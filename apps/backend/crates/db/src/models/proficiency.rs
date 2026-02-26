//! User proficiency and focus mode models and DTOs (PRD-32).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `user_proficiency` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserProficiency {
    pub id: DbId,
    pub user_id: DbId,
    pub feature_area: String,
    pub proficiency_level: String,
    pub usage_count: i32,
    pub manual_override: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `user_focus_preferences` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserFocusPreference {
    pub id: DbId,
    pub user_id: DbId,
    pub focus_mode: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for manually setting a proficiency level.
#[derive(Debug, Deserialize)]
pub struct SetProficiency {
    pub feature_area: String,
    pub proficiency_level: String,
}

/// DTO for setting the user's focus mode.
#[derive(Debug, Deserialize)]
pub struct SetFocusMode {
    pub focus_mode: Option<String>,
}
