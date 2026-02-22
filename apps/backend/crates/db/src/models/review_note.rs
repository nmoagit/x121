//! Review note, review tag, and note-tag association models (PRD-38).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/* --------------------------------------------------------------------------
   Review tags
   -------------------------------------------------------------------------- */

/// A row from the `review_tags` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewTag {
    pub id: DbId,
    pub name: String,
    pub color: String,
    pub category: String,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new review tag.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewTag {
    pub name: String,
    pub color: Option<String>,
    pub category: Option<String>,
}

/* --------------------------------------------------------------------------
   Review notes
   -------------------------------------------------------------------------- */

/// A row from the `review_notes` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewNote {
    pub id: DbId,
    pub segment_id: DbId,
    pub user_id: DbId,
    pub parent_note_id: Option<DbId>,
    pub timecode: Option<String>,
    pub frame_number: Option<i32>,
    pub text_content: Option<String>,
    pub voice_memo_path: Option<String>,
    pub voice_memo_transcript: Option<String>,
    pub status: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new review note.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewNote {
    pub segment_id: DbId,
    pub parent_note_id: Option<DbId>,
    pub timecode: Option<String>,
    pub frame_number: Option<i32>,
    pub text_content: Option<String>,
    pub voice_memo_path: Option<String>,
    pub tag_ids: Option<Vec<DbId>>,
}

/// DTO for updating an existing review note.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReviewNote {
    pub text_content: Option<String>,
    pub status: Option<String>,
}

/* --------------------------------------------------------------------------
   Note-tag associations
   -------------------------------------------------------------------------- */

/// A row from the `review_note_tags` junction table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewNoteTag {
    pub id: DbId,
    pub note_id: DbId,
    pub tag_id: DbId,
    pub created_at: Timestamp,
}

/* --------------------------------------------------------------------------
   Aggregation types
   -------------------------------------------------------------------------- */

/// Tag usage frequency (aggregate query result).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TagFrequency {
    pub tag_id: DbId,
    pub tag_name: String,
    pub count: i64,
}
