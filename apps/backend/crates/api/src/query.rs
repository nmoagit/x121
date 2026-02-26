//! Shared query parameter types for API handlers.
//!
//! Common query structs that appear across multiple handler modules are
//! extracted here to avoid duplication.

use serde::Deserialize;

/// Generic pagination parameters (`?limit=&offset=`).
///
/// Used by any handler that supports paginated listing. Values are clamped
/// in the repository layer via `clamp_limit` / `clamp_offset`.
#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for list endpoints that support an `include_inactive` flag.
///
/// Used by tracks, scene catalog, and any other entity with soft-deactivation.
#[derive(Debug, Deserialize)]
pub struct IncludeInactiveParams {
    #[serde(default)]
    pub include_inactive: bool,
}
