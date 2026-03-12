//! Cloud GPU provider entity models and DTOs (PRD-114).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// Entity structs (match database tables)
// ---------------------------------------------------------------------------

/// A row from the `cloud_providers` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudProvider {
    pub id: DbId,
    pub name: String,
    pub provider_type: String,
    pub api_key_encrypted: Vec<u8>,
    pub api_key_nonce: Vec<u8>,
    pub base_url: Option<String>,
    pub settings: serde_json::Value,
    pub status_id: StatusId,
    pub budget_limit_cents: Option<i64>,
    pub budget_period_start: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Safe view of a provider (no encrypted key material).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudProviderSafe {
    pub id: DbId,
    pub name: String,
    pub provider_type: String,
    pub base_url: Option<String>,
    pub settings: serde_json::Value,
    pub status_id: StatusId,
    pub budget_limit_cents: Option<i64>,
    pub budget_period_start: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `cloud_gpu_types` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudGpuType {
    pub id: DbId,
    pub provider_id: DbId,
    pub gpu_id: String,
    pub name: String,
    pub vram_mb: i32,
    pub cost_per_hour_cents: i32,
    pub max_gpu_count: i16,
    pub available: bool,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `cloud_instances` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudInstance {
    pub id: DbId,
    pub provider_id: DbId,
    pub gpu_type_id: DbId,
    pub external_id: String,
    pub name: Option<String>,
    pub status_id: StatusId,
    pub ip_address: Option<String>,
    pub ssh_port: Option<i32>,
    pub gpu_count: i16,
    pub cost_per_hour_cents: i32,
    pub total_cost_cents: i64,
    pub metadata: serde_json::Value,
    pub started_at: Option<Timestamp>,
    pub stopped_at: Option<Timestamp>,
    pub last_health_check: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `cloud_scaling_rules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudScalingRule {
    pub id: DbId,
    pub provider_id: DbId,
    pub gpu_type_id: DbId,
    pub min_instances: i16,
    pub max_instances: i16,
    pub queue_threshold: i32,
    pub cooldown_secs: i32,
    pub budget_limit_cents: Option<i64>,
    pub enabled: bool,
    pub last_scaled_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `cloud_cost_events` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudCostEvent {
    pub id: DbId,
    pub instance_id: DbId,
    pub provider_id: DbId,
    pub event_type: String,
    pub amount_cents: i64,
    pub description: Option<String>,
    pub created_at: Timestamp,
}

/// A row from the `cloud_scaling_events` audit table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudScalingEvent {
    pub id: DbId,
    pub rule_id: DbId,
    pub provider_id: DbId,
    pub action: String,
    pub reason: String,
    pub instances_changed: i16,
    pub queue_depth: i32,
    pub current_count: i16,
    pub budget_spent_cents: i64,
    pub cooldown_remaining_secs: i32,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create / Update DTOs
// ---------------------------------------------------------------------------

/// DTO for creating a new cloud provider.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCloudProvider {
    pub name: String,
    pub provider_type: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub budget_limit_cents: Option<i64>,
}

/// DTO for updating an existing cloud provider. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCloudProvider {
    pub name: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub status_id: Option<StatusId>,
    pub budget_limit_cents: Option<i64>,
}

/// DTO for creating/syncing a GPU type.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCloudGpuType {
    pub gpu_id: String,
    pub name: String,
    pub vram_mb: i32,
    pub cost_per_hour_cents: i32,
    pub max_gpu_count: Option<i16>,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for updating a GPU type.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCloudGpuType {
    pub name: Option<String>,
    pub cost_per_hour_cents: Option<i32>,
    pub max_gpu_count: Option<i16>,
    pub available: Option<bool>,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for provisioning a new cloud instance.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCloudInstance {
    pub gpu_type_id: DbId,
    pub external_id: String,
    pub name: Option<String>,
    pub gpu_count: Option<i16>,
    pub cost_per_hour_cents: i32,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for creating a scaling rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCloudScalingRule {
    pub gpu_type_id: DbId,
    pub min_instances: Option<i16>,
    pub max_instances: Option<i16>,
    pub queue_threshold: Option<i32>,
    pub cooldown_secs: Option<i32>,
    pub budget_limit_cents: Option<i64>,
    pub enabled: Option<bool>,
}

/// DTO for updating a scaling rule. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCloudScalingRule {
    pub min_instances: Option<i16>,
    pub max_instances: Option<i16>,
    pub queue_threshold: Option<i32>,
    pub cooldown_secs: Option<i32>,
    pub budget_limit_cents: Option<i64>,
    pub enabled: Option<bool>,
}

/// DTO for recording a scaling decision event.
#[derive(Debug, Clone)]
pub struct CreateCloudScalingEvent {
    pub rule_id: DbId,
    pub provider_id: DbId,
    pub action: String,
    pub reason: String,
    pub instances_changed: i16,
    pub queue_depth: i32,
    pub current_count: i16,
    pub budget_spent_cents: i64,
    pub cooldown_remaining_secs: i32,
}

/// DTO for recording a cost event.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCloudCostEvent {
    pub instance_id: DbId,
    pub provider_id: DbId,
    pub event_type: String,
    pub amount_cents: i64,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Aggregate DTOs
// ---------------------------------------------------------------------------

/// Aggregate cost summary for a provider.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProviderCostSummary {
    pub total_cost_cents: i64,
    pub event_count: i64,
}

/// Aggregate dashboard statistics.
#[derive(Debug, Clone, Serialize)]
pub struct CloudDashboardStats {
    pub total_providers: i64,
    pub active_providers: i64,
    pub total_instances: i64,
    pub running_instances: i64,
    pub total_cost_cents: i64,
}
