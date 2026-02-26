//! Route definitions for System Integrity & Repair Tools (PRD-43).
//!
//! ```text
//! /admin/integrity-scans                  list scans (GET), start scan (POST)
//! /admin/integrity-scans/{worker_id}      worker report (GET), start worker scan (POST)
//!
//! /admin/repair/{worker_id}               full repair (POST)
//! /admin/repair/{worker_id}/sync-models   sync models (POST)
//! /admin/repair/{worker_id}/install-nodes install nodes (POST)
//!
//! /admin/model-checksums                  list (GET), create (POST)
//! /admin/model-checksums/{id}             update (PUT), delete (DELETE)
//! ```

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::integrity;
use crate::state::AppState;

/// Routes for integrity scan management.
pub fn scan_router() -> Router<AppState> {
    Router::new()
        .route("/", post(integrity::start_scan).get(integrity::list_scans))
        .route(
            "/{worker_id}",
            post(integrity::start_worker_scan).get(integrity::get_worker_report),
        )
}

/// Routes for repair actions on a specific worker.
pub fn repair_router() -> Router<AppState> {
    Router::new()
        .route("/{worker_id}", post(integrity::repair_worker))
        .route("/{worker_id}/sync-models", post(integrity::sync_models))
        .route("/{worker_id}/install-nodes", post(integrity::install_nodes))
}

/// Routes for model checksum CRUD.
pub fn checksum_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(integrity::list_checksums).post(integrity::create_checksum),
        )
        .route(
            "/{id}",
            put(integrity::update_checksum).delete(integrity::delete_checksum),
        )
}
