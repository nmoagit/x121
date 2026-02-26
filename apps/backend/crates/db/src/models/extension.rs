//! Extension models and DTOs (PRD-85).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `extensions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Extension {
    pub id: DbId,
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub manifest_json: serde_json::Value,
    pub settings_json: serde_json::Value,
    pub enabled: bool,
    pub source_path: String,
    pub api_version: String,
    pub installed_by: Option<DbId>,
    pub installed_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for creating (installing) a new extension.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateExtension {
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub manifest_json: serde_json::Value,
    pub settings_json: Option<serde_json::Value>,
    pub source_path: String,
    pub api_version: String,
    pub installed_by: Option<DbId>,
}

/// DTO for updating extension settings.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateExtensionSettings {
    pub settings_json: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Lightweight extension info returned by the registry endpoint.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ExtensionRegistration {
    pub id: DbId,
    pub name: String,
    pub version: String,
    pub manifest_json: serde_json::Value,
    pub settings_json: serde_json::Value,
    pub enabled: bool,
}
