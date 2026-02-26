//! Repository for the `readiness_criteria` table (PRD-107).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::readiness_criteria::{
    CreateReadinessCriteria, ReadinessCriteria, UpdateReadinessCriteria,
};

/// Column list for readiness_criteria queries.
const COLUMNS: &str = "id, scope_type, scope_id, criteria_json, created_at, updated_at";

/// Provides CRUD operations for readiness criteria.
pub struct ReadinessCriteriaRepo;

impl ReadinessCriteriaRepo {
    /// Create a new readiness criteria row, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateReadinessCriteria,
    ) -> Result<ReadinessCriteria, sqlx::Error> {
        let query = format!(
            "INSERT INTO readiness_criteria (scope_type, scope_id, criteria_json)
             VALUES ($1, $2, $3)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ReadinessCriteria>(&query)
            .bind(&input.scope_type)
            .bind(input.scope_id)
            .bind(&input.criteria_json)
            .fetch_one(pool)
            .await
    }

    /// Find a readiness criteria row by scope type and scope id.
    pub async fn find_by_scope(
        pool: &PgPool,
        scope_type: &str,
        scope_id: Option<DbId>,
    ) -> Result<Option<ReadinessCriteria>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM readiness_criteria
             WHERE scope_type = $1 AND COALESCE(scope_id, 0) = COALESCE($2, 0)"
        );
        sqlx::query_as::<_, ReadinessCriteria>(&query)
            .bind(scope_type)
            .bind(scope_id)
            .fetch_optional(pool)
            .await
    }

    /// Find the studio-level default criteria.
    pub async fn find_studio_default(
        pool: &PgPool,
    ) -> Result<Option<ReadinessCriteria>, sqlx::Error> {
        Self::find_by_scope(pool, "studio", None).await
    }

    /// Find criteria for a project, falling back to studio default.
    ///
    /// Checks for a project-level override first; if not found, returns
    /// the studio-level default.
    pub async fn find_for_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Option<ReadinessCriteria>, sqlx::Error> {
        let project_criteria = Self::find_by_scope(pool, "project", Some(project_id)).await?;
        if project_criteria.is_some() {
            return Ok(project_criteria);
        }
        Self::find_studio_default(pool).await
    }

    /// List all readiness criteria, ordered by scope type then id.
    pub async fn list(pool: &PgPool) -> Result<Vec<ReadinessCriteria>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM readiness_criteria
             ORDER BY scope_type ASC, id ASC"
        );
        sqlx::query_as::<_, ReadinessCriteria>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a readiness criteria row by ID, returning the updated row.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateReadinessCriteria,
    ) -> Result<Option<ReadinessCriteria>, sqlx::Error> {
        let query = format!(
            "UPDATE readiness_criteria SET
                criteria_json = COALESCE($2, criteria_json)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ReadinessCriteria>(&query)
            .bind(id)
            .bind(&input.criteria_json)
            .fetch_optional(pool)
            .await
    }

    /// Delete a readiness criteria row by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM readiness_criteria WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
