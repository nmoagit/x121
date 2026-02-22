//! Route definitions for the template & preset system (PRD-27).
//!
//! Provides two routers:
//! - `template_router()` mounted at `/templates`
//! - `preset_router()` mounted at `/presets`
//!
//! ```text
//! TEMPLATES:
//! GET    /                              list_templates
//! POST   /                              create_template
//! GET    /{id}                          get_template
//! PUT    /{id}                          update_template
//! DELETE /{id}                          delete_template
//!
//! PRESETS:
//! GET    /                              list_presets
//! POST   /                              create_preset
//! GET    /marketplace                   marketplace
//! GET    /{id}                          get_preset
//! PUT    /{id}                          update_preset
//! DELETE /{id}                          delete_preset
//! POST   /{id}/rate                     rate_preset
//! GET    /{id}/diff/{scene_type_id}     preview_apply
//! POST   /{id}/apply/{scene_type_id}    apply_preset
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::presets;
use crate::state::AppState;

/// Template routes — mounted at `/templates`.
pub fn template_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(presets::list_templates).post(presets::create_template),
        )
        .route(
            "/{id}",
            get(presets::get_template)
                .put(presets::update_template)
                .delete(presets::delete_template),
        )
}

/// Preset routes — mounted at `/presets`.
pub fn preset_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(presets::list_presets).post(presets::create_preset),
        )
        .route("/marketplace", get(presets::marketplace))
        .route(
            "/{id}",
            get(presets::get_preset)
                .put(presets::update_preset)
                .delete(presets::delete_preset),
        )
        .route("/{id}/rate", post(presets::rate_preset))
        .route("/{id}/diff/{scene_type_id}", get(presets::preview_apply))
        .route("/{id}/apply/{scene_type_id}", post(presets::apply_preset))
}
