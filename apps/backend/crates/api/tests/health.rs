//! Integration tests for the health check endpoint and general HTTP behaviour.

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use common::{body_json, get};
use sqlx::PgPool;
use tower::ServiceExt;

// ---------------------------------------------------------------------------
// Test: GET /health returns 200 with expected JSON fields
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn health_check_returns_ok_with_json(pool: PgPool) {
    let app = common::build_test_app(pool);
    let response = get(app, "/health").await;

    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;

    // The response must contain "status", "version", and "db_healthy" fields.
    assert_eq!(json["status"], "ok");
    assert!(json["version"].is_string());
    assert_eq!(json["db_healthy"], true);
}

// ---------------------------------------------------------------------------
// Test: Unknown route returns 404
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn unknown_route_returns_404(pool: PgPool) {
    let app = common::build_test_app(pool);
    let response = get(app, "/this-route-does-not-exist").await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// Test: x-request-id header is present in response
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn response_contains_x_request_id_header(pool: PgPool) {
    let app = common::build_test_app(pool);
    let response = get(app, "/health").await;

    assert_eq!(response.status(), StatusCode::OK);

    let request_id = response.headers().get("x-request-id");
    assert!(
        request_id.is_some(),
        "Response must contain an x-request-id header"
    );

    // The value should be a valid UUID (36 chars with hyphens).
    let id_str = request_id.unwrap().to_str().unwrap();
    assert_eq!(id_str.len(), 36, "x-request-id should be a UUID string");
}

// ---------------------------------------------------------------------------
// Test: CORS preflight OPTIONS request returns correct headers
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn cors_preflight_returns_correct_headers(pool: PgPool) {
    let app = common::build_test_app(pool);

    // CORS preflight requires custom headers, so we build the request manually.
    let request = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/v1/ws")
        .header("Origin", "http://localhost:5173")
        .header("Access-Control-Request-Method", "GET")
        .header("Access-Control-Request-Headers", "content-type")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    // CORS preflight should return 200.
    assert_eq!(response.status(), StatusCode::OK);

    let headers = response.headers();

    // Access-Control-Allow-Origin must match the request origin.
    let allow_origin = headers
        .get("access-control-allow-origin")
        .expect("Missing Access-Control-Allow-Origin header")
        .to_str()
        .unwrap();
    assert_eq!(allow_origin, "http://localhost:5173");

    // Access-Control-Allow-Methods must include GET.
    let allow_methods = headers
        .get("access-control-allow-methods")
        .expect("Missing Access-Control-Allow-Methods header")
        .to_str()
        .unwrap();
    assert!(
        allow_methods.contains("GET"),
        "Allow-Methods should contain GET, got: {allow_methods}"
    );
}
