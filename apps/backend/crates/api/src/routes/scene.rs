//! Route definitions for scene-scoped sub-resources.
//!
//! These routes are mounted at `/scenes` and provide access to segments
//! and video versions that belong to a specific scene.

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post, put};
use axum::Router;

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
/// GET    /{scene_id}/versions/{id}           get_by_id
/// DELETE /{scene_id}/versions/{id}           delete
/// PUT    /{scene_id}/versions/{id}/set-final set_final
/// PUT    /{scene_id}/versions/{id}/approve   approve_clip
/// PUT    /{scene_id}/versions/{id}/reject    reject_clip
/// POST   /{scene_id}/versions/{id}/resume-from resume_from_clip
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
        .route("/{id}", get(version::get_by_id).delete(version::delete))
        .route("/{id}/set-final", put(version::set_final))
        .route("/{id}/approve", put(version::approve_clip))
        .route("/{id}/reject", put(version::reject_clip))
        .route("/{id}/resume-from", post(version::resume_from_clip))
        .layer(DefaultBodyLimit::max(IMPORT_BODY_LIMIT));

    Router::new()
        .nest("/{scene_id}/segments", segment_routes)
        .nest("/{scene_id}/versions", version_routes)
}
