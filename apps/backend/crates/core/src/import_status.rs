//! Import report status constants.
//!
//! These match the seeded values in the `import_report_statuses` lookup table.

pub const IMPORT_STATUS_PREVIEW: &str = "preview";
pub const IMPORT_STATUS_COMMITTED: &str = "committed";
pub const IMPORT_STATUS_PARTIAL: &str = "partial";
pub const IMPORT_STATUS_FAILED: &str = "failed";
pub const IMPORT_STATUS_CANCELLED: &str = "cancelled";

/// The `status_id` value for "preview" in the `import_report_statuses` table.
///
/// This is the first seeded row (id = 1).
pub const IMPORT_STATUS_PREVIEW_ID: i64 = 1;
