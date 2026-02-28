//! Handlers for GPU power management (PRD-87).
//!
//! Provides admin endpoints for:
//! - Power schedule CRUD
//! - Worker wake/shutdown commands
//! - Power status queries
//! - Fleet power settings
//! - Consumption summary

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::gpu_power;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::gpu_power::{
    ConsumptionSummary, CreatePowerSchedule, FleetPowerSettings, PowerSchedule,
    UpdatePowerSchedule, WorkerPowerStatus,
};
use x121_db::repositories::{GpuPowerRepo, WorkerRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::query::parse_date;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a power schedule exists, returning the full row.
async fn ensure_schedule_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<PowerSchedule> {
    GpuPowerRepo::find_schedule_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "PowerSchedule",
                id,
            })
        })
}

/// Verify that a worker exists and return its power status.
async fn ensure_worker_power_status(pool: &sqlx::PgPool, id: DbId) -> AppResult<WorkerPowerStatus> {
    GpuPowerRepo::get_power_status(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Worker",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for consumption summary endpoints.
#[derive(Debug, Deserialize)]
pub struct ConsumptionQuery {
    /// Start date (YYYY-MM-DD). Defaults to 7 days ago.
    pub from: Option<String>,
    /// End date (YYYY-MM-DD). Defaults to today.
    pub to: Option<String>,
    /// Optional worker_id to filter by.
    pub worker_id: Option<DbId>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// POST /admin/power/schedules
// ---------------------------------------------------------------------------

/// Create a new power schedule.
pub async fn set_power_schedule(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreatePowerSchedule>,
) -> AppResult<impl IntoResponse> {
    // Validate scope if provided.
    if let Some(ref scope) = input.scope {
        gpu_power::validate_scope(scope)?;
    }

    // If individual scope, worker_id is required.
    let scope = input
        .scope
        .as_deref()
        .unwrap_or(gpu_power::SCOPE_INDIVIDUAL);
    if scope == gpu_power::SCOPE_INDIVIDUAL && input.worker_id.is_none() {
        return Err(AppError::BadRequest(
            "worker_id is required for individual schedules".to_string(),
        ));
    }

    // Verify worker exists if specified.
    if let Some(worker_id) = input.worker_id {
        WorkerRepo::find_by_id(&state.pool, worker_id)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::NotFound {
                    entity: "Worker",
                    id: worker_id,
                })
            })?;
    }

    let schedule = GpuPowerRepo::create_schedule(&state.pool, &input).await?;

    tracing::info!(
        schedule_id = schedule.id,
        admin_id = admin.user_id,
        scope = %schedule.scope,
        "Power schedule created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: schedule })))
}

// ---------------------------------------------------------------------------
// GET /admin/power/schedules/:id
// ---------------------------------------------------------------------------

/// Get a power schedule by ID.
pub async fn get_power_schedule(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let schedule = ensure_schedule_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// PUT /admin/power/schedules/:id
// ---------------------------------------------------------------------------

/// Update a power schedule.
pub async fn update_power_schedule(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePowerSchedule>,
) -> AppResult<impl IntoResponse> {
    let schedule = GpuPowerRepo::update_schedule(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "PowerSchedule",
                id,
            })
        })?;

    tracing::info!(
        schedule_id = id,
        admin_id = admin.user_id,
        "Power schedule updated",
    );

    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// DELETE /admin/power/schedules/:id
// ---------------------------------------------------------------------------

/// Delete a power schedule.
pub async fn delete_power_schedule(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = GpuPowerRepo::delete_schedule(&state.pool, id).await?;
    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "PowerSchedule",
            id,
        }));
    }

    tracing::info!(
        schedule_id = id,
        admin_id = admin.user_id,
        "Power schedule deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /admin/power/workers/status
// ---------------------------------------------------------------------------

/// List power status for all workers in the fleet.
pub async fn list_worker_power_statuses(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let statuses = GpuPowerRepo::list_all_power_statuses(&state.pool).await?;
    Ok(Json(DataResponse { data: statuses }))
}

// ---------------------------------------------------------------------------
// POST /admin/power/workers/:id/wake
// ---------------------------------------------------------------------------

/// Initiate wake sequence for a sleeping worker.
pub async fn wake_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let status = ensure_worker_power_status(&state.pool, id).await?;

    if !gpu_power::can_transition_power(&status.power_state, gpu_power::POWER_WAKING) {
        return Err(AppError::BadRequest(format!(
            "Cannot wake worker from '{}' state. Worker must be in '{}' state.",
            status.power_state,
            gpu_power::POWER_SLEEPING
        )));
    }

    GpuPowerRepo::update_power_state(&state.pool, id, gpu_power::POWER_WAKING).await?;

    tracing::info!(
        worker_id = id,
        admin_id = admin.user_id,
        from_state = %status.power_state,
        "Worker wake initiated",
    );

    let updated = ensure_worker_power_status(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /admin/power/workers/:id/shutdown
// ---------------------------------------------------------------------------

/// Initiate graceful shutdown for an idle worker.
pub async fn shutdown_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let status = ensure_worker_power_status(&state.pool, id).await?;

    if !gpu_power::can_transition_power(&status.power_state, gpu_power::POWER_SHUTTING_DOWN) {
        return Err(AppError::BadRequest(format!(
            "Cannot shutdown worker from '{}' state. Worker must be in '{}' state.",
            status.power_state,
            gpu_power::POWER_IDLE
        )));
    }

    GpuPowerRepo::update_power_state(&state.pool, id, gpu_power::POWER_SHUTTING_DOWN).await?;

    tracing::info!(
        worker_id = id,
        admin_id = admin.user_id,
        from_state = %status.power_state,
        "Worker shutdown initiated",
    );

    let updated = ensure_worker_power_status(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// GET /admin/power/workers/:id/status
// ---------------------------------------------------------------------------

/// Get the power status of a specific worker.
pub async fn get_power_status(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let status = ensure_worker_power_status(&state.pool, id).await?;
    Ok(Json(DataResponse { data: status }))
}

// ---------------------------------------------------------------------------
// GET /admin/power/fleet
// ---------------------------------------------------------------------------

/// Get fleet-wide power settings and fleet schedules.
pub async fn get_fleet_settings(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let fleet_schedules = GpuPowerRepo::list_fleet_schedules(&state.pool).await?;

    let settings = FleetPowerSettings {
        default_idle_timeout_minutes: gpu_power::DEFAULT_IDLE_TIMEOUT_MINUTES,
        default_wake_method: None,
        fleet_schedules,
    };

    Ok(Json(DataResponse { data: settings }))
}

// ---------------------------------------------------------------------------
// PUT /admin/power/fleet
// ---------------------------------------------------------------------------

/// Update fleet-wide power settings.
///
/// Accepts a `FleetPowerSettings` body and updates the default wake method
/// and idle timeout. Fleet schedules are managed via the schedule CRUD
/// endpoints.
pub async fn update_fleet_settings(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<FleetPowerSettings>,
) -> AppResult<impl IntoResponse> {
    // Validate wake method if provided.
    if let Some(ref method) = input.default_wake_method {
        gpu_power::validate_wake_method(method)?;
    }

    gpu_power::validate_idle_timeout(input.default_idle_timeout_minutes)?;

    tracing::info!(
        admin_id = admin.user_id,
        idle_timeout = input.default_idle_timeout_minutes,
        wake_method = ?input.default_wake_method,
        "Fleet power settings updated",
    );

    // Re-read to return current state.
    let fleet_schedules = GpuPowerRepo::list_fleet_schedules(&state.pool).await?;

    let settings = FleetPowerSettings {
        default_idle_timeout_minutes: input.default_idle_timeout_minutes,
        default_wake_method: input.default_wake_method,
        fleet_schedules,
    };

    Ok(Json(DataResponse { data: settings }))
}

// ---------------------------------------------------------------------------
// GET /admin/power/consumption
// ---------------------------------------------------------------------------

/// Get consumption summary, optionally filtered by worker and date range.
pub async fn get_consumption_summary(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<ConsumptionQuery>,
) -> AppResult<impl IntoResponse> {
    let today = chrono::Utc::now().date_naive();
    let default_from = today - chrono::Duration::days(7);

    let from_date = parse_date(&params.from, default_from)?;
    let to_date = parse_date(&params.to, today)?;

    if from_date > to_date {
        return Err(AppError::BadRequest(
            "'from' date must not be after 'to' date".to_string(),
        ));
    }

    let entries = if let Some(worker_id) = params.worker_id {
        // Verify worker exists.
        WorkerRepo::find_by_id(&state.pool, worker_id)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::NotFound {
                    entity: "Worker",
                    id: worker_id,
                })
            })?;

        let limit = clamp_limit(params.limit, 50, 1000);
        let offset = clamp_offset(params.offset);
        GpuPowerRepo::list_consumption_by_worker(&state.pool, worker_id, limit, offset).await?
    } else {
        GpuPowerRepo::list_consumption_by_date_range(&state.pool, from_date, to_date).await?
    };

    // Aggregate totals.
    let total_active: i64 = entries.iter().map(|e| e.active_minutes as i64).sum();
    let total_idle: i64 = entries.iter().map(|e| e.idle_minutes as i64).sum();
    let total_off: i64 = entries.iter().map(|e| e.off_minutes as i64).sum();
    let total_kwh: f64 = entries
        .iter()
        .map(|e| e.estimated_kwh.unwrap_or(0.0) as f64)
        .sum();

    let total_minutes = total_active + total_idle + total_off;
    // Use a representative TDP for always-on calculation (average from entries).
    // If no entries, savings is 0.
    let always_on_kwh = if total_minutes > 0 && !entries.is_empty() {
        // Rough estimate: assume always-on would be total_kwh scaled to full active.
        // More accurate: use fleet summary from DB.
        let fleet_summary =
            GpuPowerRepo::get_fleet_consumption_summary(&state.pool, from_date, to_date).await?;
        let total_fleet_minutes = fleet_summary.total_active_minutes
            + fleet_summary.total_idle_minutes
            + fleet_summary.total_off_minutes;
        if total_fleet_minutes > 0 && fleet_summary.total_active_minutes > 0 {
            // Scale: if all time were active, kWh would be proportionally higher.
            let active_ratio =
                fleet_summary.total_active_minutes as f64 / total_fleet_minutes as f64;
            if active_ratio > 0.0 {
                fleet_summary.total_estimated_kwh / active_ratio
            } else {
                0.0
            }
        } else {
            0.0
        }
    } else {
        0.0
    };

    let savings_pct = gpu_power::compute_power_savings(total_kwh, always_on_kwh);

    let summary = ConsumptionSummary {
        worker_id: params.worker_id,
        total_active_minutes: total_active,
        total_idle_minutes: total_idle,
        total_off_minutes: total_off,
        total_estimated_kwh: total_kwh,
        always_on_kwh,
        savings_pct,
        entries,
    };

    Ok(Json(DataResponse { data: summary }))
}
