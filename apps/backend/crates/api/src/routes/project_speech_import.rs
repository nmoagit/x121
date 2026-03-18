//! Route definitions for project-level speech import and deliverables (PRD-136).

use axum::routing::post;
use axum::Router;

use crate::handlers::project_speech_import;
use crate::state::AppState;

/// Routes merged into the project router at `/projects/{project_id}/...`.
///
/// ```text
/// POST /speeches/import           -> bulk_import_speeches
/// POST /speech-deliverables       -> bulk_generate_deliverables
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/speeches/import",
            post(project_speech_import::bulk_import_speeches),
        )
        .route(
            "/{project_id}/speech-deliverables",
            post(project_speech_import::bulk_generate_deliverables),
        )
}
