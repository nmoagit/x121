//! Repository for the `frame_annotations` table (PRD-70).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::frame_annotation::{
    AnnotatedItem, AnnotationSummary, CreateFrameAnnotation, CreateVersionAnnotation,
    FrameAnnotation, UpdateFrameAnnotation,
};

/// Column list for frame_annotations queries.
const COLUMNS: &str = "id, segment_id, version_id, media_variant_id, user_id, frame_number, \
    annotations_json, review_note_id, created_at, updated_at";

/// Provides CRUD operations for frame annotations.
pub struct FrameAnnotationRepo;

impl FrameAnnotationRepo {
    // -----------------------------------------------------------------------
    // Segment-scoped operations (original PRD-70)
    // -----------------------------------------------------------------------

    /// Create a new frame annotation on a segment, returning the created row.
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
        let query = format!("SELECT {COLUMNS} FROM frame_annotations WHERE id = $1");
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

    // -----------------------------------------------------------------------
    // Version-scoped operations (clip review annotations)
    // -----------------------------------------------------------------------

    /// Create a new frame annotation on a video version.
    pub async fn create_for_version(
        pool: &PgPool,
        version_id: DbId,
        user_id: DbId,
        input: &CreateVersionAnnotation,
    ) -> Result<FrameAnnotation, sqlx::Error> {
        let query = format!(
            "INSERT INTO frame_annotations
                (version_id, user_id, frame_number, annotations_json)
             VALUES ($1, $2, $3, $4)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(version_id)
            .bind(user_id)
            .bind(input.frame_number)
            .bind(&input.annotations_json)
            .fetch_one(pool)
            .await
    }

    /// List all annotations for a video version, ordered by frame number ascending.
    pub async fn list_by_version(
        pool: &PgPool,
        version_id: DbId,
    ) -> Result<Vec<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM frame_annotations
             WHERE version_id = $1
             ORDER BY frame_number ASC, created_at ASC"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(version_id)
            .fetch_all(pool)
            .await
    }

    /// Delete all annotations for a video version and a specific frame.
    /// Returns the number of rows deleted.
    pub async fn delete_by_version_and_frame(
        pool: &PgPool,
        version_id: DbId,
        frame_number: i32,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM frame_annotations
             WHERE version_id = $1 AND frame_number = $2",
        )
        .bind(version_id)
        .bind(frame_number)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Replace all annotations for a version+frame in a single transaction.
    ///
    /// Deletes existing rows for the (version_id, frame_number) pair, then
    /// inserts a new row if annotations_json is non-empty.
    pub async fn upsert_version_frame(
        pool: &PgPool,
        version_id: DbId,
        user_id: DbId,
        frame_number: i32,
        annotations_json: &serde_json::Value,
    ) -> Result<Option<FrameAnnotation>, sqlx::Error> {
        // Delete existing for this version+frame
        sqlx::query(
            "DELETE FROM frame_annotations
             WHERE version_id = $1 AND frame_number = $2",
        )
        .bind(version_id)
        .bind(frame_number)
        .execute(pool)
        .await?;

        // Only insert if there are actual annotations
        let arr = annotations_json.as_array();
        if arr.is_some_and(|a| !a.is_empty()) {
            let query = format!(
                "INSERT INTO frame_annotations
                    (version_id, user_id, frame_number, annotations_json)
                 VALUES ($1, $2, $3, $4)
                 RETURNING {COLUMNS}"
            );
            let row = sqlx::query_as::<_, FrameAnnotation>(&query)
                .bind(version_id)
                .bind(user_id)
                .bind(frame_number)
                .bind(annotations_json)
                .fetch_one(pool)
                .await?;
            Ok(Some(row))
        } else {
            Ok(None)
        }
    }

    /// Count annotated frames for a video version.
    pub async fn count_by_version(pool: &PgPool, version_id: DbId) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM frame_annotations WHERE version_id = $1")
                .bind(version_id)
                .fetch_one(pool)
                .await?;
        Ok(count)
    }

    /// Browse all annotated items with full context (avatar, scene, project).
    ///
    /// Joins through version->scene->avatar->project and segment->scene->avatar->project
    /// chains to provide a flat browseable list.
    pub async fn browse(
        pool: &PgPool,
        project_id: Option<DbId>,
        avatar_id: Option<DbId>,
        pipeline_id: Option<DbId>,
        sort: &str,
        sort_dir: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AnnotatedItem>, sqlx::Error> {
        let order_clause = match sort {
            "avatar_name" => "ch.name",
            _ => "fa.created_at",
        };
        let dir = match sort_dir {
            "asc" => "ASC",
            _ => "DESC",
        };

        let query = format!(
            "SELECT
                fa.id AS annotation_id,
                fa.version_id,
                fa.segment_id,
                fa.frame_number,
                COALESCE(jsonb_array_length(fa.annotations_json), 0)::int4 AS annotation_count,
                ch.id AS avatar_id,
                ch.name AS avatar_name,
                sc.id AS scene_id,
                COALESCE(st.name, '') AS scene_type_name,
                COALESCE(sc.status_id, 1::smallint) AS scene_status_id,
                pr.id AS project_id,
                pr.name AS project_name,
                svv.file_path,
                svv.preview_path,
                fa.created_at,
                fa.updated_at,
                fa.user_id
            FROM frame_annotations fa
            LEFT JOIN scene_video_versions svv ON svv.id = fa.version_id
            LEFT JOIN segments seg ON seg.id = fa.segment_id
            LEFT JOIN scenes sc ON sc.id = COALESCE(svv.scene_id, seg.scene_id)
            LEFT JOIN avatars ch ON ch.id = sc.avatar_id
            LEFT JOIN projects pr ON pr.id = ch.project_id
            LEFT JOIN scene_types st ON st.id = sc.scene_type_id
            WHERE sc.id IS NOT NULL
              AND ($1::bigint IS NULL OR pr.id = $1)
              AND ($2::bigint IS NULL OR ch.id = $2)
              AND ($3::bigint IS NULL OR pr.pipeline_id = $3)
            ORDER BY {order_clause} {dir}
            LIMIT $4 OFFSET $5"
        );

        sqlx::query_as::<_, AnnotatedItem>(&query)
            .bind(project_id)
            .bind(avatar_id)
            .bind(pipeline_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Image-variant-scoped operations
    // -----------------------------------------------------------------------

    /// List all annotations for an image variant, ordered by frame number ascending.
    pub async fn list_by_media_variant(
        pool: &PgPool,
        media_variant_id: DbId,
    ) -> Result<Vec<FrameAnnotation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM frame_annotations
             WHERE media_variant_id = $1
             ORDER BY frame_number ASC, created_at ASC"
        );
        sqlx::query_as::<_, FrameAnnotation>(&query)
            .bind(media_variant_id)
            .fetch_all(pool)
            .await
    }

    /// Replace all annotations for an image_variant+frame in a single transaction.
    ///
    /// Deletes existing rows for the (media_variant_id, frame_number) pair, then
    /// inserts a new row if annotations_json is non-empty.
    pub async fn upsert_media_variant_frame(
        pool: &PgPool,
        media_variant_id: DbId,
        user_id: DbId,
        frame_number: i32,
        annotations_json: &serde_json::Value,
    ) -> Result<Option<FrameAnnotation>, sqlx::Error> {
        // Delete existing for this variant+frame
        sqlx::query(
            "DELETE FROM frame_annotations
             WHERE media_variant_id = $1 AND frame_number = $2",
        )
        .bind(media_variant_id)
        .bind(frame_number)
        .execute(pool)
        .await?;

        // Only insert if there are actual annotations
        let arr = annotations_json.as_array();
        if arr.is_some_and(|a| !a.is_empty()) {
            let query = format!(
                "INSERT INTO frame_annotations
                    (media_variant_id, user_id, frame_number, annotations_json)
                 VALUES ($1, $2, $3, $4)
                 RETURNING {COLUMNS}"
            );
            let row = sqlx::query_as::<_, FrameAnnotation>(&query)
                .bind(media_variant_id)
                .bind(user_id)
                .bind(frame_number)
                .bind(annotations_json)
                .fetch_one(pool)
                .await?;
            Ok(Some(row))
        } else {
            Ok(None)
        }
    }

    /// Delete all annotations for an image variant and a specific frame.
    /// Returns the number of rows deleted.
    pub async fn delete_by_media_variant_and_frame(
        pool: &PgPool,
        media_variant_id: DbId,
        frame_number: i32,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM frame_annotations
             WHERE media_variant_id = $1 AND frame_number = $2",
        )
        .bind(media_variant_id)
        .bind(frame_number)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
