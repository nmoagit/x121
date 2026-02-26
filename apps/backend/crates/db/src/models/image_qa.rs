//! Image quality assurance models and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// QaCheckType
// ---------------------------------------------------------------------------

/// A row from the `qa_check_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct QaCheckType {
    pub id: DbId,
    pub name: String,
    pub category: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// ImageQualityScore
// ---------------------------------------------------------------------------

/// A row from the `image_quality_scores` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImageQualityScore {
    pub id: DbId,
    pub image_variant_id: Option<DbId>,
    pub character_id: DbId,
    pub check_type_id: DbId,
    pub score: Option<f64>,
    pub status: String,
    pub details: Option<serde_json::Value>,
    pub is_source_image: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new quality score.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImageQualityScore {
    pub image_variant_id: Option<DbId>,
    pub character_id: DbId,
    pub check_type_id: DbId,
    pub score: Option<f64>,
    pub status: String,
    pub details: Option<serde_json::Value>,
    pub is_source_image: bool,
}

// ---------------------------------------------------------------------------
// ImageQaThreshold
// ---------------------------------------------------------------------------

/// A row from the `image_qa_thresholds` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImageQaThreshold {
    pub id: DbId,
    pub project_id: Option<DbId>,
    pub check_type_id: DbId,
    pub warn_threshold: f64,
    pub fail_threshold: f64,
    pub is_blocking: bool,
    pub config: Option<serde_json::Value>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting a threshold.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertImageQaThreshold {
    pub check_type_id: DbId,
    pub warn_threshold: f64,
    pub fail_threshold: f64,
    pub is_blocking: Option<bool>,
    pub config: Option<serde_json::Value>,
}
