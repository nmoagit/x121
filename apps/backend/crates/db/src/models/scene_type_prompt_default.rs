//! Scene type prompt default model and DTOs (PRD-115).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_type_prompt_defaults` table.
///
/// Stores the default prompt text for a given scene type / prompt slot pair.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypePromptDefault {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub prompt_text: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating (or upserting) a scene type prompt default.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneTypePromptDefault {
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub prompt_text: String,
}

/// DTO for updating an existing scene type prompt default.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneTypePromptDefault {
    pub prompt_text: Option<String>,
}
