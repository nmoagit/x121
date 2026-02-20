pub mod character;
pub mod health;
pub mod project;
pub mod scene;
pub mod scene_type;

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
/// /scene-types                                     list (studio-level), create
/// /scene-types/{id}                                get, update, delete
/// ```
pub fn api_routes() -> Router<AppState> {
    Router::new()
        // WebSocket endpoint.
        .route("/ws", get(ws::ws_handler))
        // Project routes (also nests characters and project-scoped scene types).
        .nest("/projects", project::router())
        // Character-scoped sub-resources (images, scenes).
        .nest("/characters", character::router())
        // Scene-scoped sub-resources (segments).
        .nest("/scenes", scene::router())
        // Studio-level scene types.
        .nest("/scene-types", scene_type::studio_router())
}
