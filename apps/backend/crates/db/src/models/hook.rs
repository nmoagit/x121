//! Hook models and DTOs (PRD-77).
//!
//! Defines the database row struct for `hooks` and associated
//! create / update / filter types used by the repository and API layers.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A hook row from the `hooks` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Hook {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub hook_type: String,
    pub hook_point: String,
    pub scope_type: String,
    pub scope_id: Option<DbId>,
    pub failure_mode: String,
    pub config_json: serde_json::Value,
    pub sort_order: i32,
    pub enabled: bool,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new hook record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateHook {
    pub name: String,
    pub description: Option<String>,
    pub hook_type: String,
    pub hook_point: String,
    pub scope_type: String,
    pub scope_id: Option<DbId>,
    pub failure_mode: Option<String>,
    pub config_json: serde_json::Value,
    pub sort_order: Option<i32>,
    pub enabled: Option<bool>,
    pub created_by: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// Input for updating an existing hook. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateHook {
    pub name: Option<String>,
    pub description: Option<String>,
    pub hook_type: Option<String>,
    pub failure_mode: Option<String>,
    pub config_json: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

/// Query parameters for filtering hooks.
#[derive(Debug, Clone, Deserialize)]
pub struct HookFilter {
    pub scope_type: Option<String>,
    pub scope_id: Option<DbId>,
    pub hook_point: Option<String>,
    pub enabled: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
