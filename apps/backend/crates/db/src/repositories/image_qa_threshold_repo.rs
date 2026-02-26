//! Repository for the `image_qa_thresholds` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::image_qa::{ImageQaThreshold, UpsertImageQaThreshold};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, project_id, check_type_id, warn_threshold, fail_threshold, \
    is_blocking, config, created_at, updated_at";

/// Provides CRUD operations for image QA thresholds.
pub struct ImageQaThresholdRepo;

impl ImageQaThresholdRepo {
    /// List all thresholds for a specific project, ordered by check type.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ImageQaThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_qa_thresholds
             WHERE project_id = $1
             ORDER BY check_type_id"
        );
        sqlx::query_as::<_, ImageQaThreshold>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List default (system-wide) thresholds where `project_id IS NULL`.
    pub async fn list_defaults(pool: &PgPool) -> Result<Vec<ImageQaThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_qa_thresholds
             WHERE project_id IS NULL
             ORDER BY check_type_id"
        );
        sqlx::query_as::<_, ImageQaThreshold>(&query)
            .fetch_all(pool)
            .await
    }

    /// Upsert a threshold for a given project and check type.
    ///
    /// If `project_id` is `None`, upserts a system-wide default.
    /// If `is_blocking` is `None`, defaults to `true`.
    pub async fn upsert(
        pool: &PgPool,
        project_id: Option<DbId>,
        input: &UpsertImageQaThreshold,
    ) -> Result<ImageQaThreshold, sqlx::Error> {
        let query = format!(
            "INSERT INTO image_qa_thresholds
                (project_id, check_type_id, warn_threshold, fail_threshold, is_blocking, config)
             VALUES ($1, $2, $3, $4, COALESCE($5, true), $6)
             ON CONFLICT (COALESCE(project_id, 0), check_type_id)
                DO UPDATE SET
                    warn_threshold = EXCLUDED.warn_threshold,
                    fail_threshold = EXCLUDED.fail_threshold,
                    is_blocking = EXCLUDED.is_blocking,
                    config = EXCLUDED.config,
                    updated_at = NOW()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageQaThreshold>(&query)
            .bind(project_id)
            .bind(input.check_type_id)
            .bind(input.warn_threshold)
            .bind(input.fail_threshold)
            .bind(input.is_blocking)
            .bind(&input.config)
            .fetch_one(pool)
            .await
    }

    /// Get the effective threshold for a project and check type.
    ///
    /// Returns the project-specific threshold if one exists, otherwise falls
    /// back to the system-wide default (where `project_id IS NULL`).
    pub async fn get_effective(
        pool: &PgPool,
        project_id: DbId,
        check_type_id: DbId,
    ) -> Result<Option<ImageQaThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_qa_thresholds
             WHERE check_type_id = $2
               AND (project_id = $1 OR project_id IS NULL)
             ORDER BY project_id IS NULL ASC
             LIMIT 1"
        );
        sqlx::query_as::<_, ImageQaThreshold>(&query)
            .bind(project_id)
            .bind(check_type_id)
            .fetch_optional(pool)
            .await
    }
}
