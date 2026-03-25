//! Handlers for bulk export jobs (PRD-151).
//!
//! Provides endpoints for creating export jobs, polling their status,
//! and downloading completed ZIP archives.

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::Json;
use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::audit::CreateAuditLog;
use x121_db::models::export_job::{CreateExportJob, ExportJob};
use x121_db::repositories::{AuditLogRepo, ExportJobRepo};

use crate::background::export_archive;
use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for creating a new export job.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateExportInput {
    pub entity_type: String,
    pub ids: Option<Vec<DbId>>,
    pub filters: Option<serde_json::Value>,
    pub split_size_mb: Option<i32>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that an export job exists, returning the full row.
async fn ensure_export_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<ExportJob> {
    ExportJobRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "ExportJob",
            id,
        })
    })
}

// ---------------------------------------------------------------------------
// POST /api/v1/exports
// ---------------------------------------------------------------------------

/// Create a new export job and spawn a background task to build the archive.
pub async fn create_export(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateExportInput>,
) -> AppResult<(StatusCode, Json<DataResponse<ExportJob>>)> {
    // Validate entity type.
    if input.entity_type != "scene_video_version" && input.entity_type != "media_variant" {
        return Err(AppError::BadRequest(format!(
            "Unsupported entity_type '{}'; expected 'scene_video_version' or 'media_variant'",
            input.entity_type
        )));
    }

    let item_count = input.ids.as_ref().map_or(0, |ids| ids.len() as i32);
    let split_size_mb = input.split_size_mb.unwrap_or(500);

    // Build filter snapshot from provided IDs and/or filters.
    let filter_snapshot = Some(serde_json::json!({
        "ids": input.ids,
        "filters": input.filters,
    }));

    let create_dto = CreateExportJob {
        entity_type: input.entity_type.clone(),
        requested_by: auth.user_id,
        pipeline_id: None,
        item_count,
        split_size_mb,
        filter_snapshot,
    };

    let job = ExportJobRepo::create(&state.pool, &create_dto).await?;

    // Audit log.
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(auth.user_id),
            session_id: None,
            action_type: "export_job.created".to_string(),
            entity_type: Some("export_job".to_string()),
            entity_id: Some(job.id),
            details_json: Some(serde_json::json!({
                "entity_type": input.entity_type,
                "item_count": item_count,
                "split_size_mb": split_size_mb,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    // Spawn background task.
    let bg_state = state.clone();
    let job_id = job.id;
    tokio::spawn(async move {
        export_archive::run_export_job(bg_state, job_id).await;
    });

    Ok((StatusCode::ACCEPTED, Json(DataResponse { data: job })))
}

// ---------------------------------------------------------------------------
// GET /api/v1/exports/{id}
// ---------------------------------------------------------------------------

/// Get the status of an export job.
pub async fn get_export(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<ExportJob>>> {
    let job = ensure_export_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: job }))
}

// ---------------------------------------------------------------------------
// GET /api/v1/exports/{id}/download/{part}
// ---------------------------------------------------------------------------

/// Download a specific part (ZIP archive) of a completed export job.
pub async fn download_export_part(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((id, part)): Path<(DbId, i32)>,
) -> AppResult<Response> {
    let job = ensure_export_exists(&state.pool, id).await?;

    if job.status != "completed" {
        return Err(AppError::BadRequest(
            "Export job is not yet completed".to_string(),
        ));
    }

    // Resolve the storage root for exports.
    let export_dir = state
        .resolve_to_path(&format!("exports/{}", job.id))
        .await?;
    let zip_path = export_dir.join(format!("part{part}.zip"));

    if !zip_path.exists() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ExportPart",
            id: part as DbId,
        }));
    }

    let file = tokio::fs::File::open(&zip_path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let file_name = format!("export_{}_part{part}.zip", job.id);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{file_name}\""),
        )
        .body(body)
        .expect("valid response"))
}
