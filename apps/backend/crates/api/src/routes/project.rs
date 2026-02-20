//! Route definitions for the `/projects` resource.
//!
//! Also nests character and project-scoped scene type routes
//! under `/projects/{project_id}/...`.

use axum::routing::get;
use axum::Router;

use crate::handlers::{character, project, scene_type};
use crate::state::AppState;

/// Routes mounted at `/projects`.
///
/// ```text
/// GET    /                                  -> list
/// POST   /                                  -> create
/// GET    /{id}                              -> get_by_id
/// PUT    /{id}                              -> update
/// DELETE /{id}                              -> delete
///
/// GET    /{project_id}/characters           -> list_by_project
/// POST   /{project_id}/characters           -> create
/// GET    /{project_id}/characters/{id}      -> get_by_id
/// PUT    /{project_id}/characters/{id}      -> update
/// DELETE /{project_id}/characters/{id}      -> delete
/// GET    /{project_id}/characters/{id}/settings  -> get_settings
/// PUT    /{project_id}/characters/{id}/settings  -> update_settings
/// PATCH  /{project_id}/characters/{id}/settings  -> patch_settings
///
/// GET    /{project_id}/scene-types          -> list_by_project
/// POST   /{project_id}/scene-types          -> create
/// GET    /{project_id}/scene-types/{id}     -> get_by_id
/// PUT    /{project_id}/scene-types/{id}     -> update
/// DELETE /{project_id}/scene-types/{id}     -> delete
/// ```
pub fn router() -> Router<AppState> {
    let character_routes = Router::new()
        .route("/", get(character::list_by_project).post(character::create))
        .route(
            "/{id}",
            get(character::get_by_id)
                .put(character::update)
                .delete(character::delete),
        )
        .route(
            "/{id}/settings",
            get(character::get_settings)
                .put(character::update_settings)
                .patch(character::patch_settings),
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
        .nest("/{project_id}/characters", character_routes)
        .nest("/{project_id}/scene-types", scene_type_routes)
}
