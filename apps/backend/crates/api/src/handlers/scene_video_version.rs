//! Handlers for the `/versions` resource.
//!
//! Scene video versions are nested under scenes:
//! `/scenes/{scene_id}/versions[/{id}]`

use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::scene_video_version::{CreateSceneVideoVersion, SceneVideoVersion};
use trulience_db::repositories::SceneVideoVersionRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Supported video file extensions for import.
const SUPPORTED_VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov"];

/// GET /api/v1/scenes/{scene_id}/versions
///
/// List all video versions for a scene, ordered by version number descending.
pub async fn list_by_scene(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<Json<Vec<SceneVideoVersion>>> {
    let versions = SceneVideoVersionRepo::list_by_scene(&state.pool, scene_id).await?;
    Ok(Json(versions))
}

/// GET /api/v1/scenes/{scene_id}/versions/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<SceneVideoVersion>> {
    let version = SceneVideoVersionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneVideoVersion",
            id,
        }))?;
    Ok(Json(version))
}

/// DELETE /api/v1/scenes/{scene_id}/versions/{id}
///
/// Soft-deletes a version. Returns 409 if the version is currently marked as final.
pub async fn delete(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let version = SceneVideoVersionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneVideoVersion",
            id,
        }))?;

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
pub async fn set_final(
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<SceneVideoVersion>> {
    let version = SceneVideoVersionRepo::set_final(&state.pool, scene_id, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneVideoVersion",
            id,
        }))?;
    Ok(Json(version))
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
) -> AppResult<(StatusCode, Json<SceneVideoVersion>)> {
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

    // Store file in a predictable path based on scene_id and timestamp.
    // In production this would use the project's asset/object-storage layer.
    let storage_dir = std::path::PathBuf::from("storage/imports");
    tokio::fs::create_dir_all(&storage_dir)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let stored_filename = format!("scene_{scene_id}_{}.{ext}", chrono::Utc::now().timestamp());
    let file_path = storage_dir.join(&stored_filename);
    tokio::fs::write(&file_path, &data)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let file_size = data.len() as i64;

    let input = CreateSceneVideoVersion {
        scene_id,
        source: "imported".to_string(),
        file_path: file_path.to_string_lossy().to_string(),
        file_size_bytes: Some(file_size),
        duration_secs: None, // would require ffprobe to determine
        is_final: Some(true),
        notes,
    };

    let version = SceneVideoVersionRepo::create_as_final(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(version)))
}
