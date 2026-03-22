//! Avatar ingest session and entry entity models and DTOs (PRD-113).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `avatar_ingest_sessions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarIngestSession {
    pub id: DbId,
    pub project_id: DbId,
    pub status_id: StatusId,
    pub source_type: String,
    pub source_name: Option<String>,
    pub target_group_id: Option<DbId>,
    pub total_entries: i32,
    pub ready_count: i32,
    pub error_count: i32,
    pub excluded_count: i32,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new ingest session.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatarIngestSession {
    pub project_id: DbId,
    pub source_type: String,
    pub source_name: Option<String>,
    pub target_group_id: Option<DbId>,
    pub created_by: Option<DbId>,
}

/// A row from the `avatar_ingest_entries` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarIngestEntry {
    pub id: DbId,
    pub session_id: DbId,
    pub folder_name: Option<String>,
    pub parsed_name: String,
    pub confirmed_name: Option<String>,
    pub name_confidence: Option<String>,
    pub detected_images: serde_json::Value,
    pub image_classifications: serde_json::Value,
    pub metadata_status: Option<String>,
    pub metadata_json: Option<serde_json::Value>,
    pub metadata_source: Option<String>,
    pub tov_json: Option<serde_json::Value>,
    pub bio_json: Option<serde_json::Value>,
    pub metadata_errors: serde_json::Value,
    pub validation_status: Option<String>,
    pub validation_errors: serde_json::Value,
    pub validation_warnings: serde_json::Value,
    pub is_included: bool,
    pub created_avatar_id: Option<DbId>,
    pub script_execution_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new ingest entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatarIngestEntry {
    pub session_id: DbId,
    pub folder_name: Option<String>,
    pub parsed_name: String,
    pub name_confidence: Option<String>,
    pub detected_images: Option<serde_json::Value>,
    pub image_classifications: Option<serde_json::Value>,
    pub metadata_status: Option<String>,
    pub metadata_json: Option<serde_json::Value>,
    pub metadata_source: Option<String>,
    pub tov_json: Option<serde_json::Value>,
    pub bio_json: Option<serde_json::Value>,
}

/// DTO for updating an ingest entry. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAvatarIngestEntry {
    pub confirmed_name: Option<String>,
    pub image_classifications: Option<serde_json::Value>,
    pub metadata_json: Option<serde_json::Value>,
    pub is_included: Option<bool>,
}
