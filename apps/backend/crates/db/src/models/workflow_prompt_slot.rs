//! Workflow prompt slot model and DTOs (PRD-115).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `workflow_prompt_slots` table.
///
/// Maps a ComfyUI workflow node input to a named prompt slot for
/// scene-type defaults and character-level overrides.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkflowPromptSlot {
    pub id: DbId,
    pub workflow_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub slot_type: String,
    pub sort_order: i32,
    pub default_text: Option<String>,
    pub is_user_editable: bool,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new workflow prompt slot.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkflowPromptSlot {
    pub workflow_id: DbId,
    pub node_id: String,
    pub input_name: Option<String>,
    pub slot_label: String,
    pub slot_type: Option<String>,
    pub sort_order: Option<i32>,
    pub default_text: Option<String>,
    pub is_user_editable: Option<bool>,
    pub description: Option<String>,
}

/// DTO for updating an existing workflow prompt slot. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWorkflowPromptSlot {
    pub slot_label: Option<String>,
    pub slot_type: Option<String>,
    pub sort_order: Option<i32>,
    pub default_text: Option<String>,
    pub is_user_editable: Option<bool>,
    pub description: Option<String>,
}
