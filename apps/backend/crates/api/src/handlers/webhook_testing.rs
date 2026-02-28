//! Webhook Integration Testing Console handlers (PRD-99).
//!
//! Admin endpoints for delivery log inspection, health monitoring,
//! mock endpoint management, and sample payloads. Plus a public
//! mock capture endpoint.

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_core::webhook_testing::{
    self, compute_endpoint_health, generate_mock_token, ENDPOINT_TYPE_WEBHOOK,
};
use x121_db::models::webhook_testing::{
    CapturePage, CreateDeliveryLog, CreateMockCapture, CreateMockEndpoint, DeliveryLogPage,
    HealthSummary, MockEndpointPage,
};
use x121_db::repositories::webhook_testing_repo::{
    DeliveryLogRepo, MockCaptureRepo, MockEndpointRepo,
};
use x121_db::repositories::WebhookRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::request::{extract_ip, headers_to_json};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for filtering delivery logs.
#[derive(Debug, Deserialize)]
pub struct DeliveryFilterParams {
    pub endpoint_id: Option<DbId>,
    pub endpoint_type: Option<String>,
    pub event_type: Option<String>,
    pub success: Option<bool>,
    pub is_test: Option<bool>,
    pub is_replay: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Request body for sending a test payload.
#[derive(Debug, Deserialize)]
pub struct TestPayloadRequest {
    pub event_type: Option<String>,
    pub payload: Option<serde_json::Value>,
}

/// Request body for creating a mock endpoint.
#[derive(Debug, Deserialize)]
pub struct CreateMockEndpointRequest {
    pub name: String,
    pub webhook_endpoint_id: Option<DbId>,
    pub capture_enabled: Option<bool>,
    pub retention_hours: Option<i32>,
}

// ---------------------------------------------------------------------------
// Admin: delivery log endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/webhook-testing/deliveries
///
/// List delivery logs with optional filters and pagination.
pub async fn list_deliveries(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<DeliveryFilterParams>,
) -> AppResult<impl IntoResponse> {
    let items = DeliveryLogRepo::list_filtered(
        &state.pool,
        params.endpoint_id,
        params.endpoint_type.as_deref(),
        params.event_type.as_deref(),
        params.success,
        params.is_test,
        params.is_replay,
        params.limit,
        params.offset,
    )
    .await?;

    let total = DeliveryLogRepo::count_filtered(
        &state.pool,
        params.endpoint_id,
        params.endpoint_type.as_deref(),
        params.event_type.as_deref(),
        params.success,
        params.is_test,
        params.is_replay,
    )
    .await?;

    Ok(Json(DataResponse {
        data: DeliveryLogPage { items, total },
    }))
}

/// GET /api/v1/admin/webhook-testing/deliveries/:id
///
/// Get a single delivery log by ID with full request/response details.
pub async fn get_delivery(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Path(delivery_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let delivery = DeliveryLogRepo::find_by_id(&state.pool, delivery_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WebhookDeliveryLog",
            id: delivery_id,
        }))?;

    Ok(Json(DataResponse { data: delivery }))
}

// ---------------------------------------------------------------------------
// Shared HTTP delivery helper
// ---------------------------------------------------------------------------

/// Result of an HTTP POST delivery attempt.
struct DeliveryResult {
    response_status: Option<i16>,
    response_body: Option<String>,
    success: bool,
    error_message: Option<String>,
    duration_ms: i32,
}

/// Send a POST request and capture the outcome.
async fn send_webhook_post(url: &str, body: &serde_json::Value) -> AppResult<DeliveryResult> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::InternalError(format!("Failed to build HTTP client: {e}")))?;

    let start = std::time::Instant::now();
    let result = client.post(url).json(body).send().await;
    let duration_ms = start.elapsed().as_millis() as i32;

    let (response_status, response_body, success, error_message) = match result {
        Ok(resp) => {
            let status = resp.status().as_u16() as i16;
            let body = resp.text().await.unwrap_or_default();
            let ok = (200..300).contains(&(status as u16));
            (Some(status), Some(body), ok, None)
        }
        Err(e) => (None, None, false, Some(e.to_string())),
    };

    Ok(DeliveryResult {
        response_status,
        response_body,
        success,
        error_message,
        duration_ms,
    })
}

// ---------------------------------------------------------------------------
// Admin: test & replay
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/webhook-testing/webhooks/:id/test
///
/// Send a test payload to a webhook endpoint and log the delivery.
pub async fn test_webhook(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(webhook_id): Path<DbId>,
    Json(input): Json<TestPayloadRequest>,
) -> AppResult<impl IntoResponse> {
    let webhook = WebhookRepo::find_by_id(&state.pool, webhook_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Webhook",
            id: webhook_id,
        }))?;

    let event_type = input
        .event_type
        .unwrap_or_else(|| "webhook.test".to_string());

    let payload = input.payload.unwrap_or_else(|| {
        serde_json::json!({
            "event": event_type,
            "webhook_id": webhook.id,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "message": "Test delivery to verify webhook connectivity."
        })
    });

    let dr = send_webhook_post(&webhook.url, &payload).await?;

    let log_entry = CreateDeliveryLog {
        endpoint_id: webhook.id,
        endpoint_type: ENDPOINT_TYPE_WEBHOOK.to_string(),
        event_type,
        request_method: "POST".to_string(),
        request_url: webhook.url.clone(),
        request_headers_json: Some(serde_json::json!({
            "content-type": "application/json",
            "user-agent": "x121-webhook-test/1.0"
        })),
        request_body_json: Some(payload),
        response_status: dr.response_status,
        response_headers_json: None,
        response_body: dr.response_body,
        duration_ms: dr.duration_ms,
        success: dr.success,
        error_message: dr.error_message,
        is_test: true,
        is_replay: false,
        replay_of_id: None,
        retry_count: 0,
    };

    let delivery = DeliveryLogRepo::insert(&state.pool, &log_entry).await?;

    tracing::info!(
        delivery_id = delivery.id,
        webhook_id,
        user_id = admin.user_id,
        success = dr.success,
        "Test webhook delivery logged",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: delivery })))
}

/// POST /api/v1/admin/webhook-testing/deliveries/:id/replay
///
/// Replay a historical delivery, creating a new log entry with is_replay=true.
pub async fn replay_delivery(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(delivery_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let original = DeliveryLogRepo::find_by_id(&state.pool, delivery_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WebhookDeliveryLog",
            id: delivery_id,
        }))?;

    let body = original
        .request_body_json
        .clone()
        .unwrap_or(serde_json::Value::Null);
    let dr = send_webhook_post(&original.request_url, &body).await?;

    let log_entry = CreateDeliveryLog {
        endpoint_id: original.endpoint_id,
        endpoint_type: original.endpoint_type.clone(),
        event_type: original.event_type.clone(),
        request_method: original.request_method.clone(),
        request_url: original.request_url.clone(),
        request_headers_json: original.request_headers_json.clone(),
        request_body_json: original.request_body_json.clone(),
        response_status: dr.response_status,
        response_headers_json: None,
        response_body: dr.response_body,
        duration_ms: dr.duration_ms,
        success: dr.success,
        error_message: dr.error_message,
        is_test: false,
        is_replay: true,
        replay_of_id: Some(original.id),
        retry_count: 0,
    };

    let delivery = DeliveryLogRepo::insert(&state.pool, &log_entry).await?;

    tracing::info!(
        delivery_id = delivery.id,
        original_id = original.id,
        user_id = admin.user_id,
        success = dr.success,
        "Webhook delivery replayed",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: delivery })))
}

// ---------------------------------------------------------------------------
// Admin: health endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/webhook-testing/webhooks/:id/health
///
/// Compute health for a single webhook endpoint based on recent deliveries.
pub async fn get_endpoint_health(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Path(webhook_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify webhook exists
    WebhookRepo::find_by_id(&state.pool, webhook_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Webhook",
            id: webhook_id,
        }))?;

    let (total, successful, total_duration, recent_failures) =
        DeliveryLogRepo::health_stats(&state.pool, webhook_id, ENDPOINT_TYPE_WEBHOOK, 100).await?;

    let health = compute_endpoint_health(total, successful, total_duration, recent_failures);

    Ok(Json(DataResponse {
        data: HealthSummary {
            endpoint_id: webhook_id,
            endpoint_type: ENDPOINT_TYPE_WEBHOOK.to_string(),
            health,
        },
    }))
}

/// GET /api/v1/admin/webhook-testing/health/summary
///
/// Fleet-wide health summary for all webhook endpoints.
pub async fn get_health_summary(
    _admin: RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let webhooks = WebhookRepo::list(&state.pool).await?;

    let mut summaries = Vec::with_capacity(webhooks.len());
    for wh in &webhooks {
        let (total, successful, total_duration, recent_failures) =
            DeliveryLogRepo::health_stats(&state.pool, wh.id, ENDPOINT_TYPE_WEBHOOK, 100).await?;

        let health = compute_endpoint_health(total, successful, total_duration, recent_failures);
        summaries.push(HealthSummary {
            endpoint_id: wh.id,
            endpoint_type: ENDPOINT_TYPE_WEBHOOK.to_string(),
            health,
        });
    }

    Ok(Json(DataResponse { data: summaries }))
}

// ---------------------------------------------------------------------------
// Admin: mock endpoint management
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/webhook-testing/mock-endpoints
///
/// Create a new mock endpoint with an auto-generated token.
pub async fn create_mock_endpoint(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateMockEndpointRequest>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    let token = generate_mock_token();

    let create = CreateMockEndpoint {
        name: input.name.trim().to_string(),
        token,
        webhook_endpoint_id: input.webhook_endpoint_id,
        capture_enabled: input.capture_enabled,
        retention_hours: input.retention_hours,
        created_by: admin.user_id,
    };

    let endpoint = MockEndpointRepo::create(&state.pool, &create).await?;

    tracing::info!(
        mock_endpoint_id = endpoint.id,
        user_id = admin.user_id,
        "Mock endpoint created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: endpoint })))
}

/// GET /api/v1/admin/webhook-testing/mock-endpoints
///
/// List all mock endpoints with pagination.
pub async fn list_mock_endpoints(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let items = MockEndpointRepo::list_all(&state.pool, params.limit, params.offset).await?;
    let total = MockEndpointRepo::count_all(&state.pool).await?;

    Ok(Json(DataResponse {
        data: MockEndpointPage { items, total },
    }))
}

/// DELETE /api/v1/admin/webhook-testing/mock-endpoints/:id
///
/// Delete a mock endpoint and all its captures.
pub async fn delete_mock_endpoint(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(mock_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = MockEndpointRepo::delete(&state.pool, mock_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "MockEndpoint",
            id: mock_id,
        }));
    }

    tracing::info!(
        mock_endpoint_id = mock_id,
        user_id = admin.user_id,
        "Mock endpoint deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/admin/webhook-testing/mock-endpoints/:id/captures
///
/// List captured payloads for a mock endpoint.
pub async fn list_captures(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Path(mock_id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    // Verify mock endpoint exists
    MockEndpointRepo::find_by_id(&state.pool, mock_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MockEndpoint",
            id: mock_id,
        }))?;

    let items =
        MockCaptureRepo::list_by_endpoint(&state.pool, mock_id, params.limit, params.offset)
            .await?;
    let total = MockCaptureRepo::count_by_endpoint(&state.pool, mock_id).await?;

    Ok(Json(DataResponse {
        data: CapturePage { items, total },
    }))
}

// ---------------------------------------------------------------------------
// Admin: sample payloads
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/webhook-testing/sample-payloads
///
/// Return a list of available sample payloads for testing webhooks.
pub async fn list_sample_payloads(_admin: RequireAdmin) -> AppResult<impl IntoResponse> {
    let payloads = webhook_testing::get_sample_payloads();
    Ok(Json(DataResponse { data: payloads }))
}

// ---------------------------------------------------------------------------
// Public: mock capture endpoint
// ---------------------------------------------------------------------------

/// POST /mock/:token
///
/// Public endpoint that receives a webhook payload and captures it.
/// Returns 200 OK regardless of capture status to simulate a real endpoint.
pub async fn receive_mock_payload(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let endpoint = match MockEndpointRepo::find_by_token(&state.pool, &token).await {
        Ok(Some(ep)) => ep,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if !endpoint.capture_enabled {
        return StatusCode::OK.into_response();
    }

    let request_body = serde_json::from_slice::<serde_json::Value>(&body).ok();
    let request_headers = headers_to_json(&headers);
    let source_ip = extract_ip(&headers);

    let capture = CreateMockCapture {
        mock_endpoint_id: endpoint.id,
        request_method: "POST".to_string(),
        request_headers_json: Some(request_headers),
        request_body_json: request_body,
        source_ip,
    };

    if let Err(e) = MockCaptureRepo::insert(&state.pool, &capture).await {
        tracing::error!(
            mock_endpoint_id = endpoint.id,
            error = %e,
            "Failed to capture mock payload",
        );
    }

    StatusCode::OK.into_response()
}

