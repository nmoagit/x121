//! Admin handlers for webhook management (PRD-12).
//!
//! All endpoints require the admin role via [`RequireAdmin`].
//! Provides CRUD for webhooks, delivery history, test delivery, and replay.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::search::{clamp_limit, clamp_offset};
use trulience_core::types::DbId;
use trulience_db::models::api_key::{CreateWebhook, UpdateWebhook};
use trulience_db::repositories::WebhookRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Webhook CRUD
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/webhooks
///
/// Create a new webhook subscription.
pub async fn create_webhook(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateWebhook>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if input.url.trim().is_empty() {
        return Err(AppError::BadRequest("url must not be empty".into()));
    }

    let event_types_json = serde_json::to_value(&input.event_types)
        .map_err(|e| AppError::BadRequest(format!("Invalid event_types: {e}")))?;

    let webhook = WebhookRepo::create(
        &state.pool,
        input.name.trim(),
        input.url.trim(),
        input.secret.as_deref(),
        &event_types_json,
        input.is_enabled.unwrap_or(true),
        admin.user_id,
    )
    .await?;

    tracing::info!(
        webhook_id = webhook.id,
        url = %webhook.url,
        user_id = admin.user_id,
        "Webhook created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: webhook })))
}

/// GET /api/v1/admin/webhooks
///
/// List all webhooks.
pub async fn list_webhooks(
    _admin: RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let webhooks = WebhookRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: webhooks }))
}

/// PUT /api/v1/admin/webhooks/{id}
///
/// Update a webhook's settings (name, URL, secret, event types, enabled).
pub async fn update_webhook(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(webhook_id): Path<DbId>,
    Json(input): Json<UpdateWebhook>,
) -> AppResult<impl IntoResponse> {
    let event_types_json = input
        .event_types
        .as_ref()
        .map(|et| serde_json::to_value(et))
        .transpose()
        .map_err(|e| AppError::BadRequest(format!("Invalid event_types: {e}")))?;

    let updated = WebhookRepo::update(
        &state.pool,
        webhook_id,
        input.name.as_deref(),
        input.url.as_deref(),
        input.secret.as_deref(),
        event_types_json.as_ref(),
        input.is_enabled,
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "Webhook",
        id: webhook_id,
    }))?;

    tracing::info!(
        webhook_id,
        user_id = admin.user_id,
        "Webhook updated",
    );

    Ok(Json(DataResponse { data: updated }))
}

/// DELETE /api/v1/admin/webhooks/{id}
///
/// Delete a webhook and all its deliveries.
pub async fn delete_webhook(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(webhook_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = WebhookRepo::delete(&state.pool, webhook_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Webhook",
            id: webhook_id,
        }));
    }

    tracing::info!(
        webhook_id,
        user_id = admin.user_id,
        "Webhook deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Delivery management
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/webhooks/{id}/deliveries
///
/// List delivery history for a specific webhook.
pub async fn list_deliveries(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Path(webhook_id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    // Verify webhook exists
    WebhookRepo::find_by_id(&state.pool, webhook_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Webhook",
            id: webhook_id,
        }))?;

    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let deliveries =
        WebhookRepo::list_deliveries_for_webhook(&state.pool, webhook_id, limit, offset).await?;

    Ok(Json(DataResponse { data: deliveries }))
}

/// POST /api/v1/admin/webhooks/{id}/test
///
/// Send a test payload to a webhook to verify connectivity.
pub async fn test_webhook(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(webhook_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let webhook = WebhookRepo::find_by_id(&state.pool, webhook_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Webhook",
            id: webhook_id,
        }))?;

    // Create a test delivery record with a synthetic payload
    let test_payload = serde_json::json!({
        "event": "webhook.test",
        "webhook_id": webhook.id,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "message": "This is a test delivery to verify webhook connectivity."
    });

    let delivery = WebhookRepo::create_delivery(
        &state.pool,
        webhook.id,
        None, // no event_id for test
        &test_payload,
    )
    .await?;

    tracing::info!(
        webhook_id,
        delivery_id = delivery.id,
        user_id = admin.user_id,
        "Test webhook delivery created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: delivery })))
}

/// POST /api/v1/admin/webhooks/deliveries/{id}/replay
///
/// Replay a failed or delivered webhook delivery by resetting its status.
pub async fn replay_delivery(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(delivery_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let replayed = WebhookRepo::replay_delivery(&state.pool, delivery_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WebhookDelivery",
            id: delivery_id,
        }))?;

    tracing::info!(
        delivery_id,
        webhook_id = replayed.webhook_id,
        user_id = admin.user_id,
        "Webhook delivery replayed",
    );

    Ok(Json(DataResponse { data: replayed }))
}
