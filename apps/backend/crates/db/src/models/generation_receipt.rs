//! Generation receipt models and DTOs (PRD-69).
//!
//! Defines the database row struct for `generation_receipts` and associated
//! create/complete/response types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// An immutable generation receipt row from the `generation_receipts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GenerationReceipt {
    pub id: DbId,
    pub segment_id: DbId,
    pub source_image_hash: String,
    pub variant_image_hash: String,
    pub workflow_version: String,
    pub workflow_hash: String,
    pub model_asset_id: Option<DbId>,
    pub model_version: String,
    pub model_hash: String,
    pub lora_configs: serde_json::Value,
    pub prompt_text: String,
    pub negative_prompt: Option<String>,
    pub cfg_scale: f64,
    pub seed: i64,
    pub resolution_width: i32,
    pub resolution_height: i32,
    pub steps: i32,
    pub sampler: String,
    pub additional_params: serde_json::Value,
    pub inputs_hash: String,
    pub generation_started_at: Timestamp,
    pub generation_completed_at: Option<Timestamp>,
    pub generation_duration_ms: Option<i32>,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new generation receipt.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateGenerationReceipt {
    pub segment_id: DbId,
    pub source_image_hash: String,
    pub variant_image_hash: String,
    pub workflow_version: String,
    pub workflow_hash: String,
    pub model_asset_id: Option<DbId>,
    pub model_version: String,
    pub model_hash: String,
    pub lora_configs: serde_json::Value,
    pub prompt_text: String,
    pub negative_prompt: Option<String>,
    pub cfg_scale: f64,
    pub seed: i64,
    pub resolution_width: i32,
    pub resolution_height: i32,
    pub steps: i32,
    pub sampler: String,
    pub additional_params: serde_json::Value,
    pub inputs_hash: String,
    pub generation_started_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Complete DTO
// ---------------------------------------------------------------------------

/// Input for completing a generation receipt (setting timing fields).
#[derive(Debug, Clone, Deserialize)]
pub struct CompleteReceiptInput {
    pub completed_at: Timestamp,
    pub duration_ms: i32,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// A staleness report entry showing a segment whose model version
/// no longer matches the current asset version.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StalenessReportEntry {
    pub segment_id: DbId,
    pub scene_id: DbId,
    pub receipt_id: DbId,
    pub model_version: String,
    pub current_model_version: Option<String>,
}

/// An entry in reverse provenance: which segments used a given asset.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetUsageEntry {
    pub segment_id: DbId,
    pub scene_id: DbId,
    pub model_version: String,
    pub created_at: Timestamp,
}
