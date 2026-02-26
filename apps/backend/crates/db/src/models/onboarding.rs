//! User onboarding entity model and DTOs (PRD-53).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `user_onboarding` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserOnboarding {
    pub id: DbId,
    pub user_id: DbId,
    pub tour_completed: bool,
    pub hints_dismissed_json: serde_json::Value,
    pub checklist_progress_json: serde_json::Value,
    pub feature_reveal_json: serde_json::Value,
    pub sample_project_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for partially updating onboarding state.
///
/// All fields are optional. JSONB fields are merged (not replaced) server-side.
#[derive(Debug, Deserialize)]
pub struct UpdateOnboarding {
    pub tour_completed: Option<bool>,
    pub hints_dismissed_json: Option<Vec<String>>,
    pub checklist_progress_json: Option<std::collections::HashMap<String, bool>>,
    pub feature_reveal_json: Option<std::collections::HashMap<String, bool>>,
}
