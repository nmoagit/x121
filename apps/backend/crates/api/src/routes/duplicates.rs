//! Route definitions for character duplicate detection endpoints (PRD-79).
//!
//! ```text
//! /characters/duplicates/check              check single character (POST)
//! /characters/duplicates/batch              batch check (POST)
//! /characters/duplicates/history            check history (GET)
//! /characters/duplicates/{id}/resolve       resolve match (POST)
//! /characters/duplicates/{id}/dismiss       dismiss match (POST)
//!
//! /admin/duplicate-settings                 get, update settings (GET, PUT)
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::duplicates;
use crate::state::AppState;

/// Duplicate checking and resolution routes, nested at `/characters/duplicates`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/check", post(duplicates::check_duplicate))
        .route("/batch", post(duplicates::batch_check))
        .route("/history", get(duplicates::list_checks))
        .route("/{id}/resolve", post(duplicates::resolve_check))
        .route("/{id}/dismiss", post(duplicates::dismiss_check))
}

/// Settings management routes, nested at `/admin/duplicate-settings`.
pub fn settings_router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(duplicates::get_settings).put(duplicates::update_settings),
    )
}
