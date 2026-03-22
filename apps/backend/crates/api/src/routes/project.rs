//! Route definitions for the `/projects` resource.
//!
//! Also nests avatar, avatar group, and project-scoped scene type routes
//! under `/projects/{project_id}/...`.

use axum::routing::get;
use axum::Router;

use crate::handlers::{avatar, avatar_group, project, scene_type};
use crate::state::AppState;

/// Routes mounted at `/projects`.
///
/// ```text
/// GET    /                                  -> list
/// POST   /                                  -> create
/// GET    /{id}                              -> get_by_id
/// PUT    /{id}                              -> update
/// DELETE /{id}                              -> delete
/// GET    /{id}/stats                        -> get_stats (PRD-112)
/// GET    /{id}/avatar-deliverables       -> get_avatar_deliverables
///
/// GET    /{project_id}/avatars           -> list_by_project
/// POST   /{project_id}/avatars           -> create
/// POST   /{project_id}/avatars/bulk      -> bulk_create
/// GET    /{project_id}/avatars/{id}      -> get_by_id
/// PUT    /{project_id}/avatars/{id}      -> update
/// DELETE /{project_id}/avatars/{id}      -> delete
/// GET    /{project_id}/avatars/{id}/settings  -> get_settings
/// PUT    /{project_id}/avatars/{id}/settings  -> update_settings
/// PATCH  /{project_id}/avatars/{id}/settings  -> patch_settings
/// PUT    /{project_id}/avatars/{id}/group     -> assign_avatar_to_group (PRD-112)
///
/// GET    /{project_id}/groups               -> list_by_project (PRD-112)
/// POST   /{project_id}/groups               -> create (PRD-112)
/// PUT    /{project_id}/groups/{id}          -> update (PRD-112)
/// DELETE /{project_id}/groups/{id}          -> delete (PRD-112)
/// GET    /{project_id}/groups/{id}/scene-settings       -> list_effective
/// PUT    /{project_id}/groups/{id}/scene-settings       -> bulk_update
/// PUT    /{project_id}/groups/{id}/scene-settings/{st}  -> toggle_single
/// DELETE /{project_id}/groups/{id}/scene-settings/{st}  -> remove_override
/// GET    /{project_id}/groups/{id}/scenes/{st}/prompt-overrides  -> get_group_prompt_overrides
/// PUT    /{project_id}/groups/{id}/scenes/{st}/prompt-overrides  -> upsert_group_prompt_overrides
///
/// GET    /{project_id}/scene-types          -> list_by_project
/// POST   /{project_id}/scene-types          -> create
/// GET    /{project_id}/scene-types/{id}     -> get_by_id
/// PUT    /{project_id}/scene-types/{id}     -> update
/// DELETE /{project_id}/scene-types/{id}     -> delete
/// ```
pub fn router() -> Router<AppState> {
    let avatar_routes = Router::new()
        .route("/", get(avatar::list_by_project).post(avatar::create))
        .route("/bulk", axum::routing::post(avatar::bulk_create))
        .route(
            "/{id}",
            get(avatar::get_by_id)
                .put(avatar::update)
                .delete(avatar::delete),
        )
        .route(
            "/{id}/settings",
            get(avatar::get_settings)
                .put(avatar::update_settings)
                .patch(avatar::patch_settings),
        )
        .route(
            "/{id}/group",
            axum::routing::put(avatar_group::assign_avatar_to_group),
        )
        .route(
            "/{id}/toggle-enabled",
            axum::routing::put(avatar::toggle_enabled),
        )
        .route(
            "/{id}/bulk-approve",
            axum::routing::post(avatar::bulk_approve),
        );

    let group_routes = Router::new()
        .route(
            "/",
            get(avatar_group::list_by_project).post(avatar_group::create),
        )
        .route(
            "/{id}",
            axum::routing::put(avatar_group::update).delete(avatar_group::delete),
        )
        .merge(super::prompt_management::group_prompt_override_router())
        .merge(super::video_settings::group_video_settings_router())
        .nest(
            "/{id}/scene-settings",
            super::group_scene_settings::router(),
        );

    let scene_type_routes = Router::new()
        .route(
            "/",
            get(scene_type::list_by_project).post(scene_type::create),
        )
        .route(
            "/{id}",
            get(scene_type::get_by_id_scoped)
                .put(scene_type::update_scoped)
                .delete(scene_type::delete_scoped),
        );

    Router::new()
        .route("/", get(project::list).post(project::create))
        .route(
            "/{id}",
            get(project::get_by_id)
                .put(project::update)
                .delete(project::delete),
        )
        .route("/{id}/stats", get(project::get_stats))
        .route(
            "/{id}/avatar-deliverables",
            get(project::get_avatar_deliverables),
        )
        .route(
            "/{id}/scene-assignments",
            get(project::get_batch_scene_assignments),
        )
        .route(
            "/{id}/variant-statuses",
            get(project::get_batch_variant_statuses),
        )
        .route(
            "/{id}/speech-language-counts",
            get(project::get_speech_language_counts),
        )
        .nest("/{project_id}/avatars", avatar_routes)
        .nest("/{project_id}/groups", group_routes)
        .nest("/{project_id}/scene-types", scene_type_routes)
}
