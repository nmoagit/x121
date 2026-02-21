//! Pipeline checkpointing constants, data types, and validation (PRD-28).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future worker or CLI tooling.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default directory for storing checkpoint data on disk.
pub const DEFAULT_CHECKPOINT_DIR: &str = "data/checkpoints";

/// Maximum checkpoint data size in bytes (100 MB).
pub const MAX_CHECKPOINT_SIZE_BYTES: u64 = 100 * 1024 * 1024;

/// Maximum number of checkpoints per job (prevents unbounded growth).
pub const MAX_CHECKPOINTS_PER_JOB: u32 = 100;

/// Maximum overhead budget for checkpoint creation in milliseconds.
pub const CHECKPOINT_OVERHEAD_MS: u64 = 2000;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Structured payload for checkpoint data written to disk.
///
/// This is serialized to JSON and persisted alongside the binary data
/// (intermediate frames, latents) at the checkpoint's `data_path`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointData {
    /// Zero-based index of the completed pipeline stage.
    pub stage_index: u32,
    /// Human-readable name of the pipeline stage.
    pub stage_name: String,
    /// IDs of segments completed up to this point.
    pub completed_segments: Vec<i64>,
    /// Filesystem path to the last rendered frame.
    pub last_frame_path: String,
    /// Cumulative duration in seconds of all completed stages.
    pub cumulative_duration_secs: f64,
    /// Pipeline configuration snapshot at the time of checkpointing.
    pub configuration: serde_json::Value,
}

/// Structured failure diagnostic data stored as JSONB on the job.
///
/// Captures everything needed to understand why a pipeline stage failed
/// and what state the system was in at the time of failure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureDiagnosticData {
    /// Zero-based index of the failed pipeline stage.
    pub stage_index: u32,
    /// Human-readable name of the failed pipeline stage.
    pub stage_name: String,
    /// Primary error message.
    pub error_message: String,
    /// Raw ComfyUI error string, if applicable.
    pub comfyui_error: Option<String>,
    /// ComfyUI node ID that triggered the failure.
    pub node_id: Option<String>,
    /// GPU memory used at the time of failure (megabytes).
    pub gpu_memory_used_mb: Option<u64>,
    /// Total GPU memory available (megabytes).
    pub gpu_memory_total_mb: Option<u64>,
    /// Snapshot of the pipeline input state when the failure occurred.
    pub input_state: Option<serde_json::Value>,
    /// ISO-8601 timestamp of when the failure was recorded.
    pub timestamp: String,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a checkpoint stage index is non-negative and within bounds.
pub fn validate_stage_index(stage_index: i32, total_stages: i32) -> Result<(), String> {
    if stage_index < 0 {
        return Err("stage_index must be non-negative".to_string());
    }
    if total_stages > 0 && stage_index >= total_stages {
        return Err(format!(
            "stage_index {stage_index} exceeds total stages {total_stages}"
        ));
    }
    Ok(())
}

/// Validate that checkpoint data size is within the budget.
pub fn validate_checkpoint_size(size_bytes: u64) -> Result<(), String> {
    if size_bytes > MAX_CHECKPOINT_SIZE_BYTES {
        return Err(format!(
            "Checkpoint size {}MB exceeds maximum {}MB",
            size_bytes / (1024 * 1024),
            MAX_CHECKPOINT_SIZE_BYTES / (1024 * 1024),
        ));
    }
    Ok(())
}

/// Build the filesystem path for a checkpoint's data directory.
pub fn checkpoint_data_dir(base_dir: &str, job_id: i64, stage_index: i32) -> String {
    format!("{base_dir}/job_{job_id}/stage_{stage_index}")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_stage_index() {
        assert!(validate_stage_index(0, 10).is_ok());
        assert!(validate_stage_index(9, 10).is_ok());
    }

    #[test]
    fn negative_stage_index_rejected() {
        let err = validate_stage_index(-1, 10).unwrap_err();
        assert!(err.contains("non-negative"));
    }

    #[test]
    fn stage_index_out_of_bounds_rejected() {
        let err = validate_stage_index(10, 10).unwrap_err();
        assert!(err.contains("exceeds total stages"));
    }

    #[test]
    fn stage_index_with_zero_total_always_ok() {
        // When total_stages is 0 (unknown), skip upper-bound check.
        assert!(validate_stage_index(5, 0).is_ok());
    }

    #[test]
    fn valid_checkpoint_size() {
        assert!(validate_checkpoint_size(1024).is_ok());
        assert!(validate_checkpoint_size(MAX_CHECKPOINT_SIZE_BYTES).is_ok());
    }

    #[test]
    fn oversized_checkpoint_rejected() {
        let err = validate_checkpoint_size(MAX_CHECKPOINT_SIZE_BYTES + 1).unwrap_err();
        assert!(err.contains("exceeds maximum"));
    }

    #[test]
    fn checkpoint_data_dir_format() {
        let dir = checkpoint_data_dir("/data/checkpoints", 42, 3);
        assert_eq!(dir, "/data/checkpoints/job_42/stage_3");
    }

    #[test]
    fn checkpoint_data_roundtrip() {
        let data = CheckpointData {
            stage_index: 2,
            stage_name: "render_segment".to_string(),
            completed_segments: vec![1, 2, 3],
            last_frame_path: "/tmp/frame_003.png".to_string(),
            cumulative_duration_secs: 45.2,
            configuration: serde_json::json!({"resolution": "1080p"}),
        };

        let json = serde_json::to_string(&data).unwrap();
        let deserialized: CheckpointData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.stage_index, 2);
        assert_eq!(deserialized.stage_name, "render_segment");
        assert_eq!(deserialized.completed_segments, vec![1, 2, 3]);
    }

    #[test]
    fn failure_diagnostic_data_roundtrip() {
        let diag = FailureDiagnosticData {
            stage_index: 5,
            stage_name: "upscale".to_string(),
            error_message: "Out of GPU memory".to_string(),
            comfyui_error: Some("CUDA OOM at node 12".to_string()),
            node_id: Some("12".to_string()),
            gpu_memory_used_mb: Some(7800),
            gpu_memory_total_mb: Some(8192),
            input_state: Some(serde_json::json!({"width": 1920, "height": 1080})),
            timestamp: "2026-02-21T10:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&diag).unwrap();
        let deserialized: FailureDiagnosticData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.stage_index, 5);
        assert_eq!(deserialized.error_message, "Out of GPU memory");
        assert_eq!(deserialized.gpu_memory_used_mb, Some(7800));
    }

    #[test]
    fn constants_are_reasonable() {
        assert!(MAX_CHECKPOINT_SIZE_BYTES > 0);
        assert!(MAX_CHECKPOINTS_PER_JOB > 0);
        assert!(CHECKPOINT_OVERHEAD_MS > 0);
        assert!(!DEFAULT_CHECKPOINT_DIR.is_empty());
    }
}
