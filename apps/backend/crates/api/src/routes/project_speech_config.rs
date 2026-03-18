//! Route definitions for project speech configuration (PRD-136).

use axum::routing::get;
use axum::Router;

use crate::handlers::project_speech_config;
use crate::state::AppState;

/// Routes mounted at `/projects/{project_id}/speech-config`.
///
/// ```text
/// GET  /  -> get_speech_config
/// PUT  /  -> set_speech_config
/// ```
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(project_speech_config::get_speech_config).put(project_speech_config::set_speech_config),
    )
}
