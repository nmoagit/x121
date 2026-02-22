//! Handlers for worker pool management (PRD-46).
//!
//! Provides:
//! - Admin endpoints for listing, approving, draining, decommissioning workers.
//! - Agent endpoint for self-registration (no auth).
//! - Fleet statistics and worker health-log queries.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_core::worker_pool;
use trulience_db::models::status::WorkerStatus;
use trulience_db::models::worker::{CreateHealthLogEntry, CreateWorker, UpdateWorker, Worker};
use trulience_db::repositories::WorkerRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers (DRY-212, DRY-216)
// ---------------------------------------------------------------------------

/// Verify that a worker exists, returning the full Worker row.
async fn ensure_worker_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Worker> {
    WorkerRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Worker",
                id,
            })
        })
}

/// Validate worker registration input (name + optional tags).
fn validate_create_input(input: &CreateWorker) -> AppResult<()> {
    worker_pool::validate_worker_name(&input.name)?;
    if let Some(ref tags) = input.tags {
        worker_pool::validate_tags(tags)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// POST /admin/workers  (admin registration -- auto-approved)
// ---------------------------------------------------------------------------

/// Register a worker as admin. The worker is auto-approved.
pub async fn register_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateWorker>,
) -> AppResult<impl IntoResponse> {
    validate_create_input(&input)?;

    let worker = WorkerRepo::register(&state.pool, &input).await?;

    // Admin-registered workers are auto-approved.
    let worker = WorkerRepo::approve(&state.pool, worker.id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Worker",
            id: worker.id,
        }))?;

    tracing::info!(
        worker_id = worker.id,
        worker_name = %worker.name,
        admin_id = admin.user_id,
        "Worker registered and auto-approved by admin",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: worker })))
}

// ---------------------------------------------------------------------------
// POST /workers/register  (agent self-registration -- no auth)
// ---------------------------------------------------------------------------

/// Self-register a worker from an agent. Not auto-approved.
pub async fn self_register_worker(
    State(state): State<AppState>,
    Json(input): Json<CreateWorker>,
) -> AppResult<impl IntoResponse> {
    validate_create_input(&input)?;

    let worker = WorkerRepo::register(&state.pool, &input).await?;

    tracing::info!(
        worker_id = worker.id,
        worker_name = %worker.name,
        "Worker self-registered (pending approval)",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: worker })))
}

// ---------------------------------------------------------------------------
// GET /admin/workers
// ---------------------------------------------------------------------------

/// List all workers (admin view).
pub async fn list_workers(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let workers = WorkerRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: workers }))
}

// ---------------------------------------------------------------------------
// GET /admin/workers/:id
// ---------------------------------------------------------------------------

/// Get a single worker by ID.
pub async fn get_worker(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let worker = ensure_worker_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: worker }))
}

// ---------------------------------------------------------------------------
// PUT /admin/workers/:id
// ---------------------------------------------------------------------------

/// Update a worker.
pub async fn update_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateWorker>,
) -> AppResult<impl IntoResponse> {
    let worker = WorkerRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Worker",
            id,
        }))?;

    tracing::info!(
        worker_id = id,
        admin_id = admin.user_id,
        "Worker updated",
    );

    Ok(Json(DataResponse { data: worker }))
}

// ---------------------------------------------------------------------------
// POST /admin/workers/:id/approve
// ---------------------------------------------------------------------------

/// Approve a worker for receiving jobs.
pub async fn approve_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Fetch current state for health log.
    let current = ensure_worker_exists(&state.pool, id).await?;

    let worker = WorkerRepo::approve(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Worker",
            id,
        }))?;

    // Log the status transition if status changed.
    if current.status_id != WorkerStatus::Idle.id() {
        WorkerRepo::log_transition(
            &state.pool,
            &CreateHealthLogEntry {
                worker_id: id,
                from_status_id: current.status_id,
                to_status_id: WorkerStatus::Idle.id(),
                reason: Some(format!("Approved by admin {}", admin.user_id)),
            },
        )
        .await?;
    }

    tracing::info!(
        worker_id = id,
        admin_id = admin.user_id,
        "Worker approved",
    );

    Ok(Json(DataResponse { data: worker }))
}

// ---------------------------------------------------------------------------
// POST /admin/workers/:id/drain
// ---------------------------------------------------------------------------

/// Set a worker to draining status (finishes current jobs, accepts no new ones).
pub async fn drain_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let current = ensure_worker_exists(&state.pool, id).await?;

    if current.status_id == WorkerStatus::Draining.id() {
        return Err(AppError::BadRequest(
            "Worker is already draining".to_string(),
        ));
    }

    WorkerRepo::update_status(&state.pool, id, WorkerStatus::Draining.id()).await?;

    // Log the transition.
    WorkerRepo::log_transition(
        &state.pool,
        &CreateHealthLogEntry {
            worker_id: id,
            from_status_id: current.status_id,
            to_status_id: WorkerStatus::Draining.id(),
            reason: Some(format!("Drain initiated by admin {}", admin.user_id)),
        },
    )
    .await?;

    tracing::info!(
        worker_id = id,
        admin_id = admin.user_id,
        "Worker set to draining",
    );

    // Refetch to return updated state.
    let worker = ensure_worker_exists(&state.pool, id).await?;

    Ok(Json(DataResponse { data: worker }))
}

// ---------------------------------------------------------------------------
// POST /admin/workers/:id/decommission
// ---------------------------------------------------------------------------

/// Decommission a worker (mark offline, disable, set decommissioned_at).
pub async fn decommission_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let current = ensure_worker_exists(&state.pool, id).await?;

    if current.decommissioned_at.is_some() {
        return Err(AppError::BadRequest(
            "Worker is already decommissioned".to_string(),
        ));
    }

    WorkerRepo::decommission(&state.pool, id).await?;

    // Log the transition.
    WorkerRepo::log_transition(
        &state.pool,
        &CreateHealthLogEntry {
            worker_id: id,
            from_status_id: current.status_id,
            to_status_id: WorkerStatus::Offline.id(),
            reason: Some(format!("Decommissioned by admin {}", admin.user_id)),
        },
    )
    .await?;

    tracing::info!(
        worker_id = id,
        admin_id = admin.user_id,
        "Worker decommissioned",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /admin/workers/stats
// ---------------------------------------------------------------------------

/// Get fleet-level aggregate statistics.
pub async fn fleet_stats(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let stats = WorkerRepo::fleet_stats(&state.pool).await?;
    Ok(Json(DataResponse { data: stats }))
}

// ---------------------------------------------------------------------------
// GET /admin/workers/:id/health-log
// ---------------------------------------------------------------------------

/// Get the health-log (status transition history) for a worker.
pub async fn worker_health_log(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify worker exists.
    ensure_worker_exists(&state.pool, id).await?;

    let log = WorkerRepo::get_health_log(&state.pool, id).await?;
    Ok(Json(DataResponse { data: log }))
}
