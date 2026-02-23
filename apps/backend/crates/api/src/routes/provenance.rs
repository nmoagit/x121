//! Route definitions for Generation Provenance & Asset Versioning (PRD-69).
//!
//! ```text
//! PROVENANCE:
//! POST  /receipts                 create_receipt
//! PATCH /receipts/{id}/complete   complete_receipt
//! GET   /staleness                get_staleness_report (?project_id)
//!
//! SEGMENT PROVENANCE (merged into /segments):
//! GET   /{segment_id}/provenance  get_segment_provenance
//!
//! ASSET USAGE (merged into /assets):
//! GET   /{asset_id}/usage         get_asset_usage (?version)
//! ```

use axum::routing::{get, patch, post};
use axum::Router;

use crate::handlers::provenance;
use crate::state::AppState;

/// Provenance routes -- mounted at `/provenance`.
pub fn provenance_router() -> Router<AppState> {
    Router::new()
        .route("/receipts", post(provenance::create_receipt))
        .route(
            "/receipts/{id}/complete",
            patch(provenance::complete_receipt),
        )
        .route("/staleness", get(provenance::get_staleness_report))
}

/// Segment provenance sub-route -- merged into `/segments`.
pub fn segment_provenance_router() -> Router<AppState> {
    Router::new().route(
        "/{segment_id}/provenance",
        get(provenance::get_segment_provenance),
    )
}

/// Asset usage sub-route -- merged into `/assets`.
pub fn asset_provenance_router() -> Router<AppState> {
    Router::new().route("/{asset_id}/usage", get(provenance::get_asset_usage))
}
