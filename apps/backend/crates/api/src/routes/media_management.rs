//! Routes for dynamic generation seeds and media management (PRD-146).
//!
//! - Workflow media slot routes are merged into the `/workflows` nest.
//! - Avatar media assignment routes are merged into the `/avatars` nest.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::media_management;
use crate::state::AppState;

/// Workflow media slot routes (merged into `/workflows`).
///
/// ```text
/// GET  /{workflow_id}/media-slots            -> list_media_slots
/// PUT  /{workflow_id}/media-slots/{slot_id}  -> update_media_slot
/// POST /backfill-media-slots                 -> backfill_media_slots
/// ```
pub fn workflow_media_slot_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{workflow_id}/media-slots",
            get(media_management::list_media_slots),
        )
        .route(
            "/{workflow_id}/media-slots/{slot_id}",
            put(media_management::update_media_slot),
        )
        .route(
            "/backfill-media-slots",
            post(media_management::backfill_media_slots),
        )
}

/// Avatar media assignment routes (merged into `/avatars`).
///
/// ```text
/// GET    /{avatar_id}/media-assignments                  -> list_avatar_media_assignments
/// POST   /{avatar_id}/media-assignments                  -> upsert_avatar_media_assignment
/// GET    /{avatar_id}/media-assignments/{assignment_id}  -> (not implemented)
/// PUT    /{avatar_id}/media-assignments/{assignment_id}  -> update_avatar_media_assignment
/// DELETE /{avatar_id}/media-assignments/{assignment_id}  -> delete_avatar_media_assignment
/// GET    /{avatar_id}/seed-summary                       -> get_seed_summary
/// ```
pub fn avatar_media_assignment_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/media-assignments",
            get(media_management::list_avatar_media_assignments)
                .post(media_management::upsert_avatar_media_assignment),
        )
        .route(
            "/{avatar_id}/media-assignments/{assignment_id}",
            put(media_management::update_avatar_media_assignment)
                .delete(media_management::delete_avatar_media_assignment),
        )
        .route(
            "/{avatar_id}/seed-summary",
            get(media_management::get_seed_summary),
        )
        .route(
            "/{avatar_id}/actions/auto-assign-seeds",
            post(media_management::auto_assign_seeds),
        )
}
