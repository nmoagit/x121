//! Route definitions for pipelines (PRD-138, PRD-143).

use axum::routing::get;
use axum::Router;

use crate::handlers::{pipeline_speech_config, pipelines};
use crate::state::AppState;

/// Routes mounted at `/pipelines`.
///
/// ```text
/// GET    /                           -> list
/// POST   /                           -> create
/// GET    /{id}                       -> get_by_id
/// PUT    /{id}                       -> update
/// DELETE /{id}                       -> delete
/// GET    /{id}/metadata-template     -> get_metadata_template
/// PUT    /{id}/metadata-template     -> set_metadata_template
/// GET    /{id}/speech-config         -> list_speech_config
/// PUT    /{id}/speech-config         -> set_speech_config
/// DELETE /{id}/speech-config/{cid}   -> delete_speech_config
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(pipelines::list).post(pipelines::create))
        .route("/code/{code}", get(pipelines::get_by_code))
        .route(
            "/{id}",
            get(pipelines::get_by_id)
                .put(pipelines::update)
                .delete(pipelines::delete),
        )
        .route(
            "/{id}/metadata-template",
            get(pipelines::get_metadata_template).put(pipelines::set_metadata_template),
        )
        .route(
            "/{id}/speech-config",
            get(pipeline_speech_config::list_speech_config)
                .put(pipeline_speech_config::set_speech_config),
        )
        .route(
            "/{id}/speech-config/{config_id}",
            axum::routing::delete(pipeline_speech_config::delete_speech_config),
        )
}
