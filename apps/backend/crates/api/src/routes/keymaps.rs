//! Route definitions for the keyboard shortcut / keymap system (PRD-52).
//!
//! Two routers are provided:
//! - `user_router()` for per-user keymap routes mounted at `/user/keymap`
//! - `preset_router()` for preset listing and export/import at `/keymaps`

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::keymaps;
use crate::state::AppState;

/// User keymap routes mounted at `/user/keymap`.
///
/// ```text
/// GET /  -> get_keymap
/// PUT /  -> update_keymap
/// ```
pub fn user_router() -> Router<AppState> {
    Router::new().route("/", get(keymaps::get_keymap).put(keymaps::update_keymap))
}

/// Preset and export/import routes mounted at `/keymaps`.
///
/// ```text
/// GET  /presets -> list_presets
/// POST /export  -> export_keymap
/// POST /import  -> import_keymap
/// ```
pub fn preset_router() -> Router<AppState> {
    Router::new()
        .route("/presets", get(keymaps::list_presets))
        .route("/export", post(keymaps::export_keymap))
        .route("/import", post(keymaps::import_keymap))
}
