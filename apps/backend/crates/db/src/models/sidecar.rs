//! Sidecar template and dataset export models (PRD-40).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `sidecar_templates` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SidecarTemplate {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub format: String,
    pub target_tool: Option<String>,
    pub template_json: serde_json::Value,
    pub is_builtin: bool,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new sidecar template.
#[derive(Debug, Deserialize)]
pub struct CreateSidecarTemplate {
    pub name: String,
    pub description: Option<String>,
    pub format: String,
    pub target_tool: Option<String>,
    pub template_json: serde_json::Value,
}

/// DTO for updating an existing sidecar template. All fields are optional.
#[derive(Debug, Deserialize)]
pub struct UpdateSidecarTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub format: Option<String>,
    pub target_tool: Option<String>,
    pub template_json: Option<serde_json::Value>,
}

/// A row from the `dataset_exports` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DatasetExport {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub config_json: serde_json::Value,
    pub manifest_json: Option<serde_json::Value>,
    pub file_path: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub sample_count: Option<i32>,
    pub status_id: DbId,
    pub exported_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new dataset export.
#[derive(Debug, Deserialize)]
pub struct CreateDatasetExport {
    pub name: String,
    pub config_json: serde_json::Value,
}
