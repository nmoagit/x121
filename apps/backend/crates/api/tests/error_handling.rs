//! Tests for `AppError` → HTTP response mapping.
//!
//! These tests verify that each `AppError` variant produces the correct HTTP
//! status code, error code, and message. They do NOT need an HTTP server --
//! they call `IntoResponse` directly on `AppError` values.

use axum::response::IntoResponse;
use http_body_util::BodyExt;
use trulience_api::error::AppError;
use trulience_core::error::CoreError;

/// Helper: convert an `AppError` into its status code and parsed JSON body.
async fn error_to_response(err: AppError) -> (axum::http::StatusCode, serde_json::Value) {
    let response = err.into_response();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    (status, json)
}

// ---------------------------------------------------------------------------
// Test: CoreError::NotFound maps to 404 with NOT_FOUND code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn not_found_error_returns_404() {
    let err = AppError::Core(CoreError::NotFound {
        entity: "Project",
        id: 42,
    });

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::NOT_FOUND);
    assert_eq!(json["code"], "NOT_FOUND");
    assert_eq!(json["error"], "Project with id 42 not found");
}

// ---------------------------------------------------------------------------
// Test: AppError::BadRequest maps to 400 with BAD_REQUEST code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn bad_request_error_returns_400() {
    let err = AppError::BadRequest("invalid field value".into());

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST);
    assert_eq!(json["code"], "BAD_REQUEST");
    assert_eq!(json["error"], "invalid field value");
}

// ---------------------------------------------------------------------------
// Test: CoreError::Conflict maps to 409 with CONFLICT code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn conflict_error_returns_409() {
    let err = AppError::Core(CoreError::Conflict("duplicate name".into()));

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::CONFLICT);
    assert_eq!(json["code"], "CONFLICT");
    assert_eq!(json["error"], "duplicate name");
}

// ---------------------------------------------------------------------------
// Test: AppError::InternalError maps to 500 and sanitizes the message
// ---------------------------------------------------------------------------

#[tokio::test]
async fn internal_error_returns_500_and_sanitizes_message() {
    let err = AppError::InternalError("secret database credentials leaked".into());

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(json["code"], "INTERNAL_ERROR");

    // The response body must NOT contain the original error details.
    let body_text = json.to_string();
    assert!(
        !body_text.contains("secret"),
        "Internal error response must not leak sensitive details"
    );
    assert_eq!(json["error"], "An internal error occurred");
}

// ---------------------------------------------------------------------------
// Test: CoreError::Unauthorized maps to 401 with UNAUTHORIZED code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn unauthorized_error_returns_401() {
    let err = AppError::Core(CoreError::Unauthorized("no token provided".into()));

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);
    assert_eq!(json["code"], "UNAUTHORIZED");
    assert_eq!(json["error"], "no token provided");
}

// ---------------------------------------------------------------------------
// Test: CoreError::Validation maps to 400 with VALIDATION_ERROR code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn validation_error_returns_400() {
    let err = AppError::Core(CoreError::Validation("name is required".into()));

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST);
    assert_eq!(json["code"], "VALIDATION_ERROR");
    assert_eq!(json["error"], "name is required");
}

// ---------------------------------------------------------------------------
// Test: CoreError::Forbidden maps to 403 with FORBIDDEN code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn forbidden_error_returns_403() {
    let err = AppError::Core(CoreError::Forbidden("insufficient permissions".into()));

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);
    assert_eq!(json["code"], "FORBIDDEN");
    assert_eq!(json["error"], "insufficient permissions");
}

// ---------------------------------------------------------------------------
// Test: CoreError::Internal maps to 500 and sanitizes like InternalError
// ---------------------------------------------------------------------------

#[tokio::test]
async fn core_internal_error_returns_500_and_sanitizes() {
    let err = AppError::Core(CoreError::Internal("panic stack trace here".into()));

    let (status, json) = error_to_response(err).await;

    assert_eq!(status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(json["code"], "INTERNAL_ERROR");

    let body_text = json.to_string();
    assert!(
        !body_text.contains("panic stack trace"),
        "Core internal error must not leak details"
    );
    assert_eq!(json["error"], "An internal error occurred");
}
