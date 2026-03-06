//! Route definitions for delivery destinations (PRD-039 Amendment A.1).
//!
//! Provides a router merged into `/projects`:
//!
//! ```text
//! GET    /{project_id}/delivery-destinations              list
//! POST   /{project_id}/delivery-destinations              create
//! GET    /{project_id}/delivery-destinations/{id}         get_by_id
//! PUT    /{project_id}/delivery-destinations/{id}         update
//! DELETE /{project_id}/delivery-destinations/{id}         delete
//! ```

use axum::routing::get;
use axum::Router;

use crate::handlers::delivery_destination;
use crate::state::AppState;

/// Delivery destination routes — merged into `/projects`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/delivery-destinations",
            get(delivery_destination::list).post(delivery_destination::create),
        )
        .route(
            "/{project_id}/delivery-destinations/{id}",
            get(delivery_destination::get_by_id)
                .put(delivery_destination::update)
                .delete(delivery_destination::delete),
        )
}
