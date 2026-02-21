//! Well-known restart status name constants.
//!
//! These must match the seed data in `20260220000021_create_restart_statuses_table.sql`.

/// A restart has been initiated but the service has not yet begun stopping.
pub const RESTART_INITIATED: &str = "initiated";

/// The service is in the process of stopping.
pub const RESTART_STOPPING: &str = "stopping";

/// The service has stopped and is starting back up.
pub const RESTART_RESTARTING: &str = "restarting";

/// The restart completed successfully.
pub const RESTART_COMPLETED: &str = "completed";

/// The restart failed.
pub const RESTART_FAILED: &str = "failed";
