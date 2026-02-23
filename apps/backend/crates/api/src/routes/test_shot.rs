//! Route definitions for Scene Preview & Quick Test (PRD-58).
//!
//! ```text
//! TEST SHOTS:
//! POST   /                              generate_test_shot
//! GET    /                              list_gallery (?scene_type_id, character_id, limit, offset)
//! POST   /batch                         batch_test_shots
//! GET    /{id}                          get_test_shot
//! DELETE /{id}                          delete_test_shot
//! POST   /{id}/promote                  promote_test_shot
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::test_shot;
use crate::state::AppState;

/// Test shot routes -- mounted at `/test-shots`.
pub fn test_shot_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(test_shot::generate_test_shot).get(test_shot::list_gallery),
        )
        .route("/batch", post(test_shot::batch_test_shots))
        .route(
            "/{id}",
            get(test_shot::get_test_shot).delete(test_shot::delete_test_shot),
        )
        .route("/{id}/promote", post(test_shot::promote_test_shot))
}
