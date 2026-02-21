//! Route definitions for the asset registry (PRD-17).
//!
//! All routes are mounted under `/assets`.

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::assets;
use crate::state::AppState;

/// Asset registry routes mounted at `/assets`.
///
/// ```text
/// GET    /                  -> list_assets
/// POST   /                  -> create_asset (admin only)
/// GET    /{id}              -> get_asset
/// PUT    /{id}              -> update_asset (admin only)
/// DELETE /{id}              -> delete_asset (admin only)
/// GET    /{id}/dependencies -> get_dependencies
/// POST   /{id}/dependencies -> add_dependency (admin only)
/// GET    /{id}/impact       -> get_impact
/// GET    /{id}/notes        -> get_notes
/// POST   /{id}/notes        -> add_note
/// PUT    /{id}/rating       -> rate_asset
/// GET    /{id}/ratings      -> get_ratings
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(assets::list_assets).post(assets::create_asset))
        .route(
            "/{id}",
            get(assets::get_asset)
                .put(assets::update_asset)
                .delete(assets::delete_asset),
        )
        .route(
            "/{id}/dependencies",
            get(assets::get_dependencies).post(assets::add_dependency),
        )
        .route("/{id}/impact", get(assets::get_impact))
        .route("/{id}/notes", get(assets::get_notes).post(assets::add_note))
        .route("/{id}/rating", put(assets::rate_asset))
        .route("/{id}/ratings", get(assets::get_ratings))
}
