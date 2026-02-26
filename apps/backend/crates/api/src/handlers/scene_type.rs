//! Handlers for the `/scene-types` resource.
//!
//! Scene types have two scopes:
//! - Project-scoped: `/projects/{project_id}/scene-types[/{id}]`
//! - Studio-level:   `/scene-types[/{id}]`

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::scene_type::{
    CreateSceneType, MatrixCellDto, MatrixRequest, PromptPreviewQuery, PromptPreviewResponse,
    SceneType, UpdateSceneType, ValidationResult,
};
use x121_db::repositories::{CharacterRepo, SceneTypeRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Project-scoped handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/projects/{project_id}/scene-types
///
/// Overrides `input.project_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateSceneType>,
) -> AppResult<(StatusCode, Json<SceneType>)> {
    input.project_id = Some(project_id);
    let scene_type = SceneTypeRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(scene_type)))
}

/// GET /api/v1/projects/{project_id}/scene-types
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<Vec<SceneType>>> {
    let scene_types = SceneTypeRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(scene_types))
}

/// GET /api/v1/projects/{project_id}/scene-types/{id}
pub async fn get_by_id_scoped(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<SceneType>> {
    get_by_id_inner(&state, id).await
}

/// PUT /api/v1/projects/{project_id}/scene-types/{id}
pub async fn update_scoped(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateSceneType>,
) -> AppResult<Json<SceneType>> {
    update_inner(&state, id, input).await
}

/// DELETE /api/v1/projects/{project_id}/scene-types/{id}
pub async fn delete_scoped(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_inner(&state, id).await
}

// ---------------------------------------------------------------------------
// Studio-level handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/scene-types
///
/// Creates a studio-level scene type (no project association).
pub async fn create_studio(
    State(state): State<AppState>,
    Json(mut input): Json<CreateSceneType>,
) -> AppResult<(StatusCode, Json<SceneType>)> {
    input.project_id = None;
    input.is_studio_level = Some(true);
    let scene_type = SceneTypeRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(scene_type)))
}

/// GET /api/v1/scene-types
pub async fn list_studio_level(State(state): State<AppState>) -> AppResult<Json<Vec<SceneType>>> {
    let scene_types = SceneTypeRepo::list_studio_level(&state.pool).await?;
    Ok(Json(scene_types))
}

/// GET /api/v1/scene-types/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<SceneType>> {
    get_by_id_inner(&state, id).await
}

/// PUT /api/v1/scene-types/{id}
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateSceneType>,
) -> AppResult<Json<SceneType>> {
    update_inner(&state, id, input).await
}

/// DELETE /api/v1/scene-types/{id}
pub async fn delete(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<StatusCode> {
    delete_inner(&state, id).await
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async fn get_by_id_inner(state: &AppState, id: DbId) -> AppResult<Json<SceneType>> {
    let scene_type = SceneTypeRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))?;
    Ok(Json(scene_type))
}

async fn update_inner(
    state: &AppState,
    id: DbId,
    input: UpdateSceneType,
) -> AppResult<Json<SceneType>> {
    let scene_type = SceneTypeRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))?;
    Ok(Json(scene_type))
}

async fn delete_inner(state: &AppState, id: DbId) -> AppResult<StatusCode> {
    let deleted = SceneTypeRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// PRD-23 endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-types/{id}/preview-prompt/{character_id}?clip_position=full_clip
pub async fn preview_prompt(
    State(state): State<AppState>,
    Path((scene_type_id, character_id)): Path<(DbId, DbId)>,
    Query(params): Query<PromptPreviewQuery>,
) -> AppResult<impl IntoResponse> {
    use x121_core::scene_type_config::{self, ClipPosition, ResolvedPrompt};

    // 1. Load scene type
    let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id: scene_type_id,
        }))?;

    // 2. Load character
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    // 3. Parse clip position (default to full_clip)
    let position = match params.clip_position.as_deref() {
        Some(pos) => ClipPosition::parse(pos).map_err(AppError::BadRequest)?,
        None => ClipPosition::FullClip,
    };

    // 4. Select prompt for position
    let positive_template = scene_type_config::select_prompt_for_position(
        scene_type.prompt_template.as_deref(),
        scene_type.prompt_start_clip.as_deref(),
        scene_type.prompt_continuation_clip.as_deref(),
        position,
    );
    let negative_template = scene_type_config::select_prompt_for_position(
        scene_type.negative_prompt_template.as_deref(),
        scene_type.negative_prompt_start_clip.as_deref(),
        scene_type.negative_prompt_continuation_clip.as_deref(),
        position,
    );

    // 5. Build metadata map from character
    let mut metadata = std::collections::HashMap::new();
    metadata.insert("character_name".to_string(), character.name.clone());
    if let Some(ref meta) = character.metadata {
        if let Some(phys) = meta.get("physical_attributes") {
            for key in &["hair_color", "eye_color", "build", "height"] {
                if let Some(val) = phys.get(key).and_then(|v| v.as_str()) {
                    metadata.insert(key.to_string(), val.to_string());
                }
            }
        }
        if let Some(bio) = meta.get("biographical") {
            if let Some(desc) = bio.get("description").and_then(|v| v.as_str()) {
                metadata.insert("description".to_string(), desc.to_string());
            }
        }
    }

    // 6. Resolve templates
    let positive_resolved = match positive_template {
        Some(t) => scene_type_config::resolve_prompt_template(t, &metadata),
        None => ResolvedPrompt {
            text: String::new(),
            unresolved_placeholders: vec![],
        },
    };
    let negative_resolved = match negative_template {
        Some(t) => scene_type_config::resolve_prompt_template(t, &metadata),
        None => ResolvedPrompt {
            text: String::new(),
            unresolved_placeholders: vec![],
        },
    };

    // 7. Determine source label
    let source = match position {
        ClipPosition::FullClip => "full_clip".to_string(),
        ClipPosition::StartClip => {
            if scene_type.prompt_start_clip.is_some() {
                "start_clip".to_string()
            } else {
                "full_clip (fallback)".to_string()
            }
        }
        ClipPosition::ContinuationClip => {
            if scene_type.prompt_continuation_clip.is_some() {
                "continuation_clip".to_string()
            } else {
                "full_clip (fallback)".to_string()
            }
        }
    };

    // Merge unresolved from both
    let mut unresolved = positive_resolved.unresolved_placeholders;
    for p in negative_resolved.unresolved_placeholders {
        if !unresolved.contains(&p) {
            unresolved.push(p);
        }
    }

    Ok(Json(DataResponse {
        data: PromptPreviewResponse {
            positive_prompt: positive_resolved.text,
            negative_prompt: negative_resolved.text,
            unresolved_placeholders: unresolved,
            source,
        },
    }))
}

/// POST /api/v1/scene-types/matrix
pub async fn generate_matrix(
    State(state): State<AppState>,
    Json(body): Json<MatrixRequest>,
) -> AppResult<impl IntoResponse> {
    use x121_db::repositories::TrackRepo;

    // Load scene types
    let scene_types = SceneTypeRepo::list_by_ids(&state.pool, &body.scene_type_ids).await?;

    // Load active tracks to use as variant types (replaces expand_variants)
    let tracks = TrackRepo::list(&state.pool, false).await?;
    let track_slugs: Vec<String> = tracks.into_iter().map(|t| t.slug).collect();

    // Build matrix cells
    let mut cells: Vec<MatrixCellDto> = Vec::new();
    for st in &scene_types {
        for &character_id in &body.character_ids {
            for slug in &track_slugs {
                cells.push(MatrixCellDto {
                    character_id,
                    scene_type_id: st.id,
                    variant_type: slug.clone(),
                    existing_scene_id: None,
                    status: "not_started".to_string(),
                });
            }
        }
    }

    // Check existing scenes
    let char_ids: Vec<DbId> = body.character_ids.clone();
    let st_ids: Vec<DbId> = body.scene_type_ids.clone();
    let existing_scenes: Vec<(DbId, DbId, DbId, i16)> = sqlx::query_as(
        "SELECT s.id, s.character_id, s.scene_type_id, s.status_id
         FROM scenes s
         JOIN image_variants iv ON iv.id = s.image_variant_id
         WHERE s.character_id = ANY($1) AND s.scene_type_id = ANY($2) AND s.deleted_at IS NULL",
    )
    .bind(&char_ids)
    .bind(&st_ids)
    .fetch_all(&state.pool)
    .await?;

    // Update cells with existing scene info
    for (scene_id, char_id, st_id, status_id) in &existing_scenes {
        if let Some(cell) = cells
            .iter_mut()
            .find(|c| c.character_id == *char_id && c.scene_type_id == *st_id)
        {
            cell.existing_scene_id = Some(*scene_id);
            cell.status = scene_status_label(*status_id).to_string();
        }
    }

    Ok(Json(DataResponse { data: cells }))
}

/// Map a scene status_id to a display label for the matrix view.
fn scene_status_label(status_id: i16) -> &'static str {
    use x121_db::models::status::SceneStatus;
    match status_id {
        x if x == SceneStatus::Pending.id() => "pending",
        x if x == SceneStatus::Generating.id() => "generating",
        x if x == SceneStatus::Generated.id() => "review",
        x if x == SceneStatus::Approved.id() => "approved",
        x if x == SceneStatus::Rejected.id() => "failed",
        x if x == SceneStatus::Delivered.id() => "approved",
        _ => "unknown",
    }
}

/// POST /api/v1/scene-types/validate
pub async fn validate_scene_type_config(
    Json(input): Json<CreateSceneType>,
) -> AppResult<impl IntoResponse> {
    use x121_core::scene_type_config;

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Validate name
    if input.name.trim().is_empty() {
        errors.push("name is required".to_string());
    }

    // Validate duration
    if let Err(e) = scene_type_config::validate_duration_config(
        input.target_duration_secs,
        input.segment_duration_secs,
        input.duration_tolerance_secs,
    ) {
        errors.push(e);
    }

    // Validate prompt placeholders (warnings only)
    if let Some(ref template) = input.prompt_template {
        let unknown = scene_type_config::validate_placeholders(template);
        for p in unknown {
            warnings.push(format!(
                "Unknown placeholder '{{{p}}}' in prompt_template — may not resolve"
            ));
        }
    }

    Ok(Json(DataResponse {
        data: ValidationResult {
            valid: errors.is_empty(),
            errors,
            warnings,
        },
    }))
}
