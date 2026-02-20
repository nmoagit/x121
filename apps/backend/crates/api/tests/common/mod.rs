// All functions in this module are shared test helpers. Not every test binary
// uses every helper, so we suppress dead_code warnings at the item level.
#![allow(dead_code)]

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderName, Method, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use trulience_api::auth::jwt::JwtConfig;
use trulience_api::config::ServerConfig;
use trulience_api::routes;
use trulience_api::state::AppState;
use trulience_api::ws::WsManager;

/// Build a test `ServerConfig` with safe defaults.
///
/// Uses `http://localhost:5173` as CORS origin (matching the dev default)
/// and a 30-second request timeout.
pub fn test_config() -> ServerConfig {
    ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 0,
        cors_origins: vec!["http://localhost:5173".to_string()],
        request_timeout_secs: 30,
        shutdown_timeout_secs: 30,
        jwt: JwtConfig {
            secret: "test-secret-for-integration-tests-minimum-length".to_string(),
            access_token_expiry_mins: 15,
            refresh_token_expiry_days: 7,
        },
    }
}

/// Build the full application router with all middleware layers, using the
/// given database pool.
///
/// This mirrors the router construction in `main.rs` so integration tests
/// exercise the same middleware stack (CORS, request ID, timeout, tracing,
/// panic recovery) that production uses.
pub fn build_test_app(pool: PgPool) -> Router {
    let config = test_config();
    let ws_manager = Arc::new(WsManager::new());

    let state = AppState {
        pool,
        config: Arc::new(config),
        ws_manager,
    };

    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:5173".parse().unwrap()])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
        ])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        .allow_credentials(true)
        .max_age(Duration::from_secs(3600));

    let request_id_header = HeaderName::from_static("x-request-id");

    Router::new()
        .merge(routes::health::router())
        .nest("/api/v1", routes::api_routes())
        .layer(CatchPanicLayer::new())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid))
        .layer(cors)
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Shared HTTP test helpers
// ---------------------------------------------------------------------------

/// Collect the response body into a `serde_json::Value`.
pub async fn body_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// Send a JSON request with the given HTTP method.
pub async fn send_json(
    app: Router,
    method: Method,
    uri: &str,
    body: serde_json::Value,
) -> axum::response::Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    app.oneshot(request).await.unwrap()
}

/// POST JSON to the given URI and return the response.
pub async fn post_json(
    app: Router,
    uri: &str,
    body: serde_json::Value,
) -> axum::response::Response {
    send_json(app, Method::POST, uri, body).await
}

/// PUT JSON to the given URI and return the response.
pub async fn put_json(app: Router, uri: &str, body: serde_json::Value) -> axum::response::Response {
    send_json(app, Method::PUT, uri, body).await
}

/// GET from the given URI.
pub async fn get(app: Router, uri: &str) -> axum::response::Response {
    let request = Request::builder().uri(uri).body(Body::empty()).unwrap();
    app.oneshot(request).await.unwrap()
}

/// DELETE the given URI.
pub async fn delete(app: Router, uri: &str) -> axum::response::Response {
    let request = Request::builder()
        .method(Method::DELETE)
        .uri(uri)
        .body(Body::empty())
        .unwrap();
    app.oneshot(request).await.unwrap()
}

// ---------------------------------------------------------------------------
// Authenticated HTTP test helpers
// ---------------------------------------------------------------------------

/// Send a JSON request with the given HTTP method and a Bearer token.
pub async fn send_json_auth(
    app: Router,
    method: Method,
    uri: &str,
    body: serde_json::Value,
    token: &str,
) -> axum::response::Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    app.oneshot(request).await.unwrap()
}

/// POST JSON with a Bearer token.
pub async fn post_json_auth(
    app: Router,
    uri: &str,
    body: serde_json::Value,
    token: &str,
) -> axum::response::Response {
    send_json_auth(app, Method::POST, uri, body, token).await
}

/// PUT JSON with a Bearer token.
pub async fn put_json_auth(
    app: Router,
    uri: &str,
    body: serde_json::Value,
    token: &str,
) -> axum::response::Response {
    send_json_auth(app, Method::PUT, uri, body, token).await
}

/// GET from the given URI with a Bearer token.
pub async fn get_auth(app: Router, uri: &str, token: &str) -> axum::response::Response {
    let request = Request::builder()
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    app.oneshot(request).await.unwrap()
}

/// DELETE the given URI with a Bearer token.
pub async fn delete_auth(app: Router, uri: &str, token: &str) -> axum::response::Response {
    let request = Request::builder()
        .method(Method::DELETE)
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    app.oneshot(request).await.unwrap()
}
