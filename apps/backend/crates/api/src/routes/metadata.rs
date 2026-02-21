//! Route definitions for metadata preview, regeneration, and staleness
//! endpoints (PRD-13).
//!
//! These routes are mounted at multiple nesting points:
//! - Character metadata preview & regenerate under `/characters`.
//! - Scene metadata preview under `/scenes`.
//! - Project-level regeneration & staleness under `/projects`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::metadata;
use crate::state::AppState;

/// Character-scoped metadata routes mounted under `/characters`.
///
/// ```text
/// GET  /{character_id}/metadata/preview      -> preview_character_metadata
/// POST /{character_id}/metadata/regenerate   -> regenerate_character_metadata
/// ```
pub fn character_metadata_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/metadata/preview",
            get(metadata::preview_character_metadata),
        )
        .route(
            "/{character_id}/metadata/regenerate",
            post(metadata::regenerate_character_metadata),
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
