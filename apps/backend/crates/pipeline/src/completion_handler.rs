//! Handle completed segment generation.
//!
//! When ComfyUI signals that a workflow has finished, this module:
//! 1. Retrieves the execution history (output filenames).
//! 2. Classifies all outputs (Final vs Intermediate).
//! 3. Downloads and stores the final video and intermediate artifacts.
//! 4. Updates the segment record with output paths and duration.
//! 5. Increments the scene's completed segment count.

use std::sync::Arc;

use x121_comfyui::api::ComfyUIApi;
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::models::generation::UpdateSegmentGeneration;
use x121_db::repositories::{SceneRepo, SegmentRepo};

use crate::error::PipelineError;
use crate::gen_log;
use crate::output_classifier::{self, ClassifiedOutput, OutputRole};

/// A downloaded artifact with its storage path and metadata.
#[derive(Debug)]
pub struct DownloadedArtifact {
    /// Classification info for this artifact.
    pub classified: ClassifiedOutput,
    /// Storage key where the file was persisted.
    pub storage_key: String,
    /// Size of the downloaded file in bytes.
    pub file_size_bytes: i64,
    /// Duration in seconds (only meaningful for video outputs).
    pub duration_secs: Option<f64>,
}

/// Information about a completed segment, returned to the loop driver.
#[derive(Debug)]
pub struct CompletionResult {
    pub segment_id: DbId,
    pub scene_id: DbId,
    pub output_video_path: String,
    pub duration_secs: f64,
    pub cumulative_duration_secs: f64,
    /// All downloaded artifacts (Final + Intermediate).
    pub downloaded_artifacts: Vec<DownloadedArtifact>,
}

/// Process a completed segment generation.
///
/// `prompt_id` is the ComfyUI execution identifier.
/// `api` is the ComfyUI REST client for fetching history/outputs.
/// `storage` is the pluggable storage backend for persisting the video.
/// `workflow` is the submitted workflow JSON, used for output classification.
/// Pass `serde_json::Value::Null` if the workflow is unavailable (falls back
/// to single-output extraction).
pub async fn handle_completion(
    pool: &sqlx::PgPool,
    api: &ComfyUIApi,
    storage: &Arc<dyn StorageProvider>,
    segment_id: DbId,
    scene_id: DbId,
    prompt_id: &str,
    workflow: &serde_json::Value,
) -> Result<CompletionResult, PipelineError> {
    // 1. Get execution history to find output file info.
    let history = api
        .get_history(prompt_id)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to get history: {e}")))?;

    gen_log::log(
        pool,
        scene_id,
        "info",
        "Fetched execution history from ComfyUI",
    )
    .await;

    // 2. Classify all outputs.
    let classified = output_classifier::classify_outputs(&history, prompt_id, workflow)?;

    let final_count = classified
        .iter()
        .filter(|o| o.role == OutputRole::Final)
        .count();
    let intermediate_count = classified
        .iter()
        .filter(|o| o.role == OutputRole::Intermediate)
        .count();
    gen_log::log(
        pool,
        scene_id,
        "info",
        format!(
            "Classified {} outputs ({} final, {} intermediate)",
            classified.len(),
            final_count,
            intermediate_count
        ),
    )
    .await;

    // 3. Find the Final output and download it.
    let final_output = classified
        .iter()
        .find(|o| o.role == OutputRole::Final)
        .ok_or_else(|| {
            PipelineError::Download("No Final output found in classified outputs".to_string())
        })?;

    let video_bytes = api
        .download_output(&final_output.file_info)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to download final output: {e}")))?;

    let storage_key = format!(
        "segments/{scene_id}/{segment_id}/{}",
        final_output.file_info.filename
    );
    storage
        .upload(&storage_key, &video_bytes)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to store output: {e}")))?;

    let file_size_bytes = video_bytes.len() as i64;
    gen_log::log(pool, scene_id, "info", "Downloaded output video").await;
    gen_log::log(
        pool,
        scene_id,
        "info",
        format!("Stored video to {storage_key}"),
    )
    .await;

    // 4. Compute duration via ffprobe on the stored file.
    let duration_secs =
        probe_stored_duration(pool, scene_id, storage, &storage_key, &video_bytes).await;

    // 5. Build the artifacts list, starting with the Final output.
    let mut downloaded_artifacts = vec![DownloadedArtifact {
        classified: final_output.clone(),
        storage_key: storage_key.clone(),
        file_size_bytes,
        duration_secs: Some(duration_secs),
    }];

    // 6. Download intermediate artifacts (best-effort — errors are logged, not fatal).
    for output in classified
        .iter()
        .filter(|o| o.role == OutputRole::Intermediate)
    {
        match download_intermediate(api, storage, segment_id, output).await {
            Ok(artifact) => downloaded_artifacts.push(artifact),
            Err(e) => {
                tracing::warn!(
                    node_id = %output.node_id,
                    label = %output.label,
                    error = %e,
                    "Failed to download intermediate artifact — skipping",
                );
            }
        }
    }

    // 7. Get previous cumulative duration.
    let segment = SegmentRepo::find_by_id(pool, segment_id)
        .await
        .map_err(PipelineError::Database)?
        .ok_or_else(|| PipelineError::MissingConfig(format!("Segment {segment_id} not found")))?;

    let prev_cumulative = if segment.sequence_index > 0 {
        let prev = SegmentRepo::find_by_scene_and_index(pool, scene_id, segment.sequence_index - 1)
            .await
            .map_err(PipelineError::Database)?;
        prev.and_then(|s| s.cumulative_duration_secs).unwrap_or(0.0)
    } else {
        0.0
    };
    let cumulative = prev_cumulative + duration_secs;

    // 8. Update segment with results.
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

    // 9. Increment scene's completed segment count.
    SceneRepo::increment_completed_segments(pool, scene_id)
        .await
        .map_err(PipelineError::Database)?;

    // 10. Re-estimate total segments based on actual segment duration.
    //     The initial estimate uses DEFAULT_SEGMENT_DURATION_SECS (5s) which
    //     may be far off from what the model actually produces. After the first
    //     segment, re-estimate using the average actual duration so far.
    if duration_secs > 0.0 {
        let scene = SceneRepo::find_by_id(pool, scene_id)
            .await
            .map_err(PipelineError::Database)?;
        if let Some(scene) = scene {
            if let Some(target) = scene.total_segments_estimated {
                let completed_count = scene.total_segments_completed.max(1) as f64;
                let avg_duration = cumulative / completed_count;
                let scene_type =
                    x121_db::repositories::SceneTypeRepo::find_by_id(pool, scene.scene_type_id)
                        .await
                        .map_err(PipelineError::Database)?;
                if let Some(st) = scene_type {
                    let target_dur = st.target_duration_secs.map(|d| d as f64).unwrap_or(16.0);
                    let remaining = (target_dur - cumulative).max(0.0);
                    let new_estimate =
                        scene.total_segments_completed + (remaining / avg_duration).ceil() as i32;
                    if new_estimate != target {
                        let update = x121_db::models::generation::UpdateSceneGeneration {
                            status_id: None,
                            total_segments_estimated: Some(new_estimate),
                            total_segments_completed: None,
                            actual_duration_secs: None,
                            transition_segment_index: None,
                            generation_started_at: None,
                            generation_completed_at: None,
                        };
                        let _ = SceneRepo::update_generation_state(pool, scene_id, &update).await;
                        tracing::info!(
                            scene_id,
                            old_estimate = target,
                            new_estimate,
                            avg_segment_duration = avg_duration,
                            "Re-estimated total segments based on actual duration",
                        );
                    }
                }
            }
        }
    }

    tracing::info!(
        segment_id,
        scene_id,
        %prompt_id,
        duration_secs,
        cumulative,
        output = %storage_key,
        artifact_count = downloaded_artifacts.len(),
        "Segment generation completed",
    );

    Ok(CompletionResult {
        segment_id,
        scene_id,
        output_video_path: storage_key,
        duration_secs,
        cumulative_duration_secs: cumulative,
        downloaded_artifacts,
    })
}

/// Download and store a single intermediate artifact.
async fn download_intermediate(
    api: &ComfyUIApi,
    storage: &Arc<dyn StorageProvider>,
    segment_id: DbId,
    output: &ClassifiedOutput,
) -> Result<DownloadedArtifact, PipelineError> {
    let bytes = api
        .download_output(&output.file_info)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to download artifact: {e}")))?;

    let storage_key = format!(
        "artifacts/{segment_id}/{}/{}",
        output.node_id, output.file_info.filename,
    );
    storage
        .upload(&storage_key, &bytes)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to store artifact: {e}")))?;

    let file_size_bytes = bytes.len() as i64;

    Ok(DownloadedArtifact {
        classified: output.clone(),
        storage_key,
        file_size_bytes,
        duration_secs: None,
    })
}

/// Try to get real duration via ffprobe by writing bytes to a temp file.
///
/// Falls back to a default estimate if ffprobe is unavailable or fails.
async fn probe_stored_duration(
    pool: &sqlx::PgPool,
    scene_id: DbId,
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
            gen_log::log(
                pool,
                scene_id,
                "warn",
                "Warning: ffprobe failed \u{2014} using default duration",
            )
            .await;
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
