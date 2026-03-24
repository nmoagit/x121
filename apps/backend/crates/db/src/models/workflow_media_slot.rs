//! Workflow media slot model and DTOs (PRD-146).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `workflow_media_slots` table.
///
/// Maps a ComfyUI workflow node input to a named media slot for
/// seed images, LoRAs, and other media inputs that drive generation.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkflowMediaSlot {
    pub id: DbId,
    pub workflow_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub class_type: String,
    pub slot_label: String,
    pub media_type: String,
    pub is_required: bool,
    pub fallback_mode: Option<String>,
    pub fallback_value: Option<String>,
    pub sort_order: i32,
    pub description: Option<String>,
    pub seed_slot_name: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new workflow media slot.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkflowMediaSlot {
    pub workflow_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub class_type: Option<String>,
    pub slot_label: String,
    pub media_type: Option<String>,
    pub is_required: Option<bool>,
    pub fallback_mode: Option<String>,
    pub fallback_value: Option<String>,
    pub sort_order: Option<i32>,
    pub description: Option<String>,
    pub seed_slot_name: Option<String>,
}

/// DTO for updating an existing workflow media slot. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWorkflowMediaSlot {
    pub slot_label: Option<String>,
    pub media_type: Option<String>,
    pub is_required: Option<bool>,
    pub fallback_mode: Option<String>,
    pub fallback_value: Option<String>,
    pub sort_order: Option<i32>,
    pub description: Option<String>,
    pub seed_slot_name: Option<String>,
}
