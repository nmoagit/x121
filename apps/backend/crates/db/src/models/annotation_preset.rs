//! Annotation preset model and DTOs (PRD-149).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `annotation_presets` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AnnotationPreset {
    pub id: DbId,
    pub pipeline_id: Option<DbId>,
    pub label: String,
    pub color: Option<String>,
    pub sort_order: i32,
    pub created_at: Timestamp,
}

/// DTO for creating a new annotation preset.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAnnotationPreset {
    pub pipeline_id: Option<DbId>,
    pub label: String,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
}

/// DTO for updating an existing annotation preset.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAnnotationPreset {
    pub label: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
}
