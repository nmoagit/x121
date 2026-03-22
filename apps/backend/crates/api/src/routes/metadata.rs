//! Route definitions for metadata preview, regeneration, and staleness
//! endpoints (PRD-13).
//!
//! These routes are mounted at multiple nesting points:
//! - Avatar metadata preview & regenerate under `/avatars`.
//! - Scene metadata preview under `/scenes`.
//! - Project-level regeneration & staleness under `/projects`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::metadata;
use crate::state::AppState;

/// Avatar-scoped metadata routes mounted under `/avatars`.
///
/// ```text
/// GET  /{avatar_id}/metadata/preview      -> preview_avatar_metadata
/// POST /{avatar_id}/metadata/regenerate   -> regenerate_avatar_metadata
/// ```
pub fn avatar_metadata_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/metadata/preview",
            get(metadata::preview_avatar_metadata),
        )
        .route(
            "/{avatar_id}/metadata/regenerate",
            post(metadata::regenerate_avatar_metadata),
        )
}

/// Scene-scoped metadata routes mounted under `/scenes`.
///
/// ```text
/// GET  /{scene_id}/metadata/preview   -> preview_video_metadata
/// ```
pub fn scene_metadata_router() -> Router<AppState> {
    Router::new().route(
        "/{scene_id}/metadata/preview",
        get(metadata::preview_video_metadata),
    )
}

/// Project-scoped metadata routes mounted under `/projects`.
///
/// ```text
/// POST /{project_id}/metadata/regenerate   -> regenerate_project_metadata
/// GET  /{project_id}/metadata/stale        -> get_stale_metadata
/// ```
pub fn project_metadata_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/metadata/regenerate",
            post(metadata::regenerate_project_metadata),
        )
        .route(
            "/{project_id}/metadata/stale",
            get(metadata::get_stale_metadata),
        )
}
