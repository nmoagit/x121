//! Route definitions for scene assembly & delivery packaging (PRD-39).
//!
//! Provides three routers:
//! - `profile_router()` mounted at `/output-format-profiles`
//! - `export_router()` mounted at `/projects` (merges with project routes)
//! - `watermark_router()` mounted at `/watermark-settings`
//!
//! ```text
//! OUTPUT FORMAT PROFILES:
//! GET    /                              list_profiles
//! POST   /                              create_profile
//! GET    /{id}                          get_profile
//! PUT    /{id}                          update_profile
//! DELETE /{id}                          delete_profile
//!
//! PROJECT DELIVERY:
//! POST   /{project_id}/assemble                start_assembly
//! GET    /{project_id}/delivery-validation      validate_delivery
//! GET    /{project_id}/exports                  list_exports
//! GET    /{project_id}/exports/{export_id}      get_export
//!
//! WATERMARK SETTINGS:
//! GET    /                              list_watermarks
//! POST   /                              create_watermark
//! GET    /{id}                          get_watermark
//! PUT    /{id}                          update_watermark
//! DELETE /{id}                          delete_watermark
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::delivery;
use crate::state::AppState;

/// Output format profile routes — mounted at `/output-format-profiles`.
pub fn profile_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(delivery::list_profiles).post(delivery::create_profile),
        )
        .route(
            "/{id}",
            get(delivery::get_profile)
                .put(delivery::update_profile)
                .delete(delivery::delete_profile),
        )
}

/// Delivery export routes — merged into `/projects`.
pub fn export_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/assemble",
            post(delivery::start_assembly),
        )
        .route(
            "/{project_id}/delivery-validation",
            get(delivery::validate_delivery),
        )
        .route(
            "/{project_id}/exports",
            get(delivery::list_exports),
        )
        .route(
            "/{project_id}/exports/{export_id}",
            get(delivery::get_export),
        )
}

/// Watermark settings routes — mounted at `/watermark-settings`.
pub fn watermark_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(delivery::list_watermarks).post(delivery::create_watermark),
        )
        .route(
            "/{id}",
            get(delivery::get_watermark)
                .put(delivery::update_watermark)
                .delete(delivery::delete_watermark),
        )
}
