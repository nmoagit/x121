//! Handlers for hierarchical video settings (duration, fps, resolution).
//!
//! Supports 4-level hierarchy: Scene Type -> Project -> Group -> Character.
//! Includes a resolution endpoint that walks all levels and returns the
//! effective settings with provenance tracking.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_core::video_settings::{self, VideoSettingsLayer};
use x121_db::models::video_settings::UpsertVideoSettings;
use x121_db::repositories::{CharacterRepo, SceneTypeRepo, VideoSettingsRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Scene Type (read-only — fps/resolution/duration are on scene_types row)
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-types/{id}/video-settings
///
/// Returns the scene type's own video settings (not resolved through hierarchy).
pub async fn get_scene_type_video_settings(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
) -> AppResult<Json<DataResponse<VideoSettingsLayer>>> {
    let st = SceneTypeRepo::find_by_id(&state.pool, scene_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id: scene_type_id,
        }))?;

    Ok(Json(DataResponse {
        data: VideoSettingsLayer {
            target_duration_secs: st.target_duration_secs,
            target_fps: st.target_fps,
            target_resolution: st.target_resolution,
        },
    }))
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/video-settings/{scene_type_id}
///
/// Returns the project-level video settings override for a scene type.
pub async fn get_project_settings(
    State(state): State<AppState>,
    Path((project_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<Option<x121_db::models::video_settings::ProjectVideoSettings>>>> {
    let settings = VideoSettingsRepo::find_project(&state.pool, project_id, scene_type_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/video-settings/{scene_type_id}
///
/// Create or update project-level video settings for a scene type.
pub async fn upsert_project_settings(
    State(state): State<AppState>,
    Path((project_id, scene_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpsertVideoSettings>,
) -> AppResult<Json<DataResponse<x121_db::models::video_settings::ProjectVideoSettings>>> {
    let result =
        VideoSettingsRepo::upsert_project(&state.pool, project_id, scene_type_id, &body).await?;
    Ok(Json(DataResponse { data: result }))
}

/// DELETE /api/v1/projects/{project_id}/video-settings/{scene_type_id}
///
/// Remove the project-level video settings override for a scene type.
pub async fn delete_project_settings(
    State(state): State<AppState>,
    Path((project_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted =
        VideoSettingsRepo::delete_project_by_key(&state.pool, project_id, scene_type_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ProjectVideoSettings",
            id: 0,
        }))
    }
}

/// GET /api/v1/projects/{project_id}/video-settings
///
/// List all project-level video settings overrides.
pub async fn list_project_settings(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::video_settings::ProjectVideoSettings>>>> {
    let settings = VideoSettingsRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/groups/{group_id}/video-settings/{scene_type_id}
///
/// Returns the group-level video settings override for a scene type.
pub async fn get_group_settings(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<Json<DataResponse<Option<x121_db::models::video_settings::GroupVideoSettings>>>> {
    let settings = VideoSettingsRepo::find_group(&state.pool, group_id, scene_type_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/groups/{group_id}/video-settings/{scene_type_id}
///
/// Create or update group-level video settings for a scene type.
pub async fn upsert_group_settings(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<UpsertVideoSettings>,
) -> AppResult<Json<DataResponse<x121_db::models::video_settings::GroupVideoSettings>>> {
    let result =
        VideoSettingsRepo::upsert_group(&state.pool, group_id, scene_type_id, &body).await?;
    Ok(Json(DataResponse { data: result }))
}

/// DELETE /api/v1/projects/{project_id}/groups/{group_id}/video-settings/{scene_type_id}
///
/// Remove the group-level video settings override for a scene type.
pub async fn delete_group_settings(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted =
        VideoSettingsRepo::delete_group_by_key(&state.pool, group_id, scene_type_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "GroupVideoSettings",
            id: 0,
        }))
    }
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

/// GET /api/v1/characters/{character_id}/video-settings
///
/// List all character-level video settings overrides.
pub async fn list_character_settings(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::video_settings::CharacterVideoSettings>>>> {
    let settings = VideoSettingsRepo::list_by_character(&state.pool, character_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// GET /api/v1/characters/{character_id}/video-settings/{scene_type_id}
///
/// Returns the character-level video settings override for a scene type.
pub async fn get_character_settings(
    State(state): State<AppState>,
    Path((character_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<Option<x121_db::models::video_settings::CharacterVideoSettings>>>>
{
    let settings =
        VideoSettingsRepo::find_character(&state.pool, character_id, scene_type_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/characters/{character_id}/video-settings/{scene_type_id}
///
/// Create or update character-level video settings for a scene type.
pub async fn upsert_character_settings(
    State(state): State<AppState>,
    Path((character_id, scene_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpsertVideoSettings>,
) -> AppResult<Json<DataResponse<x121_db::models::video_settings::CharacterVideoSettings>>> {
    let result =
        VideoSettingsRepo::upsert_character(&state.pool, character_id, scene_type_id, &body)
            .await?;
    Ok(Json(DataResponse { data: result }))
}

/// DELETE /api/v1/characters/{character_id}/video-settings/{scene_type_id}
///
/// Remove the character-level video settings override for a scene type.
pub async fn delete_character_settings(
    State(state): State<AppState>,
    Path((character_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted =
        VideoSettingsRepo::delete_character_by_key(&state.pool, character_id, scene_type_id)
            .await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "CharacterVideoSettings",
            id: 0,
        }))
    }
}

// ---------------------------------------------------------------------------
// Resolved settings (walks all 4 levels)
// ---------------------------------------------------------------------------

/// GET /api/v1/characters/{character_id}/video-settings/{scene_type_id}/resolved
///
/// Resolves video settings through the full hierarchy:
/// Scene Type -> Project -> Group -> Character.
/// Returns the effective settings with provenance for each field.
pub async fn get_resolved_settings(
    State(state): State<AppState>,
    Path((character_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<video_settings::ResolvedVideoSettings>>> {
    // Load the character to find project_id and group_id.
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    // Load the scene type for base settings.
    let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id: scene_type_id,
        }))?;

    let scene_type_layer = VideoSettingsLayer {
        target_duration_secs: scene_type.target_duration_secs,
        target_fps: scene_type.target_fps,
        target_resolution: scene_type.target_resolution,
    };

    // Load all override layers through the shared hierarchy helper.
    let (project_layer, group_layer, char_layer) = VideoSettingsRepo::load_hierarchy_layers(
        &state.pool,
        character.project_id,
        character.group_id,
        character_id,
        scene_type_id,
    )
    .await?;

    // Determine if this is an idle scene type.
    let is_idle = scene_type.name.to_lowercase() == "idle";

    let resolved = video_settings::resolve_video_settings(
        &scene_type_layer,
        project_layer.as_ref(),
        group_layer.as_ref(),
        char_layer.as_ref(),
        is_idle,
    );

    Ok(Json(DataResponse { data: resolved }))
}
