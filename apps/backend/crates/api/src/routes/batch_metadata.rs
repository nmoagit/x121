//! Route definitions for Batch Metadata Operations (PRD-88).
//!
//! Mounted at `/admin/batch-metadata` by `api_routes()`.
//!
//! ```text
//! GET    /                  -> list_operations (?project_id, operation_type, status, limit, offset)
//! POST   /                  -> create_preview
//! GET    /{id}              -> get_operation
//! POST   /{id}/execute      -> execute_operation
//! POST   /{id}/undo         -> undo_operation
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::batch_metadata;
use crate::state::AppState;

/// Batch metadata operations routes -- mounted at `/admin/batch-metadata`.
pub fn batch_metadata_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(batch_metadata::list_operations).post(batch_metadata::create_preview),
        )
        .route("/{id}", get(batch_metadata::get_operation))
        .route("/{id}/execute", post(batch_metadata::execute_operation))
        .route("/{id}/undo", post(batch_metadata::undo_operation))
}
