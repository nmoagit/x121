//! Worker pool entity models and DTOs (PRD-46).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// Entity structs (match database tables)
// ---------------------------------------------------------------------------

/// A worker row from the `workers` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Worker {
    pub id: DbId,
    pub name: String,
    pub hostname: String,
    pub ip_address: Option<String>,
    pub gpu_model: Option<String>,
    pub gpu_count: i16,
    pub vram_total_mb: Option<i32>,
    pub status_id: StatusId,
    pub tags: serde_json::Value,
    pub comfyui_instance_id: Option<DbId>,
    pub is_approved: bool,
    pub is_enabled: bool,
    pub last_heartbeat_at: Option<Timestamp>,
    pub registered_at: Timestamp,
    pub decommissioned_at: Option<Timestamp>,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `worker_health_log` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkerHealthLogEntry {
    pub id: DbId,
    pub worker_id: DbId,
    pub from_status_id: StatusId,
    pub to_status_id: StatusId,
    pub reason: Option<String>,
    pub transitioned_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create / Update DTOs
// ---------------------------------------------------------------------------

/// DTO for registering a new worker (admin or self-registration).
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorker {
    pub name: String,
    pub hostname: String,
    pub ip_address: Option<String>,
    pub gpu_model: Option<String>,
    pub gpu_count: Option<i16>,
    pub vram_total_mb: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub comfyui_instance_id: Option<DbId>,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for updating an existing worker. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWorker {
    pub hostname: Option<String>,
    pub ip_address: Option<String>,
    pub gpu_model: Option<String>,
    pub gpu_count: Option<i16>,
    pub vram_total_mb: Option<i32>,
    pub tags: Option<serde_json::Value>,
    pub comfyui_instance_id: Option<DbId>,
    pub is_enabled: Option<bool>,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for inserting a worker health log entry.
#[derive(Debug, Clone)]
pub struct CreateHealthLogEntry {
    pub worker_id: DbId,
    pub from_status_id: StatusId,
    pub to_status_id: StatusId,
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Aggregate DTOs
// ---------------------------------------------------------------------------

/// Aggregate fleet statistics.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FleetStats {
    pub total_workers: i64,
    pub idle_workers: i64,
    pub busy_workers: i64,
    pub offline_workers: i64,
    pub draining_workers: i64,
    pub approved_workers: i64,
    pub enabled_workers: i64,
}
