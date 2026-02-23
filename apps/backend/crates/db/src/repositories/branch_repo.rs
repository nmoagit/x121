//! Repository for the `branches` table (PRD-50).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::branch::{Branch, CreateBranch, UpdateBranch};

/// Column list for branches queries.
const COLUMNS: &str = "id, scene_id, parent_branch_id, name, description, \
    is_default, depth, parameters_snapshot, created_by_id, created_at, updated_at";

/// Provides CRUD operations for content branches.
pub struct BranchRepo;

impl BranchRepo {
    /// Insert a new branch, returning the created row.
    pub async fn create(
        pool: &PgPool,
        scene_id: DbId,
        parent_branch_id: Option<DbId>,
        input: &CreateBranch,
        depth: i32,
        user_id: DbId,
    ) -> Result<Branch, sqlx::Error> {
        let query = format!(
            "INSERT INTO branches
                (scene_id, parent_branch_id, name, description,
                 parameters_snapshot, depth, created_by_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Branch>(&query)
            .bind(scene_id)
            .bind(parent_branch_id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.parameters_snapshot)
            .bind(depth)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find a branch by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Branch>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM branches WHERE id = $1");
        sqlx::query_as::<_, Branch>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all branches for a scene, default branch first, then by creation date.
    pub async fn list_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<Branch>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM branches
             WHERE scene_id = $1
             ORDER BY is_default DESC, created_at ASC"
        );
        sqlx::query_as::<_, Branch>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Count branches for a scene.
    pub async fn count_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM branches WHERE scene_id = $1")
                .bind(scene_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }

    /// Get the default branch for a scene.
    pub async fn get_default(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Option<Branch>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM branches
             WHERE scene_id = $1 AND is_default = true"
        );
        sqlx::query_as::<_, Branch>(&query)
            .bind(scene_id)
            .fetch_optional(pool)
            .await
    }

    /// Promote a branch to the default for its scene.
    ///
    /// Runs in a transaction: unset the current default, then set the new one.
    pub async fn promote(
        pool: &PgPool,
        branch_id: DbId,
        scene_id: DbId,
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        sqlx::query(
            "UPDATE branches SET is_default = false
             WHERE scene_id = $1 AND is_default = true",
        )
        .bind(scene_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE branches SET is_default = true
             WHERE id = $1 AND scene_id = $2",
        )
        .bind(branch_id)
        .bind(scene_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Update a branch. Returns the updated row, or `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateBranch,
    ) -> Result<Option<Branch>, sqlx::Error> {
        let query = format!(
            "UPDATE branches SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                parameters_snapshot = COALESCE($3, parameters_snapshot)
             WHERE id = $4
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Branch>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.parameters_snapshot)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a branch by ID.
    ///
    /// Returns `true` if a row was deleted, `false` if not found.
    /// The caller must ensure the branch is not the default before calling.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM branches WHERE id = $1 AND is_default = false")
                .bind(id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Count segments belonging to a branch.
    pub async fn count_segments(
        pool: &PgPool,
        branch_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM segments WHERE branch_id = $1")
                .bind(branch_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }

    /// List stale branches (not updated in `older_than_days` days, not default).
    pub async fn list_stale_branches(
        pool: &PgPool,
        older_than_days: i32,
    ) -> Result<Vec<Branch>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM branches
             WHERE is_default = false
               AND updated_at < NOW() - ($1 || ' days')::INTERVAL
             ORDER BY updated_at ASC"
        );
        sqlx::query_as::<_, Branch>(&query)
            .bind(older_than_days)
            .fetch_all(pool)
            .await
    }
}
