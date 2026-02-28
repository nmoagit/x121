//! Platform Setup Wizard models and DTOs (PRD-105).
//!
//! Defines the database row struct for `platform_setup` and the associated
//! update DTO for completing or resetting steps.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// PlatformSetup (row)
// ---------------------------------------------------------------------------

/// A `platform_setup` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PlatformSetup {
    pub id: DbId,
    pub step_name: String,
    pub completed: bool,
    pub config_json: Option<serde_json::Value>,
    pub validated_at: Option<Timestamp>,
    pub configured_by: Option<DbId>,
    pub error_message: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// UpdatePlatformSetup (DTO)
// ---------------------------------------------------------------------------

/// Input for updating a platform setup step. All fields optional — only
/// non-`None` values are applied.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePlatformSetup {
    pub completed: Option<bool>,
    pub config_json: Option<serde_json::Value>,
    pub validated_at: Option<Timestamp>,
    pub configured_by: Option<DbId>,
    pub error_message: Option<String>,
}
