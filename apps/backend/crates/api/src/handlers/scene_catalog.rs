//! Handlers for the `/scene-catalog` resource (PRD-111).
//!
//! Studio-level registry of scene content concepts with track associations.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::scene_catalog::{CreateSceneCatalogEntry, UpdateSceneCatalogEntry};
use x121_db::repositories::SceneCatalogRepo;

use crate::error::{AppError, AppResult};
use crate::query::IncludeInactiveParams;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for adding tracks to a scene catalog entry.
#[derive(Debug, Deserialize)]
pub struct AddTracksRequest {
    pub track_ids: Vec<DbId>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-catalog?include_inactive=false
///
/// List all scene catalog entries with their associated tracks.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<IncludeInactiveParams>,
) -> AppResult<impl IntoResponse> {
    let entries = SceneCatalogRepo::list_with_tracks(&state.pool, params.include_inactive).await?;
    Ok(Json(DataResponse { data: entries }))
}

/// POST /api/v1/scene-catalog
///
/// Create a new scene catalog entry, optionally associating tracks.
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreateSceneCatalogEntry>,
) -> AppResult<impl IntoResponse> {
    let entry = SceneCatalogRepo::create(&state.pool, &input).await?;
    let with_tracks = SceneCatalogRepo::find_by_id_with_tracks(&state.pool, entry.id)
        .await?
        .expect("just created");
    Ok((
        StatusCode::CREATED,
        Json(DataResponse { data: with_tracks }),
    ))
}

/// GET /api/v1/scene-catalog/{id}
///
/// Get a single scene catalog entry by ID with its tracks.
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let entry = SceneCatalogRepo::find_by_id_with_tracks(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneCatalogEntry",
            id,
        }))?;
    Ok(Json(DataResponse { data: entry }))
}

/// PUT /api/v1/scene-catalog/{id}
///
/// Update a scene catalog entry. If `track_ids` is present, replaces track associations.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateSceneCatalogEntry>,
) -> AppResult<impl IntoResponse> {
    SceneCatalogRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneCatalogEntry",
            id,
        }))?;
    let with_tracks = SceneCatalogRepo::find_by_id_with_tracks(&state.pool, id)
        .await?
        .expect("just updated");
    Ok(Json(DataResponse { data: with_tracks }))
}

/// DELETE /api/v1/scene-catalog/{id}
///
/// Deactivate a scene catalog entry (soft-disable, not delete).
pub async fn deactivate(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deactivated = SceneCatalogRepo::deactivate(&state.pool, id).await?;
    if deactivated {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneCatalogEntry",
            id,
        }))
    }
}

/// POST /api/v1/scene-catalog/{id}/tracks
///
/// Add one or more tracks to a scene catalog entry.
pub async fn add_tracks(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<AddTracksRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify entry exists
    SceneCatalogRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneCatalogEntry",
            id,
        }))?;

    for track_id in &body.track_ids {
        SceneCatalogRepo::add_track(&state.pool, id, *track_id).await?;
    }

    let with_tracks = SceneCatalogRepo::find_by_id_with_tracks(&state.pool, id)
        .await?
        .expect("verified exists");
    Ok(Json(DataResponse { data: with_tracks }))
}

/// DELETE /api/v1/scene-catalog/{id}/tracks/{track_id}
///
/// Remove a single track from a scene catalog entry.
pub async fn remove_track(
    State(state): State<AppState>,
    Path((id, track_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let removed = SceneCatalogRepo::remove_track(&state.pool, id, track_id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneCatalogTrack",
            id,
        }))
    }
}
