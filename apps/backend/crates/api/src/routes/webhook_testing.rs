//! Route definitions for the Webhook Integration Testing Console (PRD-99).
//!
//! Two routers are provided:
//! - `admin_router()` for admin testing/inspection endpoints
//! - `mock_router()` for the public mock capture endpoint

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::webhook_testing;
use crate::state::AppState;

/// Admin webhook testing routes mounted at `/admin/webhook-testing`.
///
/// ```text
/// GET    /deliveries                  -> list_deliveries
/// GET    /deliveries/{id}             -> get_delivery
/// POST   /deliveries/{id}/replay      -> replay_delivery
/// POST   /webhooks/{id}/test          -> test_webhook
/// GET    /webhooks/{id}/health        -> get_endpoint_health
/// GET    /health/summary              -> get_health_summary
/// POST   /mock-endpoints              -> create_mock_endpoint
/// GET    /mock-endpoints              -> list_mock_endpoints
/// DELETE /mock-endpoints/{id}         -> delete_mock_endpoint
/// GET    /mock-endpoints/{id}/captures -> list_captures
/// GET    /sample-payloads             -> list_sample_payloads
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/deliveries", get(webhook_testing::list_deliveries))
        .route("/deliveries/{id}", get(webhook_testing::get_delivery))
        .route(
            "/deliveries/{id}/replay",
            post(webhook_testing::replay_delivery),
        )
        .route("/webhooks/{id}/test", post(webhook_testing::test_webhook))
        .route(
            "/webhooks/{id}/health",
            get(webhook_testing::get_endpoint_health),
        )
        .route("/health/summary", get(webhook_testing::get_health_summary))
        .route(
            "/mock-endpoints",
            get(webhook_testing::list_mock_endpoints).post(webhook_testing::create_mock_endpoint),
        )
        .route(
            "/mock-endpoints/{id}",
            delete(webhook_testing::delete_mock_endpoint),
        )
        .route(
            "/mock-endpoints/{id}/captures",
            get(webhook_testing::list_captures),
        )
        .route(
            "/sample-payloads",
            get(webhook_testing::list_sample_payloads),
        )
}

/// Public mock capture route mounted at `/mock`.
///
/// ```text
/// POST /{token}  -> receive_mock_payload
/// ```
pub fn mock_router() -> Router<AppState> {
    Router::new().route("/{token}", post(webhook_testing::receive_mock_payload))
}
