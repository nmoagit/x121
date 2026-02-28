//! Shared query parameter types and helpers for API handlers.
//!
//! Common query structs and parsing utilities that appear across multiple
//! handler modules are extracted here to avoid duplication.

use serde::Deserialize;

use crate::error::{AppError, AppResult};

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

// ---------------------------------------------------------------------------
// Timestamp parsing
// ---------------------------------------------------------------------------

/// Parse an optional ISO 8601 date string, returning `fallback` if `None`.
///
/// Used by audit log and activity log handlers for `?from=` / `?to=` query
/// parameters.
pub fn parse_timestamp(
    s: &Option<String>,
    fallback: chrono::DateTime<chrono::Utc>,
) -> AppResult<chrono::DateTime<chrono::Utc>> {
    match s {
        Some(v) => v
            .parse::<chrono::DateTime<chrono::Utc>>()
            .map_err(|_| AppError::BadRequest("Invalid date format".into())),
        None => Ok(fallback),
    }
}

/// Parse an optional YYYY-MM-DD date string, returning `fallback` if `None`.
///
/// Used by consumption summary and other handlers that accept date-only
/// query parameters.
pub fn parse_date(
    s: &Option<String>,
    fallback: chrono::NaiveDate,
) -> AppResult<chrono::NaiveDate> {
    match s {
        Some(v) => v
            .parse::<chrono::NaiveDate>()
            .map_err(|_| AppError::BadRequest("Invalid date format, expected YYYY-MM-DD".into())),
        None => Ok(fallback),
    }
}
