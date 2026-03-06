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
    // 1. Get execution history to find output filenames.
    let history = api
        .get_history(prompt_id)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to get history: {e}")))?;

    let output_filename = extract_output_filename(&history, prompt_id)?;

    // 2. Download the output video from ComfyUI.
    let video_bytes = api
        .download_output(&output_filename)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to download output: {e}")))?;

    // 3. Store via StorageProvider.
    let storage_key = format!("segments/{scene_id}/{segment_id}/{output_filename}");
    storage
        .upload(&storage_key, &video_bytes)
        .await
        .map_err(|e| PipelineError::Download(format!("Failed to store output: {e}")))?;

    // 4. Compute duration (placeholder — real implementation uses ffprobe).
    // TODO: Use x121_core::ffmpeg::probe_duration once available.
    let duration_secs = 5.0; // Default segment duration assumption.

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
        boundary_frame_index: None,
        boundary_selection_mode: None,
        generation_started_at: None,
        generation_completed_at: Some(chrono::Utc::now()),
        worker_id: None,
        prompt_type: None,
        prompt_text: None,
        seed_frame_path: None,
        last_frame_path: None, // TODO: extract last frame via ffmpeg
        output_video_path: Some(storage_key.clone()),
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

/// Extract the output video filename from ComfyUI history JSON.
///
/// History format: `{ "<prompt_id>": { "outputs": { "<node_id>": { "gifs": [{ "filename": "..." }] } } } }`
/// Also checks for `"videos"` and `"images"` keys as ComfyUI varies by workflow.
fn extract_output_filename(
    history: &serde_json::Value,
    prompt_id: &str,
) -> Result<String, PipelineError> {
    let prompt_data = history
        .get(prompt_id)
        .ok_or_else(|| PipelineError::Download(format!("No history entry for prompt {prompt_id}")))?;

    let outputs = prompt_data
        .get("outputs")
        .and_then(|o| o.as_object())
        .ok_or_else(|| PipelineError::Download("No outputs in history".to_string()))?;

    // Search output nodes for video/gif/image files.
    for (_node_id, node_output) in outputs {
        for key in &["gifs", "videos", "images"] {
            if let Some(files) = node_output.get(*key).and_then(|v| v.as_array()) {
                if let Some(first) = files.first() {
                    if let Some(filename) = first.get("filename").and_then(|f| f.as_str()) {
                        return Ok(filename.to_string());
                    }
                }
            }
        }
    }

    Err(PipelineError::Download(
        "No output files found in ComfyUI history".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let result = extract_output_filename(&history, "abc-123").unwrap();
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
        let result = extract_output_filename(&history, "def-456").unwrap();
        assert_eq!(result, "scene_video.webm");
    }

    #[test]
    fn extract_fails_when_no_outputs() {
        let history = serde_json::json!({
            "ghi-789": {
                "outputs": {}
            }
        });
        let err = extract_output_filename(&history, "ghi-789").unwrap_err();
        assert!(err.to_string().contains("No output files"));
    }

    #[test]
    fn extract_fails_when_no_prompt() {
        let history = serde_json::json!({});
        let err = extract_output_filename(&history, "missing").unwrap_err();
        assert!(err.to_string().contains("No history entry"));
    }
}

