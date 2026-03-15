//! Handlers for the System Health Page (PRD-80).
//!
//! Provides admin-only endpoints for viewing service health, uptime
//! statistics, startup readiness, on-demand re-checks, and alert
//! configuration management.
//!
//! All endpoints require admin authentication.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use chrono::{Duration, Utc};

use x121_core::system_health;
use x121_db::models::system_health::{
    ServiceDetailResponse, ServiceStatusResponse, UpsertAlertConfig, UptimeResponse,
};
use x121_db::repositories::{HealthAlertConfigRepo, HealthCheckRepo, UptimeRecordRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// GET /admin/health/statuses
// ---------------------------------------------------------------------------

/// Get the latest health status for every known service.
pub async fn get_all_statuses(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let checks = HealthCheckRepo::get_latest_per_service(&state.pool).await?;

    let statuses: Vec<ServiceStatusResponse> = checks
        .into_iter()
        .map(|c| ServiceStatusResponse {
            service_name: c.service_name,
            status: c.status,
            latency_ms: c.latency_ms,
            error_message: c.error_message,
            checked_at: c.checked_at,
        })
        .collect();

    Ok(Json(DataResponse { data: statuses }))
}

// ---------------------------------------------------------------------------
// GET /admin/health/services/:service
// ---------------------------------------------------------------------------

/// Get detailed status for a single service, including 24h uptime and
/// recent check history.
pub async fn get_service_detail(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> AppResult<impl IntoResponse> {
    system_health::validate_service_name(&service)?;

    let latest = HealthCheckRepo::get_latest_for_service(&state.pool, &service)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("No health checks found for service '{service}'"))
        })?;

    let recent_checks = HealthCheckRepo::get_service_history(&state.pool, &service, 50).await?;

    let since = Utc::now() - Duration::hours(24);
    let (healthy_s, degraded_s, total_s) =
        UptimeRecordRepo::compute_uptime_seconds(&state.pool, &service, since).await?;

    let uptime_percent_24h = system_health::compute_uptime_percent(healthy_s, degraded_s, total_s);

    let detail = ServiceDetailResponse {
        service_name: latest.service_name,
        current_status: latest.status,
        latency_ms: latest.latency_ms,
        error_message: latest.error_message,
        checked_at: latest.checked_at,
        uptime_percent_24h,
        recent_checks,
    };

    Ok(Json(DataResponse { data: detail }))
}

// ---------------------------------------------------------------------------
// GET /admin/health/uptime
// ---------------------------------------------------------------------------

/// Get 24-hour uptime percentages for all known services.
pub async fn get_uptime(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let since = Utc::now() - Duration::hours(24);
    let mut results = Vec::with_capacity(system_health::ALL_SERVICES.len());

    for &service in system_health::ALL_SERVICES {
        let (healthy_s, degraded_s, total_s) =
            UptimeRecordRepo::compute_uptime_seconds(&state.pool, service, since).await?;
        let down_s = total_s - healthy_s - degraded_s;

        results.push(UptimeResponse {
            service_name: service.to_string(),
            uptime_percent_24h: system_health::compute_uptime_percent(
                healthy_s, degraded_s, total_s,
            ),
            healthy_seconds: healthy_s,
            degraded_seconds: degraded_s,
            down_seconds: down_s.max(0),
            total_seconds: total_s,
        });
    }

    Ok(Json(DataResponse { data: results }))
}

// ---------------------------------------------------------------------------
// GET /admin/health/startup
// ---------------------------------------------------------------------------

/// Run the startup readiness checklist and return results.
pub async fn get_startup_checklist(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let mut checks = Vec::new();

    // 1. Database connectivity.
    let db_ok = x121_db::health_check(&state.pool).await;
    checks.push(system_health::StartupCheck {
        name: "Database connectivity".into(),
        passed: db_ok.is_ok(),
        error: db_ok.err().map(|e| e.to_string()),
        required: true,
    });

    // 2. ComfyUI instances.
    let comfyui_connected = state.comfyui_manager.connected_instance_ids().await;
    checks.push(system_health::StartupCheck {
        name: "ComfyUI instances".into(),
        passed: !comfyui_connected.is_empty(),
        error: if comfyui_connected.is_empty() {
            Some("No ComfyUI instances connected".into())
        } else {
            None
        },
        required: false,
    });

    // 3. Event bus.
    checks.push(system_health::StartupCheck {
        name: "Event bus".into(),
        passed: true,
        error: None,
        required: true,
    });

    let result = system_health::StartupCheckResult::from_checks(checks);

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// POST /admin/health/recheck/:service
// ---------------------------------------------------------------------------

/// Trigger an on-demand health check for a single service and persist
/// the result. Returns the newly recorded health check row.
pub async fn recheck_service(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> AppResult<impl IntoResponse> {
    system_health::validate_service_name(&service)?;

    let (status, latency_ms, error_message, details) = probe_service(&state, &service).await;

    let check = HealthCheckRepo::record(
        &state.pool,
        &service,
        status,
        latency_ms,
        error_message.as_deref(),
        details,
    )
    .await?;

    // Update uptime tracking.
    UptimeRecordRepo::upsert(&state.pool, &service, status).await?;

    tracing::info!(
        service = %service,
        status = %status,
        user_id = admin.user_id,
        "On-demand health recheck completed",
    );

    Ok(Json(DataResponse { data: check }))
}

// ---------------------------------------------------------------------------
// GET /admin/health/alerts
// ---------------------------------------------------------------------------

/// List all alert configurations.
pub async fn list_alert_configs(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let configs = HealthAlertConfigRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: configs }))
}

// ---------------------------------------------------------------------------
// PUT /admin/health/alerts/:service
// ---------------------------------------------------------------------------

/// Create or update the alert configuration for a service.
pub async fn update_alert_config(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(service): Path<String>,
    Json(input): Json<UpsertAlertConfig>,
) -> AppResult<impl IntoResponse> {
    system_health::validate_service_name(&service)?;

    let delay = input
        .escalation_delay_seconds
        .unwrap_or(system_health::DEFAULT_ESCALATION_DELAY_SECONDS);
    system_health::validate_escalation_delay(delay)?;

    let enabled = input.enabled.unwrap_or(true);

    let config = HealthAlertConfigRepo::upsert(
        &state.pool,
        &service,
        delay,
        input.webhook_url.as_deref(),
        input.notification_channels_json,
        enabled,
    )
    .await?;

    tracing::info!(
        service = %service,
        user_id = admin.user_id,
        "Alert config updated",
    );

    Ok(Json(DataResponse { data: config }))
}

// ---------------------------------------------------------------------------
// Internal probe helper
// ---------------------------------------------------------------------------

/// Probe a named service and return `(status, latency_ms, error, details)`.
async fn probe_service(
    state: &AppState,
    service: &str,
) -> (
    &'static str,
    Option<i32>,
    Option<String>,
    Option<serde_json::Value>,
) {
    match service {
        system_health::SERVICE_DATABASE => {
            let start = std::time::Instant::now();
            match x121_db::health_check(&state.pool).await {
                Ok(()) => {
                    let latency = start.elapsed().as_millis() as i32;
                    (system_health::STATUS_HEALTHY, Some(latency), None, None)
                }
                Err(e) => (system_health::STATUS_DOWN, None, Some(e.to_string()), None),
            }
        }
        system_health::SERVICE_COMFYUI => {
            let connected = state.comfyui_manager.connected_instance_ids().await;
            let count = connected.len();
            if count > 0 {
                (
                    system_health::STATUS_HEALTHY,
                    None,
                    None,
                    Some(serde_json::json!({ "connected_instances": count })),
                )
            } else {
                // No instances connected — only report "down" if there are pending jobs
                let (pending, _, _) = x121_db::repositories::JobRepo::queue_counts(&state.pool)
                    .await
                    .unwrap_or((0, 0, 0));
                if pending > 0 {
                    (
                        system_health::STATUS_DOWN,
                        None,
                        Some(format!("{pending} pending job(s) but no GPU instances connected")),
                        None,
                    )
                } else {
                    (
                        system_health::STATUS_HEALTHY,
                        None,
                        Some("Idle — no active instances".into()),
                        None,
                    )
                }
            }
        }
        system_health::SERVICE_WORKERS => {
            match x121_db::repositories::WorkerRepo::fleet_stats(&state.pool).await {
                Ok(stats) => {
                    let total = stats.total_workers;
                    let status = if total == 0 {
                        // No workers — only report down if there are pending jobs
                        let (pending, _, _) = x121_db::repositories::JobRepo::queue_counts(&state.pool)
                            .await
                            .unwrap_or((0, 0, 0));
                        if pending > 0 { system_health::STATUS_DOWN } else { system_health::STATUS_HEALTHY }
                    } else if stats.idle_workers == 0 && stats.busy_workers == 0 {
                        system_health::STATUS_DEGRADED
                    } else {
                        system_health::STATUS_HEALTHY
                    };
                    (
                        status,
                        None,
                        None,
                        Some(serde_json::json!({
                            "total": total,
                            "idle": stats.idle_workers,
                            "busy": stats.busy_workers,
                        })),
                    )
                }
                Err(e) => (
                    system_health::STATUS_DEGRADED,
                    None,
                    Some(e.to_string()),
                    None,
                ),
            }
        }
        system_health::SERVICE_BACKEND => {
            // The backend is always healthy if we can serve this request.
            (system_health::STATUS_HEALTHY, None, None, None)
        }
        system_health::SERVICE_EVENT_BUS => {
            // Event bus is in-process; if we are here, it is running.
            (system_health::STATUS_HEALTHY, None, None, None)
        }
        system_health::SERVICE_FILESYSTEM => {
            // Basic filesystem check: verify temp dir is writable.
            let test_path = std::env::temp_dir().join("x121_health_check");
            match tokio::fs::write(&test_path, b"ok").await {
                Ok(()) => {
                    let _ = tokio::fs::remove_file(&test_path).await;
                    (system_health::STATUS_HEALTHY, None, None, None)
                }
                Err(e) => (system_health::STATUS_DOWN, None, Some(e.to_string()), None),
            }
        }
        _ => (
            system_health::STATUS_DOWN,
            None,
            Some(format!("Unknown service: {service}")),
            None,
        ),
    }
}
