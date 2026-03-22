//! Avatar deliverable ignore model and DTOs (PRD-126).
//!
//! Marks specific scene_type + track combinations as intentionally skipped
//! for a avatar, excluding them from readiness calculations.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `avatar_deliverable_ignores` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarDeliverableIgnore {
    pub id: DbId,
    pub uuid: sqlx::types::Uuid,
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
    pub ignored_by: Option<String>,
    pub reason: Option<String>,
    pub created_at: Timestamp,
}

/// DTO for creating a new deliverable ignore entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDeliverableIgnore {
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
    pub ignored_by: Option<String>,
    pub reason: Option<String>,
}
