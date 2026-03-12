//! Route definitions for Dashboard Widget Customization (PRD-89).
//!
//! ```text
//! USER DASHBOARD (mounted at /user/dashboard):
//! GET    /effective                    get_dashboard (resolve effective layout)
//! PUT    /layout                       save_dashboard (save layout + settings)
//! GET    /presets                       list_presets
//! POST   /presets                       create_preset
//! PUT    /presets/{id}                 update_preset
//! DELETE /presets/{id}                 delete_preset
//! POST   /presets/{id}/activate        activate_preset
//! POST   /presets/{id}/share           share_preset
//! POST   /presets/import/{share_token} import_preset
//!
//! DASHBOARD CATALOGUE (mounted at /dashboard):
//! GET    /widget-catalogue               get_widget_catalogue
//!
//! ADMIN DASHBOARD (mounted at /admin/dashboard):
//! GET    /role-defaults                list_role_defaults
//! PUT    /role-defaults/{role}         update_role_default
//! ```

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::dashboard_customization;
use crate::state::AppState;

/// User dashboard preset routes -- merged into `/user/dashboard`.
pub fn user_dashboard_router() -> Router<AppState> {
    Router::new()
        .route("/effective", get(dashboard_customization::get_dashboard))
        .route("/layout", put(dashboard_customization::save_dashboard))
        .route(
            "/presets",
            get(dashboard_customization::list_presets).post(dashboard_customization::create_preset),
        )
        .route(
            "/presets/{id}",
            put(dashboard_customization::update_preset)
                .delete(dashboard_customization::delete_preset),
        )
        .route(
            "/presets/{id}/activate",
            post(dashboard_customization::activate_preset),
        )
        .route(
            "/presets/{id}/share",
            post(dashboard_customization::share_preset),
        )
        .route(
            "/presets/import/{share_token}",
            post(dashboard_customization::import_preset),
        )
}

/// Dashboard catalogue routes -- merged into `/dashboard`.
pub fn dashboard_catalog_router() -> Router<AppState> {
    Router::new().route(
        "/widget-catalogue",
        get(dashboard_customization::get_widget_catalogue),
    )
}

/// Admin dashboard routes -- mounted at `/admin/dashboard`.
pub fn admin_dashboard_router() -> Router<AppState> {
    Router::new()
        .route(
            "/role-defaults",
            get(dashboard_customization::list_role_defaults),
        )
        .route(
            "/role-defaults/{role}",
            put(dashboard_customization::update_role_default),
        )
}
