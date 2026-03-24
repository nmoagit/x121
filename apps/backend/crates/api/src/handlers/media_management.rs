//! Handlers for dynamic generation seeds and media management (PRD-146).
//!
//! Covers workflow media slots (auto-detected from ComfyUI workflows) and
//! avatar media assignments (linking avatars to specific media for each slot).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

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
            media_variant_id: input.media_variant_id,
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

/// One seed slot entry: a scene_type × track combination that needs a seed image.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SeedSlotEntry {
    pub scene_type_id: DbId,
    pub scene_type_name: String,
    pub track_id: DbId,
    pub track_name: String,
    pub workflow_id: Option<DbId>,
    pub workflow_name: Option<String>,
    /// The first media slot in the workflow (if any) — for node injection.
    pub media_slot_id: Option<DbId>,
    pub media_slot_label: Option<String>,
}

/// A seed slot with its current avatar assignment (if any).
#[derive(Debug, Serialize)]
pub struct SeedSlotWithAssignment {
    pub scene_type_id: DbId,
    pub scene_type_name: String,
    pub track_id: DbId,
    pub track_name: String,
    pub workflow_name: Option<String>,
    pub media_slot_id: Option<DbId>,
    pub assignment: Option<AvatarMediaAssignment>,
}

/// Aggregated seed summary for an avatar — every scene_type × track that needs a seed.
#[derive(Debug, Serialize)]
pub struct SeedSummary {
    pub slots: Vec<SeedSlotWithAssignment>,
}

/// GET /api/v1/avatars/{avatar_id}/seed-summary
///
/// Returns every scene_type × track combination for the avatar's pipeline,
/// paired with the avatar's current media assignment (if any).
pub async fn get_seed_summary(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<Json<DataResponse<SeedSummary>>> {
    // 1. Get all scene_type × track combos for the avatar's pipeline,
    //    with their workflow and first media slot.
    let entries: Vec<SeedSlotEntry> = sqlx::query_as(
        "SELECT
            st.id AS scene_type_id,
            st.name AS scene_type_name,
            t.id AS track_id,
            t.name AS track_name,
            sttc.workflow_id,
            w.name AS workflow_name,
            (SELECT wms.id FROM workflow_media_slots wms
             WHERE wms.workflow_id = sttc.workflow_id
             ORDER BY wms.sort_order, wms.id LIMIT 1) AS media_slot_id,
            (SELECT wms.slot_label FROM workflow_media_slots wms
             WHERE wms.workflow_id = sttc.workflow_id
             ORDER BY wms.sort_order, wms.id LIMIT 1) AS media_slot_label
         FROM scene_type_track_configs sttc
         JOIN scene_types st ON st.id = sttc.scene_type_id
         JOIN tracks t ON t.id = sttc.track_id
         JOIN avatars a ON a.id = $1
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN workflows w ON w.id = sttc.workflow_id
         WHERE (st.project_id = p.id OR (st.project_id IS NULL AND st.pipeline_id = p.pipeline_id))
         ORDER BY st.sort_order, st.name, t.sort_order, t.name",
    )
    .bind(avatar_id)
    .fetch_all(&state.pool)
    .await?;

    // 2. Get all avatar media assignments for this avatar.
    let assignments = AvatarMediaAssignmentRepo::list_by_avatar(&state.pool, avatar_id).await?;

    // 3. Build lookup: (media_slot_id, track_id) -> assignment.
    //    Also support assignments keyed by (media_slot_id, None) as avatar-level defaults.
    let mut assignment_map: std::collections::HashMap<(Option<DbId>, Option<DbId>), AvatarMediaAssignment> =
        std::collections::HashMap::new();
    for a in assignments {
        assignment_map.insert((Some(a.media_slot_id), a.track_id), a);
    }

    // 4. Build the result: one row per scene_type × track.
    let slots: Vec<SeedSlotWithAssignment> = entries
        .into_iter()
        .map(|e| {
            // Try to find assignment for this slot+track, then fallback to slot-only
            let assignment = e.media_slot_id.and_then(|slot_id| {
                assignment_map
                    .get(&(Some(slot_id), Some(e.track_id)))
                    .or_else(|| assignment_map.get(&(Some(slot_id), None)))
                    .cloned()
            });
            SeedSlotWithAssignment {
                scene_type_id: e.scene_type_id,
                scene_type_name: e.scene_type_name,
                track_id: e.track_id,
                track_name: e.track_name,
                workflow_name: e.workflow_name,
                media_slot_id: e.media_slot_id,
                assignment,
            }
        })
        .collect();

    Ok(Json(DataResponse {
        data: SeedSummary { slots },
    }))
}

// ---------------------------------------------------------------------------
// Backfill: discover media slots for existing workflows
// ---------------------------------------------------------------------------

/// POST /api/v1/workflows/backfill-media-slots
///
/// For all workflows that have JSON content but no media slots yet,
/// discover media-loading nodes and create `workflow_media_slots` rows.
/// Returns the count of workflows processed and slots created.
pub async fn backfill_media_slots(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<DataResponse<BackfillMediaSlotsResult>>> {
    use x121_core::workflow_import::discover_media_nodes;
    use x121_db::models::workflow_media_slot::CreateWorkflowMediaSlot;

    // Find workflows that have JSON content but no media slots.
    let workflows: Vec<(DbId, serde_json::Value)> = sqlx::query_as(
        "SELECT w.id, w.json_content \
         FROM workflows w \
         WHERE w.json_content IS NOT NULL \
           AND NOT EXISTS (SELECT 1 FROM workflow_media_slots wms WHERE wms.workflow_id = w.id)",
    )
    .fetch_all(&state.pool)
    .await?;

    let mut workflows_processed = 0i64;
    let mut slots_created = 0i64;

    for (workflow_id, json_content) in &workflows {
        let media_nodes = discover_media_nodes(json_content);
        if media_nodes.is_empty() {
            continue;
        }

        let slot_inputs: Vec<CreateWorkflowMediaSlot> = media_nodes
            .iter()
            .enumerate()
            .map(|(i, node)| CreateWorkflowMediaSlot {
                workflow_id: *workflow_id,
                node_id: node.node_id.clone(),
                input_name: node.input_name.clone(),
                class_type: Some(node.class_type.clone()),
                slot_label: node.auto_label.clone(),
                media_type: Some(node.media_type.clone()),
                is_required: Some(true),
                fallback_mode: None,
                fallback_value: None,
                sort_order: Some(i as i32),
                description: None,
                seed_slot_name: None,
            })
            .collect();

        let created = WorkflowMediaSlotRepo::bulk_create(&state.pool, &slot_inputs).await?;
        slots_created += created.len() as i64;
        workflows_processed += 1;
    }

    Ok(Json(DataResponse {
        data: BackfillMediaSlotsResult {
            workflows_processed,
            slots_created,
        },
    }))
}

#[derive(Debug, Serialize)]
pub struct BackfillMediaSlotsResult {
    pub workflows_processed: i64,
    pub slots_created: i64,
}

// ---------------------------------------------------------------------------
// Auto-Assign Seeds
// ---------------------------------------------------------------------------

/// Input for the auto-assign seeds action.
#[derive(Debug, Deserialize)]
pub struct AutoAssignInput {
    /// When `true`, no assignments are created — the response previews what would happen.
    #[serde(default)]
    pub dry_run: bool,
    /// When `true`, existing assignments are overwritten with the best match.
    #[serde(default)]
    pub overwrite_existing: bool,
}

/// A single slot that was auto-assigned.
#[derive(Debug, Serialize)]
pub struct AutoAssignedSlot {
    pub scene_type_name: String,
    pub track_name: String,
    pub media_variant_id: DbId,
    pub variant_label: String,
    pub file_path: String,
}

/// A single slot that was skipped during auto-assign.
#[derive(Debug, Serialize)]
pub struct SkippedSlot {
    pub scene_type_name: String,
    pub track_name: String,
    /// One of `"already_assigned"` or `"no_matching_variants"`.
    pub reason: String,
}

/// Summary of the auto-assign operation.
#[derive(Debug, Serialize)]
pub struct AutoAssignResult {
    pub assigned: Vec<AutoAssignedSlot>,
    pub skipped: Vec<SkippedSlot>,
    pub total_slots: i64,
    pub total_assigned: i64,
    pub total_skipped: i64,
}

/// Best-match variant returned by the per-slot lookup query.
#[derive(Debug, sqlx::FromRow)]
struct BestVariantMatch {
    id: DbId,
    variant_label: String,
    file_path: String,
}

/// POST /api/v1/avatars/{avatar_id}/actions/auto-assign-seeds
///
/// For each scene_type x track slot, find the best matching media variant
/// (by track affinity: variant_type matching track name, hero first, then
/// most recent approved). Creates avatar_media_assignments for unassigned slots.
pub async fn auto_assign_seeds(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(input): Json<AutoAssignInput>,
) -> AppResult<Json<DataResponse<AutoAssignResult>>> {
    // 1. Get all seed slots (scene_type x track combos) — same query as get_seed_summary.
    let entries: Vec<SeedSlotEntry> = sqlx::query_as(
        "SELECT
            st.id AS scene_type_id,
            st.name AS scene_type_name,
            t.id AS track_id,
            t.name AS track_name,
            sttc.workflow_id,
            w.name AS workflow_name,
            (SELECT wms.id FROM workflow_media_slots wms
             WHERE wms.workflow_id = sttc.workflow_id
             ORDER BY wms.sort_order, wms.id LIMIT 1) AS media_slot_id,
            (SELECT wms.slot_label FROM workflow_media_slots wms
             WHERE wms.workflow_id = sttc.workflow_id
             ORDER BY wms.sort_order, wms.id LIMIT 1) AS media_slot_label
         FROM scene_type_track_configs sttc
         JOIN scene_types st ON st.id = sttc.scene_type_id
         JOIN tracks t ON t.id = sttc.track_id
         JOIN avatars a ON a.id = $1
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN workflows w ON w.id = sttc.workflow_id
         WHERE (st.project_id = p.id OR (st.project_id IS NULL AND st.pipeline_id = p.pipeline_id))
         ORDER BY st.sort_order, st.name, t.sort_order, t.name",
    )
    .bind(avatar_id)
    .fetch_all(&state.pool)
    .await?;

    // 2. Get existing assignments for this avatar.
    let assignments = AvatarMediaAssignmentRepo::list_by_avatar(&state.pool, avatar_id).await?;

    // Build lookup: (media_slot_id, track_id) -> assignment.
    let mut assignment_map: std::collections::HashMap<(Option<DbId>, Option<DbId>), AvatarMediaAssignment> =
        std::collections::HashMap::new();
    for a in assignments {
        assignment_map.insert((Some(a.media_slot_id), a.track_id), a);
    }

    // 3. For each slot, find the best matching variant or skip.
    let mut assigned = Vec::new();
    let mut skipped = Vec::new();

    for entry in &entries {
        // Check if already assigned.
        let has_existing = entry.media_slot_id.is_some()
            && assignment_map.contains_key(&(entry.media_slot_id, Some(entry.track_id)));

        if has_existing && !input.overwrite_existing {
            skipped.push(SkippedSlot {
                scene_type_name: entry.scene_type_name.clone(),
                track_name: entry.track_name.clone(),
                reason: "already_assigned".to_string(),
            });
            continue;
        }

        // Find best variant: approved, matching variant_type to track name, hero first.
        let best: Option<BestVariantMatch> = sqlx::query_as(
            "SELECT id, variant_label, file_path
             FROM media_variants
             WHERE avatar_id = $1
               AND LOWER(variant_type) = LOWER($2)
               AND status_id = 2
               AND deleted_at IS NULL
             ORDER BY is_hero DESC, created_at DESC
             LIMIT 1",
        )
        .bind(avatar_id)
        .bind(&entry.track_name)
        .fetch_optional(&state.pool)
        .await?;

        let Some(variant) = best else {
            skipped.push(SkippedSlot {
                scene_type_name: entry.scene_type_name.clone(),
                track_name: entry.track_name.clone(),
                reason: "no_matching_variants".to_string(),
            });
            continue;
        };

        // Create or update assignment (unless dry_run).
        if !input.dry_run {
            if let Some(media_slot_id) = entry.media_slot_id {
                let create_input = CreateAvatarMediaAssignment {
                    avatar_id,
                    media_slot_id,
                    scene_type_id: Some(entry.scene_type_id),
                    track_id: Some(entry.track_id),
                    media_variant_id: Some(variant.id),
                    file_path: Some(variant.file_path.clone()),
                    media_type: Some("image".to_string()),
                    is_passthrough: Some(false),
                    passthrough_track_id: None,
                    notes: Some("Auto-assigned".to_string()),
                    created_by: None,
                };

                // If overwriting, check for existing and update; otherwise create.
                if has_existing {
                    if let Some(existing) = assignment_map.get(&(Some(media_slot_id), Some(entry.track_id))) {
                        let update = UpdateAvatarMediaAssignment {
                            scene_type_id: Some(entry.scene_type_id),
                            media_variant_id: Some(variant.id),
                            file_path: Some(variant.file_path.clone()),
                            media_type: Some("image".to_string()),
                            is_passthrough: Some(false),
                            passthrough_track_id: None,
                            notes: Some("Auto-assigned".to_string()),
                        };
                        AvatarMediaAssignmentRepo::update(&state.pool, existing.id, &update).await?;
                    }
                } else {
                    AvatarMediaAssignmentRepo::create(&state.pool, &create_input).await?;
                }
            }
        }

        assigned.push(AutoAssignedSlot {
            scene_type_name: entry.scene_type_name.clone(),
            track_name: entry.track_name.clone(),
            media_variant_id: variant.id,
            variant_label: variant.variant_label,
            file_path: variant.file_path,
        });
    }

    let total_slots = entries.len() as i64;
    let total_assigned = assigned.len() as i64;
    let total_skipped = skipped.len() as i64;

    Ok(Json(DataResponse {
        data: AutoAssignResult {
            assigned,
            skipped,
            total_slots,
            total_assigned,
            total_skipped,
        },
    }))
}
