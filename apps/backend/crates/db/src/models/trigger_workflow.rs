//! Trigger workflow models and DTOs (PRD-97).
//!
//! Defines the database row structs for `triggers` and `trigger_log`
//! tables, plus create / update DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Trigger entity
// ---------------------------------------------------------------------------

/// A trigger rule row from the `triggers` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Trigger {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub event_type: String,
    pub entity_type: String,
    pub scope: Option<serde_json::Value>,
    pub conditions: Option<serde_json::Value>,
    pub actions: serde_json::Value,
    pub execution_mode: String,
    pub max_chain_depth: i32,
    pub requires_approval: bool,
    pub is_enabled: bool,
    pub sort_order: i32,
    pub created_by_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new trigger.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTrigger {
    pub project_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub event_type: String,
    pub entity_type: String,
    pub scope: Option<serde_json::Value>,
    pub conditions: Option<serde_json::Value>,
    pub actions: serde_json::Value,
    pub execution_mode: Option<String>,
    pub max_chain_depth: Option<i32>,
    pub requires_approval: Option<bool>,
    pub is_enabled: Option<bool>,
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// Input for updating an existing trigger. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTrigger {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_type: Option<String>,
    pub entity_type: Option<String>,
    pub scope: Option<serde_json::Value>,
    pub conditions: Option<serde_json::Value>,
    pub actions: Option<serde_json::Value>,
    pub execution_mode: Option<String>,
    pub max_chain_depth: Option<i32>,
    pub requires_approval: Option<bool>,
    pub is_enabled: Option<bool>,
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------------------------
// Trigger log entity
// ---------------------------------------------------------------------------

/// A trigger execution log row from the `trigger_log` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TriggerLog {
    pub id: DbId,
    pub trigger_id: DbId,
    pub event_data: serde_json::Value,
    pub actions_taken: serde_json::Value,
    pub chain_depth: i32,
    pub result: String,
    pub error_message: Option<String>,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create trigger log DTO
// ---------------------------------------------------------------------------

/// Input for inserting a trigger execution log entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTriggerLog {
    pub trigger_id: DbId,
    pub event_data: Option<serde_json::Value>,
    pub actions_taken: Option<serde_json::Value>,
    pub chain_depth: Option<i32>,
    pub result: String,
    pub error_message: Option<String>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Trigger with aggregated stats (fire count and last-fired timestamp).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TriggerWithStats {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub event_type: String,
    pub entity_type: String,
    pub scope: Option<serde_json::Value>,
    pub conditions: Option<serde_json::Value>,
    pub actions: serde_json::Value,
    pub execution_mode: String,
    pub max_chain_depth: i32,
    pub requires_approval: bool,
    pub is_enabled: bool,
    pub sort_order: i32,
    pub created_by_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub fire_count: i64,
    pub last_fired_at: Option<Timestamp>,
}
