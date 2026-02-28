//! Shared job status ID constants matching the `job_statuses` seed data.
//!
//! Many features (reports, dataset exports, scheduling, etc.) reference the same
//! lookup table.  Rather than redefining the IDs in every feature module, import
//! them from here.

/// Status ID for a **pending** job (id = 1).
pub const JOB_STATUS_ID_PENDING: i64 = 1;

/// Status ID for a **running** job (id = 2).
pub const JOB_STATUS_ID_RUNNING: i64 = 2;

/// Status ID for a **completed** job (id = 3).
pub const JOB_STATUS_ID_COMPLETED: i64 = 3;

/// Status ID for a **failed** job (id = 4).
pub const JOB_STATUS_ID_FAILED: i64 = 4;
