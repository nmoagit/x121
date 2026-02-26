//! Handlers for the recursive video generation loop (PRD-24).
//!
//! Routes:
//! - `POST  /scenes/{id}/generate`             — start generation
//! - `GET   /scenes/{id}/progress`             — get generation progress
//! - `POST  /scenes/batch-generate`            — batch start generation
//! - `POST  /segments/{id}/select-boundary-frame` — manual boundary frame selection

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::generation;
use x121_core::types::DbId;
use x121_db::models::generation::{
    BatchGenerateError, BatchGenerateRequest, BatchGenerateResponse, GenerationProgress,
    SelectBoundaryFrameRequest, SelectBoundaryFrameResponse, StartGenerationRequest,
    StartGenerationResponse, UpdateSceneGeneration, UpdateSegmentGeneration,
};
use x121_db::repositories::{SceneRepo, SceneTypeRepo, SegmentRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

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

    let (estimated, boundary_mode) =
        init_scene_generation(&state, scene_id, input.boundary_mode).await?;

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
async fn init_scene_generation(
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

    let target_duration = scene_type.target_duration_secs.map(|d| d as f64);

    // image_variant_id > 0 indicates a seed variant is set.
    generation::validate_generation_start(scene.image_variant_id > 0, target_duration)
        .map_err(AppError::Core)?;

    let estimated = generation::estimate_segments(
        target_duration.unwrap_or(generation::DEFAULT_SEGMENT_DURATION_SECS),
        generation::DEFAULT_SEGMENT_DURATION_SECS,
    );

    let update = UpdateSceneGeneration {
        total_segments_estimated: Some(estimated as i32),
        total_segments_completed: None,
        actual_duration_secs: None,
        transition_segment_index: None,
        generation_started_at: Some(chrono::Utc::now()),
        generation_completed_at: None,
    };
    SceneRepo::update_generation_state(&state.pool, scene_id, &update).await?;

    let mode = boundary_mode.unwrap_or_else(|| generation::BOUNDARY_AUTO.to_string());
    Ok((estimated, mode))
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
        duration_secs: None,
        cumulative_duration_secs: None,
        boundary_frame_index: Some(input.frame_index),
        boundary_selection_mode: Some(generation::BOUNDARY_MANUAL.to_string()),
        generation_started_at: None,
        generation_completed_at: None,
        worker_id: None,
        prompt_type: None,
        prompt_text: None,
        seed_frame_path: None,
        last_frame_path: None,
        output_video_path: None,
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
        match init_scene_generation(&state, scene_id, None).await {
            Ok(_) => started.push(scene_id),
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
