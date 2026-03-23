//! Pipeline generator script model (PRD-143).
//!
//! Scripts stored in the database that can be executed to generate avatar
//! metadata (e.g., bio.json, tov.json). Each script belongs to a pipeline
//! and has versioning support.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use x121_core::types::{DbId, Timestamp};

/// A row from the `pipeline_generator_scripts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PipelineGeneratorScript {
    pub id: DbId,
    pub uuid: Uuid,
    pub pipeline_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub script_type: String,
    pub script_content: String,
    pub version: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new generator script.
#[derive(Debug, Deserialize)]
pub struct CreatePipelineGeneratorScript {
    pub pipeline_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub script_type: String,
    pub script_content: String,
}

/// DTO for updating a generator script. Fields are optional.
#[derive(Debug, Deserialize)]
pub struct UpdatePipelineGeneratorScript {
    pub name: Option<String>,
    pub description: Option<String>,
    pub script_content: Option<String>,
}

/// Valid script types.
const VALID_SCRIPT_TYPES: &[&str] = &["python", "javascript", "shell"];

/// Check if a script type string is valid.
pub fn is_valid_script_type(script_type: &str) -> bool {
    VALID_SCRIPT_TYPES.contains(&script_type)
}
