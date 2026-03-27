//! Route definitions for scene-scoped sub-resources.
//!
//! These routes are mounted at `/scenes` and provide access to segments
//! and video versions that belong to a specific scene.

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::annotation;
use crate::handlers::scene_video_version as version;
use crate::handlers::segment;
use crate::state::AppState;

/// 500 MB — generous limit for video file imports.
const IMPORT_BODY_LIMIT: usize = 500 * 1024 * 1024;

/// Routes mounted at `/scenes`.
///
/// ```text
/// GET    /{scene_id}/segments                list_by_scene
/// POST   /{scene_id}/segments                create
/// GET    /{scene_id}/segments/{id}           get_by_id
/// PUT    /{scene_id}/segments/{id}           update
/// DELETE /{scene_id}/segments/{id}           delete
///
/// GET    /{scene_id}/versions                list_by_scene
/// POST   /{scene_id}/versions/import         import_video (multipart)
/// POST   /{scene_id}/versions/import-from-path import_from_path (JSON, PRD-153)
/// GET    /{scene_id}/versions/{id}           get_by_id
/// DELETE /{scene_id}/versions/{id}           delete
/// PUT    /{scene_id}/versions/{id}/set-final set_final
/// PUT    /{scene_id}/versions/{id}/approve    approve_clip
/// PUT    /{scene_id}/versions/{id}/unapprove unapprove_clip
/// PUT    /{scene_id}/versions/{id}/reject    reject_clip
/// GET    /{scene_id}/versions/{id}/artifacts list_artifacts
/// POST   /{scene_id}/versions/{id}/resume-from resume_from_clip
/// GET    /{scene_id}/versions/{id}/annotations        list_version_annotations
/// PUT    /{scene_id}/versions/{id}/annotations/{frame} upsert_version_annotation
/// DELETE /{scene_id}/versions/{id}/annotations/{frame} delete_version_frame_annotations
/// ```
pub fn router() -> Router<AppState> {
    let segment_routes = Router::new()
        .route("/", get(segment::list_by_scene).post(segment::create))
        .route(
            "/{id}",
            get(segment::get_by_id)
                .put(segment::update)
                .delete(segment::delete),
        );

    let version_routes = Router::new()
        .route("/", get(version::list_by_scene))
        .route("/import", post(version::import_video))
        .route("/import-from-path", post(version::import_from_path))
        .route(
            "/{id}",
            get(version::get_by_id)
                .put(version::update)
                .delete(version::delete),
        )
        .route("/{id}/set-final", put(version::set_final))
        .route("/{id}/approve", put(version::approve_clip))
        .route("/{id}/unapprove", put(version::unapprove_clip))
        .route("/{id}/reject", put(version::reject_clip))
        .route("/{id}/artifacts", get(version::list_artifacts))
        .route("/{id}/resume-from", post(version::resume_from_clip))
        .route(
            "/{id}/annotations",
            get(annotation::list_version_annotations),
        )
        .route(
            "/{id}/annotations/{frame}",
            put(annotation::upsert_version_annotation)
                .delete(annotation::delete_version_frame_annotations),
        )
        .layer(DefaultBodyLimit::max(IMPORT_BODY_LIMIT));

    Router::new()
        .nest("/{scene_id}/segments", segment_routes)
        .nest("/{scene_id}/versions", version_routes)
}
