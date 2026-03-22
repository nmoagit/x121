//! Repository for project lifecycle operations (PRD-72).
//!
//! Provides lifecycle transitions, completion checklist data, project
//! summaries, and bulk archive operations.

use sqlx::{FromRow, PgPool};
use x121_core::types::DbId;

use crate::models::project_lifecycle::ProjectSummary;
use crate::models::status::SceneStatus;

/// Aggregate counts for a project, used by checklist evaluation and summary reports.
#[derive(Debug, Clone, FromRow)]
pub struct ProjectAggregates {
    pub total_scenes: i64,
    pub approved_scenes: i64,
    pub total_avatars: i64,
    pub avatars_with_metadata: i64,
    pub total_segments: i64,
}

/// Column list for `project_summaries` queries.
const SUMMARY_COLUMNS: &str =
    "id, project_id, report_json, generated_at, generated_by, created_at, updated_at";

/// Provides data access for project lifecycle operations.
pub struct ProjectLifecycleRepo;

impl ProjectLifecycleRepo {
    // -----------------------------------------------------------------------
    // Status lookup
    // -----------------------------------------------------------------------

    /// Get the current lifecycle status name for a project via JOIN on `project_statuses`.
    pub async fn get_project_status(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Option<String>, sqlx::Error> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT ps.name
             FROM projects p
             JOIN project_statuses ps ON ps.id = p.status_id
             WHERE p.id = $1 AND p.deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|(name,)| name))
    }

    /// Resolve a project status name to its ID.
    pub async fn get_status_id_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<i16>, sqlx::Error> {
        let row: Option<(i16,)> = sqlx::query_as("SELECT id FROM project_statuses WHERE name = $1")
            .bind(name)
            .fetch_optional(pool)
            .await?;

        Ok(row.map(|(id,)| id))
    }

    // -----------------------------------------------------------------------
    // Transitions
    // -----------------------------------------------------------------------

    /// Transition a project to a new lifecycle state.
    ///
    /// Updates `status_id`, `is_edit_locked`, `lifecycle_transitioned_at`,
    /// and `lifecycle_transitioned_by`.
    pub async fn transition(
        pool: &PgPool,
        project_id: DbId,
        new_status_id: i16,
        user_id: DbId,
        is_edit_locked: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE projects
             SET status_id = $2,
                 is_edit_locked = $3,
                 lifecycle_transitioned_at = NOW(),
                 lifecycle_transitioned_by = $4
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(project_id)
        .bind(new_status_id)
        .bind(is_edit_locked)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Set or clear the edit lock on a project.
    pub async fn set_edit_lock(
        pool: &PgPool,
        project_id: DbId,
        locked: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE projects SET is_edit_locked = $2
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(project_id)
        .bind(locked)
        .execute(pool)
        .await?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Checklist aggregates
    // -----------------------------------------------------------------------

    /// Count total scenes for a project (non-deleted).
    pub async fn count_scenes(pool: &PgPool, project_id: DbId) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*)
             FROM scenes s
             JOIN avatars c ON c.id = s.avatar_id
             WHERE c.project_id = $1
               AND c.deleted_at IS NULL
               AND s.deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Count approved scenes for a project (non-deleted).
    pub async fn count_approved_scenes(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*)
             FROM scenes s
             JOIN avatars c ON c.id = s.avatar_id
             WHERE c.project_id = $1
               AND c.deleted_at IS NULL
               AND s.deleted_at IS NULL
               AND s.status_id = $2",
        )
        .bind(project_id)
        .bind(SceneStatus::Approved.id())
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Count total avatars for a project (non-deleted).
    pub async fn count_avatars(pool: &PgPool, project_id: DbId) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*)
             FROM avatars
             WHERE project_id = $1 AND deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Count avatars that have non-null, non-empty metadata for a project.
    pub async fn count_avatars_with_metadata(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*)
             FROM avatars
             WHERE project_id = $1
               AND deleted_at IS NULL
               AND metadata IS NOT NULL
               AND metadata != 'null'::jsonb
               AND metadata != '{}'::jsonb",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Count total segments for a project (non-deleted scenes and avatars).
    pub async fn count_segments(pool: &PgPool, project_id: DbId) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*)
             FROM segments seg
             JOIN scenes s ON s.id = seg.scene_id
             JOIN avatars c ON c.id = s.avatar_id
             WHERE c.project_id = $1
               AND c.deleted_at IS NULL
               AND s.deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Fetch all project aggregate counts in a single query.
    ///
    /// Replaces multiple sequential calls to `count_scenes`, `count_approved_scenes`,
    /// `count_avatars`, `count_avatars_with_metadata`, and `count_segments`.
    pub async fn get_project_aggregates(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<ProjectAggregates, sqlx::Error> {
        sqlx::query_as::<_, ProjectAggregates>(
            "SELECT
                 (SELECT COUNT(*)
                  FROM scenes s
                  JOIN avatars c ON c.id = s.avatar_id
                  WHERE c.project_id = $1 AND c.deleted_at IS NULL AND s.deleted_at IS NULL
                 ) AS total_scenes,
                 (SELECT COUNT(*)
                  FROM scenes s
                  JOIN avatars c ON c.id = s.avatar_id
                  WHERE c.project_id = $1 AND c.deleted_at IS NULL AND s.deleted_at IS NULL
                    AND s.status_id = $2
                 ) AS approved_scenes,
                 (SELECT COUNT(*)
                  FROM avatars
                  WHERE project_id = $1 AND deleted_at IS NULL
                 ) AS total_avatars,
                 (SELECT COUNT(*)
                  FROM avatars
                  WHERE project_id = $1 AND deleted_at IS NULL
                    AND metadata IS NOT NULL
                    AND metadata != 'null'::jsonb
                    AND metadata != '{}'::jsonb
                 ) AS avatars_with_metadata,
                 (SELECT COUNT(*)
                  FROM segments seg
                  JOIN scenes s ON s.id = seg.scene_id
                  JOIN avatars c ON c.id = s.avatar_id
                  WHERE c.project_id = $1 AND c.deleted_at IS NULL AND s.deleted_at IS NULL
                 ) AS total_segments",
        )
        .bind(project_id)
        .bind(SceneStatus::Approved.id())
        .fetch_one(pool)
        .await
    }

    // -----------------------------------------------------------------------
    // Project summaries
    // -----------------------------------------------------------------------

    /// Insert a new project summary report.
    pub async fn create_summary(
        pool: &PgPool,
        project_id: DbId,
        report_json: &serde_json::Value,
        user_id: DbId,
    ) -> Result<ProjectSummary, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_summaries (project_id, report_json, generated_by)
             VALUES ($1, $2, $3)
             RETURNING {SUMMARY_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectSummary>(&query)
            .bind(project_id)
            .bind(report_json)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Get the latest summary report for a project.
    pub async fn get_latest_summary(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Option<ProjectSummary>, sqlx::Error> {
        let query = format!(
            "SELECT {SUMMARY_COLUMNS}
             FROM project_summaries
             WHERE project_id = $1
             ORDER BY generated_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, ProjectSummary>(&query)
            .bind(project_id)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Bulk operations
    // -----------------------------------------------------------------------

    /// Bulk-archive projects that are currently in the `delivered` state.
    ///
    /// Returns the number of rows successfully updated.
    pub async fn bulk_archive(
        pool: &PgPool,
        project_ids: &[DbId],
        user_id: DbId,
        archived_status_id: i16,
        delivered_status_id: i16,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE projects
             SET status_id = $2,
                 is_edit_locked = true,
                 lifecycle_transitioned_at = NOW(),
                 lifecycle_transitioned_by = $3
             WHERE id = ANY($1)
               AND status_id = $4
               AND deleted_at IS NULL",
        )
        .bind(project_ids)
        .bind(archived_status_id)
        .bind(user_id)
        .bind(delivered_status_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
