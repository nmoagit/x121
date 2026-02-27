//! Platform setting entity models and DTOs (PRD-110).
//!
//! Key-value store for admin-configurable platform settings.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A single platform setting row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PlatformSetting {
    pub id: DbId,
    pub key: String,
    pub value: String,
    pub category: String,
    pub updated_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create / Upsert DTO
// ---------------------------------------------------------------------------

/// DTO for upserting a platform setting.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertPlatformSetting {
    pub key: String,
    pub value: String,
    pub category: String,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// DTO for updating just the value of an existing setting.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePlatformSettingValue {
    pub value: String,
}
