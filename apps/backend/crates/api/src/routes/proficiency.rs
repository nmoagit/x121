//! Route definitions for user proficiency and focus mode (PRD-32).
//!
//! All endpoints require authentication.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::proficiency;
use crate::state::AppState;

/// Routes mounted at `/user/proficiency`.
///
/// ```text
/// GET    /                -> get_proficiency
/// PUT    /                -> set_proficiency
/// POST   /record-usage    -> record_usage
/// GET    /focus-mode      -> get_focus_mode
/// PUT    /focus-mode      -> set_focus_mode
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(proficiency::get_proficiency).put(proficiency::set_proficiency),
        )
        .route("/record-usage", post(proficiency::record_usage))
        .route(
            "/focus-mode",
            get(proficiency::get_focus_mode).put(proficiency::set_focus_mode),
        )
}
