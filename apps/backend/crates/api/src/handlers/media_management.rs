//! Handlers for dynamic generation seeds and media management (PRD-146).
//!
//! Covers workflow media slots (auto-detected from ComfyUI workflows) and
//! avatar media assignments (linking avatars to specific media for each slot).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::avatar_media_assignment::{
    AvatarMediaAssignment, CreateAvatarMediaAssignment, UpdateAvatarMediaAssignment,
};
use x121_db::models::workflow_media_slot::{UpdateWorkflowMediaSlot, WorkflowMediaSlot};
use x121_db::repositories::{AvatarMediaAssignmentRepo, WorkflowMediaSlotRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Load a workflow media slot by ID or return 404.
async fn ensure_media_slot_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<WorkflowMediaSlot> {
    WorkflowMediaSlotRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WorkflowMediaSlot",
            id,
        }))
}

/// Load an avatar media assignment by ID or return 404.
async fn ensure_assignment_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<AvatarMediaAssignment> {
    AvatarMediaAssignmentRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarMediaAssignment",
            id,
        }))
}

// ---------------------------------------------------------------------------
// Workflow Media Slots
// ---------------------------------------------------------------------------

/// GET /api/v1/workflows/{workflow_id}/media-slots
///
/// List all media slots for a workflow, ordered by `sort_order`.
pub async fn list_media_slots(
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<WorkflowMediaSlot>>>> {
    let slots = WorkflowMediaSlotRepo::list_by_workflow(&state.pool, workflow_id).await?;
    Ok(Json(DataResponse { data: slots }))
}

/// PUT /api/v1/workflows/{workflow_id}/media-slots/{slot_id}
///
/// Update a media slot. Validates the slot belongs to the given workflow.
pub async fn update_media_slot(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((workflow_id, slot_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateWorkflowMediaSlot>,
) -> AppResult<Json<DataResponse<WorkflowMediaSlot>>> {
    let existing = ensure_media_slot_exists(&state.pool, slot_id).await?;

    if existing.workflow_id != workflow_id {
        return Err(AppError::BadRequest(format!(
            "Media slot {slot_id} does not belong to workflow {workflow_id}"
        )));
    }

    let updated = WorkflowMediaSlotRepo::update(&state.pool, slot_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WorkflowMediaSlot",
            id: slot_id,
        }))?;

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// Avatar Media Assignments
// ---------------------------------------------------------------------------

/// GET /api/v1/avatars/{avatar_id}/media-assignments
///
/// List all media assignments for an avatar, ordered by creation time.
pub async fn list_avatar_media_assignments(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<AvatarMediaAssignment>>>> {
    let assignments = AvatarMediaAssignmentRepo::list_by_avatar(&state.pool, avatar_id).await?;
    Ok(Json(DataResponse { data: assignments }))
}

/// POST /api/v1/avatars/{avatar_id}/media-assignments
///
/// Upsert a media assignment for an avatar. If an assignment already exists
/// for the same (avatar, media_slot, scene_type), it is updated in place.
pub async fn upsert_avatar_media_assignment(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(avatar_id): Path<DbId>,
    Json(mut input): Json<CreateAvatarMediaAssignment>,
) -> AppResult<(StatusCode, Json<DataResponse<AvatarMediaAssignment>>)> {
    // Ensure the avatar_id in the path matches the body.
    input.avatar_id = avatar_id;

    // Check if an assignment already exists for this (avatar, slot, scene_type).
    let existing = AvatarMediaAssignmentRepo::find_by_avatar_and_slot(
        &state.pool,
        avatar_id,
        input.media_slot_id,
        input.scene_type_id,
    )
    .await?;

    if let Some(existing_row) = existing {
        // Update the existing assignment.
        let update = UpdateAvatarMediaAssignment {
            scene_type_id: input.scene_type_id,
            image_variant_id: input.image_variant_id,
            file_path: input.file_path,
            media_type: input.media_type,
            is_passthrough: input.is_passthrough,
            passthrough_track_id: input.passthrough_track_id,
            notes: input.notes,
        };
        let updated = AvatarMediaAssignmentRepo::update(&state.pool, existing_row.id, &update)
            .await?
            .ok_or(AppError::Core(CoreError::NotFound {
                entity: "AvatarMediaAssignment",
                id: existing_row.id,
            }))?;
        Ok((StatusCode::OK, Json(DataResponse { data: updated })))
    } else {
        // Create a new assignment.
        let created = AvatarMediaAssignmentRepo::create(&state.pool, &input).await?;
        Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
    }
}

/// PUT /api/v1/avatars/{avatar_id}/media-assignments/{assignment_id}
///
/// Update an existing media assignment. Validates the assignment belongs
/// to the given avatar.
pub async fn update_avatar_media_assignment(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((avatar_id, assignment_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateAvatarMediaAssignment>,
) -> AppResult<Json<DataResponse<AvatarMediaAssignment>>> {
    let existing = ensure_assignment_exists(&state.pool, assignment_id).await?;

    if existing.avatar_id != avatar_id {
        return Err(AppError::BadRequest(format!(
            "Assignment {assignment_id} does not belong to avatar {avatar_id}"
        )));
    }

    let updated = AvatarMediaAssignmentRepo::update(&state.pool, assignment_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarMediaAssignment",
            id: assignment_id,
        }))?;

    Ok(Json(DataResponse { data: updated }))
}

/// DELETE /api/v1/avatars/{avatar_id}/media-assignments/{assignment_id}
///
/// Delete a media assignment. Validates the assignment belongs to the
/// given avatar.
pub async fn delete_avatar_media_assignment(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((avatar_id, assignment_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let existing = ensure_assignment_exists(&state.pool, assignment_id).await?;

    if existing.avatar_id != avatar_id {
        return Err(AppError::BadRequest(format!(
            "Assignment {assignment_id} does not belong to avatar {avatar_id}"
        )));
    }

    let deleted = AvatarMediaAssignmentRepo::delete(&state.pool, assignment_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarMediaAssignment",
            id: assignment_id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Seed Summary
// ---------------------------------------------------------------------------

/// A media slot with its current avatar assignment (if any).
#[derive(Debug, Serialize)]
pub struct SlotWithAssignment {
    pub slot: WorkflowMediaSlot,
    pub assignment: Option<AvatarMediaAssignment>,
}

/// Aggregated seed summary for an avatar across all relevant workflows.
#[derive(Debug, Serialize)]
pub struct SeedSummary {
    /// All media slots from workflows linked to the avatar's scene types,
    /// paired with the avatar's assignment (if any).
    pub slots: Vec<SlotWithAssignment>,
}

/// GET /api/v1/avatars/{avatar_id}/seed-summary
///
/// Returns an aggregated view of all media slots from workflows linked
/// to the avatar's scene types, paired with the avatar's current
/// media assignments.
pub async fn get_seed_summary(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<Json<DataResponse<SeedSummary>>> {
    // 1. Get all workflow media slots for workflows linked to the avatar's
    //    project -> scene types (via scene_types.workflow_id) and track-level
    //    overrides (via scene_type_track_configs.workflow_id).
    let slots: Vec<WorkflowMediaSlot> = sqlx::query_as::<_, WorkflowMediaSlot>(
        "SELECT DISTINCT ON (wms.id)
            wms.id, wms.workflow_id, wms.node_id, wms.input_name, wms.class_type,
            wms.slot_label, wms.media_type, wms.is_required, wms.fallback_mode,
            wms.fallback_value, wms.sort_order, wms.description, wms.seed_slot_name,
            wms.created_at, wms.updated_at
         FROM workflow_media_slots wms
         WHERE wms.workflow_id IN (
             -- Workflows assigned directly to scene types in the avatar's project
             SELECT st.workflow_id
             FROM scene_types st
             JOIN avatars a ON a.project_id = st.project_id
             WHERE a.id = $1 AND st.workflow_id IS NOT NULL
             UNION
             -- Workflows from per-track overrides
             SELECT sttc.workflow_id
             FROM scene_type_track_configs sttc
             JOIN scene_types st ON st.id = sttc.scene_type_id
             JOIN avatars a ON a.project_id = st.project_id
             WHERE a.id = $1 AND sttc.workflow_id IS NOT NULL
         )
         ORDER BY wms.id",
    )
    .bind(avatar_id)
    .fetch_all(&state.pool)
    .await?;

    // 2. Get all avatar media assignments for this avatar.
    let assignments = AvatarMediaAssignmentRepo::list_by_avatar(&state.pool, avatar_id).await?;

    // 3. Build a map of media_slot_id -> assignment for quick lookup.
    let assignment_map: std::collections::HashMap<DbId, AvatarMediaAssignment> = assignments
        .into_iter()
        .map(|a| (a.media_slot_id, a))
        .collect();

    // 4. Pair each slot with its assignment.
    let paired: Vec<SlotWithAssignment> = slots
        .into_iter()
        .map(|slot| {
            let assignment = assignment_map.get(&slot.id).cloned();
            SlotWithAssignment { slot, assignment }
        })
        .collect();

    Ok(Json(DataResponse {
        data: SeedSummary { slots: paired },
    }))
}
