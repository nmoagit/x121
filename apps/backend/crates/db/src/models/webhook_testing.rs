//! Webhook Testing Console models and DTOs (PRD-99).
//!
//! Defines the database row structs for `webhook_delivery_log`,
//! `mock_endpoints`, and `mock_endpoint_captures`, plus associated
//! create DTOs and paginated response types.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};
use x121_core::webhook_testing::EndpointHealth;

// ---------------------------------------------------------------------------
// WebhookDeliveryLog entity
// ---------------------------------------------------------------------------

/// A row from the `webhook_delivery_log` table.
///
/// Captures the full request/response details for every webhook delivery
/// attempt (append-only).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WebhookDeliveryLog {
    pub id: DbId,
    pub endpoint_id: DbId,
    pub endpoint_type: String,
    pub event_type: String,
    pub request_method: String,
    pub request_url: String,
    pub request_headers_json: Option<serde_json::Value>,
    pub request_body_json: Option<serde_json::Value>,
    pub response_status: Option<i16>,
    pub response_headers_json: Option<serde_json::Value>,
    pub response_body: Option<String>,
    pub duration_ms: i32,
    pub success: bool,
    pub error_message: Option<String>,
    pub is_test: bool,
    pub is_replay: bool,
    pub replay_of_id: Option<DbId>,
    pub retry_count: i16,
    pub created_at: Timestamp,
}

/// Input for inserting a new delivery log record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDeliveryLog {
    pub endpoint_id: DbId,
    pub endpoint_type: String,
    pub event_type: String,
    pub request_method: String,
    pub request_url: String,
    pub request_headers_json: Option<serde_json::Value>,
    pub request_body_json: Option<serde_json::Value>,
    pub response_status: Option<i16>,
    pub response_headers_json: Option<serde_json::Value>,
    pub response_body: Option<String>,
    pub duration_ms: i32,
    pub success: bool,
    pub error_message: Option<String>,
    pub is_test: bool,
    pub is_replay: bool,
    pub replay_of_id: Option<DbId>,
    pub retry_count: i16,
}

// ---------------------------------------------------------------------------
// MockEndpoint entity
// ---------------------------------------------------------------------------

/// A row from the `mock_endpoints` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MockEndpoint {
    pub id: DbId,
    pub name: String,
    pub token: String,
    pub webhook_endpoint_id: Option<DbId>,
    pub capture_enabled: bool,
    pub retention_hours: i32,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating a new mock endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMockEndpoint {
    pub name: String,
    pub token: String,
    pub webhook_endpoint_id: Option<DbId>,
    pub capture_enabled: Option<bool>,
    pub retention_hours: Option<i32>,
    pub created_by: DbId,
}

// ---------------------------------------------------------------------------
// MockEndpointCapture entity
// ---------------------------------------------------------------------------

/// A row from the `mock_endpoint_captures` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MockEndpointCapture {
    pub id: DbId,
    pub mock_endpoint_id: DbId,
    pub request_method: String,
    pub request_headers_json: Option<serde_json::Value>,
    pub request_body_json: Option<serde_json::Value>,
    pub source_ip: Option<String>,
    pub received_at: Timestamp,
}

/// Input for inserting a captured payload.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMockCapture {
    pub mock_endpoint_id: DbId,
    pub request_method: String,
    pub request_headers_json: Option<serde_json::Value>,
    pub request_body_json: Option<serde_json::Value>,
    pub source_ip: Option<String>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Paginated delivery log response.
#[derive(Debug, Serialize)]
pub struct DeliveryLogPage {
    pub items: Vec<WebhookDeliveryLog>,
    pub total: i64,
}

/// Paginated mock endpoint response.
#[derive(Debug, Serialize)]
pub struct MockEndpointPage {
    pub items: Vec<MockEndpoint>,
    pub total: i64,
}

/// Paginated capture response.
#[derive(Debug, Serialize)]
pub struct CapturePage {
    pub items: Vec<MockEndpointCapture>,
    pub total: i64,
}

/// Health summary for a specific endpoint.
#[derive(Debug, Serialize)]
pub struct HealthSummary {
    pub endpoint_id: DbId,
    pub endpoint_type: String,
    pub health: EndpointHealth,
}
