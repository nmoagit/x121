//! Shared response envelope types for API handlers.
//!
//! All API responses use a `{ "data": ... }` envelope per project conventions.
//! Use [`DataResponse`] instead of ad-hoc `serde_json::json!({ "data": ... })`
//! to get compile-time type safety and consistent serialization.

use serde::Serialize;

/// Standard `{ "data": T }` response envelope.
///
/// Wraps any serializable payload in the project's standard response format.
///
/// # Example
///
/// ```ignore
/// Ok(Json(DataResponse { data: items }))
/// ```
#[derive(Debug, Serialize)]
pub struct DataResponse<T: Serialize> {
    pub data: T,
}
