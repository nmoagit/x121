//! Handlers for the `/versions` resource.
//!
//! Scene video versions are nested under scenes:
//! `/scenes/{scene_id}/versions[/{id}]`

use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::clip_qa::{
    CLIP_QA_APPROVED, CLIP_QA_REJECTED, CLIP_SOURCE_IMPORTED, RESUME_STATUS_READY,
};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::scene_video_version::{
    CreateSceneVideoVersion, RejectClipRequest, ResumeFromResponse, SceneVideoVersion,
    UpdateSceneVideoVersion,
};
use x121_db::repositories::{SceneVideoVersionRepo, SegmentRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Supported video file extensions for import.
///
/// Keep in sync with the frontend `ACCEPTED_FORMATS` in
/// `features/scenes/ImportClipDialog.tsx`.
const SUPPORTED_VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a scene video version exists, returning the full row.
async fn ensure_version_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<SceneVideoVersion> {
    SceneVideoVersionRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SceneVideoVersion",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/scenes/{scene_id}/versions
///
/// List all video versions for a scene, ordered by version number descending.
pub async fn list_by_scene(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<SceneVideoVersion>>>> {
    let versions = SceneVideoVersionRepo::list_by_scene(&state.pool, scene_id).await?;
    Ok(Json(DataResponse { data: versions }))
}

/// GET /api/v1/scenes/{scene_id}/versions/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> {
    let version = ensure_version_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: version }))
}

/// DELETE /api/v1/scenes/{scene_id}/versions/{id}
///
/// Soft-deletes a version. Returns 409 if the version is currently marked as final.
pub async fn delete(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let version = ensure_version_exists(&state.pool, id).await?;

    if version.is_final {
        return Err(AppError::Core(CoreError::Conflict(
            "Cannot delete the final version. Select a different final version first.".into(),
        )));
    }

    SceneVideoVersionRepo::soft_delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/set-final
///
/// Marks this version as the final version for its scene, un-marking any
/// previously final version in the same transaction.
/// Rejects the request if the clip has a `qa_status` of `"rejected"`.
pub async fn set_final(
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> {
    // PRD-121: Prevent marking rejected clips as final
    let existing = ensure_version_exists(&state.pool, id).await?;

    if existing.qa_status == CLIP_QA_REJECTED {
        return Err(AppError::BadRequest(
            "Cannot mark a rejected clip as final. Approve it first.".to_string(),
        ));
    }

    let version = SceneVideoVersionRepo::set_final(&state.pool, scene_id, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SceneVideoVersion",
                id,
            })
        })?;
    Ok(Json(DataResponse { data: version }))
}

/// POST /api/v1/scenes/{scene_id}/versions/import
///
/// Accepts a multipart form with a required `file` field and an optional `notes`
/// field. The uploaded video is stored locally and a new version is created as
/// the final version for the scene.
pub async fn import_video(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<DataResponse<SceneVideoVersion>>)> {
    let mut file_data: Option<(String, Vec<u8>)> = None;
    let mut notes: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let filename = field.file_name().unwrap_or("imported.mp4").to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                file_data = Some((filename, data.to_vec()));
            }
            "notes" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                notes = Some(text);
            }
            _ => {} // ignore unknown fields
        }
    }

    let (filename, data) =
        file_data.ok_or_else(|| AppError::BadRequest("Missing required 'file' field".into()))?;

    // Validate file extension
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    if !SUPPORTED_VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported video format '.{ext}'. Supported: .mp4, .webm, .mov"
        )));
    }

    // Store file via the active storage provider (PRD-122).
    let storage_key = format!(
        "imports/scene_{scene_id}_{}.{ext}",
        chrono::Utc::now().timestamp()
    );
    let provider = state.storage_provider().await;
    provider.upload(&storage_key, &data).await?;

    let file_size = data.len() as i64;

    let input = CreateSceneVideoVersion {
        scene_id,
        source: CLIP_SOURCE_IMPORTED.to_string(),
        file_path: storage_key,
        file_size_bytes: Some(file_size),
        duration_secs: None, // would require ffprobe to determine
        is_final: Some(true),
        notes,
    };

    let version = SceneVideoVersionRepo::create_as_final(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/approve
///
/// Sets the clip's `qa_status` to `"approved"`, recording the reviewer and timestamp.
pub async fn approve_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> {
    let _version = ensure_version_exists(&state.pool, id).await?;

    let update = UpdateSceneVideoVersion {
        is_final: None,
        notes: None,
        qa_status: Some(CLIP_QA_APPROVED.to_string()),
        qa_reviewed_by: Some(auth.user_id),
        qa_reviewed_at: Some(chrono::Utc::now()),
        qa_rejection_reason: None,
        qa_notes: None,
    };

    let updated = SceneVideoVersionRepo::update(&state.pool, id, &update)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SceneVideoVersion",
                id,
            })
        })?;

    tracing::info!(user_id = auth.user_id, version_id = id, "Clip approved");
    Ok(Json(DataResponse { data: updated }))
}

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/reject
///
/// Sets the clip's `qa_status` to `"rejected"`, recording the reviewer, timestamp,
/// rejection reason, and optional notes.
pub async fn reject_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<RejectClipRequest>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> {
    let _version = ensure_version_exists(&state.pool, id).await?;

    let update = UpdateSceneVideoVersion {
        is_final: None,
        notes: None,
        qa_status: Some(CLIP_QA_REJECTED.to_string()),
        qa_reviewed_by: Some(auth.user_id),
        qa_reviewed_at: Some(chrono::Utc::now()),
        qa_rejection_reason: Some(input.reason),
        qa_notes: input.notes,
    };

    let updated = SceneVideoVersionRepo::update(&state.pool, id, &update)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SceneVideoVersion",
                id,
            })
        })?;

    tracing::info!(user_id = auth.user_id, version_id = id, "Clip rejected");
    Ok(Json(DataResponse { data: updated }))
}

/// POST /api/v1/scenes/{scene_id}/versions/{id}/resume-from
///
/// Resumes generation from an approved clip. Soft-deletes all versions after this
/// one and all segments after the last completed segment.
pub async fn resume_from_clip(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<ResumeFromResponse>>> {
    let version = ensure_version_exists(&state.pool, id).await?;

    if version.qa_status != CLIP_QA_APPROVED {
        return Err(AppError::BadRequest(
            "Can only resume from an approved clip".to_string(),
        ));
    }

    // Soft-delete all clips after this version
    let clips_discarded = SceneVideoVersionRepo::soft_delete_after_version(
        &state.pool,
        scene_id,
        version.version_number,
    )
    .await?;

    // Find the last completed segment and soft-delete segments after it
    let last_segment = SegmentRepo::get_last_completed(&state.pool, scene_id).await?;
    let segments_preserved = last_segment.as_ref().map(|s| s.sequence_index).unwrap_or(0);
    let segments_discarded =
        SegmentRepo::soft_delete_after_sequence(&state.pool, scene_id, segments_preserved).await?;

    tracing::info!(
        scene_id,
        version_id = id,
        resume_from_version = version.version_number,
        clips_discarded,
        segments_discarded,
        "Resuming generation from clip"
    );

    Ok(Json(DataResponse {
        data: ResumeFromResponse {
            scene_id,
            resume_from_version: version.version_number,
            segments_preserved,
            segments_discarded: segments_discarded as i32,
            status: RESUME_STATUS_READY.to_string(),
        },
    }))
}
