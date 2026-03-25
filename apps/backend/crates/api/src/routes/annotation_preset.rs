//! Route definitions for annotation presets (PRD-149).

use axum::routing::get;
use axum::Router;

use crate::handlers::annotation_preset;
use crate::state::AppState;

/// Routes mounted at `/annotation-presets`.
///
/// ```text
/// GET    /       -> list_annotation_presets (?pipeline_id)
/// POST   /       -> create_annotation_preset
/// PUT    /{id}   -> update_annotation_preset
/// DELETE /{id}   -> delete_annotation_preset
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(annotation_preset::list_annotation_presets)
                .post(annotation_preset::create_annotation_preset),
        )
        .route(
            "/{id}",
            axum::routing::put(annotation_preset::update_annotation_preset)
                .delete(annotation_preset::delete_annotation_preset),
        )
}
