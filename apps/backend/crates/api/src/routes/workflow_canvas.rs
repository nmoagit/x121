//! Route definitions for the node-based workflow canvas (PRD-33).
//!
//! Provides a single router mounted at `/workflows` that handles:
//! - Canvas layout persistence (GET/PUT `/:id/canvas`)
//! - Timing telemetry (GET `/:id/telemetry`)
//! - ComfyUI import (POST `/import-comfyui`)

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::workflow_canvas;
use crate::state::AppState;

/// Workflow canvas routes mounted at `/workflows`.
///
/// ```text
/// GET  /{id}/canvas       -> get_canvas
/// PUT  /{id}/canvas       -> save_canvas
/// GET  /{id}/telemetry    -> get_telemetry
/// POST /import-comfyui    -> import_comfyui
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/canvas",
            get(workflow_canvas::get_canvas).put(workflow_canvas::save_canvas),
        )
        .route(
            "/{id}/telemetry",
            get(workflow_canvas::get_telemetry),
        )
        .route(
            "/import-comfyui",
            post(workflow_canvas::import_comfyui),
        )
}
