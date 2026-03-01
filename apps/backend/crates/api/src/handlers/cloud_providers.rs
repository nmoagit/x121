//! Handlers for cloud GPU provider management (PRD-114).
//!
//! All endpoints require admin role. Mounted at `/admin/cloud-providers`.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;

use x121_core::cloud::CloudGpuProvider;
use x121_core::crypto;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::cloud_provider::*;
use x121_db::repositories::{
    CloudCostEventRepo, CloudGpuTypeRepo, CloudInstanceRepo, CloudProviderRepo,
    CloudScalingRuleRepo,
};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_master_key() -> AppResult<[u8; 32]> {
    let hex = std::env::var("CLOUD_ENCRYPTION_KEY")
        .map_err(|_| AppError::InternalError("CLOUD_ENCRYPTION_KEY not set".into()))?;
    Ok(crypto::parse_master_key(&hex)?)
}

async fn ensure_provider_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<CloudProviderSafe> {
    CloudProviderRepo::find_by_id_safe(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudProvider",
                id,
            })
        })
}

async fn ensure_instance_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<CloudInstance> {
    CloudInstanceRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudInstance",
                id,
            })
        })
}

async fn get_provider_impl(
    state: &AppState,
    provider_id: DbId,
) -> AppResult<Arc<dyn CloudGpuProvider>> {
    state.cloud_registry.get(provider_id).await.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "CloudProvider (runtime)",
            id: provider_id,
        })
    })
}

// ---------------------------------------------------------------------------
// Provider CRUD
// ---------------------------------------------------------------------------

/// GET /admin/cloud-providers
pub async fn list_providers(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<Json<DataResponse<Vec<CloudProviderSafe>>>> {
    let providers = CloudProviderRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: providers }))
}

/// POST /admin/cloud-providers
pub async fn create_provider(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateCloudProvider>,
) -> AppResult<(StatusCode, Json<DataResponse<CloudProviderSafe>>)> {
    let master_key = get_master_key()?;
    let (encrypted, nonce) = crypto::encrypt_api_key(&input.api_key, &master_key)?;

    let settings = input.settings.unwrap_or_else(|| serde_json::json!({}));
    let provider = CloudProviderRepo::create(
        &state.pool,
        &input.name,
        &input.provider_type,
        &encrypted,
        &nonce,
        input.base_url.as_deref(),
        &settings,
        input.budget_limit_cents,
    )
    .await?;

    // Register runtime provider
    register_runtime_provider(&state, provider.id, &provider).await;

    let safe = CloudProviderRepo::find_by_id_safe(&state.pool, provider.id)
        .await?
        .unwrap();
    Ok((StatusCode::CREATED, Json(DataResponse { data: safe })))
}

/// GET /admin/cloud-providers/:id
pub async fn get_provider(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<CloudProviderSafe>>> {
    let provider = ensure_provider_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: provider }))
}

/// PUT /admin/cloud-providers/:id
pub async fn update_provider(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateCloudProvider>,
) -> AppResult<Json<DataResponse<CloudProviderSafe>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;

    // Handle API key update separately if provided
    if let Some(ref new_key) = input.api_key {
        let master_key = get_master_key()?;
        let (encrypted, nonce) = crypto::encrypt_api_key(new_key, &master_key)?;
        CloudProviderRepo::update_api_key(&state.pool, id, &encrypted, &nonce).await?;

        // Re-register runtime provider with new key
        if let Ok(Some(full)) = CloudProviderRepo::find_by_id(&state.pool, id).await {
            register_runtime_provider(&state, id, &full).await;
        }
    }

    let provider = CloudProviderRepo::update(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudProvider",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: provider }))
}

/// DELETE /admin/cloud-providers/:id
pub async fn delete_provider(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = CloudProviderRepo::delete(&state.pool, id).await?;
    if deleted {
        state.cloud_registry.remove(id).await;
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "CloudProvider",
            id,
        }))
    }
}

/// POST /admin/cloud-providers/:id/test-connection
pub async fn test_connection(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<x121_core::cloud::ProviderHealth>>> {
    let provider = get_provider_impl(&state, id).await?;
    let health = provider.health_check().await?;
    Ok(Json(DataResponse { data: health }))
}

// ---------------------------------------------------------------------------
// GPU Types
// ---------------------------------------------------------------------------

/// GET /admin/cloud-providers/:id/gpu-types
pub async fn list_gpu_types(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CloudGpuType>>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let types = CloudGpuTypeRepo::list_by_provider(&state.pool, id).await?;
    Ok(Json(DataResponse { data: types }))
}

/// POST /admin/cloud-providers/:id/gpu-types/sync
pub async fn sync_gpu_types(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CloudGpuType>>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let provider = get_provider_impl(&state, id).await?;

    let remote_types = provider.list_gpu_types().await?;

    let mut results = Vec::new();
    for gt in remote_types {
        let create = CreateCloudGpuType {
            gpu_id: gt.gpu_id,
            name: gt.name,
            vram_mb: gt.vram_mb as i32,
            cost_per_hour_cents: gt.cost_per_hour_cents as i32,
            max_gpu_count: Some(gt.max_gpu_count as i16),
            metadata: None,
        };
        let upserted = CloudGpuTypeRepo::upsert(&state.pool, id, &create).await?;
        results.push(upserted);
    }

    Ok(Json(DataResponse { data: results }))
}

/// PUT /admin/cloud-providers/:id/gpu-types/:gpu_id
pub async fn update_gpu_type(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((provider_id, gpu_type_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCloudGpuType>,
) -> AppResult<Json<DataResponse<CloudGpuType>>> {
    let _ = ensure_provider_exists(&state.pool, provider_id).await?;
    let gpu_type = CloudGpuTypeRepo::update(&state.pool, gpu_type_id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudGpuType",
                id: gpu_type_id,
            })
        })?;
    Ok(Json(DataResponse { data: gpu_type }))
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

/// GET /admin/cloud-providers/:id/instances
pub async fn list_instances(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CloudInstance>>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let instances = CloudInstanceRepo::list_by_provider(&state.pool, id).await?;
    Ok(Json(DataResponse { data: instances }))
}

/// POST /admin/cloud-providers/:id/instances/provision
pub async fn provision_instance(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<ProvisionRequest>,
) -> AppResult<(StatusCode, Json<DataResponse<CloudInstance>>)> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let provider = get_provider_impl(&state, id).await?;

    let gpu_type = CloudGpuTypeRepo::find_by_id(&state.pool, input.gpu_type_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudGpuType",
                id: input.gpu_type_id,
            })
        })?;

    let config = x121_core::cloud::ProvisionConfig {
        name: input.name.clone(),
        gpu_count: input.gpu_count.unwrap_or(1) as u32,
        network_volume_id: input.network_volume_id.clone(),
        volume_mount_path: input.volume_mount_path.clone(),
        docker_image: input.docker_image.clone(),
        template_id: input.template_id.clone(),
        ..Default::default()
    };

    let info = provider
        .provision_instance(&gpu_type.gpu_id, &config)
        .await?;

    let create = CreateCloudInstance {
        gpu_type_id: input.gpu_type_id,
        external_id: info.external_id,
        name: info.name,
        gpu_count: Some(config.gpu_count as i16),
        cost_per_hour_cents: info.cost_per_hour_cents as i32,
        metadata: None,
    };

    let instance = CloudInstanceRepo::create(&state.pool, id, &create).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: instance })))
}

/// POST /admin/cloud-providers/:id/instances/:inst_id/start
pub async fn start_instance(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((provider_id, inst_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let inst = ensure_instance_exists(&state.pool, inst_id).await?;
    let provider = get_provider_impl(&state, provider_id).await?;
    provider.start_instance(&inst.external_id).await?;
    CloudInstanceRepo::update_status(
        &state.pool,
        inst_id,
        x121_db::models::status::CloudInstanceStatus::Starting.id(),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /admin/cloud-providers/:id/instances/:inst_id/stop
pub async fn stop_instance(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((provider_id, inst_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let inst = ensure_instance_exists(&state.pool, inst_id).await?;
    let provider = get_provider_impl(&state, provider_id).await?;
    provider.stop_instance(&inst.external_id).await?;
    CloudInstanceRepo::update_status(
        &state.pool,
        inst_id,
        x121_db::models::status::CloudInstanceStatus::Stopping.id(),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /admin/cloud-providers/:id/instances/:inst_id/terminate
pub async fn terminate_instance(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((provider_id, inst_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let inst = ensure_instance_exists(&state.pool, inst_id).await?;
    let provider = get_provider_impl(&state, provider_id).await?;
    provider.terminate_instance(&inst.external_id).await?;
    CloudInstanceRepo::mark_terminated(&state.pool, inst_id, inst.total_cost_cents).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /admin/cloud-providers/:id/instances/:inst_id/status
pub async fn get_instance_status(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((provider_id, inst_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<x121_core::cloud::InstanceStatus>>> {
    let inst = ensure_instance_exists(&state.pool, inst_id).await?;
    let provider = get_provider_impl(&state, provider_id).await?;
    let status = provider.get_instance_status(&inst.external_id).await?;
    Ok(Json(DataResponse { data: status }))
}

// ---------------------------------------------------------------------------
// Scaling Rules
// ---------------------------------------------------------------------------

/// GET /admin/cloud-providers/:id/scaling-rules
pub async fn list_scaling_rules(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CloudScalingRule>>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let rules = CloudScalingRuleRepo::list_by_provider(&state.pool, id).await?;
    Ok(Json(DataResponse { data: rules }))
}

/// POST /admin/cloud-providers/:id/scaling-rules
pub async fn create_scaling_rule(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<CreateCloudScalingRule>,
) -> AppResult<(StatusCode, Json<DataResponse<CloudScalingRule>>)> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let rule = CloudScalingRuleRepo::create(&state.pool, id, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: rule })))
}

/// PUT /admin/cloud-providers/:id/scaling-rules/:rule_id
pub async fn update_scaling_rule(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((_provider_id, rule_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCloudScalingRule>,
) -> AppResult<Json<DataResponse<CloudScalingRule>>> {
    let rule = CloudScalingRuleRepo::update(&state.pool, rule_id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudScalingRule",
                id: rule_id,
            })
        })?;
    Ok(Json(DataResponse { data: rule }))
}

/// DELETE /admin/cloud-providers/:id/scaling-rules/:rule_id
pub async fn delete_scaling_rule(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((_provider_id, rule_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = CloudScalingRuleRepo::delete(&state.pool, rule_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "CloudScalingRule",
            id: rule_id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CostQuery {
    pub since: Option<x121_core::types::Timestamp>,
    pub until: Option<x121_core::types::Timestamp>,
}

/// GET /admin/cloud-providers/:id/cost-summary
pub async fn get_cost_summary(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(q): Query<CostQuery>,
) -> AppResult<Json<DataResponse<ProviderCostSummary>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let now = chrono::Utc::now();
    let since = q.since.unwrap_or(now - chrono::Duration::days(30));
    let until = q.until.unwrap_or(now);
    let summary =
        CloudCostEventRepo::sum_by_provider_in_range(&state.pool, id, since, until).await?;
    Ok(Json(DataResponse { data: summary }))
}

/// GET /admin/cloud-providers/:id/cost-events
pub async fn list_cost_events(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(q): Query<CostQuery>,
) -> AppResult<Json<DataResponse<Vec<CloudCostEvent>>>> {
    let _ = ensure_provider_exists(&state.pool, id).await?;
    let events = CloudCostEventRepo::list_by_provider(&state.pool, id, q.since, q.until).await?;
    Ok(Json(DataResponse { data: events }))
}

// ---------------------------------------------------------------------------
// Serverless
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ServerlessSubmitRequest {
    pub endpoint_id: String,
    pub input: serde_json::Value,
}

#[derive(Debug, serde::Serialize)]
pub struct ServerlessJobResponse {
    pub job_id: String,
}

/// POST /admin/cloud-providers/:id/serverless/submit
pub async fn submit_serverless_job(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<ServerlessSubmitRequest>,
) -> AppResult<(StatusCode, Json<DataResponse<ServerlessJobResponse>>)> {
    let provider = get_provider_impl(&state, id).await?;
    let job_id = provider
        .submit_serverless_job(&input.endpoint_id, input.input)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: ServerlessJobResponse { job_id },
        }),
    ))
}

/// GET /admin/cloud-providers/:id/serverless/:job_id/status
pub async fn get_serverless_status(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((id, job_id)): Path<(DbId, String)>,
    Query(q): Query<ServerlessEndpointQuery>,
) -> AppResult<Json<DataResponse<x121_core::cloud::ServerlessJobStatus>>> {
    let provider = get_provider_impl(&state, id).await?;
    let status = provider
        .get_serverless_job_status(&q.endpoint_id, &job_id)
        .await?;
    Ok(Json(DataResponse { data: status }))
}

/// POST /admin/cloud-providers/:id/serverless/:job_id/cancel
pub async fn cancel_serverless_job(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((id, job_id)): Path<(DbId, String)>,
    Query(q): Query<ServerlessEndpointQuery>,
) -> AppResult<StatusCode> {
    let provider = get_provider_impl(&state, id).await?;
    provider
        .cancel_serverless_job(&q.endpoint_id, &job_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct ServerlessEndpointQuery {
    pub endpoint_id: String,
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/// GET /admin/cloud-providers/dashboard
pub async fn dashboard(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<Json<DataResponse<CloudDashboardStats>>> {
    let providers = CloudProviderRepo::list(&state.pool).await?;
    let all_instances = CloudInstanceRepo::list_all_active(&state.pool).await?;

    let running_count = all_instances
        .iter()
        .filter(|i| i.status_id == x121_db::models::status::CloudInstanceStatus::Running.id())
        .count() as i64;

    let now = chrono::Utc::now();
    let month_start = now - chrono::Duration::days(30);
    let mut total_cost = 0i64;
    for p in &providers {
        let summary =
            CloudCostEventRepo::sum_by_provider_in_range(&state.pool, p.id, month_start, now)
                .await?;
        total_cost += summary.total_cost_cents;
    }

    let active_count = providers
        .iter()
        .filter(|p| p.status_id == x121_db::models::status::CloudProviderStatus::Active.id())
        .count() as i64;

    Ok(Json(DataResponse {
        data: CloudDashboardStats {
            total_providers: providers.len() as i64,
            active_providers: active_count,
            total_instances: all_instances.len() as i64,
            running_instances: running_count,
            total_cost_cents: total_cost,
        },
    }))
}

// ---------------------------------------------------------------------------
// Emergency Stop
// ---------------------------------------------------------------------------

/// POST /admin/cloud-providers/:id/emergency-stop
pub async fn emergency_stop_provider(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<EmergencyStopResult>>> {
    let provider = get_provider_impl(&state, id).await?;
    let instances = CloudInstanceRepo::list_active_by_provider(&state.pool, id).await?;

    let (terminated, failed) =
        x121_cloud::services::terminate_and_record(provider.as_ref(), &state.pool, &instances)
            .await;

    // Disable the provider
    CloudProviderRepo::update_status(
        &state.pool,
        id,
        x121_db::models::status::CloudProviderStatus::Disabled.id(),
    )
    .await?;

    Ok(Json(DataResponse {
        data: EmergencyStopResult {
            terminated,
            failed,
            provider_disabled: true,
        },
    }))
}

/// POST /admin/cloud-providers/emergency-stop-all
pub async fn emergency_stop_all(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<Json<DataResponse<EmergencyStopResult>>> {
    let provider_ids = state.cloud_registry.provider_ids().await;
    let mut total_terminated = 0u32;
    let mut total_failed = 0u32;

    for pid in provider_ids {
        let provider = match state.cloud_registry.get(pid).await {
            Some(p) => p,
            None => continue,
        };

        let instances = CloudInstanceRepo::list_active_by_provider(&state.pool, pid).await?;
        let (ok, fail) =
            x121_cloud::services::terminate_and_record(provider.as_ref(), &state.pool, &instances)
                .await;
        total_terminated += ok;
        total_failed += fail;

        // Disable provider
        let _ = CloudProviderRepo::update_status(
            &state.pool,
            pid,
            x121_db::models::status::CloudProviderStatus::Disabled.id(),
        )
        .await;
    }

    Ok(Json(DataResponse {
        data: EmergencyStopResult {
            terminated: total_terminated,
            failed: total_failed,
            provider_disabled: true,
        },
    }))
}

// ---------------------------------------------------------------------------
// Request/Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ProvisionRequest {
    pub gpu_type_id: DbId,
    pub name: Option<String>,
    pub gpu_count: Option<i16>,
    pub network_volume_id: Option<String>,
    pub volume_mount_path: Option<String>,
    pub docker_image: Option<String>,
    pub template_id: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct EmergencyStopResult {
    pub terminated: u32,
    pub failed: u32,
    pub provider_disabled: bool,
}

// ---------------------------------------------------------------------------
// Runtime provider registration
// ---------------------------------------------------------------------------

async fn register_runtime_provider(state: &AppState, id: DbId, provider: &CloudProvider) {
    let master_key = match get_master_key() {
        Ok(k) => k,
        Err(_) => return,
    };

    let api_key = match crypto::decrypt_api_key(
        &provider.api_key_encrypted,
        &provider.api_key_nonce,
        &master_key,
    ) {
        Ok(k) => k,
        Err(_) => return,
    };

    let runtime: Arc<dyn CloudGpuProvider> = match provider.provider_type.as_str() {
        "runpod" => Arc::new(x121_cloud::runpod::RunPodProvider::new(
            api_key,
            provider.base_url.clone(),
        )),
        _ => return,
    };

    state.cloud_registry.register(id, runtime).await;
}
