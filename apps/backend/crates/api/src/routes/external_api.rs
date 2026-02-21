//! Route definitions for the External API & Webhooks admin management (PRD-12).
//!
//! Two routers are provided:
//! - `api_keys_router()` for admin API key management mounted at `/admin/api-keys`
//! - `webhooks_router()` for admin webhook management mounted at `/admin/webhooks`

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::{api_keys, webhooks};
use crate::state::AppState;

/// Admin API key management routes mounted at `/admin/api-keys`.
///
/// ```text
/// GET    /                  -> list_api_keys
/// POST   /                  -> create_api_key
/// GET    /scopes            -> list_scopes
/// PUT    /{id}              -> update_api_key
/// POST   /{id}/rotate       -> rotate_api_key
/// POST   /{id}/revoke       -> revoke_api_key
/// ```
pub fn api_keys_router() -> Router<AppState> {
    Router::new()
        .route("/", get(api_keys::list_api_keys).post(api_keys::create_api_key))
        .route("/scopes", get(api_keys::list_scopes))
        .route("/{id}", put(api_keys::update_api_key))
        .route("/{id}/rotate", post(api_keys::rotate_api_key))
        .route("/{id}/revoke", post(api_keys::revoke_api_key))
}

/// Admin webhook management routes mounted at `/admin/webhooks`.
///
/// ```text
/// GET    /                          -> list_webhooks
/// POST   /                          -> create_webhook
/// PUT    /{id}                      -> update_webhook
/// DELETE /{id}                      -> delete_webhook
/// GET    /{id}/deliveries           -> list_deliveries
/// POST   /{id}/test                 -> test_webhook
/// POST   /deliveries/{id}/replay    -> replay_delivery
/// ```
pub fn webhooks_router() -> Router<AppState> {
    Router::new()
        .route("/", get(webhooks::list_webhooks).post(webhooks::create_webhook))
        .route(
            "/{id}",
            put(webhooks::update_webhook).delete(webhooks::delete_webhook),
        )
        .route("/{id}/deliveries", get(webhooks::list_deliveries))
        .route("/{id}/test", post(webhooks::test_webhook))
        .route("/deliveries/{id}/replay", post(webhooks::replay_delivery))
}
