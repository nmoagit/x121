//! Handlers for workspace state persistence (PRD-04).
//!
//! Provides GET/PUT endpoints for per-user per-device workspace state
//! and per-entity undo snapshots. All endpoints require authentication.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::workspace::{
    is_valid_device_type, DEFAULT_DEVICE_TYPE, MAX_UNDO_SNAPSHOT_BYTES,
};
use trulience_db::models::workspace::{SaveUndoSnapshot, UpdateWorkspaceState, WorkspaceQuery};
use trulience_db::repositories::{UndoSnapshotRepo, WorkspaceRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Resolve and validate the device type from query params.
fn resolve_device_type(query: &WorkspaceQuery) -> Result<&str, AppError> {
    let dt = query.device_type.as_deref().unwrap_or(DEFAULT_DEVICE_TYPE);
    if !is_valid_device_type(dt) {
        return Err(AppError::BadRequest(format!(
            "Invalid device_type '{dt}'. Must be one of: desktop, tablet, mobile"
        )));
    }
    Ok(dt)
}

// ---------------------------------------------------------------------------
// Workspace State Endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/workspace?device_type=desktop
///
/// Returns the workspace state for the authenticated user and device type.
/// Creates a default row if none exists.
pub async fn get_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkspaceQuery>,
) -> AppResult<impl IntoResponse> {
    let device_type = resolve_device_type(&params)?;
    let ws = WorkspaceRepo::get_or_create(&state.pool, auth.user_id, device_type).await?;
    Ok(Json(DataResponse { data: ws }))
}

/// PUT /api/v1/workspace?device_type=desktop
///
/// Partially updates the workspace state. Only provided fields are merged
/// into the existing state using JSONB concatenation.
pub async fn update_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkspaceQuery>,
    Json(input): Json<UpdateWorkspaceState>,
) -> AppResult<impl IntoResponse> {
    let device_type = resolve_device_type(&params)?;

    // Ensure the row exists before updating.
    WorkspaceRepo::get_or_create(&state.pool, auth.user_id, device_type).await?;

    let ws = WorkspaceRepo::update(&state.pool, auth.user_id, device_type, &input).await?;

    tracing::debug!(
        user_id = auth.user_id,
        device_type,
        "Workspace state updated"
    );

    Ok(Json(DataResponse { data: ws }))
}

/// POST /api/v1/workspace/reset?device_type=desktop
///
/// Resets all workspace state fields to empty JSON defaults.
pub async fn reset_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkspaceQuery>,
) -> AppResult<impl IntoResponse> {
    let device_type = resolve_device_type(&params)?;

    // Ensure the row exists before resetting.
    WorkspaceRepo::get_or_create(&state.pool, auth.user_id, device_type).await?;

    let ws = WorkspaceRepo::reset_to_default(&state.pool, auth.user_id, device_type).await?;

    tracing::info!(
        user_id = auth.user_id,
        device_type,
        "Workspace state reset to defaults"
    );

    Ok(Json(DataResponse { data: ws }))
}

// ---------------------------------------------------------------------------
// Undo Snapshot Endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/workspace/undo/{entity_type}/{entity_id}
///
/// Returns the undo snapshot for a specific entity, or null if none exists.
pub async fn get_undo_snapshot(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
) -> AppResult<impl IntoResponse> {
    let snapshot =
        UndoSnapshotRepo::get(&state.pool, auth.user_id, &entity_type, entity_id).await?;
    Ok(Json(DataResponse { data: snapshot }))
}

/// PUT /api/v1/workspace/undo/{entity_type}/{entity_id}
///
/// Saves (upserts) an undo snapshot for a specific entity.
/// Enforces the maximum snapshot size limit.
pub async fn save_undo_snapshot(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
    Json(input): Json<SaveUndoSnapshot>,
) -> AppResult<impl IntoResponse> {
    // Compute snapshot size and enforce limit.
    let serialized = serde_json::to_string(&input.snapshot_data)
        .map_err(|e| AppError::BadRequest(format!("Invalid snapshot data: {e}")))?;
    let size_bytes = serialized.len();

    if size_bytes > MAX_UNDO_SNAPSHOT_BYTES {
        return Err(AppError::BadRequest(format!(
            "Undo snapshot exceeds size limit ({size_bytes} bytes > {MAX_UNDO_SNAPSHOT_BYTES} bytes)"
        )));
    }

    let snapshot = UndoSnapshotRepo::save(
        &state.pool,
        auth.user_id,
        &entity_type,
        entity_id,
        &input.snapshot_data,
        size_bytes as i32,
    )
    .await?;

    tracing::debug!(
        user_id = auth.user_id,
        entity_type,
        entity_id,
        size_bytes,
        "Undo snapshot saved"
    );

    Ok(Json(DataResponse { data: snapshot }))
}
