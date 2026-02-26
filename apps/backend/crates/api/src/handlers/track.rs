//! Handlers for the `/tracks` resource (PRD-111).
//!
//! Manages content tracks (e.g. "clothed", "topless") that replace the
//! former `variant_applicability` column on scene types.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::track::{CreateTrack, UpdateTrack};
use x121_db::repositories::TrackRepo;

use crate::error::{AppError, AppResult};
use crate::query::IncludeInactiveParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/tracks?include_inactive=false
///
/// List all tracks, optionally including inactive ones.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<IncludeInactiveParams>,
) -> AppResult<impl IntoResponse> {
    let tracks = TrackRepo::list(&state.pool, params.include_inactive).await?;
    Ok(Json(DataResponse { data: tracks }))
}

/// POST /api/v1/tracks
///
/// Create a new track.
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreateTrack>,
) -> AppResult<impl IntoResponse> {
    let track = TrackRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: track })))
}

/// PUT /api/v1/tracks/{id}
///
/// Update a track. Slug is immutable and cannot be changed.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateTrack>,
) -> AppResult<impl IntoResponse> {
    let track = TrackRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Track",
            id,
        }))?;
    Ok(Json(DataResponse { data: track }))
}
