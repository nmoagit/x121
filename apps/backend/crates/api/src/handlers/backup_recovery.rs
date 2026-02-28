//! Handlers for Backup & Disaster Recovery (PRD-81).
//!
//! All endpoints are admin-only. Provides CRUD for backups, backup schedules,
//! verification, summary dashboard data, and a static recovery runbook.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;

use x121_core::backup_recovery::{
    compute_next_run, validate_cron_expression, BackupType, TriggeredBy,
};
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use x121_db::models::backup_recovery::{
    Backup, BackupSchedule, CreateBackup, CreateBackupSchedule, UpdateBackup, UpdateBackupSchedule,
};
use x121_db::repositories::{BackupRepo, BackupScheduleRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find a backup by ID or return 404.
async fn ensure_backup_exists(state: &AppState, id: DbId) -> AppResult<Backup> {
    BackupRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Backup",
                id,
            })
        })
}

/// Find a backup schedule by ID or return 404.
async fn ensure_schedule_exists(state: &AppState, id: DbId) -> AppResult<BackupSchedule> {
    BackupScheduleRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BackupSchedule",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query params for listing backups with optional filters.
#[derive(Debug, Deserialize)]
pub struct BackupListParams {
    pub backup_type: Option<String>,
    pub status: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// Body for the verify-backup endpoint.
#[derive(Debug, Deserialize)]
pub struct VerifyBackupBody {
    pub verification_result_json: Option<serde_json::Value>,
}

// ===========================================================================
// Backups
// ===========================================================================

/// `GET /admin/backups` -- list backups with optional type/status filters.
pub async fn list_backups(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<BackupListParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(
        params.pagination.limit,
        DEFAULT_SEARCH_LIMIT,
        MAX_SEARCH_LIMIT,
    );
    let offset = clamp_offset(params.pagination.offset);

    // Validate filter values if provided.
    if let Some(ref bt) = params.backup_type {
        BackupType::parse(bt)?;
    }

    let backups = BackupRepo::list(
        &state.pool,
        params.backup_type.as_deref(),
        params.status.as_deref(),
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: backups }))
}

/// `GET /admin/backups/:id` -- get a single backup.
pub async fn get_backup(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let backup = ensure_backup_exists(&state, id).await?;
    Ok(Json(DataResponse { data: backup }))
}

/// `POST /admin/backups` -- trigger a new backup (creates a pending record).
pub async fn trigger_backup(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Json(body): Json<CreateBackup>,
) -> AppResult<impl IntoResponse> {
    // Validate backup type.
    BackupType::parse(&body.backup_type)?;

    // Validate triggered_by if provided.
    if let Some(ref tb) = body.triggered_by {
        TriggeredBy::parse(tb)?;
    }

    let backup = BackupRepo::create(&state.pool, &body).await?;

    tracing::info!(
        backup_id = backup.id,
        backup_type = %backup.backup_type,
        user_id = admin.user_id,
        "Backup triggered"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: backup })))
}

/// `POST /admin/backups/:id/verify` -- mark a backup as verified.
pub async fn verify_backup(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(body): Json<VerifyBackupBody>,
) -> AppResult<impl IntoResponse> {
    ensure_backup_exists(&state, id).await?;

    let update = UpdateBackup {
        status: Some("verified".to_string()),
        verified: Some(true),
        verified_at: Some(Utc::now()),
        verification_result_json: body.verification_result_json,
        file_path: None,
        size_bytes: None,
        started_at: None,
        completed_at: None,
        error_message: None,
        retention_expires_at: None,
    };

    let backup = BackupRepo::update(&state.pool, id, &update)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Backup",
                id,
            })
        })?;

    tracing::info!(backup_id = id, user_id = admin.user_id, "Backup verified");

    Ok(Json(DataResponse { data: backup }))
}

/// `DELETE /admin/backups/:id` -- delete a backup record.
pub async fn delete_backup(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = BackupRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(backup_id = id, user_id = admin.user_id, "Backup deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Backup",
            id,
        }))
    }
}

/// `GET /admin/backups/summary` -- dashboard summary of backup state.
pub async fn get_backup_summary(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let summary = BackupRepo::get_summary(&state.pool).await?;
    Ok(Json(DataResponse { data: summary }))
}

/// `GET /admin/backups/recovery-runbook` -- static disaster recovery runbook.
pub async fn download_runbook(RequireAdmin(_admin): RequireAdmin) -> AppResult<impl IntoResponse> {
    let runbook = include_str!("../static/recovery_runbook.html");
    Ok((
        StatusCode::OK,
        [("content-type", "text/html; charset=utf-8")],
        runbook,
    ))
}

// ===========================================================================
// Backup Schedules
// ===========================================================================

/// `GET /admin/backup-schedules` -- list all backup schedules.
pub async fn list_schedules(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let schedules = BackupScheduleRepo::list(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: schedules }))
}

/// `GET /admin/backup-schedules/:id` -- get a single backup schedule.
pub async fn get_schedule(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let schedule = ensure_schedule_exists(&state, id).await?;
    Ok(Json(DataResponse { data: schedule }))
}

/// `POST /admin/backup-schedules` -- create a new backup schedule.
pub async fn create_schedule(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Json(body): Json<CreateBackupSchedule>,
) -> AppResult<impl IntoResponse> {
    // Validate backup type (only full, incremental, config allowed for schedules).
    let bt = BackupType::parse(&body.backup_type)?;
    if bt == BackupType::Wal {
        return Err(AppError::Core(CoreError::Validation(
            "WAL backups cannot be scheduled; they are system-managed".to_string(),
        )));
    }

    // Validate and compute next run.
    validate_cron_expression(&body.cron_expression)?;
    let next_run_at = compute_next_run(&body.cron_expression, Utc::now()).ok();

    let schedule = BackupScheduleRepo::create(&state.pool, &body, next_run_at).await?;

    tracing::info!(
        schedule_id = schedule.id,
        backup_type = %schedule.backup_type,
        cron = %schedule.cron_expression,
        user_id = admin.user_id,
        "Backup schedule created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: schedule })))
}

/// `PUT /admin/backup-schedules/:id` -- update an existing backup schedule.
pub async fn update_schedule(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateBackupSchedule>,
) -> AppResult<impl IntoResponse> {
    ensure_schedule_exists(&state, id).await?;

    // Validate backup type if changed.
    if let Some(ref bt) = body.backup_type {
        let parsed = BackupType::parse(bt)?;
        if parsed == BackupType::Wal {
            return Err(AppError::Core(CoreError::Validation(
                "WAL backups cannot be scheduled; they are system-managed".to_string(),
            )));
        }
    }

    // Recompute next_run_at if cron expression changed.
    let next_run_at = if let Some(ref cron) = body.cron_expression {
        validate_cron_expression(cron)?;
        compute_next_run(cron, Utc::now()).ok()
    } else {
        None
    };

    let schedule = BackupScheduleRepo::update(&state.pool, id, &body, next_run_at)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BackupSchedule",
                id,
            })
        })?;

    tracing::info!(
        schedule_id = id,
        user_id = admin.user_id,
        "Backup schedule updated"
    );

    Ok(Json(DataResponse { data: schedule }))
}

/// `DELETE /admin/backup-schedules/:id` -- delete a backup schedule.
pub async fn delete_schedule(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = BackupScheduleRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(
            schedule_id = id,
            user_id = admin.user_id,
            "Backup schedule deleted"
        );
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "BackupSchedule",
            id,
        }))
    }
}
