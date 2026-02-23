//! Wiki article and related DTO models (PRD-56).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `wiki_articles` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WikiArticle {
    pub id: DbId,
    pub title: String,
    pub slug: String,
    pub content_md: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_builtin: bool,
    pub is_pinned: bool,
    pub pin_location: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new wiki article.
#[derive(Debug, Deserialize)]
pub struct CreateWikiArticle {
    pub title: String,
    /// Auto-generated from title if `None`.
    pub slug: Option<String>,
    pub content_md: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_pinned: Option<bool>,
    pub pin_location: Option<String>,
}

/// DTO for updating an existing wiki article.
#[derive(Debug, Deserialize)]
pub struct UpdateWikiArticle {
    pub title: Option<String>,
    pub content_md: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_pinned: Option<bool>,
    pub pin_location: Option<String>,
    pub edit_summary: Option<String>,
}

/// Query params for comparing two article versions.
#[derive(Debug, Deserialize)]
pub struct DiffRequest {
    pub v1: i32,
    pub v2: i32,
}

/// Response for a version diff.
#[derive(Debug, Serialize)]
pub struct DiffResponse {
    pub article_id: DbId,
    pub slug: String,
    pub v1: i32,
    pub v2: i32,
    pub lines: Vec<DiffLineDto>,
}

/// A single line in a diff response (serializable).
#[derive(Debug, Serialize)]
pub struct DiffLineDto {
    pub line_type: String,
    pub content: String,
}

/// Response for contextual help lookups.
#[derive(Debug, Serialize)]
pub struct ContextualHelpResponse {
    pub element_id: String,
    pub article: Option<WikiArticle>,
}
