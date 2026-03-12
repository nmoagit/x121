//! Route definitions for generation infrastructure management.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::infrastructure;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/status", get(infrastructure::get_status))
        .route("/pod/start", post(infrastructure::start_pod))
        .route("/pod/stop", post(infrastructure::stop_pod))
        .route("/gpu-types", get(infrastructure::list_gpu_types))
        .route("/comfyui/refresh", post(infrastructure::refresh_instances))
        .route("/scan-orphans", post(infrastructure::scan_orphans))
        .route("/cleanup-orphans", post(infrastructure::cleanup_orphans))
        .route("/bulk/start", post(infrastructure::bulk_start))
        .route("/bulk/stop", post(infrastructure::bulk_stop))
        .route("/bulk/terminate", post(infrastructure::bulk_terminate))
        .route(
            "/cloud-instances/{id}/restart-comfyui",
            post(infrastructure::restart_comfyui),
        )
        .route(
            "/cloud-instances/{id}/force-reconnect",
            post(infrastructure::force_reconnect_instance),
        )
        .route(
            "/cloud-instances/{id}/reset-state",
            post(infrastructure::reset_state),
        )
}
