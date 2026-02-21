//! Handlers for the `/admin/reclamation` resource (PRD-15).
//!
//! Provides admin-only endpoints for disk reclamation: previewing reclaimable
//! space, triggering cleanup, managing the trash queue, protection rules, and
//! reclamation policies.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use trulience_core::error::CoreError;
use trulience_core::reclamation::types::{
    CleanupReport, ProjectReclamationSummary, ReclamationPreview,
};
use trulience_core::types::DbId;
use trulience_db::models::reclamation::{
    CreateProtectionRule, CreateReclamationPolicy, CreateReclamationRun, UpdateProtectionRule,
    UpdateReclamationPolicy,
};
use trulience_db::repositories::ReclamationRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ── Preview & Cleanup ───────────────────────────────────────────────

/// GET /api/v1/admin/reclamation/preview
///
/// Preview reclaimable space across the studio, with per-project breakdown.
pub async fn preview(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<ReclamationPreview>>> {
    // Query pending trash entries to build preview from actual trash queue.
    let entries = ReclamationRepo::list_trash_queue(&state.pool, Some("pending"), None, None, 10_000, 0)
        .await?;

    let total_bytes: i64 = entries.iter().map(|e| e.file_size_bytes).sum();
    let total_files = entries.len() as i64;

    // Group by project_id for per-project breakdown.
    let mut project_map = std::collections::HashMap::<Option<DbId>, (i64, i64)>::new();
    for entry in &entries {
        let counter = project_map.entry(entry.project_id).or_insert((0, 0));
        counter.0 += 1;
        counter.1 += entry.file_size_bytes;
    }

    let per_project: Vec<ProjectReclamationSummary> = project_map
        .into_iter()
        .map(|(project_id, (file_count, total))| ProjectReclamationSummary {
            project_id,
            project_name: None,
            file_count,
            total_bytes: total,
        })
        .collect();

    Ok(Json(DataResponse {
        data: ReclamationPreview {
            total_files,
            total_bytes,
            per_project,
        },
    }))
}

/// Request body for the cleanup endpoint.
#[derive(Debug, Deserialize)]
pub struct RunCleanupRequest {
    pub project_id: Option<DbId>,
}

/// POST /api/v1/admin/reclamation/run
///
/// Trigger a cleanup run that purges expired trash entries.
pub async fn run_cleanup(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(body): Json<RunCleanupRequest>,
) -> AppResult<Json<DataResponse<CleanupReport>>> {
    // Create run record.
    let run_input = CreateReclamationRun {
        run_type: "manual".to_string(),
        policy_id: None,
        project_id: body.project_id,
        files_scanned: 0,
        files_marked: 0,
    };
    let run = ReclamationRepo::create_run(&state.pool, &run_input).await?;

    // Find expired entries and purge them.
    let expired = ReclamationRepo::get_expired_entries(&state.pool).await?;

    let mut files_deleted: i32 = 0;
    let mut bytes_reclaimed: i64 = 0;
    let mut errors: Vec<String> = Vec::new();

    for entry in &expired {
        // Optionally filter by project_id if specified.
        if let Some(pid) = body.project_id {
            if entry.project_id != Some(pid) {
                continue;
            }
        }

        // Attempt to delete file from disk.
        let path = std::path::Path::new(&entry.file_path);
        if path.exists() {
            if let Err(e) = tokio::fs::remove_file(path).await {
                errors.push(format!("Failed to delete {}: {}", entry.file_path, e));
                continue;
            }
        }

        // Mark as deleted in database.
        match ReclamationRepo::mark_as_deleted(&state.pool, entry.id).await {
            Ok(Some(_)) => {
                files_deleted += 1;
                bytes_reclaimed += entry.file_size_bytes;
            }
            Ok(None) => {
                errors.push(format!("Entry {} not found when marking as deleted", entry.id));
            }
            Err(e) => {
                errors.push(format!("DB error marking entry {} deleted: {}", entry.id, e));
            }
        }
    }

    // Complete the run record.
    let error_msg = if errors.is_empty() {
        None
    } else {
        Some(errors.join("; "))
    };
    ReclamationRepo::complete_run(
        &state.pool,
        run.id,
        files_deleted,
        bytes_reclaimed,
        error_msg.as_deref(),
    )
    .await?;

    Ok(Json(DataResponse {
        data: CleanupReport {
            run_id: run.id,
            files_scanned: expired.len() as i32,
            files_marked: 0,
            files_deleted,
            bytes_reclaimed,
            errors,
        },
    }))
}

// ── Trash Queue ─────────────────────────────────────────────────────

/// Query parameters for listing the trash queue.
#[derive(Debug, Deserialize)]
pub struct ListTrashParams {
    pub status: Option<String>,
    pub project_id: Option<DbId>,
    pub entity_type: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// GET /api/v1/admin/reclamation/trash
///
/// List entries in the trash queue with optional filtering.
pub async fn list_trash(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<ListTrashParams>,
) -> AppResult<impl IntoResponse> {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);
    let entries = ReclamationRepo::list_trash_queue(
        &state.pool,
        params.status.as_deref(),
        params.project_id,
        params.entity_type.as_deref(),
        limit,
        offset,
    )
    .await?;
    Ok(Json(DataResponse { data: entries }))
}

/// POST /api/v1/admin/reclamation/trash/{id}/restore
///
/// Restore a trash queue entry before its grace period expires.
pub async fn restore_trash(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let entry = ReclamationRepo::restore_from_trash(&state.pool, id, admin.user_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "TrashQueueEntry",
            id,
        }))?;
    Ok(Json(DataResponse { data: entry }))
}

// ── Cleanup History ─────────────────────────────────────────────────

/// Query parameters for listing reclamation runs.
#[derive(Debug, Deserialize)]
pub struct ListRunsParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// GET /api/v1/admin/reclamation/history
///
/// List past reclamation runs, most recent first.
pub async fn list_runs(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<ListRunsParams>,
) -> AppResult<impl IntoResponse> {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);
    let runs = ReclamationRepo::list_runs(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: runs }))
}

// ── Protection Rules ────────────────────────────────────────────────

/// GET /api/v1/admin/reclamation/protection-rules
///
/// List all asset protection rules.
pub async fn list_protection_rules(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let rules = ReclamationRepo::list_protection_rules(&state.pool).await?;
    Ok(Json(DataResponse { data: rules }))
}

/// POST /api/v1/admin/reclamation/protection-rules
///
/// Create a new protection rule. Returns 201 Created.
pub async fn create_protection_rule(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<CreateProtectionRule>,
) -> AppResult<impl IntoResponse> {
    let rule = ReclamationRepo::create_protection_rule(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: rule })))
}

/// PUT /api/v1/admin/reclamation/protection-rules/{id}
///
/// Update an existing protection rule.
pub async fn update_protection_rule(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateProtectionRule>,
) -> AppResult<impl IntoResponse> {
    let rule = ReclamationRepo::update_protection_rule(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AssetProtectionRule",
            id,
        }))?;
    Ok(Json(DataResponse { data: rule }))
}

/// DELETE /api/v1/admin/reclamation/protection-rules/{id}
///
/// Delete a protection rule. Returns 204 on success, 404 if not found.
pub async fn delete_protection_rule(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ReclamationRepo::delete_protection_rule(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "AssetProtectionRule",
            id,
        }))
    }
}

// ── Reclamation Policies ────────────────────────────────────────────

/// Query parameters for listing policies.
#[derive(Debug, Deserialize)]
pub struct ListPoliciesParams {
    pub project_id: Option<DbId>,
}

/// GET /api/v1/admin/reclamation/policies
///
/// List reclamation policies, optionally filtered by project.
pub async fn list_policies(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<ListPoliciesParams>,
) -> AppResult<impl IntoResponse> {
    let policies = ReclamationRepo::list_policies(&state.pool, params.project_id).await?;
    Ok(Json(DataResponse { data: policies }))
}

/// POST /api/v1/admin/reclamation/policies
///
/// Create a new reclamation policy. Returns 201 Created.
pub async fn create_policy(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<CreateReclamationPolicy>,
) -> AppResult<impl IntoResponse> {
    let policy = ReclamationRepo::create_policy(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: policy })))
}

/// PUT /api/v1/admin/reclamation/policies/{id}
///
/// Update an existing reclamation policy.
pub async fn update_policy(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateReclamationPolicy>,
) -> AppResult<impl IntoResponse> {
    let policy = ReclamationRepo::update_policy(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ReclamationPolicy",
            id,
        }))?;
    Ok(Json(DataResponse { data: policy }))
}

/// DELETE /api/v1/admin/reclamation/policies/{id}
///
/// Delete a reclamation policy. Returns 204 on success, 404 if not found.
pub async fn delete_policy(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ReclamationRepo::delete_policy(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ReclamationPolicy",
            id,
        }))
    }
}
