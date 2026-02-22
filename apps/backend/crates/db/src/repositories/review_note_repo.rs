//! Repository for the `review_notes` and `review_note_tags` tables (PRD-38).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::review_note::{CreateReviewNote, ReviewNote, ReviewNoteTag, ReviewTag, UpdateReviewNote};

/// Column list for review_notes queries.
const NOTE_COLUMNS: &str = "id, segment_id, user_id, parent_note_id, timecode, \
    frame_number, text_content, voice_memo_path, voice_memo_transcript, \
    status, created_at, updated_at";

/// Column list for review_note_tags queries.
const NOTE_TAG_COLUMNS: &str = "id, note_id, tag_id, created_at";

/// Provides CRUD operations for review notes and note-tag associations.
pub struct ReviewNoteRepo;

impl ReviewNoteRepo {
    /// List all notes for a segment, ordered by created_at ascending.
    pub async fn list_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<ReviewNote>, sqlx::Error> {
        let query = format!(
            "SELECT {NOTE_COLUMNS} FROM review_notes
             WHERE segment_id = $1
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, ReviewNote>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// List all replies to a given parent note (thread).
    pub async fn list_thread(
        pool: &PgPool,
        parent_note_id: DbId,
    ) -> Result<Vec<ReviewNote>, sqlx::Error> {
        let query = format!(
            "SELECT {NOTE_COLUMNS} FROM review_notes
             WHERE parent_note_id = $1
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, ReviewNote>(&query)
            .bind(parent_note_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new review note, returning the created row.
    pub async fn create(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateReviewNote,
    ) -> Result<ReviewNote, sqlx::Error> {
        let query = format!(
            "INSERT INTO review_notes
                (segment_id, user_id, parent_note_id, timecode, frame_number,
                 text_content, voice_memo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {NOTE_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewNote>(&query)
            .bind(input.segment_id)
            .bind(user_id)
            .bind(input.parent_note_id)
            .bind(&input.timecode)
            .bind(input.frame_number)
            .bind(&input.text_content)
            .bind(&input.voice_memo_path)
            .fetch_one(pool)
            .await
    }

    /// Find a review note by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ReviewNote>, sqlx::Error> {
        let query = format!(
            "SELECT {NOTE_COLUMNS} FROM review_notes WHERE id = $1"
        );
        sqlx::query_as::<_, ReviewNote>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update a review note's text content and/or status.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateReviewNote,
    ) -> Result<ReviewNote, sqlx::Error> {
        let query = format!(
            "UPDATE review_notes SET
                text_content = COALESCE($1, text_content),
                status = COALESCE($2, status)
             WHERE id = $3
             RETURNING {NOTE_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewNote>(&query)
            .bind(&input.text_content)
            .bind(&input.status)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    /// Delete a review note by its ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM review_notes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Update only the status of a review note (resolve/reopen).
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
    ) -> Result<ReviewNote, sqlx::Error> {
        let query = format!(
            "UPDATE review_notes SET status = $1
             WHERE id = $2
             RETURNING {NOTE_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewNote>(&query)
            .bind(status)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    /// Assign one or more tags to a note (bulk insert, ignoring duplicates).
    pub async fn assign_tags(
        pool: &PgPool,
        note_id: DbId,
        tag_ids: &[DbId],
    ) -> Result<Vec<ReviewNoteTag>, sqlx::Error> {
        let mut results = Vec::with_capacity(tag_ids.len());
        for &tag_id in tag_ids {
            let query = format!(
                "INSERT INTO review_note_tags (note_id, tag_id)
                 VALUES ($1, $2)
                 ON CONFLICT (note_id, tag_id) DO NOTHING
                 RETURNING {NOTE_TAG_COLUMNS}"
            );
            if let Some(row) = sqlx::query_as::<_, ReviewNoteTag>(&query)
                .bind(note_id)
                .bind(tag_id)
                .fetch_optional(pool)
                .await?
            {
                results.push(row);
            }
        }
        Ok(results)
    }

    /// Remove a tag association from a note.
    pub async fn remove_tag(
        pool: &PgPool,
        note_id: DbId,
        tag_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM review_note_tags WHERE note_id = $1 AND tag_id = $2")
            .bind(note_id)
            .bind(tag_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Get all tags assigned to a specific note.
    pub async fn get_note_tags(
        pool: &PgPool,
        note_id: DbId,
    ) -> Result<Vec<ReviewTag>, sqlx::Error> {
        sqlx::query_as::<_, ReviewTag>(
            "SELECT rt.id, rt.name, rt.color, rt.category, rt.created_by,
                    rt.created_at, rt.updated_at
             FROM review_tags rt
             INNER JOIN review_note_tags rnt ON rnt.tag_id = rt.id
             WHERE rnt.note_id = $1
             ORDER BY rt.category, rt.name",
        )
        .bind(note_id)
        .fetch_all(pool)
        .await
    }
}
