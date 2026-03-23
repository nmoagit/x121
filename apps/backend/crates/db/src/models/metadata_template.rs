//! Metadata template entity models and DTOs (PRD-113).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `metadata_templates` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MetadataTemplate {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub project_id: Option<DbId>,
    pub pipeline_id: Option<DbId>,
    pub is_default: bool,
    pub version: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new metadata template.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMetadataTemplate {
    pub name: String,
    pub description: Option<String>,
    pub project_id: Option<DbId>,
    pub pipeline_id: Option<DbId>,
    pub is_default: Option<bool>,
}

/// DTO for updating a metadata template. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMetadataTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_default: Option<bool>,
}

/// A row from the `metadata_template_fields` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MetadataTemplateField {
    pub id: DbId,
    pub template_id: DbId,
    pub field_name: String,
    pub field_type: String,
    pub is_required: bool,
    pub constraints: serde_json::Value,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new template field.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMetadataTemplateField {
    pub template_id: DbId,
    pub field_name: String,
    pub field_type: String,
    pub is_required: Option<bool>,
    pub constraints: Option<serde_json::Value>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}
