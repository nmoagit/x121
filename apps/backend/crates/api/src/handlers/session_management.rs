//! Handlers for session management endpoints (PRD-98).
//!
//! Admin endpoints for listing active sessions, force-terminating sessions,
//! viewing analytics and login history, and managing session configs.
//! User endpoints for heartbeat and listing own sessions.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::session_management::{self, SessionAnalytics, SESSION_ACTIVE, SESSION_IDLE};
use x121_core::types::DbId;
use x121_db::models::audit::CreateAuditLog;
use x121_db::models::session_management::{ActiveSessionList, LoginHistoryList};
use x121_db::repositories::{ActiveSessionRepo, AuditLogRepo, LoginAttemptRepo, SessionConfigRepo};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for login history (admin).
///
/// Composes `PaginationParams` (limit/offset) with an optional user filter.
#[derive(Debug, Deserialize)]
pub struct LoginHistoryParams {
    #[serde(flatten)]
    pub pagination: PaginationParams,
    pub user_id: Option<DbId>,
}

/// Request body for session heartbeat.
///
/// `session_id` is optional; when omitted the server resolves the most recent
/// active session for the authenticated user (identified via JWT).
#[derive(Debug, Deserialize)]
pub struct HeartbeatRequest {
    pub session_id: Option<DbId>,
    pub current_view: Option<String>,
}

/// Request body for updating a session config.
#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    pub value: String,
}

/// Response from a force-terminate action.
#[derive(Debug, Serialize)]
pub struct TerminateResponse {
    pub terminated: bool,
    pub session_id: DbId,
}

/// Heartbeat response.
#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    pub status: String,
    pub last_activity: x121_core::types::Timestamp,
}

// ---------------------------------------------------------------------------
// Admin: list active sessions
// ---------------------------------------------------------------------------

/// GET /admin/sessions
///
/// List all active (non-terminated) sessions with pagination.
pub async fn list_active_sessions(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<PaginationParams>,
) -> AppResult<Json<DataResponse<ActiveSessionList>>> {
    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let items = ActiveSessionRepo::list_active(&state.pool, limit, offset).await?;
    let total = ActiveSessionRepo::count_active(&state.pool).await?;

    Ok(Json(DataResponse {
        data: ActiveSessionList { items, total },
    }))
}

// ---------------------------------------------------------------------------
// Admin: force terminate session
// ---------------------------------------------------------------------------

/// DELETE /admin/sessions/:id
///
/// Force-terminate a session by ID. Admin only.
pub async fn force_terminate_session(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(session_id): Path<DbId>,
) -> AppResult<Json<DataResponse<TerminateResponse>>> {
    let session = ActiveSessionRepo::terminate(&state.pool, session_id).await?;

    if session.is_none() {
        return Err(crate::error::AppError::BadRequest(format!(
            "Session {session_id} not found or already terminated"
        )));
    }

    // Audit log.
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "session.force_terminated".to_string(),
            entity_type: Some("active_session".to_string()),
            entity_id: Some(session_id),
            details_json: Some(serde_json::json!({
                "terminated_session_id": session_id,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    Ok(Json(DataResponse {
        data: TerminateResponse {
            terminated: true,
            session_id,
        },
    }))
}

// ---------------------------------------------------------------------------
// Admin: session analytics
// ---------------------------------------------------------------------------

/// GET /admin/sessions/analytics
///
/// Get aggregated session analytics. Admin only.
pub async fn get_session_analytics(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<SessionAnalytics>>> {
    let total_sessions = ActiveSessionRepo::count_total(&state.pool).await?;
    let active_sessions = ActiveSessionRepo::count_by_status(&state.pool, SESSION_ACTIVE).await?;
    let idle_sessions = ActiveSessionRepo::count_by_status(&state.pool, SESSION_IDLE).await?;
    let peak_concurrent = ActiveSessionRepo::peak_concurrent_last_24h(&state.pool).await?;

    // Compute average duration from the last 1000 terminated sessions.
    let durations = ActiveSessionRepo::terminated_durations_seconds(&state.pool, 1000).await?;
    let avg_duration_seconds = session_management::compute_avg_session_duration(&durations);

    Ok(Json(DataResponse {
        data: SessionAnalytics {
            total_sessions,
            active_sessions,
            idle_sessions,
            avg_duration_seconds,
            peak_concurrent,
        },
    }))
}

// ---------------------------------------------------------------------------
// Admin: login history
// ---------------------------------------------------------------------------

/// GET /admin/sessions/login-history
///
/// List login attempts with optional user filter. Admin only.
pub async fn get_login_history(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<LoginHistoryParams>,
) -> AppResult<Json<DataResponse<LoginHistoryList>>> {
    let limit = clamp_limit(params.pagination.limit, 50, 200);
    let offset = clamp_offset(params.pagination.offset);

    let items = if let Some(user_id) = params.user_id {
        LoginAttemptRepo::list_recent_by_user(&state.pool, user_id, limit, offset).await?
    } else {
        LoginAttemptRepo::list_all(&state.pool, limit, offset).await?
    };
    let total = LoginAttemptRepo::count_total(&state.pool).await?;

    Ok(Json(DataResponse {
        data: LoginHistoryList { items, total },
    }))
}

// ---------------------------------------------------------------------------
// Admin: session config
// ---------------------------------------------------------------------------

/// GET /admin/sessions/config
///
/// List all session configuration entries. Admin only.
pub async fn list_session_configs(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::session_management::SessionConfig>>>> {
    let configs = SessionConfigRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: configs }))
}

/// PUT /admin/sessions/config/:key
///
/// Update a session config value by key. Admin only.
pub async fn update_session_config(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(key): Path<String>,
    Json(input): Json<UpdateConfigRequest>,
) -> AppResult<Json<DataResponse<x121_db::models::session_management::SessionConfig>>> {
    // Capture old value for audit.
    let old_entry = SessionConfigRepo::get_by_key(&state.pool, &key).await?;
    let old_value = old_entry.map(|e| e.value);

    let config = SessionConfigRepo::update(&state.pool, &key, &input.value)
        .await?
        .ok_or_else(|| {
            crate::error::AppError::BadRequest(format!("Session config key '{key}' not found"))
        })?;

    // Audit log.
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "session_config.updated".to_string(),
            entity_type: Some("session_config".to_string()),
            entity_id: None,
            details_json: Some(serde_json::json!({
                "key": key,
                "old_value": old_value,
                "new_value": input.value,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    Ok(Json(DataResponse { data: config }))
}

// ---------------------------------------------------------------------------
// User: heartbeat
// ---------------------------------------------------------------------------

/// POST /sessions/heartbeat
///
/// Update session last_activity timestamp. Requires authentication.
pub async fn heartbeat(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<HeartbeatRequest>,
) -> AppResult<Json<DataResponse<HeartbeatResponse>>> {
    // Resolve session_id: use the provided value, or look up the user's most
    // recent active session from the JWT-identified user.
    let session_id = match input.session_id {
        Some(id) => {
            // Verify the session belongs to the authenticated user.
            let session = ActiveSessionRepo::find_by_id(&state.pool, id).await?;
            if let Some(ref s) = session {
                if s.user_id != user.user_id {
                    return Err(crate::error::AppError::Core(
                        x121_core::error::CoreError::Forbidden(
                            "Cannot heartbeat another user's session".into(),
                        ),
                    ));
                }
            }
            id
        }
        None => {
            let session =
                ActiveSessionRepo::find_most_recent_active_by_user(&state.pool, user.user_id)
                    .await?
                    .ok_or_else(|| {
                        crate::error::AppError::BadRequest(
                            "No active session found for the current user".into(),
                        )
                    })?;
            session.id
        }
    };

    let updated =
        ActiveSessionRepo::heartbeat(&state.pool, session_id, input.current_view.as_deref())
            .await?
            .ok_or_else(|| {
                crate::error::AppError::BadRequest("Session not found or already terminated".into())
            })?;

    Ok(Json(DataResponse {
        data: HeartbeatResponse {
            status: updated.status,
            last_activity: updated.last_activity,
        },
    }))
}

// ---------------------------------------------------------------------------
// User: my sessions
// ---------------------------------------------------------------------------

/// GET /sessions/me
///
/// List the current user's active sessions.
pub async fn get_my_sessions(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::session_management::ActiveSession>>>> {
    let sessions = ActiveSessionRepo::list_by_user(&state.pool, user.user_id).await?;
    Ok(Json(DataResponse { data: sessions }))
}
