//! Handlers for the `/characters` resource.
//!
//! Characters are nested under projects:
//! `/projects/{project_id}/characters[/{id}]`
//!
//! Settings sub-resource:
//! `/projects/{project_id}/characters/{id}/settings`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::character_dashboard::SETTING_KEY_VOICE;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character::{
    Character, CharacterWithAvatar, CreateCharacter, UpdateCharacter,
};
use x121_db::repositories::{CharacterGroupRepo, CharacterRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/projects/{project_id}/characters
///
/// Overrides `input.project_id` with the value from the URL path to ensure
/// the character is created under the correct project. When no `group_id`
/// is provided, auto-assigns to the project's "Intake" group.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateCharacter>,
) -> AppResult<(StatusCode, Json<DataResponse<Character>>)> {
    input.project_id = project_id;

    // If no group specified, assign to the default "Intake" group
    if input.group_id.is_none() {
        let created = CharacterGroupRepo::ensure_default(&state.pool, project_id).await?;
        let intake_id = if let Some(group) = created {
            Some(group.id)
        } else {
            let groups = CharacterGroupRepo::list_by_project(&state.pool, project_id).await?;
            groups
                .iter()
                .find(|g| g.name == CharacterGroupRepo::DEFAULT_GROUP_NAME)
                .map(|g| g.id)
        };
        if let Some(id) = intake_id {
            input.group_id = Some(Some(id));
        }
    }

    let character = CharacterRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: character })))
}

/// Request body for bulk character creation.
#[derive(serde::Deserialize)]
pub struct BulkCreateRequest {
    pub names: Vec<String>,
    pub group_id: Option<DbId>,
}

/// POST /api/v1/projects/{project_id}/characters/bulk
///
/// Creates multiple characters at once from a list of names.
/// When no `group_id` is provided, auto-assigns to the project's default
/// "Intake" group (creating it if necessary).
pub async fn bulk_create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<BulkCreateRequest>,
) -> AppResult<(StatusCode, Json<DataResponse<Vec<Character>>>)> {
    // If no group specified, ensure a default group exists and use it
    let group_id = match input.group_id {
        Some(gid) => Some(gid),
        None => {
            // ensure_default returns Some(group) if it just created one, None if groups exist
            let created = CharacterGroupRepo::ensure_default(&state.pool, project_id).await?;
            if let Some(group) = created {
                Some(group.id)
            } else {
                // Default already exists — find the Intake group
                let groups = CharacterGroupRepo::list_by_project(&state.pool, project_id).await?;
                groups
                    .iter()
                    .find(|g| g.name == CharacterGroupRepo::DEFAULT_GROUP_NAME)
                    .map(|g| g.id)
            }
        }
    };
    let characters =
        CharacterRepo::create_many(&state.pool, project_id, &input.names, group_id).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: characters })))
}

/// GET /api/v1/projects/{project_id}/characters
///
/// Returns characters with their best avatar variant ID pre-resolved,
/// eliminating the N+1 query pattern on the frontend.
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CharacterWithAvatar>>>> {
    let characters = CharacterRepo::list_by_project_with_avatar(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: characters }))
}

/// GET /api/v1/projects/{project_id}/characters/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}
///
/// If the status is being changed to Active (2), the character must have a
/// non-empty `elevenlabs_voice` setting configured (VoiceID approval gate,
/// PRD-013 Amendment A.4).
pub async fn update(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCharacter>,
) -> AppResult<Json<DataResponse<Character>>> {
    use x121_db::models::status::CharacterStatus;

    // VoiceID approval gate: block activation without a configured voice.
    if input.status_id == Some(CharacterStatus::Active.id()) {
        let settings = CharacterRepo::get_settings(&state.pool, id)
            .await?
            .unwrap_or_default();

        let has_voice = settings
            .get(SETTING_KEY_VOICE)
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.is_empty());

        if !has_voice {
            return Err(AppError::Core(CoreError::Validation(format!(
                "VoiceID ({SETTING_KEY_VOICE}) is required before activating a character"
            ))));
        }
    }

    let character = CharacterRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// DELETE /api/v1/projects/{project_id}/characters/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = CharacterRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Settings sub-resource
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/characters/{id}/settings
pub async fn get_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<serde_json::Value>>> {
    let settings = CharacterRepo::get_settings(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}/settings
///
/// Fully replaces the character's settings JSON.
pub async fn update_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(settings): Json<serde_json::Value>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::update_settings(&state.pool, id, &settings)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// PATCH /api/v1/projects/{project_id}/characters/{id}/settings
///
/// Shallow-merges the provided JSON keys into the existing settings
/// using PostgreSQL's `||` operator.
pub async fn patch_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(patch): Json<serde_json::Value>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::patch_settings(&state.pool, id, &patch)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}/toggle-enabled
///
/// Toggle the `is_enabled` flag for a character.
pub async fn toggle_enabled(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(body): Json<ToggleEnabledRequest>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::toggle_enabled(&state.pool, id, body.is_enabled)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

#[derive(Debug, serde::Deserialize)]
pub struct ToggleEnabledRequest {
    pub is_enabled: bool,
}

// ---------------------------------------------------------------------------
// Bulk approve all deliverables
// ---------------------------------------------------------------------------

/// Response from the bulk-approve endpoint.
#[derive(Debug, serde::Serialize)]
pub struct BulkApproveResult {
    pub images_approved: i64,
    pub clips_approved: i64,
    pub metadata_approved: i64,
}

/// POST /api/v1/projects/{project_id}/characters/{id}/bulk-approve
///
/// Approves all unapproved image variants, final scene video versions,
/// and the active metadata version for a character. Intended for backfill
/// workflows where proper per-item review is not practical.
pub async fn bulk_approve(
    State(state): State<AppState>,
    Path((_project_id, character_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<BulkApproveResult>>> {
    // Verify character exists
    CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    // 1. Approve all non-approved image variants
    let images = sqlx::query_scalar::<_, i64>(
        "WITH updated AS (
            UPDATE image_variants
            SET status_id = 2, updated_at = NOW()
            WHERE character_id = $1
              AND deleted_at IS NULL
              AND status_id != 2
            RETURNING id
        ) SELECT COUNT(*) FROM updated",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    // 2. Approve all non-approved scene video versions (final clips only)
    let clips = sqlx::query_scalar::<_, i64>(
        "WITH updated AS (
            UPDATE scene_video_versions
            SET qa_status = 'approved', qa_reviewed_at = NOW(), updated_at = NOW()
            WHERE scene_id IN (SELECT id FROM scenes WHERE character_id = $1)
              AND deleted_at IS NULL
              AND is_final = true
              AND qa_status != 'approved'
            RETURNING id
        ) SELECT COUNT(*) FROM updated",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    // 2b. Update scene status to Approved for scenes that now have an approved final clip
    sqlx::query(
        "UPDATE scenes SET status_id = 4, updated_at = NOW()
         WHERE character_id = $1
           AND status_id != 4
           AND EXISTS (
               SELECT 1 FROM scene_video_versions svv
               WHERE svv.scene_id = scenes.id
                 AND svv.deleted_at IS NULL
                 AND svv.is_final = true
                 AND svv.qa_status = 'approved'
           )",
    )
    .bind(character_id)
    .execute(&state.pool)
    .await?;

    // 3. Approve the active metadata version
    let metadata = sqlx::query_scalar::<_, i64>(
        "WITH updated AS (
            UPDATE character_metadata_versions
            SET approval_status = 'approved', updated_at = NOW()
            WHERE character_id = $1
              AND is_active = true
              AND deleted_at IS NULL
              AND approval_status != 'approved'
            RETURNING id
        ) SELECT COUNT(*) FROM updated",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(DataResponse {
        data: BulkApproveResult {
            images_approved: images,
            clips_approved: clips,
            metadata_approved: metadata,
        },
    }))
}
