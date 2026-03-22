//! Repository for the `consistency_reports` table (PRD-94).
//!
//! Provides CRUD operations for avatar consistency reports.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::consistency_report::{ConsistencyReport, CreateConsistencyReport};

/// Column list for `consistency_reports` queries.
const COLUMNS: &str = "id, avatar_id, project_id, scores_json, \
    overall_consistency_score, outlier_scene_ids, report_type, \
    created_at, updated_at";

/// Provides data access for avatar consistency reports.
pub struct ConsistencyReportRepo;

impl ConsistencyReportRepo {
    /// Insert a new consistency report, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateConsistencyReport,
    ) -> Result<ConsistencyReport, sqlx::Error> {
        let query = format!(
            "INSERT INTO consistency_reports
                (avatar_id, project_id, scores_json, overall_consistency_score,
                 outlier_scene_ids, report_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ConsistencyReport>(&query)
            .bind(input.avatar_id)
            .bind(input.project_id)
            .bind(&input.scores_json)
            .bind(input.overall_consistency_score)
            .bind(&input.outlier_scene_ids)
            .bind(&input.report_type)
            .fetch_one(pool)
            .await
    }

    /// Find a consistency report by its ID.
    pub async fn get_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ConsistencyReport>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM consistency_reports WHERE id = $1");
        sqlx::query_as::<_, ConsistencyReport>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Get the most recent consistency report for a avatar.
    pub async fn get_latest_for_avatar(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Option<ConsistencyReport>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM consistency_reports
             WHERE avatar_id = $1
             ORDER BY created_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, ConsistencyReport>(&query)
            .bind(avatar_id)
            .fetch_optional(pool)
            .await
    }

    /// List all consistency reports for a project, newest first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ConsistencyReport>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM consistency_reports
             WHERE project_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ConsistencyReport>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List all consistency reports for a avatar, newest first.
    pub async fn list_by_avatar(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Vec<ConsistencyReport>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM consistency_reports
             WHERE avatar_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ConsistencyReport>(&query)
            .bind(avatar_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a consistency report by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM consistency_reports WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
