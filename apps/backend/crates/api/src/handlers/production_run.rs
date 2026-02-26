//! Handlers for the Batch Production Orchestrator (PRD-57).
//!
//! Provides endpoints for managing production runs: creating runs, viewing
//! the matrix state, submitting cells, resubmitting failures, triggering
//! delivery, and tracking aggregate progress.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::batch_production::{
    self, MatrixConfig, RUN_STATUS_ID_COMPLETED, RUN_STATUS_ID_DRAFT, RUN_STATUS_ID_FAILED,
    RUN_STATUS_ID_SUBMITTING,
};
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::production_run::{
    CreateProductionRun, CreateProductionRunCell, CreateProductionRunRequest, DeliverResponse,
    ProductionRun, ProductionRunProgress, ResubmitResponse, SubmitCellsRequest,
    SubmitCellsResponse,
};
use x121_db::repositories::ProductionRunRepo;

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
/// Generates all cells (character x scene_type combinations) and inserts them.
pub async fn create_run(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateProductionRunRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate matrix configuration.
    let config = MatrixConfig {
        character_ids: body.character_ids.clone(),
        scene_type_ids: body.scene_type_ids.clone(),
    };
    batch_production::validate_matrix_config(&config)?;

    let total_cells = (body.character_ids.len() * body.scene_type_ids.len()) as i32;

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

    // Generate cells for the matrix (character x scene_type, default variant).
    let cells: Vec<CreateProductionRunCell> = body
        .character_ids
        .iter()
        .flat_map(|&cid| {
            body.scene_type_ids
                .iter()
                .map(move |&stid| CreateProductionRunCell {
                    run_id: run.id,
                    character_id: cid,
                    scene_type_id: stid,
                    variant_label: "default".to_string(),
                })
        })
        .collect();

    ProductionRunRepo::create_cells_batch(&state.pool, &cells).await?;

    tracing::info!(
        run_id = run.id,
        project_id = body.project_id,
        total_cells,
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

/// Get the matrix state (all cells) for a production run.
pub async fn get_matrix(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_run_exists(&state.pool, id).await?;

    let cells = ProductionRunRepo::list_cells_by_run(&state.pool, id).await?;
    tracing::debug!(
        run_id = id,
        cell_count = cells.len(),
        "Fetched matrix cells"
    );
    Ok(Json(DataResponse { data: cells }))
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
