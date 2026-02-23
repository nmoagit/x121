//! Route definitions for model downloads, placement rules, and API tokens (PRD-104).
//!
//! Mounted by `api_routes()`:
//! - `/downloads` -> `download_router()`
//! - `/admin/placement-rules` -> `placement_router()`
//! - `/user/api-tokens` -> `token_router()`

use axum::routing::{delete, get, post, put};
use axum::Router;

use crate::handlers::downloads;
use crate::state::AppState;

/// Download management routes.
///
/// ```text
/// GET    /                  -> list_downloads
/// POST   /                  -> create_download
/// GET    /{id}              -> get_download
/// POST   /{id}/pause        -> pause_download
/// POST   /{id}/resume       -> resume_download
/// POST   /{id}/cancel       -> cancel_download
/// POST   /{id}/retry        -> retry_download
/// ```
pub fn download_router() -> Router<AppState> {
    Router::new()
        .route("/", get(downloads::list_downloads).post(downloads::create_download))
        .route("/{id}", get(downloads::get_download))
        .route("/{id}/pause", post(downloads::pause_download))
        .route("/{id}/resume", post(downloads::resume_download))
        .route("/{id}/cancel", post(downloads::cancel_download))
        .route("/{id}/retry", post(downloads::retry_download))
}

/// Placement rule admin routes.
///
/// ```text
/// GET    /                  -> list_placement_rules
/// POST   /                  -> create_placement_rule
/// PUT    /{id}              -> update_placement_rule
/// DELETE /{id}              -> delete_placement_rule
/// ```
pub fn placement_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(downloads::list_placement_rules).post(downloads::create_placement_rule),
        )
        .route(
            "/{id}",
            put(downloads::update_placement_rule).delete(downloads::delete_placement_rule),
        )
}

/// User API token routes.
///
/// ```text
/// GET    /                  -> list_tokens
/// POST   /                  -> store_token
/// DELETE /{service}         -> delete_token
/// ```
pub fn token_router() -> Router<AppState> {
    Router::new()
        .route("/", get(downloads::list_tokens).post(downloads::store_token))
        .route("/{service}", delete(downloads::delete_token))
}
