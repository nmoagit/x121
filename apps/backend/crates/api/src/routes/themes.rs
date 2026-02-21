//! Route definitions for the theme system (PRD-29).
//!
//! Two routers are provided:
//! - `user_router()` for user-facing theme preference routes mounted at `/user/theme`
//! - `admin_router()` for admin custom theme management mounted at `/admin/themes`

use axum::routing::get;
use axum::Router;

use crate::handlers::themes;
use crate::state::AppState;

/// User theme preference routes mounted at `/user/theme`.
///
/// ```text
/// GET /  -> get_user_theme
/// PUT /  -> update_user_theme
/// ```
pub fn user_router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(themes::get_user_theme).put(themes::update_user_theme),
    )
}

/// Admin custom theme routes mounted at `/admin/themes`.
///
/// ```text
/// GET    /              -> list_custom_themes
/// POST   /              -> create_custom_theme
/// GET    /{id}          -> get_custom_theme
/// PUT    /{id}          -> update_custom_theme
/// DELETE /{id}          -> delete_custom_theme
/// GET    /{id}/export   -> export_custom_theme
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(themes::list_custom_themes).post(themes::create_custom_theme),
        )
        .route(
            "/{id}",
            get(themes::get_custom_theme)
                .put(themes::update_custom_theme)
                .delete(themes::delete_custom_theme),
        )
        .route("/{id}/export", get(themes::export_custom_theme))
}
