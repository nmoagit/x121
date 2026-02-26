//! Handlers for the `/notifications` resource.
//!
//! All endpoints require authentication via [`AuthUser`].

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::channels::CHANNEL_IN_APP;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::notification::{UpdateNotificationSettings, UpdatePreference};
use x121_db::repositories::{EventRepo, NotificationPreferenceRepo, NotificationRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query / response types
// ---------------------------------------------------------------------------

/// Query parameters for `GET /notifications`.
#[derive(Debug, Deserialize)]
pub struct NotificationQuery {
    /// If `true`, return only unread notifications. Defaults to `false`.
    pub unread_only: Option<bool>,
    /// Maximum number of results. Defaults to 50, capped at 100.
    pub limit: Option<i64>,
    /// Number of results to skip. Defaults to 0.
    pub offset: Option<i64>,
}

/// Maximum page size for notification listing.
const MAX_LIMIT: i64 = 100;

/// Default page size for notification listing.
const DEFAULT_LIMIT: i64 = 50;

// ---------------------------------------------------------------------------
// Notification CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/notifications
///
/// List the authenticated user's notifications with optional filtering.
pub async fn list_notifications(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<NotificationQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
    let offset = params.offset.unwrap_or(0);
    let unread_only = params.unread_only.unwrap_or(false);

    let notifications =
        NotificationRepo::list_for_user(&state.pool, auth.user_id, unread_only, limit, offset)
            .await?;

    Ok(Json(serde_json::json!({ "data": notifications })))
}

/// POST /api/v1/notifications/{id}/read
///
/// Mark a single notification as read. Returns 204 No Content on success,
/// or 404 if the notification does not belong to the authenticated user.
pub async fn mark_read(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(notification_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let found = NotificationRepo::mark_read(&state.pool, notification_id, auth.user_id).await?;

    if !found {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Notification",
            id: notification_id,
        }));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/notifications/read-all
///
/// Mark all of the authenticated user's notifications as read.
/// Returns the number of notifications that were marked.
pub async fn mark_all_read(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let count = NotificationRepo::mark_all_read(&state.pool, auth.user_id).await?;

    Ok(Json(serde_json::json!({
        "data": { "marked_read": count }
    })))
}

/// GET /api/v1/notifications/unread-count
///
/// Return the number of unread notifications for the authenticated user.
pub async fn unread_count(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let count = NotificationRepo::unread_count(&state.pool, auth.user_id).await?;

    Ok(Json(serde_json::json!({
        "data": { "count": count }
    })))
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/// GET /api/v1/notifications/preferences
///
/// List all notification preferences for the authenticated user alongside
/// the full catalogue of event types so the client can render toggles
/// for types that have no preference row yet.
pub async fn get_preferences(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let prefs = NotificationPreferenceRepo::list_for_user(&state.pool, auth.user_id).await?;
    let event_types = EventRepo::list_event_types(&state.pool).await?;

    Ok(Json(serde_json::json!({
        "data": {
            "preferences": prefs,
            "event_types": event_types,
        }
    })))
}

/// PUT /api/v1/notifications/preferences/{event_type_id}
///
/// Create or update a notification preference for a specific event type.
pub async fn update_preference(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_type_id): Path<DbId>,
    Json(input): Json<UpdatePreference>,
) -> AppResult<Json<serde_json::Value>> {
    let is_enabled = input.is_enabled.unwrap_or(true);
    let channels = input
        .channels
        .unwrap_or_else(|| serde_json::json!([CHANNEL_IN_APP]));
    let scope = input.scope.unwrap_or_else(|| "all".to_string());

    let pref = NotificationPreferenceRepo::upsert(
        &state.pool,
        auth.user_id,
        event_type_id,
        is_enabled,
        &channels,
        &scope,
    )
    .await?;

    Ok(Json(serde_json::json!({ "data": pref })))
}

// ---------------------------------------------------------------------------
// Settings (DND, digest, global toggles)
// ---------------------------------------------------------------------------

/// GET /api/v1/notifications/settings
///
/// Get the authenticated user's global notification settings
/// (do-not-disturb, digest schedule, etc.).
pub async fn get_settings(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let settings = NotificationPreferenceRepo::get_settings(&state.pool, auth.user_id).await?;

    Ok(Json(serde_json::json!({ "data": settings })))
}

/// PUT /api/v1/notifications/settings
///
/// Update the authenticated user's global notification settings.
pub async fn update_settings(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<UpdateNotificationSettings>,
) -> AppResult<Json<serde_json::Value>> {
    let settings =
        NotificationPreferenceRepo::upsert_settings(&state.pool, auth.user_id, &input).await?;

    Ok(Json(serde_json::json!({ "data": settings })))
}
