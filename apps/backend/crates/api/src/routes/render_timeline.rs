//! Route definitions for the render queue timeline / Gantt view (PRD-90).
//!
//! Timeline viewing requires authentication.
//! Job reordering uses the existing `PUT /admin/queue/reorder` from queue.rs (PRD-08).

use axum::routing::get;
use axum::Router;

use crate::handlers::render_timeline;
use crate::state::AppState;

/// Routes mounted at `/queue/timeline`.
///
/// ```text
/// GET  /         -> get_timeline
/// ```
pub fn router() -> Router<AppState> {
    Router::new().route("/", get(render_timeline::get_timeline))
}
