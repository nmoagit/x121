//! Route definitions for avatar face embedding endpoints (PRD-76).
//!
//! These routes are merged into the `/avatars` nest alongside other
//! avatar-scoped sub-resources (images, scenes, metadata).
//!
//! ```text
//! POST   /{avatar_id}/extract-embedding   -> extract_embedding
//! GET    /{avatar_id}/embedding-status     -> get_embedding_status
//! GET    /{avatar_id}/detected-faces       -> get_detected_faces
//! POST   /{avatar_id}/select-face          -> select_face
//! GET    /{avatar_id}/embedding-history    -> get_embedding_history
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::embedding;
use crate::state::AppState;

/// Router for face-embedding endpoints, merged into `/avatars`.
pub fn embedding_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/extract-embedding",
            post(embedding::extract_embedding),
        )
        .route(
            "/{avatar_id}/embedding-status",
            get(embedding::get_embedding_status),
        )
        .route(
            "/{avatar_id}/detected-faces",
            get(embedding::get_detected_faces),
        )
        .route("/{avatar_id}/select-face", post(embedding::select_face))
        .route(
            "/{avatar_id}/embedding-history",
            get(embedding::get_embedding_history),
        )
}
