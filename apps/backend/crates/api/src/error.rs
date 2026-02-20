use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use trulience_core::error::CoreError;

/// Application-level error type for HTTP handlers.
///
/// Wraps [`CoreError`] for domain errors and adds HTTP-specific variants.
/// Implements [`IntoResponse`] to produce consistent JSON error responses.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A domain-level error from `trulience_core`.
    #[error(transparent)]
    Core(#[from] CoreError),

    /// A database error from sqlx.
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    /// A bad request with a human-readable message.
    #[error("Bad request: {0}")]
    BadRequest(String),

    /// An internal error with a human-readable message.
    #[error("Internal error: {0}")]
    InternalError(String),
}

/// Convenience type alias for handler return values.
pub type AppResult<T> = Result<T, AppError>;

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            // --- CoreError variants ---
            AppError::Core(core) => match core {
                CoreError::NotFound { entity, id } => (
                    StatusCode::NOT_FOUND,
                    "NOT_FOUND",
                    format!("{entity} with id {id} not found"),
                ),
                CoreError::Validation(msg) => {
                    (StatusCode::BAD_REQUEST, "VALIDATION_ERROR", msg.clone())
                }
                CoreError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
                CoreError::Unauthorized(msg) => {
                    (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone())
                }
                CoreError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone()),
                CoreError::Internal(msg) => {
                    tracing::error!(error = %msg, "Internal core error");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "INTERNAL_ERROR",
                        "An internal error occurred".to_string(),
                    )
                }
            },

            // --- Database errors ---
            AppError::Database(err) => classify_sqlx_error(err),

            // --- HTTP-specific errors ---
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::InternalError(msg) => {
                tracing::error!(error = %msg, "Internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "An internal error occurred".to_string(),
                )
            }
        };

        let body = json!({
            "error": message,
            "code": code,
        });

        (status, axum::Json(body)).into_response()
    }
}

/// Classify a sqlx error into an HTTP status, error code, and message.
///
/// - `RowNotFound` maps to 404.
/// - Unique constraint violations (constraint name starting with `uq_`) map to 409.
/// - Everything else maps to 500 with a sanitized message.
fn classify_sqlx_error(err: &sqlx::Error) -> (StatusCode, &'static str, String) {
    match err {
        sqlx::Error::RowNotFound => (
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "Resource not found".to_string(),
        ),
        sqlx::Error::Database(db_err) => {
            // PostgreSQL unique constraint violation: error code 23505
            if db_err.code().as_deref() == Some("23505") {
                let constraint = db_err.constraint().unwrap_or("unknown");
                if constraint.starts_with("uq_") {
                    return (
                        StatusCode::CONFLICT,
                        "CONFLICT",
                        format!("Duplicate value violates unique constraint: {constraint}"),
                    );
                }
            }
            tracing::error!(error = %db_err, "Database error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An internal error occurred".to_string(),
            )
        }
        other => {
            tracing::error!(error = %other, "Database error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An internal error occurred".to_string(),
            )
        }
    }
}
