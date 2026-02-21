//! Route definitions for the layout system (PRD-30).
//!
//! Two routers are provided:
//! - `user_router()` for user-facing layout routes mounted at `/user/layouts`
//! - `admin_router()` for admin layout preset management mounted at `/admin/layout-presets`

use axum::routing::get;
use axum::Router;

use crate::handlers::layouts;
use crate::state::AppState;

/// User layout routes mounted at `/user/layouts`.
///
/// ```text
/// GET    /      -> list_user_layouts
/// POST   /      -> create_user_layout
/// GET    /{id}  -> get_user_layout
/// PUT    /{id}  -> update_user_layout
/// DELETE /{id}  -> delete_user_layout
/// ```
pub fn user_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(layouts::list_user_layouts).post(layouts::create_user_layout),
        )
        .route(
            "/{id}",
            get(layouts::get_user_layout)
                .put(layouts::update_user_layout)
                .delete(layouts::delete_user_layout),
        )
}

/// Admin layout preset routes mounted at `/admin/layout-presets`.
///
/// ```text
/// GET    /      -> list_admin_presets
/// POST   /      -> create_admin_preset
/// PUT    /{id}  -> update_admin_preset
/// DELETE /{id}  -> delete_admin_preset
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(layouts::list_admin_presets).post(layouts::create_admin_preset),
        )
        .route(
            "/{id}",
            axum::routing::put(layouts::update_admin_preset).delete(layouts::delete_admin_preset),
        )
}
