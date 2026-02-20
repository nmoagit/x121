//! Route definitions for the `/admin` resource.

use axum::routing::get;
use axum::Router;

use crate::handlers::admin;
use crate::state::AppState;

/// Routes mounted at `/admin`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET    /users                   -> list_users
/// POST   /users                   -> create_user
/// GET    /users/{id}              -> get_user
/// PUT    /users/{id}              -> update_user
/// DELETE /users/{id}              -> deactivate_user
/// POST   /users/{id}/reset-password -> reset_password
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(admin::list_users).post(admin::create_user))
        .route(
            "/users/{id}",
            get(admin::get_user)
                .put(admin::update_user)
                .delete(admin::deactivate_user),
        )
        .route(
            "/users/{id}/reset-password",
            axum::routing::post(admin::reset_password),
        )
}
