//! Handlers for time-based job scheduling (PRD-119).
//!
//! Provides endpoints for managing schedules (CRUD, pause/resume),
//! viewing execution history, and configuring off-peak windows.
//! Schedule management requires authentication; off-peak configuration
//! requires admin role.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::job_scheduling::{
    self, compute_next_run, parse_cron_fields, SCHEDULE_ONE_TIME, SCHEDULE_RECURRING,
};
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::job_scheduling::{
    CreateSchedule, ScheduleHistoryParams, ScheduleListParams, UpdateOffPeakConfigBulk,
    UpdateSchedule,
};
use x121_db::repositories::{OffPeakConfigRepo, ScheduleHistoryRepo, ScheduleRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// POST /schedules
// ---------------------------------------------------------------------------

/// Create a new schedule.
pub async fn create_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateSchedule>,
) -> AppResult<impl IntoResponse> {
    // Validate schedule_type and action_type.
    job_scheduling::validate_schedule_type(&input.schedule_type)?;
    job_scheduling::validate_action_type(&input.action_type)?;
    job_scheduling::validate_timezone(&input.timezone)?;

    // Recurring schedules must have a cron expression.
    if input.schedule_type == SCHEDULE_RECURRING {
        let cron = input.cron_expression.as_deref().ok_or_else(|| {
            AppError::Core(CoreError::Validation(
                "cron_expression is required for recurring schedules".into(),
            ))
        })?;
        job_scheduling::validate_cron_expression(cron)?;
    }

    // One-time schedules must have a scheduled_at.
    if input.schedule_type == job_scheduling::SCHEDULE_ONE_TIME && input.scheduled_at.is_none() {
        return Err(AppError::Core(CoreError::Validation(
            "scheduled_at is required for one_time schedules".into(),
        )));
    }

    let mut schedule = ScheduleRepo::create(&state.pool, auth.user_id, &input).await?;

    // Compute and set next_run_at.
    let next_run = compute_next_run_for_schedule(&schedule);
    if next_run.is_some() {
        ScheduleRepo::set_next_run(&state.pool, schedule.id, next_run).await?;
        schedule.next_run_at = next_run;
    }

    tracing::info!(
        schedule_id = schedule.id,
        user_id = auth.user_id,
        schedule_type = %schedule.schedule_type,
        "Schedule created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: schedule })))
}

// ---------------------------------------------------------------------------
// GET /schedules
// ---------------------------------------------------------------------------

/// List schedules with optional filters.
pub async fn list_schedules(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ScheduleListParams>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref st) = params.schedule_type {
        job_scheduling::validate_schedule_type(st)?;
    }

    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let schedules = ScheduleRepo::list_filtered(
        &state.pool,
        Some(auth.user_id),
        params.schedule_type.as_deref(),
        params.is_active,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: schedules }))
}

// ---------------------------------------------------------------------------
// GET /schedules/:id
// ---------------------------------------------------------------------------

/// Get a single schedule by ID.
pub async fn get_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let schedule = ensure_schedule_owned(&state.pool, id, auth.user_id).await?;
    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// PUT /schedules/:id
// ---------------------------------------------------------------------------

/// Update a schedule.
pub async fn update_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateSchedule>,
) -> AppResult<impl IntoResponse> {
    ensure_schedule_owned(&state.pool, id, auth.user_id).await?;

    // Validate updated fields.
    if let Some(ref st) = input.schedule_type {
        job_scheduling::validate_schedule_type(st)?;
    }
    if let Some(ref at) = input.action_type {
        job_scheduling::validate_action_type(at)?;
    }
    if let Some(ref tz) = input.timezone {
        job_scheduling::validate_timezone(tz)?;
    }
    if let Some(ref cron) = input.cron_expression {
        job_scheduling::validate_cron_expression(cron)?;
    }

    let mut schedule =
        ScheduleRepo::update(&state.pool, id, &input)
            .await?
            .ok_or(AppError::Core(CoreError::NotFound {
                entity: "Schedule",
                id,
            }))?;

    // Recompute next_run_at if schedule parameters changed.
    let next_run = compute_next_run_for_schedule(&schedule);
    if next_run != schedule.next_run_at {
        ScheduleRepo::set_next_run(&state.pool, schedule.id, next_run).await?;
        schedule.next_run_at = next_run;
    }

    tracing::info!(schedule_id = id, user_id = auth.user_id, "Schedule updated");

    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// DELETE /schedules/:id
// ---------------------------------------------------------------------------

/// Delete a schedule.
pub async fn delete_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_schedule_owned(&state.pool, id, auth.user_id).await?;

    ScheduleRepo::delete(&state.pool, id).await?;

    tracing::info!(schedule_id = id, user_id = auth.user_id, "Schedule deleted");

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// POST /schedules/:id/pause
// ---------------------------------------------------------------------------

/// Pause a schedule (set is_active = false).
pub async fn pause_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_schedule_owned(&state.pool, id, auth.user_id).await?;

    let schedule = ScheduleRepo::set_active(&state.pool, id, false)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Schedule",
            id,
        }))?;

    tracing::info!(schedule_id = id, user_id = auth.user_id, "Schedule paused");

    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// POST /schedules/:id/resume
// ---------------------------------------------------------------------------

/// Resume a paused schedule (set is_active = true).
pub async fn resume_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_schedule_owned(&state.pool, id, auth.user_id).await?;

    let mut schedule = ScheduleRepo::set_active(&state.pool, id, true)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Schedule",
            id,
        }))?;

    // Recompute next_run_at on resume.
    let next_run = compute_next_run_for_schedule(&schedule);
    if next_run.is_some() {
        ScheduleRepo::set_next_run(&state.pool, schedule.id, next_run).await?;
        schedule.next_run_at = next_run;
    }

    tracing::info!(schedule_id = id, user_id = auth.user_id, "Schedule resumed");

    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// GET /schedules/:id/history
// ---------------------------------------------------------------------------

/// List execution history for a schedule.
pub async fn list_schedule_history(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(params): Query<ScheduleHistoryParams>,
) -> AppResult<impl IntoResponse> {
    // Verify the schedule exists and belongs to the user.
    ensure_schedule_owned(&state.pool, id, auth.user_id).await?;

    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let history = ScheduleHistoryRepo::list_by_schedule(
        &state.pool,
        id,
        params.status.as_deref(),
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: history }))
}

// ---------------------------------------------------------------------------
// GET /schedules/off-peak  (admin only)
// ---------------------------------------------------------------------------

/// Get the off-peak configuration.
pub async fn get_off_peak_config(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let configs = OffPeakConfigRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: configs }))
}

// ---------------------------------------------------------------------------
// PUT /schedules/off-peak  (admin only)
// ---------------------------------------------------------------------------

/// Replace the entire off-peak configuration.
pub async fn update_off_peak_config(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<UpdateOffPeakConfigBulk>,
) -> AppResult<impl IntoResponse> {
    // Validate each entry.
    for entry in &input.entries {
        if entry.day_of_week < 0 || entry.day_of_week > 6 {
            return Err(AppError::Core(CoreError::Validation(format!(
                "day_of_week must be 0-6, got {}",
                entry.day_of_week
            ))));
        }
        if entry.start_hour < 0 || entry.start_hour > 23 {
            return Err(AppError::Core(CoreError::Validation(format!(
                "start_hour must be 0-23, got {}",
                entry.start_hour
            ))));
        }
        if entry.end_hour < 0 || entry.end_hour > 23 {
            return Err(AppError::Core(CoreError::Validation(format!(
                "end_hour must be 0-23, got {}",
                entry.end_hour
            ))));
        }
        job_scheduling::validate_timezone(&entry.timezone)?;
    }

    // Determine the timezone (use first entry's or default to UTC).
    let timezone = input
        .entries
        .first()
        .map(|e| e.timezone.as_str())
        .unwrap_or("UTC");

    let configs = OffPeakConfigRepo::replace_all(&state.pool, timezone, &input.entries).await?;

    tracing::info!(
        user_id = admin.user_id,
        entry_count = configs.len(),
        "Off-peak config updated",
    );

    Ok(Json(DataResponse { data: configs }))
}

// ---------------------------------------------------------------------------
// POST /schedules/:id/cancel  (PRD-134)
// ---------------------------------------------------------------------------

/// Cancel a scheduled generation. Reverts associated scene statuses
/// and records the cancellation in history.
pub async fn cancel_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    use x121_core::job_scheduling::{ACTION_SCHEDULE_GENERATION, HISTORY_CANCELLED};
    use x121_db::models::generation::UpdateSceneGeneration;
    use x121_db::models::status::SceneStatus;
    use x121_db::repositories::{SceneRepo, SceneVideoVersionRepo};

    let schedule = ensure_schedule_owned(&state.pool, id, auth.user_id).await?;

    // Must be active and not already fired.
    if !schedule.is_active {
        return Err(AppError::Core(CoreError::Conflict(
            "Schedule is already inactive".into(),
        )));
    }

    // Deactivate the schedule.
    ScheduleRepo::set_active(&state.pool, id, false).await?;

    // If this is a generation schedule, revert scene statuses.
    let mut scenes_reverted = 0usize;
    if schedule.action_type == ACTION_SCHEDULE_GENERATION {
        if let Some(scene_ids) = schedule
            .action_config
            .get("scene_ids")
            .and_then(|v| serde_json::from_value::<Vec<DbId>>(v.clone()).ok())
        {
            for scene_id in scene_ids {
                // Only revert scenes that are still in Scheduled status.
                if let Ok(Some(scene)) = SceneRepo::find_by_id(&state.pool, scene_id).await {
                    if scene.status_id == SceneStatus::Scheduled.id() {
                        // Determine restore status: Generated if has videos, else Pending.
                        let has_videos =
                            SceneVideoVersionRepo::list_by_scene(&state.pool, scene_id)
                                .await
                                .map(|v| !v.is_empty())
                                .unwrap_or(false);
                        let restore = if has_videos {
                            SceneStatus::Generated.id()
                        } else {
                            SceneStatus::Pending.id()
                        };

                        let update = UpdateSceneGeneration {
                            status_id: Some(restore),
                            total_segments_estimated: None,
                            total_segments_completed: None,
                            actual_duration_secs: None,
                            transition_segment_index: None,
                            generation_started_at: None,
                            generation_completed_at: None,
                        };
                        let _ = SceneRepo::update_generation_state(&state.pool, scene_id, &update)
                            .await;
                        scenes_reverted += 1;
                    }
                }
            }
        }
    }

    // Record cancellation in history.
    let _ = ScheduleHistoryRepo::record(&state.pool, id, HISTORY_CANCELLED, None, None, None).await;

    tracing::info!(
        schedule_id = id,
        user_id = auth.user_id,
        scenes_reverted,
        "Schedule cancelled"
    );

    Ok(Json(DataResponse {
        data: CancelScheduleResponse {
            schedule_id: id,
            cancelled: true,
            scenes_reverted,
        },
    }))
}

/// Response body for `POST /schedules/{id}/cancel`.
#[derive(Debug, serde::Serialize)]
struct CancelScheduleResponse {
    schedule_id: DbId,
    cancelled: bool,
    scenes_reverted: usize,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Look up a schedule by ID and verify that the calling user owns it.
///
/// Returns `AppError::NotFound` if the schedule does not exist, or
/// `AppError::Forbidden` if it belongs to another user.
async fn ensure_schedule_owned(
    pool: &sqlx::PgPool,
    id: DbId,
    user_id: DbId,
) -> AppResult<x121_db::models::job_scheduling::Schedule> {
    let schedule = ScheduleRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Schedule",
            id,
        }))?;

    if schedule.owner_id != user_id {
        return Err(AppError::Core(CoreError::Forbidden(
            "You can only access your own schedules".into(),
        )));
    }

    Ok(schedule)
}

/// Compute the next run time for a schedule based on its type and configuration.
fn compute_next_run_for_schedule(
    schedule: &x121_db::models::job_scheduling::Schedule,
) -> Option<chrono::DateTime<chrono::Utc>> {
    match schedule.schedule_type.as_str() {
        SCHEDULE_RECURRING => {
            let cron_str = schedule.cron_expression.as_deref()?;
            let fields = parse_cron_fields(cron_str).ok()?;
            let after = schedule.last_run_at.unwrap_or_else(chrono::Utc::now);
            compute_next_run(&fields, after)
        }
        SCHEDULE_ONE_TIME => {
            // If it hasn't run yet, next_run is the scheduled_at time.
            if schedule.run_count == 0 {
                schedule.scheduled_at
            } else {
                None // Already ran.
            }
        }
        _ => None,
    }
}
