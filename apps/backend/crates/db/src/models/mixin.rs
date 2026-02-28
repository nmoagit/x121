//! Mixin (reusable parameter bundle) model and DTOs (PRD-100).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `mixins` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Mixin {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub parameters: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new mixin.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMixin {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<serde_json::Value>,
}

/// DTO for updating an existing mixin. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMixin {
    pub name: Option<String>,
    pub description: Option<String>,
    pub parameters: Option<serde_json::Value>,
}

/// A row from the `scene_type_mixins` join table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypeMixin {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub mixin_id: DbId,
    pub apply_order: i32,
    pub created_at: Timestamp,
}

/// DTO for applying a mixin to a scene type.
#[derive(Debug, Clone, Deserialize)]
pub struct ApplyMixin {
    pub mixin_id: DbId,
    pub apply_order: Option<i32>,
}
