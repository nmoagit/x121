//! Route definitions for Segment Trimming & Frame-Level Editing (PRD-78).
//!
//! ```text
//! SEGMENT-SCOPED TRIMS (merged into /segments):
//! POST   /{id}/trim                     create_trim
//! GET    /{id}/trim                     get_active_trim
//! DELETE /{id}/trim                     revert_trim
//! GET    /{id}/trim/seed-impact         get_seed_frame_impact
//!
//! BATCH TRIMS (mounted at /trims):
//! POST   /batch                         batch_trim
//! POST   /preset                        apply_preset
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::trimming;
use crate::state::AppState;

/// Segment-scoped trim routes -- merged into `/segments`.
pub fn segment_trim_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/trim",
            post(trimming::create_trim)
                .get(trimming::get_active_trim)
                .delete(trimming::revert_trim),
        )
        .route(
            "/{id}/trim/seed-impact",
            get(trimming::get_seed_frame_impact),
        )
}

/// Batch trim routes -- mounted at `/trims`.
pub fn batch_trim_router() -> Router<AppState> {
    Router::new()
        .route("/batch", post(trimming::batch_trim))
        .route("/preset", post(trimming::apply_preset))
}
