//! Image entity models and DTOs.
//!
//! Covers three related tables:
//! - `source_images` -- original uploads
//! - `derived_images` -- processed/variant outputs
//! - `image_variants` -- labelled variants linking source and/or derived images

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// SourceImage
// ---------------------------------------------------------------------------

/// A row from the `source_images` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SourceImage {
    pub id: DbId,
    pub character_id: DbId,
    pub file_path: String,
    pub description: Option<String>,
    pub is_primary: bool,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new source image.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSourceImage {
    pub character_id: DbId,
    pub file_path: String,
    pub description: Option<String>,
    pub is_primary: Option<bool>,
}

/// DTO for updating an existing source image.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSourceImage {
    pub file_path: Option<String>,
    pub description: Option<String>,
    pub is_primary: Option<bool>,
}

// ---------------------------------------------------------------------------
// DerivedImage
// ---------------------------------------------------------------------------

/// A row from the `derived_images` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DerivedImage {
    pub id: DbId,
    pub source_image_id: DbId,
    pub character_id: DbId,
    pub file_path: String,
    pub variant_type: String,
    pub description: Option<String>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new derived image.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDerivedImage {
    pub source_image_id: DbId,
    pub character_id: DbId,
    pub file_path: String,
    pub variant_type: String,
    pub description: Option<String>,
}

/// DTO for updating an existing derived image.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDerivedImage {
    pub file_path: Option<String>,
    pub variant_type: Option<String>,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// ImageVariant
// ---------------------------------------------------------------------------

/// A row from the `image_variants` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImageVariant {
    pub id: DbId,
    pub character_id: DbId,
    pub source_image_id: Option<DbId>,
    pub derived_image_id: Option<DbId>,
    pub variant_label: String,
    pub status_id: StatusId,
    pub file_path: String,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new image variant.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImageVariant {
    pub character_id: DbId,
    pub source_image_id: Option<DbId>,
    pub derived_image_id: Option<DbId>,
    pub variant_label: String,
    /// Defaults to 1 (Pending) if omitted.
    pub status_id: Option<StatusId>,
    pub file_path: String,
}

/// DTO for updating an existing image variant.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateImageVariant {
    pub source_image_id: Option<DbId>,
    pub derived_image_id: Option<DbId>,
    pub variant_label: Option<String>,
    pub status_id: Option<StatusId>,
    pub file_path: Option<String>,
}
