//! Model download entity model and DTOs (PRD-104).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `model_downloads` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ModelDownload {
    pub id: DbId,
    pub status_id: StatusId,
    pub source_type: String,
    pub source_url: String,
    pub source_model_id: Option<String>,
    pub source_version_id: Option<String>,
    pub model_name: String,
    pub model_type: String,
    pub base_model: Option<String>,
    pub file_name: String,
    pub file_size_bytes: Option<i64>,
    pub downloaded_bytes: i64,
    pub download_speed_bps: Option<i64>,
    pub target_path: Option<String>,
    pub expected_hash: Option<String>,
    pub actual_hash: Option<String>,
    pub hash_verified: bool,
    pub hash_mismatch: bool,
    pub source_metadata: serde_json::Value,
    pub asset_id: Option<DbId>,
    pub error_message: Option<String>,
    pub retry_count: i32,
    pub initiated_by: Option<DbId>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new model download record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateModelDownload {
    pub source_type: String,
    pub source_url: String,
    pub source_model_id: Option<String>,
    pub source_version_id: Option<String>,
    pub model_name: String,
    pub model_type: String,
    pub base_model: Option<String>,
    pub file_name: String,
    pub file_size_bytes: Option<i64>,
    pub target_path: Option<String>,
    pub expected_hash: Option<String>,
    pub source_metadata: Option<serde_json::Value>,
    pub initiated_by: Option<DbId>,
}

/// API request DTO for initiating a download from a URL.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDownloadRequest {
    pub url: String,
    pub model_name: Option<String>,
    pub model_type: Option<String>,
}

/// API response after successfully queuing a download.
#[derive(Debug, Clone, Serialize)]
pub struct DownloadCreatedResponse {
    pub download_id: DbId,
    pub status: String,
}
