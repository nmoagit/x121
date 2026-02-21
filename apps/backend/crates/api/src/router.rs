//! Shared application router builder.
//!
//! Provides [`build_app_router`] so both the production binary (`main.rs`)
//! and integration tests (`tests/common/mod.rs`) use the exact same middleware
//! stack. Extracted per DRY-017.

use std::time::Duration;

use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderName, Method, StatusCode};
use axum::Router;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::config::ServerConfig;
use crate::routes;
use crate::state::AppState;

/// Build the full application [`Router`] with all middleware layers.
///
/// The middleware stack is applied bottom-up:
///
/// 1. CORS
/// 2. Set request ID on incoming requests
/// 3. Structured request/response tracing
/// 4. Propagate request ID to response
/// 5. Request timeout
/// 6. Panic recovery (catch panics, return 500)
pub fn build_app_router(state: AppState, config: &ServerConfig) -> Router {
    let cors = build_cors_layer(config);
    let request_id_header = HeaderName::from_static("x-request-id");

    Router::new()
        // Health check at root level (not under /api/v1).
        .merge(routes::health::router())
        // API v1 routes.
        .nest("/api/v1", routes::api_routes())
        // -- Middleware stack (applied bottom-up) --
        // Panic recovery: catch panics and return 500 JSON.
        .layer(CatchPanicLayer::new())
        // Request timeout.
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(config.request_timeout_secs),
        ))
        // Propagate request ID to response.
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        // Structured request/response tracing.
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        // Set request ID on incoming requests.
        .layer(SetRequestIdLayer::new(
            request_id_header,
            MakeRequestUuid,
        ))
        // CORS.
        .layer(cors)
        // Shared state.
        .with_state(state)
}

/// Build the CORS middleware layer from server configuration.
///
/// Panics at startup if any configured origin is invalid, which is the
/// desired behaviour -- we want misconfiguration to fail fast.
pub fn build_cors_layer(config: &ServerConfig) -> CorsLayer {
    let origins: Vec<_> = config
        .cors_origins
        .iter()
        .map(|o| {
            o.parse()
                .unwrap_or_else(|e| panic!("Invalid CORS origin '{o}': {e}"))
        })
        .collect();

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
        ])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        .allow_credentials(true)
        .max_age(Duration::from_secs(3600))
}
