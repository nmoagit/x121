//! Wiki article version model (PRD-56).
//!
//! Versions are immutable snapshots of article content, created on every edit.

use serde::Serialize;
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `wiki_versions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WikiVersion {
    pub id: DbId,
    pub article_id: DbId,
    pub version: i32,
    pub content_md: String,
    pub edited_by: Option<DbId>,
    pub edit_summary: Option<String>,
    pub created_at: Timestamp,
}
