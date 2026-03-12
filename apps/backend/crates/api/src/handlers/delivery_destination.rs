//! Handlers for delivery destinations (PRD-039 Amendment A.1).
//!
//! CRUD endpoints for managing per-project delivery destinations
//! (local, S3, Google Drive).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::delivery_destination::{
    CreateDeliveryDestination, DeliveryDestination, UpdateDeliveryDestination,
};
use x121_db::repositories::DeliveryDestinationRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a delivery destination exists, returning the full row.
async fn ensure_destination_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<DeliveryDestination> {
    DeliveryDestinationRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DeliveryDestination",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/delivery-destinations
// ---------------------------------------------------------------------------

/// List active delivery destinations for a project.
pub async fn list(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let items = DeliveryDestinationRepo::list_for_project(&state.pool, project_id).await?;
    tracing::debug!(
        count = items.len(),
        project_id,
        "Listed delivery destinations"
    );
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/delivery-destinations/{id}
// ---------------------------------------------------------------------------

/// Get a single delivery destination by ID.
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let dest = ensure_destination_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: dest }))
}

// ---------------------------------------------------------------------------
// POST /projects/{project_id}/delivery-destinations
// ---------------------------------------------------------------------------

/// Create a new delivery destination for a project.
pub async fn create(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(project_id): Path<DbId>,
    Json(mut body): Json<CreateDeliveryDestination>,
) -> AppResult<impl IntoResponse> {
    body.project_id = project_id;
    let created = DeliveryDestinationRepo::create(&state.pool, &body).await?;
    tracing::info!(
        id = created.id,
        project_id,
        dest_type = created.destination_type_id,
        "Delivery destination created"
    );
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// PUT /projects/{project_id}/delivery-destinations/{id}
// ---------------------------------------------------------------------------

/// Update an existing delivery destination.
pub async fn update(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateDeliveryDestination>,
) -> AppResult<impl IntoResponse> {
    ensure_destination_exists(&state.pool, id).await?;

    let updated = DeliveryDestinationRepo::update(&state.pool, id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "DeliveryDestination",
            id,
        }))?;
    tracing::info!(id = updated.id, "Delivery destination updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /projects/{project_id}/delivery-destinations/{id}
// ---------------------------------------------------------------------------

/// Soft-delete a delivery destination.
pub async fn delete(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = DeliveryDestinationRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Delivery destination deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "DeliveryDestination",
            id,
        }))
    }
}
