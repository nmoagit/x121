//! Handlers for hardware monitoring endpoints (PRD-06).
//!
//! Includes:
//! - Admin REST endpoints for metrics, thresholds, and restart logs.
//! - WebSocket endpoint for agent metrics ingestion.

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{Duration, Utc};
use futures::StreamExt;
use serde::Deserialize;
use tokio::sync::Mutex;
use x121_core::alert::MetricAlert;
use x121_core::error::CoreError;
use x121_core::hardware::thresholds::{evaluate, AlertCooldownTracker, GpuSnapshot, Threshold};
use x121_core::metric_names::MSG_TYPE_GPU_METRICS;
use x121_core::types::DbId;
use x121_db::models::hardware::{CreateGpuMetric, CreateRestartLog, UpsertThreshold};
use x121_db::repositories::{GpuMetricRepo, MetricThresholdRepo, RestartLogRepo};
use x121_events::PlatformEvent;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/// Query parameters for the worker metrics history endpoint.
#[derive(Debug, Deserialize)]
pub struct MetricsQuery {
    /// How many hours of history to return (default: 1).
    pub hours: Option<i64>,
}

/// Request body for the restart service endpoint.
#[derive(Debug, Deserialize)]
pub struct RestartRequest {
    pub service_name: String,
    pub reason: Option<String>,
}

/// Request body for updating a single threshold.
#[derive(Debug, Deserialize)]
pub struct ThresholdUpdate {
    pub metric_name: String,
    pub warning_value: i32,
    pub critical_value: i32,
}

/// Request body for updating thresholds (batch).
///
/// Used by both worker-specific and global threshold endpoints.
#[derive(Debug, Deserialize)]
pub struct UpdateThresholdsRequest {
    pub thresholds: Vec<ThresholdUpdate>,
}

// ---------------------------------------------------------------------------
// Admin REST handlers
// ---------------------------------------------------------------------------

/// GET /admin/hardware/workers/metrics/current
///
/// Get the latest GPU metrics for all workers.
pub async fn get_all_workers_current(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::hardware::WorkerCurrentMetrics>>>> {
    let metrics = GpuMetricRepo::get_latest_per_worker(&state.pool).await?;
    Ok(Json(DataResponse { data: metrics }))
}

/// GET /admin/hardware/workers/{id}/metrics
///
/// Get historical GPU metrics for a specific worker.
pub async fn get_worker_metrics(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(worker_id): Path<DbId>,
    Query(query): Query<MetricsQuery>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::hardware::GpuMetric>>>> {
    let hours = query.hours.unwrap_or(1);
    if !(1..=168).contains(&hours) {
        return Err(AppError::BadRequest(
            "hours must be between 1 and 168".to_string(),
        ));
    }
    let since = Utc::now() - Duration::hours(hours);
    let metrics = GpuMetricRepo::get_for_worker(&state.pool, worker_id, since).await?;
    Ok(Json(DataResponse { data: metrics }))
}

/// POST /admin/hardware/workers/{id}/restart
///
/// Initiate a service restart on a worker.
pub async fn restart_service(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(worker_id): Path<DbId>,
    Json(input): Json<RestartRequest>,
) -> AppResult<(
    StatusCode,
    Json<DataResponse<x121_db::models::hardware::RestartLog>>,
)> {
    if input.service_name.is_empty() {
        return Err(AppError::Core(CoreError::Validation(
            "service_name is required".to_string(),
        )));
    }

    let create_dto = CreateRestartLog {
        worker_id,
        service_name: input.service_name,
        initiated_by: admin.user_id,
        reason: input.reason,
    };

    let log = RestartLogRepo::create(&state.pool, &create_dto).await?;

    // Publish a platform event for the restart.
    let event = PlatformEvent::new("hardware.restart.initiated")
        .with_source("worker", worker_id)
        .with_actor(admin.user_id)
        .with_payload(serde_json::json!({
            "restart_log_id": log.id,
            "service_name": log.service_name,
        }));
    state.event_bus.publish(event);

    Ok((StatusCode::CREATED, Json(DataResponse { data: log })))
}

/// GET /admin/hardware/workers/{id}/restarts
///
/// List restart history for a specific worker.
pub async fn list_restart_logs(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(worker_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::hardware::RestartLog>>>> {
    let logs = RestartLogRepo::list_by_worker(&state.pool, worker_id).await?;
    Ok(Json(DataResponse { data: logs }))
}

/// GET /admin/hardware/thresholds
///
/// List all metric thresholds (global and worker-specific).
pub async fn list_thresholds(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::hardware::MetricThreshold>>>> {
    let thresholds = MetricThresholdRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: thresholds }))
}

/// PUT /admin/hardware/workers/{id}/thresholds
///
/// Set per-worker threshold overrides.
pub async fn update_worker_thresholds(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(worker_id): Path<DbId>,
    Json(input): Json<UpdateThresholdsRequest>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::hardware::MetricThreshold>>>> {
    let results = upsert_thresholds(&state.pool, Some(worker_id), &input).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /admin/hardware/thresholds/global
///
/// Update global default thresholds.
pub async fn update_global_thresholds(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<UpdateThresholdsRequest>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::hardware::MetricThreshold>>>> {
    let results = upsert_thresholds(&state.pool, None, &input).await?;
    Ok(Json(DataResponse { data: results }))
}

/// Validate and upsert a batch of threshold updates for a specific worker
/// (or globally when `worker_id` is `None`).
async fn upsert_thresholds(
    pool: &sqlx::PgPool,
    worker_id: Option<DbId>,
    input: &UpdateThresholdsRequest,
) -> AppResult<Vec<x121_db::models::hardware::MetricThreshold>> {
    let mut results = Vec::with_capacity(input.thresholds.len());
    for t in &input.thresholds {
        validate_threshold(t)?;
        let dto = UpsertThreshold {
            worker_id,
            metric_name: t.metric_name.clone(),
            warning_value: t.warning_value,
            critical_value: t.critical_value,
        };
        let threshold = MetricThresholdRepo::upsert(pool, &dto).await?;
        results.push(threshold);
    }
    Ok(results)
}

// ---------------------------------------------------------------------------
// WebSocket handler for agent metrics ingestion
// ---------------------------------------------------------------------------

/// Payload sent by the worker agent over the metrics WebSocket.
#[derive(Debug, Deserialize)]
struct AgentMetricsMessage {
    /// Type discriminator — must be "gpu_metrics".
    #[serde(rename = "type")]
    msg_type: String,
    /// Worker ID reporting the metrics.
    worker_id: DbId,
    /// Array of GPU metric snapshots.
    metrics: Vec<CreateGpuMetric>,
}

/// HTTP handler that upgrades to a WebSocket for agent metrics ingestion.
///
/// This endpoint is unauthenticated by design — agents use it to push
/// GPU metrics. Future iterations will add agent token auth.
pub async fn metrics_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_metrics_socket(socket, state))
}

/// Process an agent metrics WebSocket connection.
async fn handle_metrics_socket(socket: WebSocket, state: AppState) {
    let conn_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(conn_id = %conn_id, "Metrics WebSocket connected");

    let cooldown = Arc::new(Mutex::new(AlertCooldownTracker::new()));

    let (_sink, mut stream) = socket.split();

    while let Some(result) = stream.next().await {
        match result {
            Ok(Message::Text(text)) => {
                if let Err(e) = process_metrics_message(&text, &state, Arc::clone(&cooldown)).await
                {
                    tracing::warn!(
                        conn_id = %conn_id,
                        error = %e,
                        "Failed to process metrics message"
                    );
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {} // ignore binary, ping, pong
            Err(e) => {
                tracing::debug!(conn_id = %conn_id, error = %e, "Metrics WS receive error");
                break;
            }
        }
    }

    tracing::info!(conn_id = %conn_id, "Metrics WebSocket disconnected");
}

/// Parse and process a single metrics message from the agent.
async fn process_metrics_message(
    text: &str,
    state: &AppState,
    cooldown: Arc<Mutex<AlertCooldownTracker>>,
) -> Result<(), AppError> {
    let msg: AgentMetricsMessage = serde_json::from_str(text)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;

    if msg.msg_type != MSG_TYPE_GPU_METRICS {
        return Err(AppError::BadRequest(format!(
            "Unknown message type: {}",
            msg.msg_type
        )));
    }

    if msg.metrics.is_empty() {
        return Ok(());
    }

    // Batch insert the metrics.
    GpuMetricRepo::insert_batch(&state.pool, msg.worker_id, &msg.metrics).await?;

    // Fetch thresholds for this worker and evaluate.
    let db_thresholds = MetricThresholdRepo::get_for_worker(&state.pool, msg.worker_id).await?;

    let thresholds = resolve_effective_thresholds(&db_thresholds);

    let snapshots: Vec<GpuSnapshot> = msg
        .metrics
        .iter()
        .map(|m| GpuSnapshot {
            worker_id: msg.worker_id,
            gpu_index: m.gpu_index,
            vram_used_mb: m.vram_used_mb,
            vram_total_mb: m.vram_total_mb,
            temperature_celsius: m.temperature_celsius,
            utilization_percent: m.utilization_percent,
            recorded_at: m.recorded_at,
        })
        .collect();

    let alerts = {
        let mut tracker = cooldown.lock().await;
        evaluate(&snapshots, &thresholds, &mut tracker)
    };

    // Emit alerts via event bus.
    for alert in &alerts {
        emit_alert_event(state, alert);
    }

    Ok(())
}

/// Resolve the effective set of thresholds for a worker.
///
/// For each metric, prefer the worker-specific threshold; fall back to the
/// global default. The input is expected to be sorted by (metric_name,
/// worker_id NULLS LAST).
fn resolve_effective_thresholds(
    db_thresholds: &[x121_db::models::hardware::MetricThreshold],
) -> Vec<Threshold> {
    use std::collections::HashMap;

    let mut seen: HashMap<&str, &x121_db::models::hardware::MetricThreshold> = HashMap::new();

    for t in db_thresholds {
        if !t.is_enabled {
            continue;
        }
        // For the same metric_name, the first row wins (worker-specific sorts first).
        seen.entry(&t.metric_name).or_insert(t);
    }

    seen.values()
        .map(|t| Threshold {
            metric_name: t.metric_name.clone(),
            warning_value: t.warning_value,
            critical_value: t.critical_value,
        })
        .collect()
}

/// Publish a metric alert as a platform event.
fn emit_alert_event(state: &AppState, alert: &MetricAlert) {
    let event = PlatformEvent::new("hardware.metric.alert")
        .with_source("worker", alert.worker_id)
        .with_payload(serde_json::to_value(alert).unwrap_or_else(|_| serde_json::json!({})));
    state.event_bus.publish(event);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Validate a threshold update: warning must be less than critical, both positive.
fn validate_threshold(t: &ThresholdUpdate) -> AppResult<()> {
    if t.warning_value < 0 || t.critical_value < 0 {
        return Err(AppError::Core(CoreError::Validation(
            "Threshold values must be non-negative".to_string(),
        )));
    }
    if t.warning_value >= t.critical_value {
        return Err(AppError::Core(CoreError::Validation(
            "warning_value must be less than critical_value".to_string(),
        )));
    }
    if t.metric_name.is_empty() {
        return Err(AppError::Core(CoreError::Validation(
            "metric_name is required".to_string(),
        )));
    }
    Ok(())
}
