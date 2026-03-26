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

/// Resolve entity IDs from browse filter parameters.
///
/// Runs the same WHERE clause as the browse endpoint but returns only IDs,
/// with no LIMIT/OFFSET (exports all matching rows).
async fn resolve_ids_from_filters(
    pool: &sqlx::PgPool,
    entity_type: &str,
    filters: &serde_json::Value,
) -> AppResult<Vec<DbId>> {
    match entity_type {
        "scene_video_version" => {
            let project_id: Option<DbId> = filters.get("projectId").and_then(|v| v.as_i64());
            let pipeline_id: Option<DbId> = filters.get("pipelineId").and_then(|v| v.as_i64());
            let scene_type: Option<String> = filters
                .get("sceneType")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let track: Option<String> = filters
                .get("track")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let source: Option<String> = filters
                .get("source")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let qa_status: Option<String> = filters
                .get("qaStatus")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let show_disabled = filters
                .get("showDisabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let tag_ids: Option<String> = filters
                .get("tagIds")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let search: Option<String> = filters
                .get("search")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let sql = "SELECT svv.id \
                FROM scene_video_versions svv \
                JOIN scenes sc ON sc.id = svv.scene_id AND sc.deleted_at IS NULL \
                JOIN avatars c ON c.id = sc.avatar_id AND c.deleted_at IS NULL \
                JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL \
                LEFT JOIN scene_types st ON st.id = sc.scene_type_id \
                LEFT JOIN tracks t ON t.id = sc.track_id \
                WHERE svv.deleted_at IS NULL \
                  AND ($1::bigint IS NULL OR p.id = $1) \
                  AND ($2::bigint IS NULL OR p.pipeline_id = $2) \
                  AND ($3::text IS NULL OR st.name = ANY(string_to_array($3, ','))) \
                  AND ($4::text IS NULL OR t.name = ANY(string_to_array($4, ','))) \
                  AND ($5::text IS NULL OR svv.source = ANY(string_to_array($5, ','))) \
                  AND ($6::text IS NULL OR svv.qa_status = ANY(string_to_array($6, ','))) \
                  AND ($7::bool OR c.is_enabled = true) \
                  AND ($8::text IS NULL OR svv.id IN ( \
                    SELECT et.entity_id FROM entity_tags et \
                    WHERE et.entity_type = 'scene_video_version' \
                      AND et.tag_id = ANY(string_to_array($8, ',')::bigint[]) \
                  )) \
                  AND ($9::text IS NULL OR ( \
                    c.name ILIKE '%' || $9 || '%' \
                    OR st.name ILIKE '%' || $9 || '%' \
                    OR t.name ILIKE '%' || $9 || '%' \
                    OR p.name ILIKE '%' || $9 || '%' \
                  ))";

            let ids: Vec<(DbId,)> = sqlx::query_as(sql)
                .bind(project_id)
                .bind(pipeline_id)
                .bind(&scene_type)
                .bind(&track)
                .bind(&source)
                .bind(&qa_status)
                .bind(show_disabled)
                .bind(&tag_ids)
                .bind(&search)
                .fetch_all(pool)
                .await?;

            Ok(ids.into_iter().map(|(id,)| id).collect())
        }
        "media_variant" => {
            let project_id: Option<DbId> = filters.get("projectId").and_then(|v| v.as_i64());
            let pipeline_id: Option<DbId> = filters.get("pipelineId").and_then(|v| v.as_i64());
            let status_id: Option<String> = filters
                .get("statusId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let provenance: Option<String> = filters
                .get("provenance")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let variant_type: Option<String> = filters
                .get("variantType")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let show_disabled = filters
                .get("showDisabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let tag_ids: Option<String> = filters
                .get("tagIds")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let search: Option<String> = filters
                .get("search")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let sql = "SELECT iv.id \
                FROM media_variants iv \
                JOIN avatars c ON c.id = iv.avatar_id AND c.deleted_at IS NULL \
                JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL \
                WHERE iv.deleted_at IS NULL \
                  AND ($1::bigint IS NULL OR p.id = $1) \
                  AND ($2::bigint IS NULL OR p.pipeline_id = $2) \
                  AND ($3::text IS NULL OR iv.status_id::text = ANY(string_to_array($3, ','))) \
                  AND ($4::text IS NULL OR iv.provenance = ANY(string_to_array($4, ','))) \
                  AND ($5::text IS NULL OR iv.variant_type = ANY(string_to_array($5, ','))) \
                  AND ($6::bool OR c.is_enabled = true) \
                  AND ($7::text IS NULL OR iv.id IN ( \
                    SELECT et.entity_id FROM entity_tags et \
                    WHERE et.entity_type = 'media_variant' \
                      AND et.tag_id = ANY(string_to_array($7, ',')::bigint[]) \
                  )) \
                  AND ($8::text IS NULL OR ( \
                    c.name ILIKE '%' || $8 || '%' \
                    OR iv.variant_type ILIKE '%' || $8 || '%' \
                    OR iv.variant_label ILIKE '%' || $8 || '%' \
                    OR p.name ILIKE '%' || $8 || '%' \
                  ))";

            let ids: Vec<(DbId,)> = sqlx::query_as(sql)
                .bind(project_id)
                .bind(pipeline_id)
                .bind(&status_id)
                .bind(&provenance)
                .bind(&variant_type)
                .bind(show_disabled)
                .bind(&tag_ids)
                .bind(&search)
                .fetch_all(pool)
                .await?;

            Ok(ids.into_iter().map(|(id,)| id).collect())
        }
        _ => Ok(Vec::new()),
    }
}

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

    let split_size_mb = input.split_size_mb.unwrap_or(500);

    // Resolve concrete IDs: either use provided IDs or query from filters.
    let resolved_ids = if let Some(ref ids) = input.ids {
        ids.clone()
    } else if let Some(ref filters) = input.filters {
        resolve_ids_from_filters(&state.pool, &input.entity_type, filters).await?
    } else {
        return Err(AppError::BadRequest(
            "Either 'ids' or 'filters' must be provided".to_string(),
        ));
    };

    let item_count = resolved_ids.len() as i32;

    // Store resolved IDs in the snapshot so the background task always has concrete IDs.
    let filter_snapshot = Some(serde_json::json!({
        "ids": resolved_ids,
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
