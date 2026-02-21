//! Handlers for real-time collaboration: entity locks and user presence (PRD-11).
//!
//! Lock endpoints allow acquiring, releasing, extending, and querying exclusive
//! locks on entities. Presence endpoints allow querying who is viewing an entity.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::collaboration::validate_entity_ref;
use trulience_db::models::collaboration::{AcquireLockRequest, LockActionRequest};
use trulience_db::repositories::{EntityLockRepo, UserPresenceRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Lock Endpoints
// ---------------------------------------------------------------------------

/// POST /api/v1/collaboration/locks/acquire
///
/// Attempt to acquire an exclusive lock on an entity. Returns 409 if the
/// entity is already locked by another user.
pub async fn acquire_lock(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<AcquireLockRequest>,
) -> AppResult<impl IntoResponse> {
    validate_entity_ref(&input.entity_type, input.entity_id)
        .map_err(AppError::BadRequest)?;

    let lock = EntityLockRepo::acquire(
        &state.pool,
        &input.entity_type,
        input.entity_id,
        auth.user_id,
    )
    .await?;

    match lock {
        Some(lock) => {
            tracing::info!(
                user_id = auth.user_id,
                entity_type = %input.entity_type,
                entity_id = input.entity_id,
                "Lock acquired"
            );
            Ok(Json(DataResponse { data: lock }))
        }
        None => {
            // Lock already held -- fetch holder info for the error message.
            let holder = EntityLockRepo::get_active(
                &state.pool,
                &input.entity_type,
                input.entity_id,
            )
            .await?;

            match holder {
                Some(h) => Err(AppError::Core(trulience_core::error::CoreError::Conflict(
                    format!(
                        "Entity is locked by user {} until {}",
                        h.user_id, h.expires_at
                    ),
                ))),
                // Race condition: lock was released between our insert and query.
                None => Err(AppError::InternalError(
                    "Lock conflict detected but no active lock found".into(),
                )),
            }
        }
    }
}

/// POST /api/v1/collaboration/locks/release
///
/// Release a held lock. Only the lock holder can release.
pub async fn release_lock(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<LockActionRequest>,
) -> AppResult<impl IntoResponse> {
    validate_entity_ref(&input.entity_type, input.entity_id)
        .map_err(AppError::BadRequest)?;

    let released = EntityLockRepo::release(
        &state.pool,
        &input.entity_type,
        input.entity_id,
        auth.user_id,
    )
    .await?;

    if !released {
        return Err(AppError::BadRequest(
            "You do not hold an active lock on this entity".into(),
        ));
    }

    tracing::info!(
        user_id = auth.user_id,
        entity_type = %input.entity_type,
        entity_id = input.entity_id,
        "Lock released"
    );

    Ok(Json(DataResponse {
        data: serde_json::json!({ "released": true }),
    }))
}

/// POST /api/v1/collaboration/locks/extend
///
/// Extend the expiration of a held lock. Only the lock holder can extend.
pub async fn extend_lock(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<LockActionRequest>,
) -> AppResult<impl IntoResponse> {
    validate_entity_ref(&input.entity_type, input.entity_id)
        .map_err(AppError::BadRequest)?;

    let lock = EntityLockRepo::extend(
        &state.pool,
        &input.entity_type,
        input.entity_id,
        auth.user_id,
    )
    .await?;

    match lock {
        Some(lock) => {
            tracing::debug!(
                user_id = auth.user_id,
                entity_type = %input.entity_type,
                entity_id = input.entity_id,
                new_expires_at = %lock.expires_at,
                "Lock extended"
            );
            Ok(Json(DataResponse { data: lock }))
        }
        None => Err(AppError::BadRequest(
            "You do not hold an active lock on this entity".into(),
        )),
    }
}

/// GET /api/v1/collaboration/locks/{entity_type}/{entity_id}
///
/// Check the lock status for an entity. Returns the active lock or null.
pub async fn get_lock_status(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
) -> AppResult<impl IntoResponse> {
    validate_entity_ref(&entity_type, entity_id)
        .map_err(AppError::BadRequest)?;

    let lock = EntityLockRepo::get_active(&state.pool, &entity_type, entity_id).await?;
    Ok(Json(DataResponse { data: lock }))
}

// ---------------------------------------------------------------------------
// Presence Endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/collaboration/presence/{entity_type}/{entity_id}
///
/// Returns the list of users currently viewing an entity.
pub async fn get_presence(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
) -> AppResult<impl IntoResponse> {
    validate_entity_ref(&entity_type, entity_id)
        .map_err(AppError::BadRequest)?;

    let users = UserPresenceRepo::get_present(&state.pool, &entity_type, entity_id).await?;
    Ok(Json(DataResponse { data: users }))
}
