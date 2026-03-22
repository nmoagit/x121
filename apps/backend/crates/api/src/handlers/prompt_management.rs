//! Handlers for generation strategy and workflow prompt management (PRD-115).
//!
//! Covers workflow prompt slots, scene-type prompt defaults, avatar+scene
//! prompt overrides, prompt resolution preview, and prompt fragment CRUD with
//! scene-type pinning.

use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::prompt_resolution::{self, FragmentEntry, PromptSlotInput};
use x121_core::types::DbId;
use x121_db::models::avatar_scene_prompt_override::CreateAvatarScenePromptOverride;
use x121_db::models::group_prompt_override::CreateGroupPromptOverride;
use x121_db::models::project_prompt_override::CreateProjectPromptOverride;
use x121_db::models::prompt_fragment::{
    CreatePromptFragment, PromptFragmentListParams, UpdatePromptFragment,
};
use x121_db::models::scene_type_prompt_default::CreateSceneTypePromptDefault;
use x121_db::models::workflow_prompt_slot::UpdateWorkflowPromptSlot;
use x121_db::repositories::{
    AvatarScenePromptOverrideRepo, GroupPromptOverrideRepo, ProjectPromptOverrideRepo,
    PromptFragmentRepo, SceneTypePromptDefaultRepo, WorkflowPromptSlotRepo,
};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Body for upserting a scene-type prompt default on a single slot.
#[derive(Debug, Deserialize)]
pub struct UpsertPromptDefaultRequest {
    pub prompt_text: String,
}

/// Body for upserting avatar+scene prompt overrides (bulk).
#[derive(Debug, Deserialize)]
pub struct UpsertOverrideRequest {
    pub overrides: Vec<SlotOverride>,
}

/// A single slot override within [`UpsertOverrideRequest`].
#[derive(Debug, Deserialize)]
pub struct SlotOverride {
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
}

/// Body for the prompt resolution preview endpoint.
#[derive(Debug, Deserialize)]
pub struct ResolvePromptRequest {
    pub workflow_id: DbId,
    pub scene_type_id: DbId,
    pub avatar_id: DbId,
    pub slot_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub group_id: Option<DbId>,
}

/// Query parameters for listing prompt fragments.
#[derive(Debug, Deserialize)]
pub struct FragmentListParams {
    pub search: Option<String>,
    pub category: Option<String>,
    pub scene_type_id: Option<DbId>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Load a workflow prompt slot by ID or return 404.
async fn ensure_slot_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<x121_db::models::workflow_prompt_slot::WorkflowPromptSlot> {
    WorkflowPromptSlotRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WorkflowPromptSlot",
            id,
        }))
}

// ---------------------------------------------------------------------------
// Workflow Prompt Slots
// ---------------------------------------------------------------------------

/// GET /api/v1/workflows/{workflow_id}/prompt-slots
///
/// List all prompt slots for a workflow, ordered by `sort_order`.
pub async fn list_prompt_slots(
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::workflow_prompt_slot::WorkflowPromptSlot>>>> {
    let slots = WorkflowPromptSlotRepo::list_by_workflow(&state.pool, workflow_id).await?;
    Ok(Json(DataResponse { data: slots }))
}

/// PUT /api/v1/workflows/{workflow_id}/prompt-slots/{slot_id}
///
/// Update a prompt slot. Validates the slot belongs to the given workflow.
pub async fn update_prompt_slot(
    State(state): State<AppState>,
    Path((workflow_id, slot_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateWorkflowPromptSlot>,
) -> AppResult<Json<DataResponse<x121_db::models::workflow_prompt_slot::WorkflowPromptSlot>>> {
    // Verify the slot exists and belongs to the workflow.
    let existing = ensure_slot_exists(&state.pool, slot_id).await?;

    if existing.workflow_id != workflow_id {
        return Err(AppError::BadRequest(format!(
            "Prompt slot {slot_id} does not belong to workflow {workflow_id}"
        )));
    }

    let updated = WorkflowPromptSlotRepo::update(&state.pool, slot_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WorkflowPromptSlot",
            id: slot_id,
        }))?;

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// Scene-Type Prompt Defaults
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-types/{id}/prompt-defaults
///
/// List all prompt defaults for a scene type, ordered by slot ID.
pub async fn list_prompt_defaults(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
) -> AppResult<
    Json<DataResponse<Vec<x121_db::models::scene_type_prompt_default::SceneTypePromptDefault>>>,
> {
    let defaults =
        SceneTypePromptDefaultRepo::list_by_scene_type(&state.pool, scene_type_id).await?;
    Ok(Json(DataResponse { data: defaults }))
}

/// PUT /api/v1/scene-types/{id}/prompt-defaults/{slot_id}
///
/// Upsert a prompt default for a specific scene type / prompt slot pair.
pub async fn upsert_prompt_default(
    State(state): State<AppState>,
    Path((scene_type_id, slot_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpsertPromptDefaultRequest>,
) -> AppResult<Json<DataResponse<x121_db::models::scene_type_prompt_default::SceneTypePromptDefault>>>
{
    let input = CreateSceneTypePromptDefault {
        scene_type_id,
        prompt_slot_id: slot_id,
        prompt_text: body.prompt_text,
    };
    let result = SceneTypePromptDefaultRepo::upsert(&state.pool, &input).await?;
    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// Avatar+Scene Prompt Overrides
// ---------------------------------------------------------------------------

/// GET /api/v1/avatars/{avatar_id}/scenes/{scene_type_id}/prompt-overrides
///
/// List all prompt overrides for a avatar + scene type combination.
pub async fn get_avatar_scene_overrides(
    State(state): State<AppState>,
    Path((avatar_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<
    Json<
        DataResponse<
            Vec<x121_db::models::avatar_scene_prompt_override::AvatarScenePromptOverride>,
        >,
    >,
> {
    let overrides = AvatarScenePromptOverrideRepo::list_by_avatar_and_scene_type(
        &state.pool,
        avatar_id,
        scene_type_id,
    )
    .await?;
    Ok(Json(DataResponse { data: overrides }))
}

/// PUT /api/v1/avatars/{avatar_id}/scenes/{scene_type_id}/prompt-overrides
///
/// Upsert prompt overrides for a avatar + scene type. For each override,
/// also increments usage counters on referenced fragments.
pub async fn upsert_avatar_scene_overrides(
    State(state): State<AppState>,
    Path((avatar_id, scene_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpsertOverrideRequest>,
) -> AppResult<
    Json<
        DataResponse<
            Vec<x121_db::models::avatar_scene_prompt_override::AvatarScenePromptOverride>,
        >,
    >,
> {
    for slot_override in &body.overrides {
        let input = CreateAvatarScenePromptOverride {
            avatar_id,
            scene_type_id,
            prompt_slot_id: slot_override.prompt_slot_id,
            fragments: slot_override.fragments.clone(),
            override_text: slot_override.override_text.clone(),
            notes: slot_override.notes.clone(),
            created_by: None,
        };
        AvatarScenePromptOverrideRepo::upsert(&state.pool, &input).await?;

        // Increment usage for any fragment_ref entries.
        increment_fragment_refs(&state.pool, &slot_override.fragments).await?;
    }

    // Return the full set of overrides for the avatar+scene_type.
    let overrides = AvatarScenePromptOverrideRepo::list_by_avatar_and_scene_type(
        &state.pool,
        avatar_id,
        scene_type_id,
    )
    .await?;
    Ok(Json(DataResponse { data: overrides }))
}

/// Build both a fragment map and an override_text map from override rows.
fn extract_override_maps<'a>(
    rows: impl Iterator<Item = (i64, &'a serde_json::Value, &'a Option<String>)>,
) -> (HashMap<i64, Vec<FragmentEntry>>, HashMap<i64, String>) {
    let mut fragment_map: HashMap<i64, Vec<FragmentEntry>> = HashMap::new();
    let mut text_map: HashMap<i64, String> = HashMap::new();

    for (slot_id, fragments, override_text) in rows {
        let entries: Vec<FragmentEntry> =
            serde_json::from_value(fragments.clone()).unwrap_or_default();
        if !entries.is_empty() {
            fragment_map.insert(slot_id, entries);
        }
        if let Some(text) = override_text {
            if !text.is_empty() {
                text_map.insert(slot_id, text.clone());
            }
        }
    }

    (fragment_map, text_map)
}

/// Iterate over fragments JSONB and increment usage for `fragment_ref` entries.
async fn increment_fragment_refs(
    pool: &sqlx::PgPool,
    fragments: &serde_json::Value,
) -> AppResult<()> {
    if let Some(arr) = fragments.as_array() {
        for entry in arr {
            if entry.get("type").and_then(|t| t.as_str()) == Some("fragment_ref") {
                if let Some(frag_id) = entry.get("fragment_id").and_then(|v| v.as_i64()) {
                    PromptFragmentRepo::increment_usage(pool, frag_id).await?;
                }
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Project-Level Prompt Overrides
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/scenes/{scene_type_id}/prompt-overrides
///
/// List all prompt overrides for a project + scene type combination.
pub async fn get_project_prompt_overrides(
    State(state): State<AppState>,
    Path((project_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<
    Json<DataResponse<Vec<x121_db::models::project_prompt_override::ProjectPromptOverride>>>,
> {
    let overrides = ProjectPromptOverrideRepo::list_by_project_and_scene_type(
        &state.pool,
        project_id,
        scene_type_id,
    )
    .await?;
    Ok(Json(DataResponse { data: overrides }))
}

/// PUT /api/v1/projects/{project_id}/scenes/{scene_type_id}/prompt-overrides
///
/// Upsert prompt overrides for a project + scene type. For each override,
/// also increments usage counters on referenced fragments.
pub async fn upsert_project_prompt_overrides(
    State(state): State<AppState>,
    Path((project_id, scene_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpsertOverrideRequest>,
) -> AppResult<
    Json<DataResponse<Vec<x121_db::models::project_prompt_override::ProjectPromptOverride>>>,
> {
    for slot_override in &body.overrides {
        let input = CreateProjectPromptOverride {
            project_id,
            scene_type_id,
            prompt_slot_id: slot_override.prompt_slot_id,
            fragments: slot_override.fragments.clone(),
            override_text: slot_override.override_text.clone(),
            notes: slot_override.notes.clone(),
            created_by: None,
        };
        ProjectPromptOverrideRepo::upsert(&state.pool, &input).await?;

        // Increment usage for any fragment_ref entries.
        increment_fragment_refs(&state.pool, &slot_override.fragments).await?;
    }

    // Return the full set of overrides for the project+scene_type.
    let overrides = ProjectPromptOverrideRepo::list_by_project_and_scene_type(
        &state.pool,
        project_id,
        scene_type_id,
    )
    .await?;
    Ok(Json(DataResponse { data: overrides }))
}

// ---------------------------------------------------------------------------
// Group-Level Prompt Overrides
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/groups/{group_id}/scenes/{scene_type_id}/prompt-overrides
///
/// List all prompt overrides for a group + scene type combination.
pub async fn get_group_prompt_overrides(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::group_prompt_override::GroupPromptOverride>>>>
{
    let overrides =
        GroupPromptOverrideRepo::list_by_group_and_scene_type(&state.pool, group_id, scene_type_id)
            .await?;
    Ok(Json(DataResponse { data: overrides }))
}

/// PUT /api/v1/projects/{project_id}/groups/{group_id}/scenes/{scene_type_id}/prompt-overrides
///
/// Upsert prompt overrides for a group + scene type. For each override,
/// also increments usage counters on referenced fragments.
pub async fn upsert_group_prompt_overrides(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<UpsertOverrideRequest>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::group_prompt_override::GroupPromptOverride>>>>
{
    for slot_override in &body.overrides {
        let input = CreateGroupPromptOverride {
            group_id,
            scene_type_id,
            prompt_slot_id: slot_override.prompt_slot_id,
            fragments: slot_override.fragments.clone(),
            override_text: slot_override.override_text.clone(),
            notes: slot_override.notes.clone(),
            created_by: None,
        };
        GroupPromptOverrideRepo::upsert(&state.pool, &input).await?;

        // Increment usage for any fragment_ref entries.
        increment_fragment_refs(&state.pool, &slot_override.fragments).await?;
    }

    // Return the full set of overrides for the group+scene_type.
    let overrides =
        GroupPromptOverrideRepo::list_by_group_and_scene_type(&state.pool, group_id, scene_type_id)
            .await?;
    Ok(Json(DataResponse { data: overrides }))
}

// ---------------------------------------------------------------------------
// Prompt Resolution
// ---------------------------------------------------------------------------

/// POST /api/v1/prompts/resolve
///
/// Preview the resolved prompts for a given workflow + scene type + avatar.
/// Optionally filter to a single slot via `slot_id`.
pub async fn resolve_prompt_preview(
    State(state): State<AppState>,
    Json(body): Json<ResolvePromptRequest>,
) -> AppResult<Json<DataResponse<Vec<prompt_resolution::ResolvedPromptSlot>>>> {
    // 1. Get workflow prompt slots.
    let slots = WorkflowPromptSlotRepo::list_by_workflow(&state.pool, body.workflow_id).await?;

    if slots.is_empty() {
        return Err(AppError::BadRequest(format!(
            "No prompt slots found for workflow {}",
            body.workflow_id
        )));
    }

    // 2. Get scene-type defaults -> HashMap<slot_id, prompt_text>.
    let defaults =
        SceneTypePromptDefaultRepo::list_by_scene_type(&state.pool, body.scene_type_id).await?;
    let scene_type_defaults: HashMap<i64, String> = defaults
        .into_iter()
        .map(|d| (d.prompt_slot_id, d.prompt_text))
        .collect();

    // 3. Avatar metadata (empty for now -- avatar metadata system from another PRD).
    let avatar_metadata: HashMap<String, String> = HashMap::new();

    // 4. Project-level overrides -> fragment map + override_text map.
    let (project_fragment_overrides, project_override_texts) =
        if let Some(project_id) = body.project_id {
            let rows = ProjectPromptOverrideRepo::list_by_project_and_scene_type(
                &state.pool,
                project_id,
                body.scene_type_id,
            )
            .await?;
            extract_override_maps(
                rows.iter()
                    .map(|o| (o.prompt_slot_id, &o.fragments, &o.override_text)),
            )
        } else {
            (HashMap::new(), HashMap::new())
        };

    // 5. Group-level overrides -> fragment map + override_text map.
    let (group_fragment_overrides, group_override_texts) = if let Some(group_id) = body.group_id {
        let rows = GroupPromptOverrideRepo::list_by_group_and_scene_type(
            &state.pool,
            group_id,
            body.scene_type_id,
        )
        .await?;
        extract_override_maps(
            rows.iter()
                .map(|o| (o.prompt_slot_id, &o.fragments, &o.override_text)),
        )
    } else {
        (HashMap::new(), HashMap::new())
    };

    // 6. Avatar+scene overrides -> fragment map + override_text map.
    let char_rows = AvatarScenePromptOverrideRepo::list_by_avatar_and_scene_type(
        &state.pool,
        body.avatar_id,
        body.scene_type_id,
    )
    .await?;
    let (avatar_fragment_overrides, avatar_override_texts) = extract_override_maps(
        char_rows
            .iter()
            .map(|o| (o.prompt_slot_id, &o.fragments, &o.override_text)),
    );

    // 7. Convert slots to PromptSlotInput.
    let prompt_slot_inputs: Vec<PromptSlotInput> = slots
        .iter()
        .map(|s| PromptSlotInput {
            slot_id: s.id,
            node_id: s.node_id.clone(),
            input_name: s.input_name.clone(),
            slot_label: s.slot_label.clone(),
            slot_type: s.slot_type.clone(),
            default_text: s.default_text.clone(),
            is_user_editable: s.is_user_editable,
        })
        .collect();

    // 8. Resolve.
    let mut resolved = prompt_resolution::resolve_prompts_with_overrides(
        &prompt_slot_inputs,
        &scene_type_defaults,
        &avatar_metadata,
        &project_fragment_overrides,
        &group_fragment_overrides,
        &avatar_fragment_overrides,
        &project_override_texts,
        &group_override_texts,
        &avatar_override_texts,
        None,
    );

    // 7. Filter to a single slot if requested.
    if let Some(slot_id) = body.slot_id {
        resolved.retain(|r| r.slot_id == slot_id);
    }

    Ok(Json(DataResponse { data: resolved }))
}

// ---------------------------------------------------------------------------
// Prompt Fragments
// ---------------------------------------------------------------------------

/// GET /api/v1/prompt-fragments
///
/// List prompt fragments with optional search, category, and scene-type filters.
pub async fn list_fragments(
    State(state): State<AppState>,
    Query(params): Query<FragmentListParams>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::prompt_fragment::PromptFragment>>>> {
    let repo_params = PromptFragmentListParams {
        search: params.search,
        category: params.category,
        scene_type_id: params.scene_type_id,
    };
    let mut fragments = PromptFragmentRepo::list(&state.pool, &repo_params).await?;

    // Apply offset and limit in-memory (repo doesn't support pagination directly).
    let offset = params.offset.unwrap_or(0).max(0) as usize;
    if offset > 0 && offset < fragments.len() {
        fragments = fragments.split_off(offset);
    } else if offset >= fragments.len() {
        fragments.clear();
    }

    if let Some(limit) = params.limit {
        let limit = limit.max(0) as usize;
        fragments.truncate(limit);
    }

    Ok(Json(DataResponse { data: fragments }))
}

/// POST /api/v1/prompt-fragments
///
/// Create a new prompt fragment.
pub async fn create_fragment(
    State(state): State<AppState>,
    Json(input): Json<CreatePromptFragment>,
) -> AppResult<(
    StatusCode,
    Json<DataResponse<x121_db::models::prompt_fragment::PromptFragment>>,
)> {
    let fragment = PromptFragmentRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: fragment })))
}

/// PUT /api/v1/prompt-fragments/{id}
///
/// Update a prompt fragment by ID.
pub async fn update_fragment(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePromptFragment>,
) -> AppResult<Json<DataResponse<x121_db::models::prompt_fragment::PromptFragment>>> {
    let fragment = PromptFragmentRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PromptFragment",
            id,
        }))?;
    Ok(Json(DataResponse { data: fragment }))
}

/// DELETE /api/v1/prompt-fragments/{id}
///
/// Delete a prompt fragment by ID.
pub async fn delete_fragment(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = PromptFragmentRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "PromptFragment",
            id,
        }))
    }
}

/// POST /api/v1/prompt-fragments/{id}/pin/{scene_type_id}
///
/// Pin a fragment to a scene type. Idempotent.
pub async fn pin_fragment(
    State(state): State<AppState>,
    Path((id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    PromptFragmentRepo::pin_to_scene_type(&state.pool, id, scene_type_id).await?;
    Ok(StatusCode::OK)
}

/// DELETE /api/v1/prompt-fragments/{id}/pin/{scene_type_id}
///
/// Unpin a fragment from a scene type.
pub async fn unpin_fragment(
    State(state): State<AppState>,
    Path((id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    PromptFragmentRepo::unpin_from_scene_type(&state.pool, id, scene_type_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
