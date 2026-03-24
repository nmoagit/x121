//! Handlers for the recursive video generation loop (PRD-24).
//!
//! Routes:
//! - `POST  /scenes/{id}/generate`             — start generation
//! - `GET   /scenes/{id}/progress`             — get generation progress
//! - `POST  /scenes/batch-generate`            — batch start generation
//! - `POST  /segments/{id}/select-boundary-frame` — manual boundary frame selection

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::generation;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_core::video_settings::{self, VideoSettingsLayer};
use x121_db::models::generation::{
    BatchGenerateError, BatchGenerateRequest, BatchGenerateResponse, GenerationProgress,
    SelectBoundaryFrameRequest, SelectBoundaryFrameResponse, StartGenerationRequest,
    StartGenerationResponse, UpdateSceneGeneration, UpdateSegmentGeneration,
};
use x121_db::models::status::SceneStatus;
use x121_db::models::status::StatusId;
use x121_db::repositories::{
    AvatarRepo, MediaVariantRepo, SceneGenerationLogRepo, SceneRepo, SceneTypeRepo,
    SceneVideoVersionRepo, SegmentRepo, TrackRepo, VideoSettingsRepo,
};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Determine the correct status to restore a scene to after cancellation/failure.
///
/// If the scene has existing video versions → Generated (3).
/// Otherwise → Pending (1).
pub(crate) async fn resolve_restore_status(pool: &sqlx::PgPool, scene_id: DbId) -> StatusId {
    let has_videos = SceneVideoVersionRepo::list_by_scene(pool, scene_id)
        .await
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    if has_videos {
        SceneStatus::Generated.id()
    } else {
        SceneStatus::Pending.id()
    }
}

/// POST /api/v1/scenes/{id}/generate
///
/// Validates preconditions (seed image, target duration) and initialises
/// the scene for generation by setting `generation_started_at` and
/// `total_segments_estimated`.
pub async fn start_generation(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    Json(input): Json<StartGenerationRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate boundary mode if provided.
    if let Some(ref mode) = input.boundary_mode {
        generation::validate_boundary_mode(mode).map_err(AppError::Core)?;
    }

    // Clear old logs and segments from any previous generation run.
    let _ = SceneGenerationLogRepo::delete_for_scene(&state.pool, scene_id).await;
    let _ = SegmentRepo::delete_for_scene(&state.pool, scene_id).await;

    let (estimated, boundary_mode) =
        init_scene_generation(&state, scene_id, input.boundary_mode).await?;

    x121_pipeline::gen_log::log(&state.pool, scene_id, "info", "Starting video generation").await;
    x121_pipeline::gen_log::log(
        &state.pool,
        scene_id,
        "info",
        format!("Generation started \u{2014} {estimated} segments estimated"),
    )
    .await;

    // Submit the first segment (index 0) to ComfyUI in the background.
    // The worker's event loop will handle completions and drive the loop.
    submit_first_segment(&state, scene_id);

    Ok(Json(DataResponse {
        data: StartGenerationResponse {
            scene_id,
            status: "generating".to_string(),
            total_segments_estimated: estimated,
            boundary_mode,
        },
    }))
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Load a scene and its scene type, validate preconditions, estimate segments,
/// and mark the scene as generating. Returns `(estimated_segments, boundary_mode)`.
///
/// Extracted to avoid duplicating this logic between `start_generation` and
/// `batch_generate`.
pub(crate) async fn init_scene_generation(
    state: &AppState,
    scene_id: DbId,
    boundary_mode: Option<String>,
) -> AppResult<(u32, String)> {
    let scene = SceneRepo::find_by_id(&state.pool, scene_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id: scene_id,
        }))?;

    let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene.scene_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id: scene.scene_type_id,
        }))?;

    // Resolve video settings through the 4-level hierarchy.
    let scene_type_layer = VideoSettingsLayer {
        target_duration_secs: scene_type.target_duration_secs,
        target_fps: scene_type.target_fps,
        target_resolution: scene_type.target_resolution.clone(),
    };

    let avatar = AvatarRepo::find_by_id(&state.pool, scene.avatar_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id: scene.avatar_id,
        }))?;

    let (project_layer, group_layer, char_layer) = VideoSettingsRepo::load_hierarchy_layers(
        &state.pool,
        avatar.project_id,
        avatar.group_id,
        scene.avatar_id,
        scene.scene_type_id,
    )
    .await?;

    let is_idle = scene_type.name.to_lowercase() == "idle";
    let resolved = video_settings::resolve_video_settings(
        &scene_type_layer,
        project_layer.as_ref(),
        group_layer.as_ref(),
        char_layer.as_ref(),
        is_idle,
    );

    let target_duration = Some(resolved.duration_secs as f64);

    // Auto-resolve seed image variant if not set.
    let has_seed = if scene.media_variant_id.is_some() {
        true
    } else {
        // Determine variant type from the scene's track (e.g. "clothed", "topless").
        let variant_type = if let Some(track_id) = scene.track_id {
            TrackRepo::find_by_id(&state.pool, track_id)
                .await?
                .map(|t| t.slug)
        } else {
            None
        };

        if let Some(ref vt) = variant_type {
            if let Some(variant) =
                MediaVariantRepo::find_hero(&state.pool, scene.avatar_id, vt).await?
            {
                // Assign the resolved variant to the scene.
                SceneRepo::update_media_variant(&state.pool, scene_id, variant.id).await?;
                tracing::info!(scene_id, variant_id = variant.id, variant_type = %vt, "Auto-assigned seed image variant");
                true
            } else {
                false
            }
        } else {
            false
        }
    };

    // A seed variant must be set for AI generation.
    generation::validate_generation_start(has_seed, target_duration).map_err(AppError::Core)?;

    let estimated = generation::estimate_segments(
        target_duration.unwrap_or(generation::DEFAULT_SEGMENT_DURATION_SECS),
        generation::DEFAULT_SEGMENT_DURATION_SECS,
    );

    let update = UpdateSceneGeneration {
        status_id: Some(SceneStatus::Generating.id()),
        total_segments_estimated: Some(estimated as i32),
        total_segments_completed: Some(0),
        actual_duration_secs: None,
        transition_segment_index: None,
        generation_started_at: Some(chrono::Utc::now()),
        generation_completed_at: None,
    };
    SceneRepo::update_generation_state(&state.pool, scene_id, &update).await?;

    let mode = boundary_mode.unwrap_or_else(|| generation::BOUNDARY_AUTO.to_string());
    Ok((estimated, mode))
}

use x121_core::generation::SYSTEM_USER_ID;

/// Spawn a background task to submit segment 0 to ComfyUI.
///
/// Fire-and-forget: the API returns immediately while the submission
/// happens asynchronously. Errors are logged but don't fail the response.
pub(crate) fn submit_first_segment(state: &AppState, scene_id: DbId) {
    let pool = state.pool.clone();
    let comfyui = state.comfyui_manager.clone();
    let storage = state.storage.clone();
    tokio::spawn(async move {
        let storage = storage.read().await.clone();

        x121_pipeline::gen_log::log(
            &pool,
            scene_id,
            "info",
            "Submitting first segment to ComfyUI...",
        )
        .await;

        match x121_pipeline::submitter::submit_segment(
            &pool,
            &comfyui,
            &storage,
            scene_id,
            0, // segment index 0
            SYSTEM_USER_ID,
        )
        .await
        {
            Ok(result) => {
                tracing::info!(
                    scene_id,
                    segment_id = result.segment_id,
                    job_id = result.job_id,
                    prompt_id = %result.prompt_id,
                    "First segment submitted to ComfyUI",
                );
            }
            Err(x121_pipeline::PipelineError::NoInstances) => {
                // No instances available — keep scene in Generating state.
                // The job stays Pending and the worker dispatcher will pick it
                // up once an instance comes online.
                tracing::warn!(
                    scene_id,
                    "No ComfyUI instances available — job queued for deferred dispatch",
                );
                x121_pipeline::gen_log::log(
                    &pool,
                    scene_id,
                    "warn",
                    "No ComfyUI instances available — requesting instance startup. \
                     Generation will begin automatically once an instance is ready.",
                )
                .await;
            }
            Err(e) => {
                tracing::error!(
                    scene_id,
                    error = %e,
                    "Failed to submit first segment to ComfyUI",
                );
                // Write error to the generation log so the user can see it in the UI.
                x121_pipeline::gen_log::log(
                    &pool,
                    scene_id,
                    "error",
                    format!("Failed to submit segment: {e}"),
                )
                .await;

                // Revert scene to its appropriate prior status.
                let restore_status = resolve_restore_status(&pool, scene_id).await;
                let update = UpdateSceneGeneration::reset_to(restore_status);
                let _ = SceneRepo::update_generation_state(&pool, scene_id, &update).await;

                let status_label = if restore_status == SceneStatus::Generated.id() {
                    "generated"
                } else {
                    "pending"
                };
                x121_pipeline::gen_log::log(
                    &pool,
                    scene_id,
                    "warn",
                    format!("Scene reverted to {status_label} — fix the issue and retry"),
                )
                .await;
            }
        }
    });
}

/// GET /api/v1/scenes/{id}/progress
///
/// Returns a snapshot of the current generation progress for a scene.
pub async fn get_progress(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let scene = SceneRepo::find_by_id(&state.pool, scene_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id: scene_id,
        }))?;

    // Load scene type for target duration.
    let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene.scene_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id: scene.scene_type_id,
        }))?;

    // Get last completed segment to determine cumulative duration.
    let last_seg = SegmentRepo::get_last_completed(&state.pool, scene_id).await?;
    let cumulative_duration = last_seg
        .as_ref()
        .and_then(|s| s.cumulative_duration_secs)
        .unwrap_or(0.0);

    // Compute elapsed time.
    let elapsed_secs = scene
        .generation_started_at
        .map(|started| {
            let now = chrono::Utc::now();
            (now - started).num_milliseconds() as f64 / 1000.0
        })
        .unwrap_or(0.0);

    let target_duration = scene_type.target_duration_secs.map(|d| d as f64);

    // Estimate remaining time based on velocity.
    let estimated_remaining = if scene.total_segments_completed > 0 && elapsed_secs > 0.0 {
        let velocity = elapsed_secs / scene.total_segments_completed as f64;
        let remaining_segments =
            scene.total_segments_estimated.unwrap_or(0) - scene.total_segments_completed;
        if remaining_segments > 0 {
            Some(velocity * remaining_segments as f64)
        } else {
            Some(0.0)
        }
    } else {
        None
    };

    Ok(Json(DataResponse {
        data: GenerationProgress {
            scene_id,
            segments_completed: scene.total_segments_completed,
            segments_estimated: scene.total_segments_estimated,
            cumulative_duration,
            target_duration,
            elapsed_secs,
            estimated_remaining_secs: estimated_remaining,
        },
    }))
}

/// POST /api/v1/segments/{id}/select-boundary-frame
///
/// Allows the user to manually select a boundary frame for a segment.
pub async fn select_boundary_frame(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<SelectBoundaryFrameRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify segment exists.
    let segment = SegmentRepo::find_by_id(&state.pool, segment_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Segment",
            id: segment_id,
        }))?;

    let update = UpdateSegmentGeneration {
        boundary_frame_index: Some(input.frame_index),
        boundary_selection_mode: Some(generation::BOUNDARY_MANUAL.to_string()),
        ..Default::default()
    };

    SegmentRepo::update_generation_state(&state.pool, segment_id, &update).await?;

    Ok(Json(DataResponse {
        data: SelectBoundaryFrameResponse {
            segment_id: segment.id,
            boundary_frame_index: input.frame_index,
            boundary_selection_mode: "manual".to_string(),
        },
    }))
}

/// POST /api/v1/scenes/batch-generate
///
/// Start generation for multiple scenes in parallel.
pub async fn batch_generate(
    State(state): State<AppState>,
    Json(input): Json<BatchGenerateRequest>,
) -> AppResult<impl IntoResponse> {
    if input.scene_ids.is_empty() {
        return Err(AppError::BadRequest(
            "scene_ids must not be empty".to_string(),
        ));
    }

    let mut started = Vec::new();
    let mut errors = Vec::new();

    for &scene_id in &input.scene_ids {
        // Clear old logs and segments before starting.
        let _ = SceneGenerationLogRepo::delete_for_scene(&state.pool, scene_id).await;
        let _ = SegmentRepo::delete_for_scene(&state.pool, scene_id).await;

        match init_scene_generation(&state, scene_id, None).await {
            Ok((_estimated, _)) => {
                x121_pipeline::gen_log::log(
                    &state.pool,
                    scene_id,
                    "info",
                    "Starting video generation",
                )
                .await;
                x121_pipeline::gen_log::log(
                    &state.pool,
                    scene_id,
                    "info",
                    format!("Generation started \u{2014} {_estimated} segments estimated"),
                )
                .await;
                submit_first_segment(&state, scene_id);
                started.push(scene_id);
            }
            Err(e) => {
                errors.push(BatchGenerateError {
                    scene_id,
                    error: e.to_string(),
                });
            }
        }
    }

    Ok(Json(DataResponse {
        data: BatchGenerateResponse { started, errors },
    }))
}

// ---------------------------------------------------------------------------
// Cancel generation
// ---------------------------------------------------------------------------

/// POST /api/v1/scenes/{id}/cancel-generation
///
/// Cancels an in-progress generation: reverts the scene to `Pending`,
/// cancels any active jobs, and logs the cancellation.
/// Also handles stale scenes stuck in `Generating` with no active jobs.
pub async fn cancel_generation(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    use x121_db::models::status::JobStatus;
    use x121_db::repositories::JobRepo;

    let scene = SceneRepo::find_by_id(&state.pool, scene_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id: scene_id,
        }))?;

    if scene.status_id != SceneStatus::Generating.id() {
        return Err(AppError::BadRequest(
            "Scene is not currently generating".to_string(),
        ));
    }

    // Cancel any pending/running jobs for this scene.
    // Scan recent non-terminal jobs whose parameters reference this scene.
    let jobs = JobRepo::list_all(
        &state.pool,
        &x121_db::models::job::JobListQuery {
            status_id: None,
            limit: Some(100),
            offset: None,
        },
    )
    .await?;

    let mut cancelled_jobs = 0u32;
    for job in jobs {
        // Skip terminal jobs.
        if job.status_id == JobStatus::Completed.id()
            || job.status_id == JobStatus::Failed.id()
            || job.status_id == JobStatus::Cancelled.id()
        {
            continue;
        }

        if let Ok(params) = serde_json::from_value::<x121_db::models::generation::SegmentJobParams>(
            job.parameters.clone(),
        ) {
            if params.scene_id == scene_id {
                let _ = JobRepo::cancel(&state.pool, job.id).await;
                // Also send cancel signal to ComfyUI if running.
                if job.worker_id.is_some() {
                    let _ = state.comfyui_manager.cancel_job(job.id).await;
                }
                cancelled_jobs += 1;
            }
        }
    }

    // Revert scene to its appropriate prior status (Generated if has videos, else Pending).
    let restore_status = resolve_restore_status(&state.pool, scene_id).await;
    let update = UpdateSceneGeneration::reset_to(restore_status);
    SceneRepo::update_generation_state(&state.pool, scene_id, &update).await?;

    let restore_label = if restore_status == SceneStatus::Generated.id() {
        "generated"
    } else {
        "pending"
    };

    x121_pipeline::gen_log::log(
        &state.pool,
        scene_id,
        "warn",
        format!("Generation cancelled — {cancelled_jobs} job(s) cancelled, scene reverted to {restore_label}"),
    )
    .await;

    Ok(Json(DataResponse {
        data: serde_json::json!({
            "scene_id": scene_id,
            "status": restore_label,
            "cancelled_jobs": cancelled_jobs,
        }),
    }))
}

// ---------------------------------------------------------------------------
// Generation log
// ---------------------------------------------------------------------------

/// GET /api/v1/scenes/{id}/generation-log
///
/// Returns terminal-style log entries produced during video generation.
pub async fn get_generation_log(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    Query(params): Query<crate::query::PaginationParams>,
) -> AppResult<impl IntoResponse> {
    // Verify scene exists.
    let _scene = SceneRepo::find_by_id(&state.pool, scene_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id: scene_id,
        }))?;

    let limit = clamp_limit(params.limit, 100, 500);
    let offset = clamp_offset(params.offset);
    let logs = SceneGenerationLogRepo::list_for_scene(&state.pool, scene_id, limit, offset).await?;

    Ok(Json(DataResponse { data: logs }))
}

/// GET /api/v1/generation-logs
///
/// Returns the most recent generation log entries across all scenes.
/// Used by the activity console for a global view of generation activity.
pub async fn list_all_generation_logs(
    State(state): State<AppState>,
    Query(params): Query<crate::query::PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 200, 500);
    let offset = clamp_offset(params.offset);
    let logs = SceneGenerationLogRepo::list_recent(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: logs }))
}

/// DELETE /api/v1/scenes/{id}/generation-log
///
/// Clears all generation log entries for a scene.
pub async fn clear_generation_log(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let _ = SceneGenerationLogRepo::delete_for_scene(&state.pool, scene_id).await;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Batch scene details (PRD-134)
// ---------------------------------------------------------------------------

/// Maximum number of scene IDs allowed in a single batch-details request.
const MAX_BATCH_SCENE_IDS: usize = 200;

/// Request body for `POST /scenes/batch-details`.
#[derive(Debug, serde::Deserialize)]
pub struct BatchSceneDetailsRequest {
    pub scene_ids: Vec<DbId>,
}

/// POST /api/v1/scenes/batch-details
///
/// Returns enriched scene details for a list of scene IDs.
/// Used by the queue manager to display scheduled generation targets.
pub async fn batch_scene_details(
    State(state): State<AppState>,
    Json(input): Json<BatchSceneDetailsRequest>,
) -> AppResult<impl IntoResponse> {
    if input.scene_ids.is_empty() {
        return Err(AppError::BadRequest(
            "scene_ids must not be empty".to_string(),
        ));
    }
    if input.scene_ids.len() > MAX_BATCH_SCENE_IDS {
        return Err(AppError::BadRequest(format!(
            "scene_ids must contain at most {MAX_BATCH_SCENE_IDS} entries, got {}",
            input.scene_ids.len()
        )));
    }

    let details = SceneRepo::batch_details(&state.pool, &input.scene_ids).await?;

    Ok(Json(DataResponse { data: details }))
}

// ---------------------------------------------------------------------------
// Deferred/Scheduled generation (PRD-134)
// ---------------------------------------------------------------------------

/// Request body for `POST /scenes/schedule-generation`.
#[derive(Debug, serde::Deserialize)]
pub struct ScheduleGenerationRequest {
    pub scene_ids: Vec<DbId>,
    pub scheduled_at: chrono::DateTime<chrono::Utc>,
}

/// Response body for a successful schedule-generation request.
#[derive(Debug, serde::Serialize)]
pub struct ScheduleGenerationResponse {
    pub schedule_id: DbId,
    pub scenes_scheduled: usize,
}

/// POST /api/v1/scenes/schedule-generation
///
/// Create a one-time schedule entry that will trigger batch generation
/// at the specified time. Sets scene statuses to "Scheduled" (PRD-134).
pub async fn schedule_generation(
    auth: crate::middleware::auth::AuthUser,
    State(state): State<AppState>,
    Json(input): Json<ScheduleGenerationRequest>,
) -> AppResult<impl IntoResponse> {
    use x121_core::job_scheduling::{ACTION_SCHEDULE_GENERATION, SCHEDULE_ONE_TIME};
    use x121_db::models::job_scheduling::CreateSchedule;
    use x121_db::repositories::ScheduleRepo;

    if input.scene_ids.is_empty() {
        return Err(AppError::BadRequest("scene_ids must not be empty".into()));
    }

    // Validate scheduled_at is in the future.
    let now = chrono::Utc::now();
    if input.scheduled_at <= now {
        return Err(AppError::BadRequest(
            "scheduled_at must be in the future".into(),
        ));
    }

    // Validate all scenes exist and meet generation preconditions.
    let mut valid_ids = Vec::new();
    let mut errors = Vec::new();
    for &scene_id in &input.scene_ids {
        match validate_scene_for_generation(&state, scene_id).await {
            Ok(()) => valid_ids.push(scene_id),
            Err(e) => errors.push(format!("scene {scene_id}: {e}")),
        }
    }

    if valid_ids.is_empty() {
        return Err(AppError::BadRequest(format!(
            "No scenes are eligible for scheduling: {}",
            errors.join("; ")
        )));
    }

    // Remove already-scheduled scenes from their existing schedules so they
    // can be moved to the new time slot without duplication.
    {
        use x121_db::models::job_scheduling::UpdateSchedule;

        let active_schedules = ScheduleRepo::list_filtered(
            &state.pool,
            Some(auth.user_id),
            None,       // any schedule_type
            Some(true), // active only
            200,
            0,
        )
        .await?;

        for schedule in active_schedules {
            if schedule.action_type != ACTION_SCHEDULE_GENERATION {
                continue;
            }
            let current_ids: Vec<DbId> = schedule
                .action_config
                .get("scene_ids")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            let overlap: Vec<DbId> = current_ids
                .iter()
                .copied()
                .filter(|id| valid_ids.contains(id))
                .collect();

            if overlap.is_empty() {
                continue;
            }

            let remaining: Vec<DbId> = current_ids
                .into_iter()
                .filter(|id| !overlap.contains(id))
                .collect();

            if remaining.is_empty() {
                // All scenes moved away — deactivate the old schedule.
                let _ = ScheduleRepo::set_active(&state.pool, schedule.id, false).await;
            } else {
                // Update with trimmed list.
                let new_config = serde_json::json!({ "scene_ids": remaining });
                let update = UpdateSchedule {
                    name: Some(format!("Generate {} scene(s)", remaining.len())),
                    description: None,
                    schedule_type: None,
                    cron_expression: None,
                    scheduled_at: None,
                    timezone: None,
                    is_off_peak_only: None,
                    action_type: None,
                    action_config: Some(new_config),
                };
                let _ = ScheduleRepo::update(&state.pool, schedule.id, &update).await;
            }
        }
    }

    // Create schedule entry.
    let action_config = serde_json::json!({ "scene_ids": valid_ids });
    let create = CreateSchedule {
        name: format!("Generate {} scene(s)", valid_ids.len()),
        description: None,
        schedule_type: SCHEDULE_ONE_TIME.to_string(),
        cron_expression: None,
        scheduled_at: Some(input.scheduled_at),
        timezone: "UTC".to_string(),
        is_off_peak_only: false,
        action_type: ACTION_SCHEDULE_GENERATION.to_string(),
        action_config,
    };

    let schedule = ScheduleRepo::create(&state.pool, auth.user_id, &create).await?;
    ScheduleRepo::set_next_run(&state.pool, schedule.id, Some(input.scheduled_at)).await?;

    // Set each valid scene to Scheduled status.
    for &scene_id in &valid_ids {
        let update = UpdateSceneGeneration::reset_to(SceneStatus::Scheduled.id());
        let _ = SceneRepo::update_generation_state(&state.pool, scene_id, &update).await;
    }

    Ok(Json(DataResponse {
        data: ScheduleGenerationResponse {
            schedule_id: schedule.id,
            scenes_scheduled: valid_ids.len(),
        },
    }))
}

/// Check whether a scene meets the preconditions for generation.
///
/// Returns `Ok(())` if valid, or an error string describing the issue.
async fn validate_scene_for_generation(state: &AppState, scene_id: DbId) -> Result<(), String> {
    let scene = SceneRepo::find_by_id(&state.pool, scene_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("scene {scene_id} not found"))?;

    let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene.scene_type_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "scene type not found".to_string())?;

    // Check seed image exists or can be auto-resolved.
    let has_seed = scene.media_variant_id.is_some() || {
        // Check if a hero variant exists for auto-assignment.
        if let Some(track_id) = scene.track_id {
            let track = TrackRepo::find_by_id(&state.pool, track_id)
                .await
                .map_err(|e| e.to_string())?;
            if let Some(track) = track {
                MediaVariantRepo::find_hero(&state.pool, scene.avatar_id, &track.slug)
                    .await
                    .map_err(|e| e.to_string())?
                    .is_some()
            } else {
                false
            }
        } else {
            false
        }
    };

    if !has_seed {
        return Err("no seed image variant available".into());
    }

    // Check target duration exists.
    if scene_type.target_duration_secs.is_none() {
        return Err("scene type has no target duration".into());
    }

    Ok(())
}
