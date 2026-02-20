use std::sync::Arc;
use std::time::Duration;

use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderName, Method, StatusCode};
use axum::Router;
use sqlx::PgPool;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

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
