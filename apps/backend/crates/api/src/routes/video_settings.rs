//! Route definitions for hierarchical video settings.
//!
//! Routes are provided as functions that return routers to be merged into
//! the appropriate parent nests (scene-types, projects, characters).

use axum::routing::get;
use axum::Router;

use crate::handlers::video_settings;
use crate::state::AppState;

/// Scene-type video settings route (merged into `/scene-types`).
///
/// ```text
/// GET /{id}/video-settings -> get_scene_type_video_settings
/// ```
pub fn scene_type_video_settings_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/video-settings",
        get(video_settings::get_scene_type_video_settings),
    )
}

/// Project-level video settings routes (merged into `/projects`).
///
/// ```text
/// GET    /{project_id}/video-settings                    -> list_project_settings
/// GET    /{project_id}/video-settings/{scene_type_id}    -> get_project_settings
/// PUT    /{project_id}/video-settings/{scene_type_id}    -> upsert_project_settings
/// DELETE /{project_id}/video-settings/{scene_type_id}    -> delete_project_settings
/// ```
pub fn project_video_settings_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/video-settings",
            get(video_settings::list_project_settings),
        )
        .route(
            "/{project_id}/video-settings/{scene_type_id}",
            get(video_settings::get_project_settings)
                .put(video_settings::upsert_project_settings)
                .delete(video_settings::delete_project_settings),
        )
}

/// Group-level video settings routes (merged into group routes under `/projects/{project_id}/groups`).
///
/// ```text
/// GET    /{group_id}/video-settings/{scene_type_id}  -> get_group_settings
/// PUT    /{group_id}/video-settings/{scene_type_id}  -> upsert_group_settings
/// DELETE /{group_id}/video-settings/{scene_type_id}  -> delete_group_settings
/// ```
pub fn group_video_settings_router() -> Router<AppState> {
    Router::new().route(
        "/{group_id}/video-settings/{scene_type_id}",
        get(video_settings::get_group_settings)
            .put(video_settings::upsert_group_settings)
            .delete(video_settings::delete_group_settings),
    )
}

/// Character-level video settings routes (merged into `/characters`).
///
/// ```text
/// GET    /{character_id}/video-settings                           -> list_character_settings
/// GET    /{character_id}/video-settings/{scene_type_id}           -> get_character_settings
/// PUT    /{character_id}/video-settings/{scene_type_id}           -> upsert_character_settings
/// DELETE /{character_id}/video-settings/{scene_type_id}           -> delete_character_settings
/// GET    /{character_id}/video-settings/{scene_type_id}/resolved  -> get_resolved_settings
/// ```
pub fn character_video_settings_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/video-settings",
            get(video_settings::list_character_settings),
        )
        .route(
            "/{character_id}/video-settings/{scene_type_id}",
            get(video_settings::get_character_settings)
                .put(video_settings::upsert_character_settings)
                .delete(video_settings::delete_character_settings),
        )
        .route(
            "/{character_id}/video-settings/{scene_type_id}/resolved",
            get(video_settings::get_resolved_settings),
        )
}
