//! Handlers for avatar deliverable ignores (PRD-126).
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
use x121_db::models::avatar_deliverable_ignore::CreateDeliverableIgnore;
use x121_db::repositories::AvatarDeliverableIgnoreRepo;

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

/// GET /avatars/{avatar_id}/deliverable-ignores
///
/// List all ignored deliverables for a avatar.
pub async fn list_ignores(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let ignores = AvatarDeliverableIgnoreRepo::list_for_avatar(&state.pool, avatar_id).await?;
    Ok(Json(DataResponse { data: ignores }))
}

/// POST /avatars/{avatar_id}/deliverable-ignores
///
/// Mark a deliverable (scene_type + optional track) as intentionally skipped.
pub async fn add_ignore(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<CreateIgnoreRequest>,
) -> AppResult<impl IntoResponse> {
    let input = CreateDeliverableIgnore {
        avatar_id,
        scene_type_id: body.scene_type_id,
        track_id: body.track_id,
        ignored_by: Some(auth.user_id.to_string()),
        reason: body.reason,
    };

    let ignore = AvatarDeliverableIgnoreRepo::add_ignore(&state.pool, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        scene_type_id = body.scene_type_id,
        "Deliverable ignore added"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: ignore })))
}

/// DELETE /avatars/{avatar_id}/deliverable-ignores/{uuid}
///
/// Remove a deliverable ignore by UUID.
pub async fn remove_ignore(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((avatar_id, uuid)): Path<(DbId, sqlx::types::Uuid)>,
) -> AppResult<StatusCode> {
    let deleted = AvatarDeliverableIgnoreRepo::remove_by_uuid(&state.pool, uuid).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarDeliverableIgnore",
            id: 0, // UUID-based lookup, no DbId available
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        uuid = %uuid,
        "Deliverable ignore removed"
    );

    Ok(StatusCode::NO_CONTENT)
}
