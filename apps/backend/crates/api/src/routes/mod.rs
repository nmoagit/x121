pub mod admin;
pub mod auth;
pub mod character;
pub mod health;
pub mod project;
pub mod scene;
pub mod scene_type;
pub mod trash;

use axum::routing::get;
use axum::Router;

use crate::state::AppState;
use crate::ws;

/// Build the `/api/v1` route tree.
///
/// Route hierarchy:
///
/// ```text
/// /ws                                              WebSocket
///
/// /auth/login                                      login (public)
/// /auth/refresh                                    refresh (public)
/// /auth/logout                                     logout (requires auth)
///
/// /admin/users                                     list, create (admin only)
/// /admin/users/{id}                                get, update, deactivate
/// /admin/users/{id}/reset-password                 reset password
///
/// /projects                                        list, create
/// /projects/{id}                                   get, update, delete
/// /projects/{project_id}/characters                list, create
/// /projects/{project_id}/characters/{id}           get, update, delete
/// /projects/{project_id}/characters/{id}/settings  get, put, patch
/// /projects/{project_id}/scene-types               list, create
/// /projects/{project_id}/scene-types/{id}          get, update, delete
///
/// /characters/{character_id}/source-images         list, create
/// /characters/{character_id}/source-images/{id}    get, update, delete
/// /characters/{character_id}/derived-images        list, create
/// /characters/{character_id}/derived-images/{id}   get, update, delete
/// /characters/{character_id}/image-variants        list, create
/// /characters/{character_id}/image-variants/{id}   get, update, delete
/// /characters/{character_id}/scenes                list, create
/// /characters/{character_id}/scenes/{id}           get, update, delete
///
/// /scenes/{scene_id}/segments                      list, create
/// /scenes/{scene_id}/segments/{id}                 get, update, delete
///
/// /scenes/{scene_id}/versions                      list
/// /scenes/{scene_id}/versions/import               import (multipart)
/// /scenes/{scene_id}/versions/{id}                 get, delete
/// /scenes/{scene_id}/versions/{id}/set-final       set-final
///
/// /scene-types                                     list (studio-level), create
/// /scene-types/{id}                                get, update, delete
///
/// /trash                                           list (?type=entity_type)
/// /trash/purge                                     purge all (DELETE)
/// /trash/purge-preview                             purge preview (GET)
/// /trash/{entity_type}/{id}/restore                restore (POST)
/// /trash/{entity_type}/{id}/purge                  purge one (DELETE)
/// ```
pub fn api_routes() -> Router<AppState> {
    Router::new()
        // WebSocket endpoint.
        .route("/ws", get(ws::ws_handler))
        // Authentication routes (login, refresh, logout).
        .nest("/auth", auth::router())
        // Admin routes (user management).
        .nest("/admin", admin::router())
        // Project routes (also nests characters and project-scoped scene types).
        .nest("/projects", project::router())
        // Character-scoped sub-resources (images, scenes).
        .nest("/characters", character::router())
        // Scene-scoped sub-resources (segments).
        .nest("/scenes", scene::router())
        // Studio-level scene types.
        .nest("/scene-types", scene_type::studio_router())
        // Trash / bin management.
        .nest("/trash", trash::router())
}
