//! Route definitions for cloud GPU provider management (PRD-114).
//!
//! All routes mounted at `/admin/cloud-providers`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::cloud_providers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Dashboard (must be before /:id to avoid path conflicts)
        .route("/dashboard", get(cloud_providers::dashboard))
        // Emergency stop all
        .route(
            "/emergency-stop-all",
            post(cloud_providers::emergency_stop_all),
        )
        // Provider CRUD
        .route(
            "/",
            get(cloud_providers::list_providers).post(cloud_providers::create_provider),
        )
        .route(
            "/{id}",
            get(cloud_providers::get_provider)
                .put(cloud_providers::update_provider)
                .delete(cloud_providers::delete_provider),
        )
        .route(
            "/{id}/test-connection",
            post(cloud_providers::test_connection),
        )
        // GPU Types
        .route("/{id}/gpu-types", get(cloud_providers::list_gpu_types))
        .route(
            "/{id}/gpu-types/sync",
            post(cloud_providers::sync_gpu_types),
        )
        .route(
            "/{id}/gpu-types/{gpu_id}",
            axum::routing::put(cloud_providers::update_gpu_type),
        )
        // Instances
        .route("/{id}/instances", get(cloud_providers::list_instances))
        .route(
            "/{id}/instances/provision",
            post(cloud_providers::provision_instance),
        )
        .route(
            "/{id}/instances/{inst_id}/start",
            post(cloud_providers::start_instance),
        )
        .route(
            "/{id}/instances/{inst_id}/stop",
            post(cloud_providers::stop_instance),
        )
        .route(
            "/{id}/instances/{inst_id}/terminate",
            post(cloud_providers::terminate_instance),
        )
        .route(
            "/{id}/instances/{inst_id}/status",
            get(cloud_providers::get_instance_status),
        )
        // Scaling Rules
        .route(
            "/{id}/scaling-rules",
            get(cloud_providers::list_scaling_rules).post(cloud_providers::create_scaling_rule),
        )
        .route(
            "/{id}/scaling-rules/{rule_id}",
            axum::routing::put(cloud_providers::update_scaling_rule)
                .delete(cloud_providers::delete_scaling_rule),
        )
        // Cost
        .route("/{id}/cost-summary", get(cloud_providers::get_cost_summary))
        .route("/{id}/cost-events", get(cloud_providers::list_cost_events))
        // Serverless
        .route(
            "/{id}/serverless/submit",
            post(cloud_providers::submit_serverless_job),
        )
        .route(
            "/{id}/serverless/{job_id}/status",
            get(cloud_providers::get_serverless_status),
        )
        .route(
            "/{id}/serverless/{job_id}/cancel",
            post(cloud_providers::cancel_serverless_job),
        )
        // Emergency stop per provider
        .route(
            "/{id}/emergency-stop",
            post(cloud_providers::emergency_stop_provider),
        )
}
