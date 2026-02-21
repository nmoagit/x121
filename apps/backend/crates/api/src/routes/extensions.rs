//! Route definitions for the extension system (PRD-85).
//!
//! Three routers are provided:
//! - `admin_router()` for admin extension management mounted at `/admin/extensions`
//! - `registry_router()` for the client-facing registry mounted at `/extensions`
//! - `ext_api_router()` for sandboxed API bridge mounted at `/extension-api`

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::extensions;
use crate::state::AppState;

/// Admin extension management routes mounted at `/admin/extensions`.
///
/// ```text
/// GET    /              -> list_extensions
/// POST   /              -> install_extension
/// GET    /{id}          -> get_extension
/// PUT    /{id}          -> update_extension_settings
/// DELETE /{id}          -> uninstall_extension
/// POST   /{id}/enable   -> enable_extension
/// POST   /{id}/disable  -> disable_extension
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(extensions::list_extensions).post(extensions::install_extension),
        )
        .route(
            "/{id}",
            get(extensions::get_extension)
                .put(extensions::update_extension_settings)
                .delete(extensions::uninstall_extension),
        )
        .route("/{id}/enable", post(extensions::enable_extension))
        .route("/{id}/disable", post(extensions::disable_extension))
}

/// Client-facing registry routes mounted at `/extensions`.
///
/// ```text
/// GET /registry -> get_registry
/// ```
pub fn registry_router() -> Router<AppState> {
    Router::new().route("/registry", get(extensions::get_registry))
}

/// Extension API bridge routes mounted at `/extension-api`.
///
/// These endpoints proxy data access on behalf of extensions, enforcing
/// permission checks declared in the extension manifest.
///
/// ```text
/// GET /projects        -> ext_api_list_projects
/// GET /characters/{id} -> ext_api_get_character
/// ```
pub fn ext_api_router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(extensions::ext_api_list_projects))
        .route("/characters/{id}", get(extensions::ext_api_get_character))
}
