//! Route definitions for the `/auth` resource.

use axum::routing::post;
use axum::Router;

use crate::handlers::auth;
use crate::state::AppState;

/// Routes mounted at `/auth`.
///
/// ```text
/// POST /login    -> login
/// POST /refresh  -> refresh
/// POST /logout   -> logout (requires auth)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(auth::login))
        .route("/refresh", post(auth::refresh))
        .route("/logout", post(auth::logout))
}
