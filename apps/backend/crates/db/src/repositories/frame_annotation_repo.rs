//! Repository for the `frame_annotations` table (PRD-70).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::frame_annotation::{
    AnnotationSummary, CreateFrameAnnotation, FrameAnnotation, UpdateFrameAnnotation,
};

/// Column list for frame_annotations queries.
const COLUMNS: &str = "id, segment_id, user_id, frame_number, annotations_json, \
    review_note_id, created_at, updated_at";

/// Provides CRUD operations for frame annotations.
pub struct FrameAnnotationRepo;

impl FrameAnnotationRepo {
    /// Create a new frame annotation, returning the created row.
    pub async fn create(
        pool: &PgPool,
        segment_id: DbId,
        user_id: DbId,
        input: &CreateFrameAnnotation,
    ) -> Result<FrameAnnotation, sqlx::Error> {
        let query = format!(
            "INSERT INTO frame_annotations
                (segment_id, user_id, frame_number, annotations_json, review_note_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(segment_id)
            .bind(user_id)
            .bind(input.frame_number)
            .bind(&input.annotations_json)
            .bind(input.review_note_id)
            .fetch_one(pool)
            .await
    }

    /// Find a frame annotation by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM frame_annotations WHERE id = $1"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all annotations for a segment, ordered by frame number ascending.
    pub async fn list_by_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM frame_annotations
             WHERE segment_id = $1
             ORDER BY frame_number ASC"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// List annotations for a specific segment and frame number.
    pub async fn list_by_segment_and_frame(
        pool: &PgPool,
        segment_id: DbId,
        frame_number: i32,
    ) -> Result<Vec<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM frame_annotations
             WHERE segment_id = $1 AND frame_number = $2
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(segment_id)
            .bind(frame_number)
            .fetch_all(pool)
            .await
    }

    /// List annotations for a specific segment and user (per-reviewer layer).
    pub async fn list_by_segment_and_user(
        pool: &PgPool,
        segment_id: DbId,
        user_id: DbId,
    ) -> Result<Vec<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM frame_annotations
             WHERE segment_id = $1 AND user_id = $2
             ORDER BY frame_number ASC"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(segment_id)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Update a frame annotation's JSON and/or review note link.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateFrameAnnotation,
    ) -> Result<Option<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "UPDATE frame_annotations SET
                annotations_json = COALESCE($1, annotations_json),
                review_note_id = COALESCE($2, review_note_id)
             WHERE id = $3
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(&input.annotations_json)
            .bind(input.review_note_id)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a frame annotation by its ID. Returns true if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM frame_annotations WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get an aggregated annotation summary for a segment.
    ///
    /// Returns total annotation count, distinct annotated frames, and
    /// distinct annotator user IDs.
    pub async fn summary(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<AnnotationSummary, sqlx::Error> {
        let row: (i64, i64) = sqlx::query_as(
            "SELECT
                COUNT(*) AS total_annotations,
                COUNT(DISTINCT frame_number) AS annotated_frames
             FROM frame_annotations
             WHERE segment_id = $1",
        )
        .bind(segment_id)
        .fetch_one(pool)
        .await?;

        let annotators: Vec<(DbId,)> = sqlx::query_as(
            "SELECT DISTINCT user_id
             FROM frame_annotations
             WHERE segment_id = $1
             ORDER BY user_id",
        )
        .bind(segment_id)
        .fetch_all(pool)
        .await?;

        Ok(AnnotationSummary {
            total_annotations: row.0,
            annotated_frames: row.1,
            annotators: annotators.into_iter().map(|(id,)| id).collect(),
        })
    }
}
