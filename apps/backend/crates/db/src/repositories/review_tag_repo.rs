//! Repository for the `review_tags` table (PRD-38).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::review_note::{CreateReviewTag, ReviewTag, TagFrequency};

/// Column list for review_tags queries.
const COLUMNS: &str =
    "id, name, color, category, created_by, created_at, updated_at";

/// Provides CRUD operations for review tags.
pub struct ReviewTagRepo;

impl ReviewTagRepo {
    /// List all review tags, ordered by category then name.
    pub async fn list(pool: &PgPool) -> Result<Vec<ReviewTag>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM review_tags ORDER BY category, name"
        );
        sqlx::query_as::<_, ReviewTag>(&query)
            .fetch_all(pool)
            .await
    }

    /// Create a new review tag, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateReviewTag,
        created_by: Option<DbId>,
    ) -> Result<ReviewTag, sqlx::Error> {
        let query = format!(
            "INSERT INTO review_tags (name, color, category, created_by)
             VALUES ($1, COALESCE($2, '#888888'), COALESCE($3, 'general'), $4)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ReviewTag>(&query)
            .bind(&input.name)
            .bind(&input.color)
            .bind(&input.category)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a review tag by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ReviewTag>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM review_tags WHERE id = $1"
        );
        sqlx::query_as::<_, ReviewTag>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a review tag by its ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM review_tags WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Get tag usage frequency, optionally filtered by segment.
    ///
    /// Returns the count of notes associated with each tag.
    pub async fn tag_frequency(
        pool: &PgPool,
        segment_id: Option<DbId>,
    ) -> Result<Vec<TagFrequency>, sqlx::Error> {
        if let Some(seg_id) = segment_id {
            sqlx::query_as::<_, TagFrequency>(
                "SELECT rt.id AS tag_id, rt.name AS tag_name, COUNT(rnt.id) AS count
                 FROM review_tags rt
                 LEFT JOIN review_note_tags rnt ON rnt.tag_id = rt.id
                 LEFT JOIN review_notes rn ON rn.id = rnt.note_id AND rn.segment_id = $1
                 GROUP BY rt.id, rt.name
                 ORDER BY count DESC, rt.name",
            )
            .bind(seg_id)
            .fetch_all(pool)
            .await
        } else {
            sqlx::query_as::<_, TagFrequency>(
                "SELECT rt.id AS tag_id, rt.name AS tag_name, COUNT(rnt.id) AS count
                 FROM review_tags rt
                 LEFT JOIN review_note_tags rnt ON rnt.tag_id = rt.id
                 GROUP BY rt.id, rt.name
                 ORDER BY count DESC, rt.name",
            )
            .fetch_all(pool)
            .await
        }
    }
}
