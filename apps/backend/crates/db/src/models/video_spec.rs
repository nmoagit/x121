//! Video specification requirement entity model and DTOs (PRD-113).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `video_spec_requirements` table.
///
/// NUMERIC columns map to `String` because the workspace sqlx features
/// do not include `bigdecimal` or `rust_decimal`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct VideoSpecRequirement {
    pub id: DbId,
    pub project_id: Option<DbId>,
    pub scene_type_id: Option<DbId>,
    pub name: String,
    pub framerate: Option<String>,
    pub min_duration_secs: Option<String>,
    pub max_duration_secs: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new video spec requirement.
///
/// Numeric fields use `f64` for user input; the repository casts them
/// to NUMERIC via `$N::TEXT::NUMERIC` in SQL.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateVideoSpecRequirement {
    pub project_id: Option<DbId>,
    pub scene_type_id: Option<DbId>,
    pub name: String,
    pub framerate: Option<f64>,
    pub min_duration_secs: Option<f64>,
    pub max_duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
}

/// DTO for updating a video spec requirement. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateVideoSpecRequirement {
    pub name: Option<String>,
    pub framerate: Option<f64>,
    pub min_duration_secs: Option<f64>,
    pub max_duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
    pub is_active: Option<bool>,
}
