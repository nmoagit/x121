//! Model checksum models and DTOs (PRD-43).
//!
//! Maps to the `model_checksums` table introduced in migration 000084.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `model_checksums` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ModelChecksum {
    pub id: DbId,
    pub model_name: String,
    pub file_path: String,
    pub expected_hash: String,
    pub file_size_bytes: Option<i64>,
    pub model_type: Option<String>,
    pub source_url: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for inserting a new model checksum.
#[derive(Debug, Deserialize)]
pub struct CreateModelChecksum {
    pub model_name: String,
    pub file_path: String,
    pub expected_hash: String,
    pub file_size_bytes: Option<i64>,
    pub model_type: Option<String>,
    pub source_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// DTO for updating an existing model checksum. All fields optional.
#[derive(Debug, Deserialize)]
pub struct UpdateModelChecksum {
    pub model_name: Option<String>,
    pub file_path: Option<String>,
    pub expected_hash: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub model_type: Option<String>,
    pub source_url: Option<String>,
}
