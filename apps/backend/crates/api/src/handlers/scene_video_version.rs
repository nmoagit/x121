//! Handlers for the `/versions` resource.
//!
//! Scene video versions are nested under scenes:
//! `/scenes/{scene_id}/versions[/{id}]`

use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::clip_qa::{
    CLIP_QA_APPROVED, CLIP_QA_PENDING, CLIP_QA_REJECTED, CLIP_SOURCE_IMPORTED, RESUME_STATUS_READY,
};
use x121_core::error::CoreError;
use x121_core::ffmpeg;
use x121_core::types::DbId;
use x121_db::models::scene_video_version::{
    CreateSceneVideoVersion, RejectClipRequest, ResumeFromResponse, SceneVideoVersion,
    UpdateSceneVideoVersion,
};
use x121_db::models::scene_video_version_artifact::SceneVideoVersionArtifact;
use x121_db::models::status::SceneStatus;
use x121_db::repositories::{
    SceneRepo, SceneVideoVersionArtifactRepo, SceneVideoVersionRepo, SegmentRepo,
};

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

/// Generate a low-res preview for a scene video version (best-effort).
///
/// Transcodes to a temp file, then uploads via the storage provider so the
/// preview lands in the configured storage location regardless of backend
/// (local filesystem, S3, etc.).
///
/// Returns the storage key of the generated preview, or `None` if generation
/// failed. This is intentionally fire-and-forget — callers should not fail
/// the parent operation if preview generation fails.
pub async fn generate_preview_for_version(
    state: &AppState,
    version: &SceneVideoVersion,
) -> Option<String> {
    let preview_key = format!(
        "previews/scene_{}_{}.mp4",
        version.scene_id,
        chrono::Utc::now().timestamp_millis()
    );

    // Resolve the source video to a local path for ffmpeg to read.
    let abs_source = match state.resolve_to_path(&version.file_path).await {
        Ok(path) => path,
        Err(e) => {
            tracing::warn!(version_id = version.id, error = %e, "Failed to resolve source for preview");
            return None;
        }
    };
    let provider = state.storage_provider().await;

    // Transcode to a temp file, then upload through the storage provider.
    let tmp_dir = std::env::temp_dir().join("x121_previews");
    let tmp_path = tmp_dir.join(format!("preview_{}.mp4", version.id));

    let result = match ffmpeg::transcode_preview(&abs_source, &tmp_path, 640, 360).await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(version_id = version.id, error = %e, "Preview transcode failed");
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return None;
        }
    };

    // Read the transcoded file and upload via the storage provider.
    let data = match tokio::fs::read(&tmp_path).await {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!(version_id = version.id, error = %e, "Failed to read temp preview file");
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return None;
        }
    };

    // Clean up temp file before uploading.
    let _ = tokio::fs::remove_file(&tmp_path).await;

    if let Err(e) = provider.upload(&preview_key, &data).await {
        tracing::warn!(version_id = version.id, error = %e, "Failed to upload preview to storage");
        return None;
    }

    if let Err(e) =
        SceneVideoVersionRepo::set_preview_path(&state.pool, version.id, &preview_key).await
    {
        tracing::warn!(version_id = version.id, error = %e, "Failed to save preview_path");
        return None;
    }

    tracing::info!(
        version_id = version.id,
        preview_size = result.file_size,
        "Generated video preview"
    );
    Some(preview_key)
}

/// Extract video metadata (duration, resolution, frame rate) via ffprobe
/// and persist it to the database.
///
/// Returns `true` on success, `false` on any failure.
/// Best-effort — callers should not fail the parent operation on `false`.
pub async fn extract_and_set_video_metadata(state: &AppState, version: &SceneVideoVersion) -> bool {
    let abs_source = match state.resolve_to_path(&version.file_path).await {
        Ok(path) => path,
        Err(e) => {
            tracing::warn!(version_id = version.id, error = %e, "Failed to resolve source for metadata");
            return false;
        }
    };

    let probe = match ffmpeg::probe_video(&abs_source).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(version_id = version.id, error = %e, "ffprobe failed for metadata");
            return false;
        }
    };

    let duration = ffmpeg::parse_duration(&probe);
    if duration <= 0.0 {
        return false;
    }

    let (width, height) = ffmpeg::parse_resolution(&probe);
    let frame_rate = ffmpeg::parse_framerate(&probe);

    match SceneVideoVersionRepo::set_video_metadata(
        &state.pool,
        version.id,
        duration,
        width,
        height,
        frame_rate,
    )
    .await
    {
        Ok(true) => {
            tracing::info!(
                version_id = version.id,
                duration,
                width,
                height,
                frame_rate,
                "Extracted video metadata"
            );
            true
        }
        Ok(false) => {
            tracing::warn!(version_id = version.id, "set_video_metadata matched no row");
            false
        }
        Err(e) => {
            tracing::warn!(version_id = version.id, error = %e, "Failed to save video metadata");
            false
        }
    }
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

    // Reject empty files — zero-byte uploads are not valid deliverables.
    if data.is_empty() {
        return Err(AppError::BadRequest(
            "Uploaded video file is empty (0 bytes)".to_string(),
        ));
    }

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

    // If the scene already has a final version that is approved, keep it as final
    // and create the new version as non-final. The user can manually promote the
    // new version to final if desired.
    let existing_final = SceneVideoVersionRepo::find_final_for_scene(&state.pool, scene_id).await?;
    let has_approved_final = existing_final
        .as_ref()
        .is_some_and(|v| v.qa_status == CLIP_QA_APPROVED);

    let input = CreateSceneVideoVersion {
        scene_id,
        source: CLIP_SOURCE_IMPORTED.to_string(),
        file_path: storage_key,
        file_size_bytes: Some(file_size),
        duration_secs: None, // would require ffprobe to determine
        is_final: Some(!has_approved_final),
        notes,
        generation_snapshot: None,
    };

    let version = if has_approved_final {
        SceneVideoVersionRepo::create(&state.pool, &input).await?
    } else {
        SceneVideoVersionRepo::create_as_final(&state.pool, &input).await?
    };

    // Update scene status to Generated (has video content).
    SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Generated.id()).await?;

    // Best-effort: generate a low-res preview copy for card thumbnails.
    generate_preview_for_version(&state, &version).await;

    // Best-effort: extract duration via ffprobe and persist it.
    extract_and_set_video_metadata(&state, &version).await;

    // Re-fetch version to include the preview_path and duration in the response.
    let version = SceneVideoVersionRepo::find_by_id(&state.pool, version.id)
        .await?
        .unwrap_or(version);

    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/approve
///
/// Sets the clip's `qa_status` to `"approved"`, recording the reviewer and timestamp.
/// Also updates the parent scene's status to Approved.
pub async fn approve_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
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

    // Update parent scene status to Approved
    SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Approved.id()).await?;

    tracing::info!(user_id = auth.user_id, version_id = id, "Clip approved");
    Ok(Json(DataResponse { data: updated }))
}

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/reject
///
/// Sets the clip's `qa_status` to `"rejected"`, recording the reviewer, timestamp,
/// rejection reason, and optional notes.
/// If all clips for the scene are now rejected, sets the scene status to Rejected.
/// Otherwise reverts to Generated.
pub async fn reject_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
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

    // Check if any non-rejected clip remains; if not, mark scene as Rejected.
    let remaining = SceneVideoVersionRepo::list_by_scene(&state.pool, scene_id).await?;
    let has_approved = remaining.iter().any(|v| v.qa_status == CLIP_QA_APPROVED);
    let all_rejected = remaining.iter().all(|v| v.qa_status == CLIP_QA_REJECTED);

    if has_approved {
        SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Approved.id()).await?;
    } else if all_rejected {
        SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Rejected.id()).await?;
    } else {
        SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Generated.id()).await?;
    }

    tracing::info!(user_id = auth.user_id, version_id = id, "Clip rejected");
    Ok(Json(DataResponse { data: updated }))
}

/// PUT /api/v1/scenes/{scene_id}/versions/{id}/unapprove
///
/// Reverts an approved or rejected clip back to pending status.
/// Updates the parent scene status accordingly.
pub async fn unapprove_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> {
    let version = ensure_version_exists(&state.pool, id).await?;

    if version.qa_status != CLIP_QA_APPROVED && version.qa_status != CLIP_QA_REJECTED {
        return Err(AppError::BadRequest(
            "Clip must be approved or rejected to unapprove".to_string(),
        ));
    }

    let update = UpdateSceneVideoVersion {
        is_final: None,
        notes: None,
        qa_status: Some(CLIP_QA_PENDING.to_string()),
        qa_reviewed_by: None,
        qa_reviewed_at: None,
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

    // Re-evaluate parent scene status
    let remaining = SceneVideoVersionRepo::list_by_scene(&state.pool, scene_id).await?;
    let has_approved = remaining.iter().any(|v| v.qa_status == CLIP_QA_APPROVED);
    let all_rejected = remaining.iter().all(|v| v.qa_status == CLIP_QA_REJECTED);

    if has_approved {
        SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Approved.id()).await?;
    } else if all_rejected {
        SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Rejected.id()).await?;
    } else {
        SceneRepo::set_status(&state.pool, scene_id, SceneStatus::Generated.id()).await?;
    }

    tracing::info!(user_id = auth.user_id, version_id = id, "Clip unapproved");
    Ok(Json(DataResponse { data: updated }))
}

/// GET /api/v1/scenes/{scene_id}/versions/{id}/artifacts
///
/// List all pipeline artifacts for a specific scene video version.
pub async fn list_artifacts(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<Vec<SceneVideoVersionArtifact>>>> {
    let _version = ensure_version_exists(&state.pool, id).await?;
    let artifacts = SceneVideoVersionArtifactRepo::list_by_version(&state.pool, id).await?;
    Ok(Json(DataResponse { data: artifacts }))
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

// ---------------------------------------------------------------------------
// Browse all clips across all characters/scenes
// ---------------------------------------------------------------------------

/// A clip row enriched with character/scene/project context for browsing.
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ClipBrowseItem {
    // Video version fields
    pub id: DbId,
    pub scene_id: DbId,
    pub version_number: i32,
    pub source: String,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub frame_rate: Option<f64>,
    pub preview_path: Option<String>,
    pub is_final: bool,
    pub qa_status: String,
    pub qa_rejection_reason: Option<String>,
    pub qa_notes: Option<String>,
    pub generation_snapshot: Option<serde_json::Value>,
    pub file_purged: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub annotation_count: i64,
    // Context fields
    pub character_id: DbId,
    pub character_name: String,
    pub scene_type_name: String,
    pub track_name: String,
    pub character_is_enabled: bool,
    pub project_id: DbId,
    pub project_name: String,
}

/// GET /api/v1/scene-video-versions/browse
///
/// Returns all scene video versions with character/scene/project context,
/// ordered by most recent first. Supports optional project_id filter.
pub async fn browse_clips(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<BrowseClipsParams>,
) -> AppResult<Json<DataResponse<Vec<ClipBrowseItem>>>> {
    let limit = params.limit.unwrap_or(200).min(500);
    let offset = params.offset.unwrap_or(0);

    let rows = sqlx::query_as::<_, ClipBrowseItem>(
        "SELECT
            svv.id,
            svv.scene_id,
            svv.version_number,
            svv.source,
            svv.file_path,
            svv.file_size_bytes,
            svv.duration_secs,
            svv.width,
            svv.height,
            svv.frame_rate,
            svv.preview_path,
            svv.is_final,
            svv.qa_status,
            svv.qa_rejection_reason,
            svv.qa_notes,
            svv.generation_snapshot,
            svv.file_purged,
            svv.created_at,
            COALESCE((SELECT COUNT(*) FROM frame_annotations fa WHERE fa.version_id = svv.id), 0) AS annotation_count,
            c.id AS character_id,
            c.name AS character_name,
            COALESCE(st.name, '') AS scene_type_name,
            COALESCE(t.name, '') AS track_name,
            c.is_enabled AS character_is_enabled,
            p.id AS project_id,
            p.name AS project_name
        FROM scene_video_versions svv
        JOIN scenes sc ON sc.id = svv.scene_id AND sc.deleted_at IS NULL
        JOIN characters c ON c.id = sc.character_id AND c.deleted_at IS NULL
        JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL
        LEFT JOIN scene_types st ON st.id = sc.scene_type_id
        LEFT JOIN tracks t ON t.id = sc.track_id
        WHERE svv.deleted_at IS NULL
          AND ($1::bigint IS NULL OR p.id = $1)
        ORDER BY svv.created_at DESC
        LIMIT $2 OFFSET $3",
    )
    .bind(params.project_id)
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(DataResponse { data: rows }))
}

#[derive(Debug, serde::Deserialize)]
pub struct BrowseClipsParams {
    pub project_id: Option<DbId>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}
