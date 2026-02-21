//! WebSocket message type constants for background job events (PRD-07).
//!
//! Used in `api/src/engine/progress.rs` when broadcasting job lifecycle
//! updates to connected WebSocket clients.

/// Progress update during job execution (percentage + current node).
pub const MSG_TYPE_JOB_PROGRESS: &str = "job_progress";

/// Job completed successfully.
pub const MSG_TYPE_JOB_COMPLETED: &str = "job_completed";

/// Job failed with an error.
pub const MSG_TYPE_JOB_FAILED: &str = "job_failed";

/// Job was cancelled (by user or system).
pub const MSG_TYPE_JOB_CANCELLED: &str = "job_cancelled";
