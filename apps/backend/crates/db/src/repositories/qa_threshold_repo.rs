//! Repository for the `qa_thresholds` table (PRD-49).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::qa_threshold::{CreateQaThreshold, QaThreshold, UpdateQaThreshold};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, project_id, check_type, warn_threshold, fail_threshold, is_enabled, created_at, updated_at";

/// Provides CRUD operations for QA thresholds.
pub struct QaThresholdRepo;

impl QaThresholdRepo {
    /// List effective thresholds for a project.
    ///
    /// Returns project-level overrides merged with studio defaults:
    /// for each check type, the project-level row takes precedence.
    /// If no project-level row exists, the studio default is returned.
    pub async fn list_for_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<QaThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT DISTINCT ON (check_type)
                {COLUMNS}
             FROM qa_thresholds
             WHERE project_id = $1 OR project_id IS NULL
             ORDER BY check_type, project_id IS NULL ASC"
        );
        sqlx::query_as::<_, QaThreshold>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List studio-level default thresholds (where `project_id IS NULL`).
    pub async fn list_studio_defaults(
        pool: &PgPool,
    ) -> Result<Vec<QaThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM qa_thresholds
             WHERE project_id IS NULL
             ORDER BY check_type"
        );
        sqlx::query_as::<_, QaThreshold>(&query)
            .fetch_all(pool)
            .await
    }

    /// Upsert a threshold for a given project (or studio-level if `project_id` is `None`).
    ///
    /// Uses the partial unique indexes to handle the conflict correctly.
    pub async fn upsert(
        pool: &PgPool,
        project_id: Option<DbId>,
        body: &CreateQaThreshold,
    ) -> Result<QaThreshold, sqlx::Error> {
        let is_enabled = body.is_enabled.unwrap_or(true);

        let row = if project_id.is_some() {
            // Project-level upsert.
            let query = format!(
                "INSERT INTO qa_thresholds
                    (project_id, check_type, warn_threshold, fail_threshold, is_enabled)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (project_id, check_type) WHERE project_id IS NOT NULL
                 DO UPDATE SET
                    warn_threshold = EXCLUDED.warn_threshold,
                    fail_threshold = EXCLUDED.fail_threshold,
                    is_enabled = EXCLUDED.is_enabled,
                    updated_at = NOW()
                 RETURNING {COLUMNS}"
            );
            sqlx::query_as::<_, QaThreshold>(&query)
                .bind(project_id)
                .bind(&body.check_type)
                .bind(body.warn_threshold)
                .bind(body.fail_threshold)
                .bind(is_enabled)
                .fetch_one(pool)
                .await?
        } else {
            // Studio-level upsert.
            let query = format!(
                "INSERT INTO qa_thresholds
                    (project_id, check_type, warn_threshold, fail_threshold, is_enabled)
                 VALUES (NULL, $1, $2, $3, $4)
                 ON CONFLICT (check_type) WHERE project_id IS NULL
                 DO UPDATE SET
                    warn_threshold = EXCLUDED.warn_threshold,
                    fail_threshold = EXCLUDED.fail_threshold,
                    is_enabled = EXCLUDED.is_enabled,
                    updated_at = NOW()
                 RETURNING {COLUMNS}"
            );
            sqlx::query_as::<_, QaThreshold>(&query)
                .bind(&body.check_type)
                .bind(body.warn_threshold)
                .bind(body.fail_threshold)
                .bind(is_enabled)
                .fetch_one(pool)
                .await?
        };

        Ok(row)
    }

    /// Update an existing threshold by id.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        body: &UpdateQaThreshold,
    ) -> Result<QaThreshold, sqlx::Error> {
        let query = format!(
            "UPDATE qa_thresholds SET
                warn_threshold = COALESCE($1, warn_threshold),
                fail_threshold = COALESCE($2, fail_threshold),
                is_enabled     = COALESCE($3, is_enabled),
                updated_at     = NOW()
             WHERE id = $4
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, QaThreshold>(&query)
            .bind(body.warn_threshold)
            .bind(body.fail_threshold)
            .bind(body.is_enabled)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    /// Delete a threshold by id.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM qa_thresholds WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Get the effective threshold for a specific check type.
    ///
    /// Looks up the project-specific row first; falls back to the studio default.
    pub async fn get_threshold(
        pool: &PgPool,
        project_id: Option<DbId>,
        check_type: &str,
    ) -> Result<Option<QaThreshold>, sqlx::Error> {
        if let Some(pid) = project_id {
            // Try project-level first.
            let query = format!(
                "SELECT {COLUMNS} FROM qa_thresholds
                 WHERE project_id = $1 AND check_type = $2"
            );
            let row = sqlx::query_as::<_, QaThreshold>(&query)
                .bind(pid)
                .bind(check_type)
                .fetch_optional(pool)
                .await?;
            if row.is_some() {
                return Ok(row);
            }
        }

        // Fallback to studio default.
        let query = format!(
            "SELECT {COLUMNS} FROM qa_thresholds
             WHERE project_id IS NULL AND check_type = $1"
        );
        sqlx::query_as::<_, QaThreshold>(&query)
            .bind(check_type)
            .fetch_optional(pool)
            .await
    }
}
