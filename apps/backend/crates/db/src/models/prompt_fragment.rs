//! Prompt fragment model and DTOs (PRD-115).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `prompt_fragments` table.
///
/// Reusable prompt text snippet stored in the fragment library.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PromptFragment {
    pub id: DbId,
    pub text: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: serde_json::Value,
    pub usage_count: i32,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new prompt fragment.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePromptFragment {
    pub text: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<serde_json::Value>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing prompt fragment. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePromptFragment {
    pub text: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<serde_json::Value>,
}

/// Query parameters for listing prompt fragments with optional filters.
#[derive(Debug, Clone, Deserialize)]
pub struct PromptFragmentListParams {
    pub search: Option<String>,
    pub category: Option<String>,
    pub scene_type_id: Option<DbId>,
}
