//! Route definitions for ComfyUI Workflow Import & Validation (PRD-75).
//!
//! These routes are merged into the existing `/workflows` nest alongside
//! the workflow canvas routes from PRD-33.
//!
//! ```text
//! WORKFLOW REGISTRY:
//! POST   /import                           import_workflow
//! GET    /                                 list_workflows (?status_id, limit, offset)
//! GET    /{id}/detail                      get_workflow
//! PUT    /{id}                             update_workflow
//! DELETE /{id}                             delete_workflow
//! POST   /{id}/validate                    validate_workflow
//! GET    /{id}/validation-report           get_validation_report
//! GET    /{id}/versions                    list_versions (?limit, offset)
//! GET    /{id}/versions/{version}          get_version
//! GET    /{id}/diff                        diff_versions (?v1, v2)
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::workflow_import;
use crate::state::AppState;

/// Workflow import & registry routes -- merged into `/workflows`.
///
/// Note: `GET /` for listing and `GET /{id}/detail` for single workflow use
/// `/detail` suffix to avoid conflicts with the canvas route `/{id}/canvas`.
pub fn workflow_import_router() -> Router<AppState> {
    Router::new()
        .route("/import", post(workflow_import::import_workflow))
        .route("/", get(workflow_import::list_workflows))
        .route(
            "/{id}/detail",
            get(workflow_import::get_workflow)
                .put(workflow_import::update_workflow)
                .delete(workflow_import::delete_workflow),
        )
        .route("/{id}/validate", post(workflow_import::validate_workflow))
        .route(
            "/{id}/validation-report",
            get(workflow_import::get_validation_report),
        )
        .route("/{id}/versions", get(workflow_import::list_versions))
        .route(
            "/{id}/versions/{version}",
            get(workflow_import::get_version),
        )
        .route("/{id}/diff", get(workflow_import::diff_versions))
}
