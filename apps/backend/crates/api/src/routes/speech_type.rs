//! Route definitions for speech types (PRD-124).

use axum::routing::get;
use axum::Router;

use crate::handlers::speech_type;
use crate::state::AppState;

/// Routes mounted at `/speech-types`.
///
/// ```text
/// GET    /   -> list_speech_types
/// POST   /   -> create_speech_type
/// ```
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(speech_type::list_speech_types).post(speech_type::create_speech_type),
    )
}
