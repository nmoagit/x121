//! Route definitions for character face embedding endpoints (PRD-76).
//!
//! These routes are merged into the `/characters` nest alongside other
//! character-scoped sub-resources (images, scenes, metadata).
//!
//! ```text
//! POST   /{character_id}/extract-embedding   -> extract_embedding
//! GET    /{character_id}/embedding-status     -> get_embedding_status
//! GET    /{character_id}/detected-faces       -> get_detected_faces
//! POST   /{character_id}/select-face          -> select_face
//! GET    /{character_id}/embedding-history    -> get_embedding_history
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::embedding;
use crate::state::AppState;

/// Router for face-embedding endpoints, merged into `/characters`.
pub fn embedding_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/extract-embedding",
            post(embedding::extract_embedding),
        )
        .route(
            "/{character_id}/embedding-status",
            get(embedding::get_embedding_status),
        )
        .route(
            "/{character_id}/detected-faces",
            get(embedding::get_detected_faces),
        )
        .route(
            "/{character_id}/select-face",
            post(embedding::select_face),
        )
        .route(
            "/{character_id}/embedding-history",
            get(embedding::get_embedding_history),
        )
}
