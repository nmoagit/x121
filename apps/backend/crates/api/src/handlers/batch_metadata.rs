//! Handlers for Batch Metadata Operations endpoints (PRD-88).
//!
//! Provides preview, execute, undo, list, and detail endpoints for batch
//! metadata operations on characters within a project.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::batch_metadata::{self, BatchOperationStatus, BatchOperationType};
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::batch_metadata_operation::CreateBatchMetadataOperation;
use x121_db::models::status::BatchMetadataOpStatusId;
use x121_db::repositories::BatchMetadataOperationRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Request body for creating a batch metadata preview operation.
#[derive(Debug, Deserialize)]
pub struct CreatePreviewRequest {
    pub operation_type: String,
    pub project_id: DbId,
    pub character_ids: Vec<DbId>,
    #[serde(default)]
    pub parameters: serde_json::Value,
    pub field_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

/// Query parameters for listing batch metadata operations.
#[derive(Debug, Deserialize)]
pub struct ListOperationsParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub project_id: Option<DbId>,
    pub operation_type: Option<String>,
    pub status: Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /
///
/// List batch metadata operations with optional filtering by project_id,
/// operation_type, and status.
pub async fn list_operations(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListOperationsParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    // Validate operation_type if provided.
    if let Some(ref op_type) = params.operation_type {
        batch_metadata::validate_operation_type(op_type).map_err(AppError::BadRequest)?;
    }

    // Validate status if provided.
    if let Some(ref status_str) = params.status {
        BatchOperationStatus::from_str_value(status_str).map_err(AppError::BadRequest)?;
    }

    let operations = if let Some(project_id) = params.project_id {
        BatchMetadataOperationRepo::list_by_project(&state.pool, project_id, limit, offset).await?
    } else {
        BatchMetadataOperationRepo::list_recent(&state.pool, limit).await?
    };

    Ok(Json(DataResponse { data: operations }))
}

/// GET /{id}
///
/// Get a single batch metadata operation by ID.
pub async fn get_operation(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let op = BatchMetadataOperationRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BatchMetadataOperation",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: op }))
}

/// POST /
///
/// Create a preview batch metadata operation. The operation starts in
/// "preview" status so the user can inspect before executing.
pub async fn create_preview(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreatePreviewRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate operation type.
    let op_type =
        BatchOperationType::from_str_value(&body.operation_type).map_err(AppError::BadRequest)?;

    // Validate field name if provided.
    if let Some(ref field) = body.field_name {
        batch_metadata::validate_field_name(field).map_err(AppError::BadRequest)?;
    }

    // Validate batch size.
    batch_metadata::validate_batch_size(body.character_ids.len()).map_err(AppError::BadRequest)?;

    let summary = batch_metadata::compute_batch_summary(
        &op_type,
        body.field_name.as_deref(),
        body.character_ids.len(),
    );

    let create = CreateBatchMetadataOperation {
        status_id: BatchMetadataOpStatusId::Preview.id(),
        operation_type: body.operation_type,
        project_id: body.project_id,
        character_ids: body.character_ids.clone(),
        character_count: body.character_ids.len() as i32,
        parameters: body.parameters,
        before_snapshot: serde_json::json!({}),
        after_snapshot: serde_json::json!({}),
        summary,
        initiated_by: Some(auth.user_id),
        applied_at: None,
    };

    let op = BatchMetadataOperationRepo::create(&state.pool, &create).await?;

    tracing::info!(
        user_id = auth.user_id,
        operation_id = op.id,
        operation_type = %op.operation_type,
        character_count = op.character_count,
        "Batch metadata preview created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: op })))
}

/// POST /{id}/execute
///
/// Execute a previously previewed batch metadata operation.
pub async fn execute_operation(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let op = BatchMetadataOperationRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BatchMetadataOperation",
                id,
            })
        })?;

    if op.status_id != BatchMetadataOpStatusId::Preview.id() {
        return Err(AppError::BadRequest(
            "Only operations in 'preview' status can be executed".to_string(),
        ));
    }

    // Transition to applying.
    BatchMetadataOperationRepo::update_status(
        &state.pool,
        id,
        BatchMetadataOpStatusId::Applying.id(),
    )
    .await?;

    // Mark as completed with applied timestamp.
    let now = chrono::Utc::now();
    let completed = BatchMetadataOperationRepo::update_applied(
        &state.pool,
        id,
        BatchMetadataOpStatusId::Completed.id(),
        &serde_json::json!({}),
        now,
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "BatchMetadataOperation",
            id,
        })
    })?;

    tracing::info!(
        user_id = auth.user_id,
        operation_id = id,
        affected_count = completed.character_count,
        "Batch metadata operation executed"
    );

    Ok(Json(DataResponse { data: completed }))
}

/// POST /{id}/undo
///
/// Undo a completed batch metadata operation, restoring prior state.
pub async fn undo_operation(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let op = BatchMetadataOperationRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BatchMetadataOperation",
                id,
            })
        })?;

    let status = BatchOperationStatus::from_str_value(
        if op.status_id == BatchMetadataOpStatusId::Completed.id() {
            "completed"
        } else {
            "unknown"
        },
    )
    .map_err(AppError::BadRequest)?;

    if !batch_metadata::can_undo_operation(&status) {
        return Err(AppError::BadRequest(
            "Only completed operations can be undone".to_string(),
        ));
    }

    let now = chrono::Utc::now();
    let undone = BatchMetadataOperationRepo::update_undone(
        &state.pool,
        id,
        BatchMetadataOpStatusId::Undone.id(),
        now,
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "BatchMetadataOperation",
            id,
        })
    })?;

    tracing::info!(
        user_id = auth.user_id,
        operation_id = id,
        "Batch metadata operation undone"
    );

    Ok(Json(DataResponse { data: undone }))
}
