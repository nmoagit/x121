//! Routes for generation strategy and workflow prompt management (PRD-115).
//!
//! - Workflow prompt slot routes are merged into the `/workflows` nest.
//! - Scene-type prompt default routes are merged into the `/scene-types` nest.
//! - Character prompt override routes are merged into the `/characters` nest.
//! - Prompt resolution is mounted at `/prompts`.
//! - Prompt fragment CRUD + pinning is mounted at `/prompt-fragments`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::prompt_management;
use crate::state::AppState;

/// Workflow prompt slot routes (merged into `/workflows`).
///
/// ```text
/// GET  /{workflow_id}/prompt-slots            -> list_prompt_slots
/// PUT  /{workflow_id}/prompt-slots/{slot_id}  -> update_prompt_slot
/// ```
pub fn workflow_prompt_slot_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{workflow_id}/prompt-slots",
            get(prompt_management::list_prompt_slots),
        )
        .route(
            "/{workflow_id}/prompt-slots/{slot_id}",
            put(prompt_management::update_prompt_slot),
        )
}

/// Scene-type prompt default routes (merged into `/scene-types`).
///
/// ```text
/// GET  /{id}/prompt-defaults            -> list_prompt_defaults
/// PUT  /{id}/prompt-defaults/{slot_id}  -> upsert_prompt_default
/// ```
pub fn scene_type_prompt_default_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/prompt-defaults",
            get(prompt_management::list_prompt_defaults),
        )
        .route(
            "/{id}/prompt-defaults/{slot_id}",
            put(prompt_management::upsert_prompt_default),
        )
}

/// Character+scene prompt override routes (merged into `/characters`).
///
/// ```text
/// GET  /{character_id}/scenes/{scene_type_id}/prompt-overrides  -> get_character_scene_overrides
/// PUT  /{character_id}/scenes/{scene_type_id}/prompt-overrides  -> upsert_character_scene_overrides
/// ```
pub fn character_prompt_override_router() -> Router<AppState> {
    Router::new().route(
        "/{character_id}/scenes/{scene_type_id}/prompt-overrides",
        get(prompt_management::get_character_scene_overrides)
            .put(prompt_management::upsert_character_scene_overrides),
    )
}

/// Prompt resolution route (mounted at `/prompts`).
///
/// ```text
/// POST /resolve  -> resolve_prompt_preview
/// ```
pub fn prompt_resolve_router() -> Router<AppState> {
    Router::new().route("/resolve", post(prompt_management::resolve_prompt_preview))
}

/// Prompt fragment CRUD and pinning routes (mounted at `/prompt-fragments`).
///
/// ```text
/// GET    /                           -> list_fragments
/// POST   /                           -> create_fragment
/// PUT    /{id}                       -> update_fragment
/// DELETE /{id}                       -> delete_fragment
/// POST   /{id}/pin/{scene_type_id}  -> pin_fragment
/// DELETE /{id}/pin/{scene_type_id}  -> unpin_fragment
/// ```
pub fn prompt_fragment_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(prompt_management::list_fragments).post(prompt_management::create_fragment),
        )
        .route(
            "/{id}",
            put(prompt_management::update_fragment).delete(prompt_management::delete_fragment),
        )
        .route(
            "/{id}/pin/{scene_type_id}",
            post(prompt_management::pin_fragment).delete(prompt_management::unpin_fragment),
        )
}
