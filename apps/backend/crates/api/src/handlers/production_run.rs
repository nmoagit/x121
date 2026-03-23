//! Handlers for the Batch Production Orchestrator (PRD-57).
//!
//! Provides endpoints for managing production runs: creating runs, viewing
//! the matrix state, submitting cells, resubmitting failures, triggering
//! delivery, and tracking aggregate progress.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::{Deserialize, Serialize};

use x121_core::batch_production::{
    self, MatrixConfig, RUN_STATUS_ID_COMPLETED, RUN_STATUS_ID_DRAFT, RUN_STATUS_ID_FAILED,
    RUN_STATUS_ID_SUBMITTING,
};
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::production_run::{
    AvatarCellsResponse, CancelCellsResponse, CancelRunResponse, CreateProductionRun,
    CreateProductionRunCell, CreateProductionRunRequest, DeleteCellsResponse, DeliverResponse,
    ProductionRun, ProductionRunProgress, ResubmitResponse, SubmitCellsRequest,
    SubmitCellsResponse,
};
use x121_db::repositories::{AvatarSceneOverrideRepo, ProductionRunRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination parameters for listing production runs.
#[derive(Debug, Deserialize)]
pub struct ListRunsParams {
    pub project_id: DbId,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a production run exists, returning the full row.
async fn ensure_run_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<ProductionRun> {
    ProductionRunRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProductionRun",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// POST /production-runs
// ---------------------------------------------------------------------------

/// Create a new production run with the specified matrix configuration.
///
/// Generates all cells (avatar x scene_type combinations) and inserts them.
pub async fn create_run(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateProductionRunRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate matrix configuration.
    let config = MatrixConfig {
        avatar_ids: body.avatar_ids.clone(),
        scene_type_ids: body.scene_type_ids.clone(),
    };
    batch_production::validate_matrix_config(&config)?;

    // Build the set of requested scene_type_ids for filtering.
    let requested_scene_types: std::collections::HashSet<DbId> =
        body.scene_type_ids.iter().copied().collect();

    // For each avatar, resolve the enabled (scene_type, track) pairs via the
    // four-level inheritance chain, then filter to requested scene_type_ids.
    let mut cells: Vec<CreateProductionRunCell> = Vec::new();
    for &cid in &body.avatar_ids {
        let settings = AvatarSceneOverrideRepo::list_effective(
            &state.pool,
            cid,
            body.project_id,
            None, // group_id not known at run level
        )
        .await?;

        for s in settings {
            if !s.is_enabled {
                continue;
            }
            if !requested_scene_types.contains(&s.scene_type_id) {
                continue;
            }
            cells.push(CreateProductionRunCell {
                run_id: 0, // placeholder — set after run creation
                avatar_id: cid,
                scene_type_id: s.scene_type_id,
                track_id: s.track_id,
                variant_label: "default".to_string(),
            });
        }
    }

    // Deduplicate: one cell per (avatar_id, scene_type_id, track_id).
    cells.sort_by(|a, b| {
        a.avatar_id
            .cmp(&b.avatar_id)
            .then(a.scene_type_id.cmp(&b.scene_type_id))
            .then(a.track_id.cmp(&b.track_id))
    });
    cells.dedup_by(|a, b| {
        a.avatar_id == b.avatar_id && a.scene_type_id == b.scene_type_id && a.track_id == b.track_id
    });

    let total_cells = cells.len() as i32;

    let matrix_config_json =
        serde_json::to_value(&config).map_err(|e| AppError::InternalError(e.to_string()))?;

    let input = CreateProductionRun {
        project_id: body.project_id,
        name: body.name.clone(),
        description: body.description.clone(),
        matrix_config: matrix_config_json,
        total_cells,
        estimated_gpu_hours: body.estimated_gpu_hours,
        estimated_disk_gb: body.estimated_disk_gb,
        created_by_id: auth.user_id,
    };

    let run = ProductionRunRepo::create(&state.pool, &input).await?;

    // Set the actual run_id on all cells.
    for cell in &mut cells {
        cell.run_id = run.id;
    }

    ProductionRunRepo::create_cells_batch(&state.pool, &cells).await?;

    // Retrospective: check for existing scenes and pre-mark cells.
    let mut completed_count = 0i32;
    let mut in_progress_count = 0i32;
    if body.retrospective {
        // Mark cells with approved scenes as completed.
        let approved =
            ProductionRunRepo::find_cells_with_approved_scenes(&state.pool, run.id).await?;
        completed_count = approved.len() as i32;
        if !approved.is_empty() {
            ProductionRunRepo::mark_cells_completed_with_scene(&state.pool, &approved).await?;
            ProductionRunRepo::set_completed_cells(&state.pool, run.id, completed_count).await?;
        }

        // Mark cells with in-progress scenes (have video versions but none approved) as in-progress.
        let in_progress =
            ProductionRunRepo::find_cells_with_in_progress_scenes(&state.pool, run.id).await?;
        in_progress_count = in_progress.len() as i32;
        if !in_progress.is_empty() {
            ProductionRunRepo::mark_cells_in_progress_with_scene(&state.pool, &in_progress).await?;
        }
    }

    // Re-fetch the run to get the updated counts.
    let run = if completed_count > 0 || in_progress_count > 0 {
        ProductionRunRepo::find_by_id(&state.pool, run.id)
            .await?
            .unwrap_or(run)
    } else {
        run
    };

    tracing::info!(
        run_id = run.id,
        project_id = body.project_id,
        total_cells,
        retrospective_completed = completed_count,
        retrospective_in_progress = in_progress_count,
        user_id = auth.user_id,
        "Production run created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: run })))
}

// ---------------------------------------------------------------------------
// GET /production-runs
// ---------------------------------------------------------------------------

/// List production runs for a project.
pub async fn list_runs(
    State(state): State<AppState>,
    Query(params): Query<ListRunsParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 25, 100);
    let offset = clamp_offset(params.offset);

    let items =
        ProductionRunRepo::list_by_project(&state.pool, params.project_id, limit, offset).await?;
    tracing::debug!(
        count = items.len(),
        project_id = params.project_id,
        "Listed production runs"
    );
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /production-runs/{id}
// ---------------------------------------------------------------------------

/// Get a single production run by ID.
pub async fn get_run(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: run }))
}

// ---------------------------------------------------------------------------
// GET /production-runs/{id}/matrix
// ---------------------------------------------------------------------------

/// Get the matrix state (all cells) for a production run, enriched with names.
pub async fn get_matrix(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_run_exists(&state.pool, id).await?;

    // Live-refresh stale not_started cells before returning the matrix.
    let (completed, in_progress) = ProductionRunRepo::refresh_stale_cells(&state.pool, id).await?;
    if completed > 0 || in_progress > 0 {
        tracing::debug!(
            run_id = id,
            refreshed_completed = completed,
            refreshed_in_progress = in_progress,
            "Refreshed stale matrix cells"
        );
    }

    let cells = ProductionRunRepo::list_matrix_cells(&state.pool, id).await?;
    tracing::debug!(
        run_id = id,
        cell_count = cells.len(),
        "Fetched matrix cells"
    );
    Ok(Json(DataResponse { data: cells }))
}

// ---------------------------------------------------------------------------
// GET /production-runs/enabled-scene-types
// ---------------------------------------------------------------------------

/// Query params for enabled scene types endpoint.
#[derive(Debug, Deserialize)]
pub struct EnabledSceneTypesParams {
    pub project_id: DbId,
    pub avatar_ids: String, // Comma-separated
}

/// A scene type (+track) that is enabled for a avatar.
#[derive(Debug, Serialize)]
struct EnabledSceneTypeEntry {
    avatar_id: DbId,
    scene_type_id: DbId,
    scene_type_name: String,
    track_id: Option<DbId>,
    track_name: Option<String>,
    has_clothes_off_transition: bool,
}

/// Get the enabled scene types for each avatar in the request.
///
/// Returns a flat list of `(avatar_id, scene_type_id, scene_type_name)`
/// entries, one per enabled scene type per avatar.
pub async fn enabled_scene_types(
    State(state): State<AppState>,
    Query(params): Query<EnabledSceneTypesParams>,
) -> AppResult<impl IntoResponse> {
    let char_ids: Vec<DbId> = params
        .avatar_ids
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    if char_ids.is_empty() {
        return Ok(Json(DataResponse {
            data: Vec::<EnabledSceneTypeEntry>::new(),
        }));
    }

    // For each avatar, get effective scene settings and collect enabled scene types.
    // group_id is not known here — pass None to skip the group tier.
    let mut entries = Vec::new();
    for &cid in &char_ids {
        let settings =
            AvatarSceneOverrideRepo::list_effective(&state.pool, cid, params.project_id, None)
                .await?;

        for s in settings {
            if s.is_enabled {
                entries.push(EnabledSceneTypeEntry {
                    avatar_id: cid,
                    scene_type_id: s.scene_type_id,
                    scene_type_name: s.name.clone(),
                    track_id: s.track_id,
                    track_name: s.track_name.clone(),
                    has_clothes_off_transition: s.has_clothes_off_transition,
                });
            }
        }
    }

    // Deduplicate: one entry per (avatar_id, scene_type_id, track_id)
    entries.sort_by(|a, b| {
        a.avatar_id
            .cmp(&b.avatar_id)
            .then(a.scene_type_id.cmp(&b.scene_type_id))
            .then(a.track_id.cmp(&b.track_id))
    });
    entries.dedup_by(|a, b| {
        a.avatar_id == b.avatar_id && a.scene_type_id == b.scene_type_id && a.track_id == b.track_id
    });

    Ok(Json(DataResponse { data: entries }))
}

// ---------------------------------------------------------------------------
// POST /production-runs/{id}/submit
// ---------------------------------------------------------------------------

/// Submit cells in a production run for generation.
///
/// If `cell_ids` is provided, only those cells are submitted.
/// Otherwise all cells in the run are submitted.
pub async fn submit_cells(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<SubmitCellsRequest>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;

    // Transition run status to submitting.
    ProductionRunRepo::update_status(&state.pool, id, RUN_STATUS_ID_SUBMITTING).await?;

    let cells = match body.cell_ids {
        Some(ref ids) if !ids.is_empty() => {
            ProductionRunRepo::list_cells_by_ids(&state.pool, id, ids).await?
        }
        _ => ProductionRunRepo::list_cells_by_run(&state.pool, id).await?,
    };

    // Mark each cell as running.
    for cell in &cells {
        ProductionRunRepo::update_cell_status(
            &state.pool,
            cell.id,
            RUN_STATUS_ID_SUBMITTING,
            None,
            None,
        )
        .await?;
    }

    tracing::info!(
        run_id = id,
        submitted_cells = cells.len(),
        user_id = auth.user_id,
        "Production run cells submitted"
    );

    Ok(Json(DataResponse {
        data: SubmitCellsResponse {
            run_id: run.id,
            submitted_cells: cells.len(),
            status: batch_production::RUN_STATUS_SUBMITTING.to_string(),
        },
    }))
}

// ---------------------------------------------------------------------------
// POST /production-runs/{id}/resubmit-failed
// ---------------------------------------------------------------------------

/// Re-submit failed cells in a production run.
pub async fn resubmit_failed(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_run_exists(&state.pool, id).await?;

    let failed_cells = ProductionRunRepo::list_failed_cells(&state.pool, id).await?;

    if failed_cells.is_empty() {
        return Err(AppError::Core(CoreError::Validation(
            "No failed cells to resubmit".to_string(),
        )));
    }

    // Reset each failed cell to pending.
    for cell in &failed_cells {
        ProductionRunRepo::update_cell_status(
            &state.pool,
            cell.id,
            RUN_STATUS_ID_DRAFT,
            None,
            None,
        )
        .await?;
    }

    tracing::info!(
        run_id = id,
        resubmitted_cells = failed_cells.len(),
        user_id = auth.user_id,
        "Failed cells resubmitted"
    );

    Ok(Json(DataResponse {
        data: ResubmitResponse {
            run_id: id,
            resubmitted_cells: failed_cells.len(),
        },
    }))
}

// ---------------------------------------------------------------------------
// POST /production-runs/{id}/deliver
// ---------------------------------------------------------------------------

/// Trigger delivery for a production run.
///
/// Only succeeds if all cells are approved or delivered.
pub async fn deliver_run(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_run_exists(&state.pool, id).await?;

    let cells = ProductionRunRepo::list_cells_by_run(&state.pool, id).await?;

    // Compute CellStatus for each cell based on status_id.
    let cell_statuses: Vec<batch_production::CellStatus> = cells
        .iter()
        .map(|c| match c.status_id {
            RUN_STATUS_ID_COMPLETED => batch_production::CellStatus::Approved,
            RUN_STATUS_ID_FAILED => batch_production::CellStatus::Failed,
            _ => batch_production::CellStatus::Generating,
        })
        .collect();

    batch_production::validate_delivery_readiness(&cell_statuses)?;

    // Mark run as completed/delivered.
    ProductionRunRepo::mark_completed(&state.pool, id).await?;

    tracing::info!(
        run_id = id,
        user_id = auth.user_id,
        "Production run delivery triggered"
    );

    Ok(Json(DataResponse {
        data: DeliverResponse {
            run_id: id,
            status: batch_production::RUN_STATUS_DELIVERED.to_string(),
        },
    }))
}

// ---------------------------------------------------------------------------
// GET /production-runs/{id}/progress
// ---------------------------------------------------------------------------

/// Get aggregate progress statistics for a production run.
pub async fn get_progress(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;

    let status_counts = ProductionRunRepo::count_cells_by_status(&state.pool, id).await?;

    let mut completed: i32 = 0;
    let mut failed: i32 = 0;
    let mut in_progress: i32 = 0;
    let mut not_started: i32 = 0;

    for (status_id, count) in &status_counts {
        let count = *count as i32;
        match *status_id {
            RUN_STATUS_ID_COMPLETED => completed += count,
            RUN_STATUS_ID_FAILED => failed += count,
            RUN_STATUS_ID_DRAFT => not_started += count,
            _ => in_progress += count,
        }
    }

    let total = run.total_cells;
    let completion_pct = if total > 0 {
        (completed as f64 / total as f64) * 100.0
    } else {
        0.0
    };

    let progress = ProductionRunProgress {
        run_id: id,
        total_cells: total,
        completed_cells: completed,
        failed_cells: failed,
        in_progress_cells: in_progress,
        not_started_cells: not_started,
        completion_pct,
    };

    Ok(Json(DataResponse { data: progress }))
}

// ---------------------------------------------------------------------------
// POST /production-runs/{id}/cancel
// ---------------------------------------------------------------------------

/// Cancel a production run (set status to cancelled).
pub async fn cancel_run(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;

    // Only draft or in-progress runs can be cancelled.
    if run.status_id == RUN_STATUS_ID_COMPLETED {
        return Err(AppError::Core(CoreError::Validation(
            "Cannot cancel a completed run".to_string(),
        )));
    }

    ProductionRunRepo::update_status(&state.pool, id, batch_production::RUN_STATUS_ID_CANCELLED)
        .await?;

    tracing::info!(
        run_id = id,
        user_id = auth.user_id,
        "Production run cancelled"
    );

    Ok(Json(DataResponse {
        data: CancelRunResponse {
            run_id: id,
            status: "cancelled".to_string(),
        },
    }))
}

// ---------------------------------------------------------------------------
// POST /production-runs/{id}/cells/cancel
// ---------------------------------------------------------------------------

/// Request body for cancelling specific cells.
#[derive(Debug, Deserialize)]
pub struct CellIdsRequest {
    pub cell_ids: Vec<DbId>,
}

/// Cancel specific cells in a production run (set status to cancelled).
pub async fn cancel_cells(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<CellIdsRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_run_exists(&state.pool, id).await?;

    let mut cancelled = 0usize;
    for &cell_id in &body.cell_ids {
        if let Some(_cell) = ProductionRunRepo::update_cell_status(
            &state.pool,
            cell_id,
            batch_production::RUN_STATUS_ID_CANCELLED,
            None,
            None,
        )
        .await?
        {
            cancelled += 1;
        }
    }

    tracing::info!(run_id = id, cancelled, "Cells cancelled");
    Ok(Json(DataResponse {
        data: CancelCellsResponse {
            run_id: id,
            cancelled,
        },
    }))
}

// ---------------------------------------------------------------------------
// DELETE /production-runs/{id}/cells
// ---------------------------------------------------------------------------

/// Delete specific cells from a production run.
pub async fn delete_cells(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<CellIdsRequest>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;

    let deleted = ProductionRunRepo::delete_cells(&state.pool, id, &body.cell_ids).await?;

    // Update total_cells on the run.
    let new_total = run.total_cells - deleted as i32;
    ProductionRunRepo::set_total_cells(&state.pool, id, new_total).await?;

    tracing::info!(run_id = id, deleted, "Cells deleted");
    Ok(Json(DataResponse {
        data: DeleteCellsResponse {
            run_id: id,
            deleted,
        },
    }))
}

// ---------------------------------------------------------------------------
// POST /production-runs/{id}/avatars/{avatar_id}/delete
// ---------------------------------------------------------------------------

/// Cancel all cells for a specific avatar in a production run.
pub async fn cancel_avatar_cells(
    State(state): State<AppState>,
    Path((id, avatar_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_run_exists(&state.pool, id).await?;

    let cancelled = ProductionRunRepo::cancel_avatar_cells(&state.pool, id, avatar_id).await?;

    tracing::info!(run_id = id, avatar_id, cancelled, "Avatar cells cancelled");
    Ok(Json(DataResponse {
        data: AvatarCellsResponse {
            run_id: id,
            avatar_id,
            affected: cancelled,
        },
    }))
}

/// Delete all cells for a specific avatar in a production run.
pub async fn delete_avatar_cells(
    State(state): State<AppState>,
    Path((id, avatar_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;

    let deleted = ProductionRunRepo::delete_avatar_cells(&state.pool, id, avatar_id).await?;

    // Update total_cells on the run.
    let new_total = run.total_cells - deleted as i32;
    ProductionRunRepo::set_total_cells(&state.pool, id, new_total).await?;

    // Also update matrix_config to remove this avatar_id.
    if let Ok(mut config) = serde_json::from_value::<MatrixConfig>(run.matrix_config.clone()) {
        config.avatar_ids.retain(|&cid| cid != avatar_id);
        let _ = ProductionRunRepo::update_matrix_config(
            &state.pool,
            id,
            serde_json::to_value(&config).unwrap_or(run.matrix_config),
        )
        .await;
    }

    tracing::info!(run_id = id, avatar_id, deleted, "Avatar cells deleted");
    Ok(Json(DataResponse {
        data: AvatarCellsResponse {
            run_id: id,
            avatar_id,
            affected: deleted,
        },
    }))
}

// ---------------------------------------------------------------------------
// DELETE /production-runs/{id}
// ---------------------------------------------------------------------------

/// Delete a production run by ID.
pub async fn delete_run(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ProductionRunRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Production run deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ProductionRun",
            id,
        }))
    }
}
