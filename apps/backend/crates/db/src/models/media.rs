//! Image entity models and DTOs.
//!
//! Covers three related tables:
//! - `source_media` -- original uploads
//! - `derived_media` -- processed/variant outputs
//! - `media_variants` -- labelled variants linking source and/or derived images

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// SourceMedia
// ---------------------------------------------------------------------------

/// A row from the `source_media` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SourceMedia {
    pub id: DbId,
    pub avatar_id: DbId,
    pub file_path: String,
    pub description: Option<String>,
    pub is_primary: bool,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new source image.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSourceMedia {
    pub avatar_id: DbId,
    pub file_path: String,
    pub description: Option<String>,
    pub is_primary: Option<bool>,
}

/// DTO for updating an existing source image.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSourceMedia {
    pub file_path: Option<String>,
    pub description: Option<String>,
    pub is_primary: Option<bool>,
}

// ---------------------------------------------------------------------------
// DerivedMedia
// ---------------------------------------------------------------------------

/// A row from the `derived_media` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DerivedMedia {
    pub id: DbId,
    pub source_media_id: DbId,
    pub avatar_id: DbId,
    pub file_path: String,
    pub variant_type: String,
    pub description: Option<String>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new derived image.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDerivedMedia {
    pub source_media_id: DbId,
    pub avatar_id: DbId,
    pub file_path: String,
    pub variant_type: String,
    pub description: Option<String>,
}

/// DTO for updating an existing derived image.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDerivedMedia {
    pub file_path: Option<String>,
    pub variant_type: Option<String>,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// MediaVariant
// ---------------------------------------------------------------------------

/// A row from the `media_variants` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MediaVariant {
    pub id: DbId,
    pub avatar_id: DbId,
    pub source_media_id: Option<DbId>,
    pub derived_media_id: Option<DbId>,
    pub variant_label: String,
    pub status_id: StatusId,
    pub file_path: String,
    pub variant_type: Option<String>,
    pub provenance: String,
    pub is_hero: bool,
    pub file_size_bytes: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub version: i32,
    pub parent_variant_id: Option<DbId>,
    pub generation_params: Option<serde_json::Value>,
    pub content_hash: Option<String>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new image variant.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMediaVariant {
    pub avatar_id: DbId,
    pub source_media_id: Option<DbId>,
    pub derived_media_id: Option<DbId>,
    pub variant_label: String,
    /// Defaults to 1 (Pending) if omitted.
    pub status_id: Option<StatusId>,
    pub file_path: String,
    pub variant_type: Option<String>,
    pub provenance: Option<String>,
    pub is_hero: Option<bool>,
    pub file_size_bytes: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub version: Option<i32>,
    pub parent_variant_id: Option<DbId>,
    pub generation_params: Option<serde_json::Value>,
    pub content_hash: Option<String>,
}

/// DTO for updating an existing image variant.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMediaVariant {
    pub source_media_id: Option<DbId>,
    pub derived_media_id: Option<DbId>,
    pub variant_label: Option<String>,
    pub status_id: Option<StatusId>,
    pub file_path: Option<String>,
    pub variant_type: Option<String>,
    pub provenance: Option<String>,
    pub is_hero: Option<bool>,
    pub file_size_bytes: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub generation_params: Option<serde_json::Value>,
}
