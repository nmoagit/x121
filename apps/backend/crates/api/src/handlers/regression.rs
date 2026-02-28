//! Handlers for Workflow Regression Testing (PRD-65).
//!
//! Provides endpoints for managing regression references (benchmarks),
//! triggering regression runs, and retrieving run reports with results.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::regression;
use x121_core::types::DbId;
use x121_db::models::regression::{
    CreateRegressionReference, RegressionReference, RegressionRun, RunReport, TriggerRegressionRun,
};
use x121_db::repositories::RegressionRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a regression reference exists, returning the full row.
async fn ensure_reference_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<RegressionReference> {
    RegressionRepo::find_reference_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "RegressionReference",
                id,
            })
        })
}

/// Verify that a regression run exists, returning the full row.
async fn ensure_run_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<RegressionRun> {
    RegressionRepo::find_run_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "RegressionRun",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// POST /regression/references
// ---------------------------------------------------------------------------

/// Create a new regression reference (benchmark).
pub async fn create_reference(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateRegressionReference>,
) -> AppResult<impl IntoResponse> {
    let reference = RegressionRepo::create_reference(&state.pool, &body, auth.user_id).await?;

    tracing::info!(
        reference_id = reference.id,
        character_id = body.character_id,
        scene_type_id = body.scene_type_id,
        user_id = auth.user_id,
        "Regression reference created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: reference })))
}

// ---------------------------------------------------------------------------
// GET /regression/references
// ---------------------------------------------------------------------------

/// List all regression references.
pub async fn list_references(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> AppResult<impl IntoResponse> {
    let items = RegressionRepo::list_references(&state.pool).await?;

    tracing::debug!(count = items.len(), "Listed regression references");

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /regression/references/{id}
// ---------------------------------------------------------------------------

/// Get a single regression reference by ID.
pub async fn get_reference(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let reference = ensure_reference_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: reference }))
}

// ---------------------------------------------------------------------------
// DELETE /regression/references/{id}
// ---------------------------------------------------------------------------

/// Delete a regression reference by ID.
pub async fn delete_reference(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = RegressionRepo::delete_reference(&state.pool, id).await?;

    if deleted {
        tracing::info!(
            reference_id = id,
            user_id = auth.user_id,
            "Regression reference deleted"
        );
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "RegressionReference",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// POST /regression/runs
// ---------------------------------------------------------------------------

/// Trigger a new regression run.
///
/// Creates a run record with all current references. The actual execution
/// would be handled asynchronously via a job queue; this endpoint only
/// creates the database record and returns it.
pub async fn trigger_run(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<TriggerRegressionRun>,
) -> AppResult<impl IntoResponse> {
    regression::validate_trigger_type(&body.trigger_type)?;

    let references = RegressionRepo::list_references(&state.pool).await?;
    let total_refs = references.len() as i32;

    let run = RegressionRepo::create_run(&state.pool, &body, total_refs, auth.user_id).await?;

    tracing::info!(
        run_id = run.id,
        trigger_type = %body.trigger_type,
        total_references = total_refs,
        user_id = auth.user_id,
        "Regression run triggered"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: run })))
}

// ---------------------------------------------------------------------------
// GET /regression/runs
// ---------------------------------------------------------------------------

/// List all regression runs.
pub async fn list_runs(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> AppResult<impl IntoResponse> {
    let items = RegressionRepo::list_runs(&state.pool).await?;

    tracing::debug!(count = items.len(), "Listed regression runs");

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /regression/runs/{id}/report
// ---------------------------------------------------------------------------

/// Get a full report for a regression run.
///
/// Returns the run details, all individual results, and an aggregate summary
/// computed from the result verdicts.
pub async fn get_run_report(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let run = ensure_run_exists(&state.pool, id).await?;
    let results = RegressionRepo::list_results_for_run(&state.pool, id).await?;

    let verdicts: Vec<String> = results.iter().map(|r| r.verdict.clone()).collect();
    let summary = regression::summarize_verdicts(&verdicts);

    let report = RunReport {
        run,
        results,
        summary,
    };

    Ok(Json(DataResponse { data: report }))
}

// ---------------------------------------------------------------------------
// GET /regression/runs/{id}/results/{result_id}
// ---------------------------------------------------------------------------

/// Get a single result within a regression run.
pub async fn get_run_result(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((run_id, result_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    // Verify the run exists first.
    let _run = ensure_run_exists(&state.pool, run_id).await?;

    let result = RegressionRepo::find_result_by_id(&state.pool, result_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "RegressionResult",
                id: result_id,
            })
        })?;

    // Verify the result belongs to the specified run.
    if result.run_id != run_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "RegressionResult",
            id: result_id,
        }));
    }

    Ok(Json(DataResponse { data: result }))
}
