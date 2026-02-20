//! Route definitions for image QA endpoints.
//!
//! Mounted at `/qa` within the `/api/v1` tree.
//!
//! ```text
//! GET    /check-types                                 -> list_check_types
//! POST   /run                                         -> run_qa
//! GET    /image-variants/{id}/results                 -> get_results
//! GET    /characters/{character_id}/source-qa-results -> get_source_results
//! GET    /projects/{project_id}/thresholds            -> get_thresholds
//! PUT    /projects/{project_id}/thresholds            -> update_threshold
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::image_qa;
use crate::state::AppState;

/// Build the `/qa` router.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/check-types", get(image_qa::list_check_types))
        .route("/run", post(image_qa::run_qa))
        .route("/image-variants/{id}/results", get(image_qa::get_results))
        .route(
            "/characters/{character_id}/source-qa-results",
            get(image_qa::get_source_results),
        )
        .route(
            "/projects/{project_id}/thresholds",
            get(image_qa::get_thresholds).put(image_qa::update_threshold),
        )
}
