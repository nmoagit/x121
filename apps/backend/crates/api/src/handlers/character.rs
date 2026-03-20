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
use x121_db::repositories::{CharacterGroupRepo, CharacterRepo, ReadinessCacheRepo};

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};

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

    let count = characters.len();
    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Imported {count} model{} into project {project_id}", if count != 1 { "s" } else { "" }),
        )
        .with_project(project_id)
        .with_fields(serde_json::json!({
            "models": input.names,
            "count": count,
        })),
    );

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

    // Sync elevenlabs_voice → metadata.voice_id whenever voice is set/changed.
    if let Some(voice_val) = patch.get("elevenlabs_voice") {
        if let Some(voice_str) = voice_val.as_str() {
            if !voice_str.is_empty() {
                sync_voice_id_to_metadata(&state.pool, id, voice_str).await;
            }
        }
    }

    Ok(Json(DataResponse { data: character }))
}

/// Sync an ElevenLabs VoiceID into the character's metadata JSON as `voice_id`.
async fn sync_voice_id_to_metadata(pool: &sqlx::PgPool, character_id: DbId, voice_id: &str) {
    let _ = sqlx::query(
        "UPDATE characters SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('voice_id', $2::text) WHERE id = $1",
    )
    .bind(character_id)
    .bind(voice_id)
    .execute(pool)
    .await;
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

/// Request body for bulk-approve (optional filtering by section).
#[derive(Debug, serde::Deserialize)]
pub struct BulkApproveRequest {
    /// Which deliverable sections to approve. When absent/null, approves all.
    /// Valid values: "images", "scenes", "metadata", "speech".
    pub sections: Option<Vec<String>>,
}

/// Response from the bulk-approve endpoint.
#[derive(Debug, serde::Serialize)]
pub struct BulkApproveResult {
    pub images_approved: i64,
    pub clips_approved: i64,
    pub metadata_approved: i64,
    pub skipped_sections: Vec<String>,
}

/// POST /api/v1/projects/{project_id}/characters/{id}/bulk-approve
///
/// Approves all unapproved deliverables for a character, scoped to the
/// provided `sections` list (from blocking deliverables). When `sections`
/// is absent, approves everything.
pub async fn bulk_approve(
    State(state): State<AppState>,
    Path((_project_id, character_id)): Path<(DbId, DbId)>,
    Json(body): Json<BulkApproveRequest>,
) -> AppResult<Json<DataResponse<BulkApproveResult>>> {
    // Verify character exists
    CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    let sections = body.sections.as_deref();
    let approve_images = sections.map_or(true, |s| s.iter().any(|v| v == "images"));
    let approve_scenes = sections.map_or(true, |s| s.iter().any(|v| v == "scenes"));
    let approve_metadata = sections.map_or(true, |s| s.iter().any(|v| v == "metadata"));

    let mut skipped_sections = Vec::new();
    let all_sections = ["images", "scenes", "metadata", "speech"];
    for s in &all_sections {
        if !sections.map_or(true, |sec| sec.iter().any(|v| v == *s)) {
            skipped_sections.push(s.to_string());
        }
    }

    // 1. Approve all non-approved image variants
    let images = if approve_images {
        sqlx::query_scalar::<_, i64>(
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
        .await?
    } else {
        0
    };

    // 2. Approve all non-approved scene video versions (final clips only)
    let clips = if approve_scenes {
        let count = sqlx::query_scalar::<_, i64>(
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

        count
    } else {
        0
    };

    // 3. Approve the active metadata version
    let metadata = if approve_metadata {
        sqlx::query_scalar::<_, i64>(
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
        .await?
    } else {
        0
    };

    // Recompute readiness cache — after approving all blocking sections the
    // character is ready (100%). If only some sections were approved, mark as
    // partially_ready so the count is still visible in the pulse widget.
    let new_state = if skipped_sections.is_empty() { "ready" } else { "partially_ready" };
    let new_pct: i32 = if skipped_sections.is_empty() { 100 } else {
        let total = 4i32; // images, scenes, metadata, speech
        let approved = total - skipped_sections.len() as i32;
        ((approved as f64 / total as f64) * 100.0).round() as i32
    };
    let _ = ReadinessCacheRepo::upsert(
        &state.pool,
        &x121_db::models::readiness_cache::UpsertReadinessCache {
            character_id,
            state: new_state.to_string(),
            missing_items: serde_json::json!([]),
            readiness_pct: new_pct,
        },
    ).await;

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Bulk approved character {character_id}: {images} images, {clips} clips, {metadata} metadata{}",
                if !skipped_sections.is_empty() { format!(" (skipped: {})", skipped_sections.join(", ")) } else { String::new() },
            ),
        )
        .with_fields(serde_json::json!({
            "character_id": character_id,
            "images_approved": images,
            "clips_approved": clips,
            "metadata_approved": metadata,
            "skipped_sections": skipped_sections,
        })),
    );

    Ok(Json(DataResponse {
        data: BulkApproveResult {
            images_approved: images,
            clips_approved: clips,
            metadata_approved: metadata,
            skipped_sections,
        },
    }))
}
