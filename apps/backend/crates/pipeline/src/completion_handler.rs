//! Handle completed segment generation.
//!
//! When ComfyUI signals that a workflow has finished, this module:
//! 1. Retrieves the execution history (output filenames).
//! 2. Downloads the generated video from ComfyUI.
//! 3. Stores it via the StorageProvider.
//! 4. Updates the segment record with output paths and duration.
//! 5. Increments the scene's completed segment count.

use std::sync::Arc;

use x121_comfyui::api::ComfyUIApi;
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::models::generation::UpdateSegmentGeneration;
use x121_db::repositories::{SceneRepo, SegmentRepo};

use crate::error::PipelineError;

/// Information about a completed segment, returned to the loop driver.
#[derive(Debug)]
pub struct CompletionResult {
    pub segment_id: DbId,
    pub scene_id: DbId,
    pub output_video_path: String,
    pub duration_secs: f64,
    pub cumulative_duration_secs: f64,
}

/// Process a completed segment generation.
///
/// `prompt_id` is the ComfyUI execution identifier.
/// `api` is the ComfyUI REST client for fetching history/outputs.
/// `storage` is the pluggable storage backend for persisting the video.
pub async fn handle_completion(
    pool: &sqlx::PgPool,
    api: &ComfyUIApi,
    storage: &Arc<dyn StorageProvider>,
    segment_id: DbId,
    scene_id: DbId,
    prompt_id: &str,
) -> Result<CompletionResult, PipelineError> {
    // 1. Get execution history to find output file info.
    let history = api
        .get_history(prompt_id)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to get history: {e}")))?;

    let output_info = ComfyUIApi::extract_output_info(&history, prompt_id)
        .map_err(PipelineError::Download)?;

    // 2. Download the output video from ComfyUI (with subfolder + type).
    let video_bytes = api
        .download_output(&output_info)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to download output: {e}")))?;

    // 3. Store via StorageProvider.
    let storage_key = format!("segments/{scene_id}/{segment_id}/{}", output_info.filename);
    storage
        .upload(&storage_key, &video_bytes)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to store output: {e}")))?;

    // 4. Compute duration via ffprobe on the stored file.
    let duration_secs = probe_stored_duration(storage, &storage_key, &video_bytes).await;

    // 5. Get previous cumulative duration.
    let segment = SegmentRepo::find_by_id(pool, segment_id)
        .await
        .map_err(PipelineError::Database)?
        .ok_or_else(|| {
            PipelineError::MissingConfig(format!("Segment {segment_id} not found"))
        })?;

    let prev_cumulative = if segment.sequence_index > 0 {
        let prev = SegmentRepo::find_by_scene_and_index(
            pool,
            scene_id,
            segment.sequence_index - 1,
        )
        .await
        .map_err(PipelineError::Database)?;
        prev.and_then(|s| s.cumulative_duration_secs).unwrap_or(0.0)
    } else {
        0.0
    };
    let cumulative = prev_cumulative + duration_secs;

    // 6. Update segment with results.
    let update = UpdateSegmentGeneration {
        duration_secs: Some(duration_secs),
        cumulative_duration_secs: Some(cumulative),
        generation_completed_at: Some(chrono::Utc::now()),
        output_video_path: Some(storage_key.clone()),
        ..Default::default()
    };
    SegmentRepo::update_generation_state(pool, segment_id, &update)
        .await
        .map_err(PipelineError::Database)?;

    // 7. Increment scene's completed segment count.
    SceneRepo::increment_completed_segments(pool, scene_id)
        .await
        .map_err(PipelineError::Database)?;

    tracing::info!(
        segment_id,
        scene_id,
        %prompt_id,
        duration_secs,
        cumulative,
        output = %storage_key,
        "Segment generation completed",
    );

    Ok(CompletionResult {
        segment_id,
        scene_id,
        output_video_path: storage_key,
        duration_secs,
        cumulative_duration_secs: cumulative,
    })
}

/// Try to get real duration via ffprobe by writing bytes to a temp file.
///
/// Falls back to a default estimate if ffprobe is unavailable or fails.
async fn probe_stored_duration(
    _storage: &Arc<dyn StorageProvider>,
    _storage_key: &str,
    video_bytes: &[u8],
) -> f64 {
    use std::path::Path;

    const DEFAULT_DURATION: f64 = 5.0;

    // Write to a temp file for ffprobe (it needs a file path).
    let tmp_dir = std::env::temp_dir().join("x121_probe");
    if tokio::fs::create_dir_all(&tmp_dir).await.is_err() {
        return DEFAULT_DURATION;
    }

    let tmp_path = tmp_dir.join(format!("probe_{}.mp4", uuid::Uuid::new_v4()));
    if tokio::fs::write(&tmp_path, video_bytes).await.is_err() {
        return DEFAULT_DURATION;
    }

    let result = x121_core::ffmpeg::probe_video(Path::new(&tmp_path)).await;
    let _ = tokio::fs::remove_file(&tmp_path).await;

    match result {
        Ok(probe) => {
            let dur = x121_core::ffmpeg::parse_duration(&probe);
            if dur > 0.0 {
                dur
            } else {
                DEFAULT_DURATION
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "ffprobe failed, using default duration");
            DEFAULT_DURATION
        }
    }
}

#[cfg(test)]
mod tests {
    use x121_comfyui::api::ComfyUIApi;

    #[test]
    fn extract_gifs_output() {
        let history = serde_json::json!({
            "abc-123": {
                "outputs": {
                    "42": {
                        "gifs": [{"filename": "output_00001.mp4", "subfolder": "", "type": "output"}]
                    }
                }
            }
        });
        let result = ComfyUIApi::extract_output_filename(&history, "abc-123").unwrap();
        assert_eq!(result, "output_00001.mp4");
    }

    #[test]
    fn extract_videos_output() {
        let history = serde_json::json!({
            "def-456": {
                "outputs": {
                    "10": {
                        "videos": [{"filename": "scene_video.webm"}]
                    }
                }
            }
        });
        let result = ComfyUIApi::extract_output_filename(&history, "def-456").unwrap();
        assert_eq!(result, "scene_video.webm");
    }

    #[test]
    fn extract_fails_when_no_outputs() {
        let history = serde_json::json!({
            "ghi-789": {
                "outputs": {}
            }
        });
        let err = ComfyUIApi::extract_output_filename(&history, "ghi-789").unwrap_err();
        assert!(err.contains("No output files"));
    }

    #[test]
    fn extract_fails_when_no_prompt() {
        let history = serde_json::json!({});
        let err = ComfyUIApi::extract_output_filename(&history, "missing").unwrap_err();
        assert!(err.contains("No history entry"));
    }

    #[test]
    fn extract_output_info_includes_subfolder() {
        let history = serde_json::json!({
            "test-001": {
                "outputs": {
                    "7": {
                        "gifs": [{
                            "filename": "video_001.mp4",
                            "subfolder": "animations",
                            "type": "output"
                        }]
                    }
                }
            }
        });
        let info = ComfyUIApi::extract_output_info(&history, "test-001").unwrap();
        assert_eq!(info.filename, "video_001.mp4");
        assert_eq!(info.subfolder, "animations");
        assert_eq!(info.file_type, "output");
    }
}

