//! Route definitions for Storyboard View & Scene Thumbnails (PRD-62).
//!
//! ```text
//! KEYFRAMES:
//! POST   /                                create_keyframe
//! GET    /segment/{segment_id}            list_segment_keyframes
//! DELETE /segment/{segment_id}            delete_segment_keyframes
//!
//! SCENE STORYBOARD (merged into /scenes):
//! GET    /{scene_id}/storyboard           list_scene_storyboard
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::storyboard;
use crate::state::AppState;

/// Keyframe routes -- mounted at `/keyframes`.
pub fn storyboard_router() -> Router<AppState> {
    Router::new()
        .route("/", post(storyboard::create_keyframe))
        .route(
            "/segment/{segment_id}",
            get(storyboard::list_segment_keyframes)
                .delete(storyboard::delete_segment_keyframes),
        )
}

/// Scene storyboard route -- merged into `/scenes`.
///
/// Provides `GET /{scene_id}/storyboard` for the scene-level filmstrip view.
pub fn scene_storyboard_router() -> Router<AppState> {
    Router::new().route(
        "/{scene_id}/storyboard",
        get(storyboard::list_scene_storyboard),
    )
}
