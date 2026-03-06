//! Handlers for character deliverable ignores (PRD-126).
//!
//! Allows users to mark specific scene_type + track deliverables as
//! intentionally skipped, excluding them from readiness calculations.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character_deliverable_ignore::CreateDeliverableIgnore;
use x121_db::repositories::CharacterDeliverableIgnoreRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for creating a deliverable ignore.
#[derive(Debug, Deserialize)]
pub struct CreateIgnoreRequest {
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
    pub reason: Option<String>,
}

/// GET /characters/{character_id}/deliverable-ignores
///
/// List all ignored deliverables for a character.
pub async fn list_ignores(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let ignores =
        CharacterDeliverableIgnoreRepo::list_for_character(&state.pool, character_id).await?;
    Ok(Json(DataResponse { data: ignores }))
}

/// POST /characters/{character_id}/deliverable-ignores
///
/// Mark a deliverable (scene_type + optional track) as intentionally skipped.
pub async fn add_ignore(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<CreateIgnoreRequest>,
) -> AppResult<impl IntoResponse> {
    let input = CreateDeliverableIgnore {
        character_id,
        scene_type_id: body.scene_type_id,
        track_id: body.track_id,
        ignored_by: Some(auth.user_id.to_string()),
        reason: body.reason,
    };

    let ignore = CharacterDeliverableIgnoreRepo::add_ignore(&state.pool, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        scene_type_id = body.scene_type_id,
        "Deliverable ignore added"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: ignore })))
}

/// DELETE /characters/{character_id}/deliverable-ignores/{uuid}
///
/// Remove a deliverable ignore by UUID.
pub async fn remove_ignore(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((character_id, uuid)): Path<(DbId, sqlx::types::Uuid)>,
) -> AppResult<StatusCode> {
    let deleted = CharacterDeliverableIgnoreRepo::remove_by_uuid(&state.pool, uuid).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "CharacterDeliverableIgnore",
            id: 0, // UUID-based lookup, no DbId available
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        uuid = %uuid,
        "Deliverable ignore removed"
    );

    Ok(StatusCode::NO_CONTENT)
}
