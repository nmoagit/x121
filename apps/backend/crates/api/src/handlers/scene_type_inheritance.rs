//! Handlers for scene type inheritance, overrides, and mixins (PRD-100).

use std::collections::HashMap;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::scene_type_inheritance::{self, EffectiveConfig, InheritanceChainEntry, MixinEntry};
use x121_core::types::DbId;
use x121_db::models::mixin::{ApplyMixin, CreateMixin, Mixin, SceneTypeMixin, UpdateMixin};
use x121_db::models::scene_type::{CreateSceneType, SceneType};
use x121_db::models::scene_type_override::{SceneTypeOverride, UpsertOverride};
use x121_db::repositories::{MixinRepo, SceneTypeOverrideRepo, SceneTypeRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Load a scene type by ID or return 404.
pub(crate) async fn ensure_scene_type_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<SceneType> {
    SceneTypeRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))
}

// ---------------------------------------------------------------------------
// Inheritance
// ---------------------------------------------------------------------------

/// POST /api/v1/scene-types/{id}/children
///
/// Create a child scene type under the given parent.
pub async fn create_child(
    State(state): State<AppState>,
    Path(parent_id): Path<DbId>,
    Json(mut input): Json<CreateSceneType>,
) -> AppResult<(StatusCode, Json<DataResponse<SceneType>>)> {
    // Load parent.
    let parent = ensure_scene_type_exists(&state.pool, parent_id).await?;

    // Validate depth.
    let child_depth =
        scene_type_inheritance::validate_depth(parent.depth).map_err(AppError::BadRequest)?;

    // Set parent reference; inherit project_id from parent if not set.
    input.parent_scene_type_id = Some(parent_id);
    if input.project_id.is_none() {
        input.project_id = parent.project_id;
    }

    let child = SceneTypeRepo::create(&state.pool, &input).await?;

    // Update depth (create defaults to 0; we need the calculated value).
    SceneTypeRepo::update_depth(&state.pool, child.id, child_depth).await?;

    // Reload to get the updated depth.
    let child = ensure_scene_type_exists(&state.pool, child.id).await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: child })))
}

/// GET /api/v1/scene-types/{id}/effective-config
///
/// Resolve the full effective configuration for a scene type, walking the
/// inheritance chain and applying mixins.
pub async fn effective_config(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<EffectiveConfig>>> {
    let chain = build_inheritance_chain(&state, id).await?;
    let mixins_db = MixinRepo::list_for_scene_type(&state.pool, id).await?;

    let mixin_entries: Vec<MixinEntry> = mixins_db
        .into_iter()
        .map(|m| MixinEntry {
            id: m.id,
            name: m.name,
            parameters: serde_json::from_value(m.parameters).unwrap_or_default(),
        })
        .collect();

    let config = scene_type_inheritance::resolve_effective_config(&chain, &mixin_entries);
    Ok(Json(DataResponse { data: config }))
}

/// GET /api/v1/scene-types/{id}/children
///
/// List all direct children of a scene type.
pub async fn list_children(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<SceneType>>>> {
    let children = SceneTypeRepo::list_children(&state.pool, id).await?;
    Ok(Json(DataResponse { data: children }))
}

/// GET /api/v1/scene-types/{id}/cascade-preview/{field}
///
/// Preview which direct children would be affected by changing a field on this
/// scene type (those that do NOT override the field themselves).
pub async fn cascade_preview(
    State(state): State<AppState>,
    Path((id, field)): Path<(DbId, String)>,
) -> AppResult<Json<DataResponse<Vec<DbId>>>> {
    // Find direct children IDs.
    let child_ids = SceneTypeRepo::list_children_ids(&state.pool, id).await?;

    // Gather override field names for each child.
    let mut children_with_overrides = Vec::with_capacity(child_ids.len());
    for child_id in child_ids {
        let fields = SceneTypeOverrideRepo::list_field_names(&state.pool, child_id).await?;
        children_with_overrides.push((child_id, fields));
    }

    let affected = scene_type_inheritance::find_cascade_affected(&children_with_overrides, &field);
    Ok(Json(DataResponse { data: affected }))
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-types/{id}/overrides
pub async fn list_overrides(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<SceneTypeOverride>>>> {
    let overrides = SceneTypeOverrideRepo::list_by_scene_type(&state.pool, id).await?;
    Ok(Json(DataResponse { data: overrides }))
}

/// PUT /api/v1/scene-types/{id}/overrides
pub async fn upsert_override(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpsertOverride>,
) -> AppResult<Json<DataResponse<SceneTypeOverride>>> {
    let override_row = SceneTypeOverrideRepo::upsert(&state.pool, id, &input).await?;
    Ok(Json(DataResponse { data: override_row }))
}

/// DELETE /api/v1/scene-types/{id}/overrides/{field}
pub async fn delete_override(
    State(state): State<AppState>,
    Path((id, field)): Path<(DbId, String)>,
) -> AppResult<StatusCode> {
    let deleted = SceneTypeOverrideRepo::delete(&state.pool, id, &field).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneTypeOverride",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Mixins (CRUD)
// ---------------------------------------------------------------------------

/// GET /api/v1/mixins
pub async fn list_mixins(State(state): State<AppState>) -> AppResult<Json<DataResponse<Vec<Mixin>>>> {
    let mixins = MixinRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: mixins }))
}

/// POST /api/v1/mixins
pub async fn create_mixin(
    State(state): State<AppState>,
    Json(input): Json<CreateMixin>,
) -> AppResult<(StatusCode, Json<DataResponse<Mixin>>)> {
    let mixin = MixinRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: mixin })))
}

/// GET /api/v1/mixins/{id}
pub async fn get_mixin(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Mixin>>> {
    let mixin = MixinRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Mixin",
            id,
        }))?;
    Ok(Json(DataResponse { data: mixin }))
}

/// PUT /api/v1/mixins/{id}
pub async fn update_mixin(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateMixin>,
) -> AppResult<Json<DataResponse<Mixin>>> {
    let mixin = MixinRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Mixin",
            id,
        }))?;
    Ok(Json(DataResponse { data: mixin }))
}

/// DELETE /api/v1/mixins/{id}
pub async fn delete_mixin(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = MixinRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Mixin",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Scene type <-> mixin association
// ---------------------------------------------------------------------------

/// POST /api/v1/scene-types/{id}/mixins
pub async fn apply_mixin(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<ApplyMixin>,
) -> AppResult<(StatusCode, Json<DataResponse<SceneTypeMixin>>)> {
    let assoc = MixinRepo::apply_to_scene_type(&state.pool, id, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: assoc })))
}

/// DELETE /api/v1/scene-types/{id}/mixins/{mixin_id}
pub async fn remove_mixin(
    State(state): State<AppState>,
    Path((id, mixin_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let removed = MixinRepo::remove_from_scene_type(&state.pool, id, mixin_id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneTypeMixin",
            id,
        }))
    }
}

/// GET /api/v1/scene-types/{id}/mixins
pub async fn list_scene_type_mixins(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<Mixin>>>> {
    let mixins = MixinRepo::list_for_scene_type(&state.pool, id).await?;
    Ok(Json(DataResponse { data: mixins }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Walk up the parent chain from `id` and build the inheritance chain
/// (root-first, child-last).
async fn build_inheritance_chain(
    state: &AppState,
    id: DbId,
) -> AppResult<Vec<InheritanceChainEntry>> {
    let mut chain = Vec::new();
    let mut current_id = Some(id);

    while let Some(cid) = current_id {
        let st = ensure_scene_type_exists(&state.pool, cid).await?;

        let overrides = SceneTypeOverrideRepo::list_by_scene_type(&state.pool, cid).await?;
        let override_map: HashMap<String, serde_json::Value> = overrides
            .into_iter()
            .map(|o| (o.field_name, o.override_value))
            .collect();

        let fields = scene_type_to_field_map(&st);

        chain.push(InheritanceChainEntry {
            id: st.id,
            name: st.name.clone(),
            fields,
            overrides: override_map,
        });

        current_id = st.parent_scene_type_id;
    }

    // Reverse so root is first, child is last.
    chain.reverse();
    Ok(chain)
}

/// Convert a `SceneType` row into a field map for inheritance resolution.
fn scene_type_to_field_map(st: &SceneType) -> HashMap<String, serde_json::Value> {
    let mut map = HashMap::new();

    if let Some(ref v) = st.workflow_json {
        map.insert("workflow_json".into(), v.clone());
    }
    if let Some(ref v) = st.lora_config {
        map.insert("lora_config".into(), v.clone());
    }
    if let Some(ref v) = st.prompt_template {
        map.insert("prompt_template".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.description {
        map.insert("description".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.model_config {
        map.insert("model_config".into(), v.clone());
    }
    if let Some(ref v) = st.negative_prompt_template {
        map.insert("negative_prompt_template".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.prompt_start_clip {
        map.insert("prompt_start_clip".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.negative_prompt_start_clip {
        map.insert("negative_prompt_start_clip".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.prompt_continuation_clip {
        map.insert("prompt_continuation_clip".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.negative_prompt_continuation_clip {
        map.insert(
            "negative_prompt_continuation_clip".into(),
            serde_json::json!(v),
        );
    }
    if let Some(v) = st.target_duration_secs {
        map.insert("target_duration_secs".into(), serde_json::json!(v));
    }
    if let Some(v) = st.segment_duration_secs {
        map.insert("segment_duration_secs".into(), serde_json::json!(v));
    }
    map.insert(
        "duration_tolerance_secs".into(),
        serde_json::json!(st.duration_tolerance_secs),
    );
    if let Some(v) = st.transition_segment_index {
        map.insert("transition_segment_index".into(), serde_json::json!(v));
    }
    if let Some(ref v) = st.generation_params {
        map.insert("generation_params".into(), v.clone());
    }

    map
}
