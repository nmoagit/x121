//! Route definitions for on-frame annotation and markup (PRD-70).
//!
//! Segment-scoped annotation routes are merged into the `/segments` route group.

use axum::routing::get;
use axum::Router;

use crate::handlers::annotation;
use crate::state::AppState;

/// Segment-scoped annotation routes, merged into `/segments`.
///
/// ```text
/// GET    /{id}/annotations                     list_annotations (?user_id, ?frame_number)
/// POST   /{id}/annotations                     create_annotation
/// GET    /{id}/annotations/summary             annotation_summary
/// GET    /{id}/annotations/export/{frame}      export_frame
/// GET    /{id}/annotations/{ann_id}            get_annotation
/// PUT    /{id}/annotations/{ann_id}            update_annotation
/// DELETE /{id}/annotations/{ann_id}            delete_annotation
/// ```
pub fn segment_annotation_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/annotations",
            get(annotation::list_annotations).post(annotation::create_annotation),
        )
        .route(
            "/{id}/annotations/summary",
            get(annotation::annotation_summary),
        )
        .route(
            "/{id}/annotations/export/{frame}",
            get(annotation::export_frame),
        )
        .route(
            "/{id}/annotations/{ann_id}",
            get(annotation::get_annotation)
                .put(annotation::update_annotation)
                .delete(annotation::delete_annotation),
        )
}
