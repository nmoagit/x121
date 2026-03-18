//! Route definitions for languages (PRD-136).

use axum::routing::get;
use axum::Router;

use crate::handlers::language;
use crate::state::AppState;

/// Routes mounted at `/languages`.
///
/// ```text
/// GET    /   -> list_languages
/// POST   /   -> create_language
/// ```
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(language::list_languages).post(language::create_language),
    )
}
