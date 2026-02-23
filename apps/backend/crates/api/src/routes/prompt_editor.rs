//! Route definitions for Prompt Editor & Versioning (PRD-63).
//!
//! ```text
//! SCENE-TYPE PROMPT VERSIONS (merged into /scene-types):
//! GET    /{id}/prompt-versions               list_versions
//! POST   /{id}/prompt-versions               save_prompt_version
//!
//! PROMPT VERSIONS (mounted at /prompt-versions):
//! GET    /{id_a}/diff/{id_b}                 diff_versions
//! POST   /{id}/restore                       restore_version
//!
//! PROMPT LIBRARY (mounted at /prompt-library):
//! GET    /                                   list_library
//! POST   /                                   create_library_entry
//! GET    /{id}                               get_library_entry
//! PUT    /{id}                               update_library_entry
//! DELETE /{id}                               delete_library_entry
//! POST   /{id}/rate                          rate_library_entry
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::prompt_editor;
use crate::state::AppState;

/// Scene-type-scoped prompt version routes -- merged into `/scene-types`.
pub fn scene_type_prompt_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/prompt-versions",
        get(prompt_editor::list_versions).post(prompt_editor::save_prompt_version),
    )
}

/// Prompt version routes -- mounted at `/prompt-versions`.
pub fn prompt_version_router() -> Router<AppState> {
    Router::new()
        .route("/{id_a}/diff/{id_b}", get(prompt_editor::diff_versions))
        .route("/{id}/restore", post(prompt_editor::restore_version))
}

/// Prompt library routes -- mounted at `/prompt-library`.
pub fn prompt_library_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(prompt_editor::list_library).post(prompt_editor::create_library_entry),
        )
        .route(
            "/{id}",
            get(prompt_editor::get_library_entry)
                .put(prompt_editor::update_library_entry)
                .delete(prompt_editor::delete_library_entry),
        )
        .route("/{id}/rate", post(prompt_editor::rate_library_entry))
}
