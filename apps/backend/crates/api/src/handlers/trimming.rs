//! Handlers for Segment Trimming & Frame-Level Editing (PRD-78).
//!
//! Provides endpoints for creating, reverting, batch-applying, and querying
//! non-destructive segment trims with frame-accurate in/out points.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::error::CoreError;
use trulience_core::trimming::{
    self, seed_frame_after_trim, TrimPreset,
};
use trulience_core::types::DbId;
use trulience_db::models::segment_trim::{
    ApplyPresetRequest, BatchTrimRequest, BatchTrimResponse,
    CreateSegmentTrim, SeedFrameUpdate,
};
use trulience_db::repositories::SegmentTrimRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a segment trim exists, returning the full row.
#[allow(dead_code)]
async fn ensure_trim_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<trulience_db::models::segment_trim::SegmentTrim> {
    SegmentTrimRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SegmentTrim",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// POST /segments/{id}/trim
// ---------------------------------------------------------------------------

/// API request body for creating a trim on a segment.
#[derive(Debug, serde::Deserialize)]
pub struct CreateTrimBody {
    pub original_path: String,
    pub in_frame: i32,
    pub out_frame: i32,
    pub total_original_frames: i32,
}

/// Create a new trim for a segment.
///
/// Validates trim points and creates a non-destructive trim record.
pub async fn create_trim(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(segment_id): Path<DbId>,
    Json(body): Json<CreateTrimBody>,
) -> AppResult<impl IntoResponse> {
    trimming::validate_trim_points(
        body.in_frame,
        body.out_frame,
        body.total_original_frames,
    )?;

    let input = CreateSegmentTrim {
        segment_id,
        original_path: body.original_path,
        in_frame: body.in_frame,
        out_frame: body.out_frame,
        total_original_frames: body.total_original_frames,
        created_by: auth.user_id,
    };

    let trim = SegmentTrimRepo::create(&state.pool, &input).await?;

    tracing::info!(
        trim_id = trim.id,
        segment_id,
        in_frame = body.in_frame,
        out_frame = body.out_frame,
        user_id = auth.user_id,
        "Segment trim created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: trim })))
}

// ---------------------------------------------------------------------------
// GET /segments/{id}/trim
// ---------------------------------------------------------------------------

/// Get the active (most recent) trim for a segment.
pub async fn get_active_trim(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let trim = SegmentTrimRepo::get_active_trim(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: trim }))
}

// ---------------------------------------------------------------------------
// DELETE /segments/{id}/trim
// ---------------------------------------------------------------------------

/// Revert (delete) the most recent trim for a segment.
pub async fn revert_trim(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(segment_id): Path<DbId>,
) -> AppResult<StatusCode> {
    let active = SegmentTrimRepo::get_active_trim(&state.pool, segment_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SegmentTrim",
                id: segment_id,
            })
        })?;

    SegmentTrimRepo::delete(&state.pool, active.id).await?;

    tracing::info!(
        trim_id = active.id,
        segment_id,
        user_id = auth.user_id,
        "Segment trim reverted"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /segments/{id}/trim/seed-impact
// ---------------------------------------------------------------------------

/// Check the downstream seed frame impact of the active trim on a segment.
pub async fn get_seed_frame_impact(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let active = SegmentTrimRepo::get_active_trim(&state.pool, segment_id).await?;

    let impact = match active {
        Some(trim) => {
            let new_seed = seed_frame_after_trim(trim.out_frame);
            SeedFrameUpdate {
                segment_id,
                new_seed_frame: new_seed,
                // In a full implementation, this would look up the next
                // segment in the scene and check if it has been generated.
                downstream_segment_id: None,
                downstream_invalidated: false,
            }
        }
        None => SeedFrameUpdate {
            segment_id,
            new_seed_frame: 0,
            downstream_segment_id: None,
            downstream_invalidated: false,
        },
    };

    Ok(Json(DataResponse { data: impact }))
}

// ---------------------------------------------------------------------------
// POST /trims/batch
// ---------------------------------------------------------------------------

/// Apply the same trim to multiple segments at once.
pub async fn batch_trim(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<BatchTrimRequest>,
) -> AppResult<impl IntoResponse> {
    trimming::validate_batch_trim_size(body.segment_ids.len())?;

    let mut ids = Vec::with_capacity(body.segment_ids.len());

    for &sid in &body.segment_ids {
        // For batch trim we use in_frame/out_frame as provided.
        // The caller is responsible for ensuring total_original_frames is
        // consistent. We validate the trim points against out_frame as the
        // total to ensure out > in and the range is positive.
        trimming::validate_trim_points(body.in_frame, body.out_frame, body.out_frame)?;

        let input = CreateSegmentTrim {
            segment_id: sid,
            original_path: String::new(), // batch trim does not set path
            in_frame: body.in_frame,
            out_frame: body.out_frame,
            total_original_frames: body.out_frame,
            created_by: auth.user_id,
        };
        let trim = SegmentTrimRepo::create(&state.pool, &input).await?;
        ids.push(trim.id);
    }

    let count = ids.len();

    tracing::info!(
        count,
        user_id = auth.user_id,
        "Batch segment trims created"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: BatchTrimResponse {
                trim_ids: ids,
                count,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// POST /trims/preset
// ---------------------------------------------------------------------------

/// Apply a quick trim preset to a segment.
pub async fn apply_preset(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ApplyPresetRequest>,
) -> AppResult<impl IntoResponse> {
    let preset = TrimPreset::parse(&body.preset)?;
    let (in_frame, out_frame) = preset.apply(body.total_frames);

    trimming::validate_trim_points(in_frame, out_frame, body.total_frames)?;

    let input = CreateSegmentTrim {
        segment_id: body.segment_id,
        original_path: String::new(),
        in_frame,
        out_frame,
        total_original_frames: body.total_frames,
        created_by: auth.user_id,
    };

    let trim = SegmentTrimRepo::create(&state.pool, &input).await?;

    tracing::info!(
        trim_id = trim.id,
        segment_id = body.segment_id,
        preset = body.preset,
        in_frame,
        out_frame,
        user_id = auth.user_id,
        "Trim preset applied"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: trim })))
}
