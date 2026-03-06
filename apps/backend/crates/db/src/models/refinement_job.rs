//! Refinement job entity model and DTOs (PRD-125).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `refinement_jobs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RefinementJob {
    pub id: DbId,
    pub uuid: sqlx::types::Uuid,
    pub character_id: DbId,
    pub status: String,
    pub source_bio: Option<serde_json::Value>,
    pub source_tov: Option<serde_json::Value>,
    pub llm_provider: String,
    pub llm_model: String,
    pub enrich: bool,
    pub iterations: serde_json::Value,
    pub final_metadata: Option<serde_json::Value>,
    pub final_report: Option<serde_json::Value>,
    pub error: Option<String>,
    pub metadata_version_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub deleted_at: Option<Timestamp>,
}

/// DTO for creating a new refinement job.
#[derive(Debug, Deserialize)]
pub struct CreateRefinementJob {
    pub character_id: DbId,
    pub source_bio: Option<serde_json::Value>,
    pub source_tov: Option<serde_json::Value>,
    pub llm_provider: String,
    pub llm_model: String,
    pub enrich: bool,
}
