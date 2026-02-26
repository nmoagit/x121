//! Role entity model.

use serde::Serialize;
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A role row from the `roles` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Role {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}
