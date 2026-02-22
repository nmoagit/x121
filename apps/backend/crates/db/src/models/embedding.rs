//! Embedding-related entity models and DTOs (PRD-76).
//!
//! These models map to the `embedding_statuses`, `detected_faces`, and
//! `embedding_history` tables. The `face_embedding` vector column is
//! handled separately (not in `FromRow` structs) because pgvector types
//! are stored/read via raw SQL casts.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// Embedding status lookup
// ---------------------------------------------------------------------------

/// A row from the `embedding_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EmbeddingStatusLookup {
    pub id: StatusId,
    pub name: String,
    pub label: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Detected face
// ---------------------------------------------------------------------------

/// A detected face from the `detected_faces` table.
///
/// The `embedding` column is `vector(512)` in the database but is stored
/// here as `serde_json::Value` because we use runtime queries rather than
/// compile-time sqlx macros. The actual vector is cast to/from JSON in SQL.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DetectedFace {
    pub id: DbId,
    pub character_id: DbId,
    pub bounding_box: serde_json::Value,
    pub confidence: f64,
    pub is_primary: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for inserting a new detected face.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDetectedFace {
    pub bounding_box: serde_json::Value,
    pub confidence: f64,
    /// Raw embedding vector as `f32` values. Converted to pgvector in SQL.
    pub embedding: Vec<f32>,
    pub is_primary: bool,
}

// ---------------------------------------------------------------------------
// Embedding history
// ---------------------------------------------------------------------------

/// A row from the `embedding_history` table (audit trail of replaced embeddings).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EmbeddingHistory {
    pub id: DbId,
    pub character_id: DbId,
    pub face_detection_confidence: f64,
    pub face_bounding_box: Option<serde_json::Value>,
    pub replaced_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// API response DTOs
// ---------------------------------------------------------------------------

/// Summary of a character's current embedding status, returned by the API.
#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingStatusResponse {
    pub character_id: DbId,
    pub embedding_status_id: StatusId,
    pub embedding_status_label: String,
    pub face_detection_confidence: Option<f64>,
    pub face_bounding_box: Option<serde_json::Value>,
    pub embedding_extracted_at: Option<Timestamp>,
    pub has_embedding: bool,
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Request body for POST `.../select-face`.
#[derive(Debug, Clone, Deserialize)]
pub struct SelectFaceRequest {
    pub face_id: DbId,
}

/// Request body for POST `.../extract-embedding`.
#[derive(Debug, Clone, Deserialize)]
pub struct ExtractEmbeddingRequest {
    /// Optional custom confidence threshold (defaults to 0.7).
    pub confidence_threshold: Option<f64>,
}
