//! Repository for the `qa_profiles` table (PRD-91).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::qa_profile::{CreateQaProfile, QaProfile, UpdateQaProfile};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, description, thresholds, is_builtin, created_at, updated_at";

/// Provides CRUD operations for QA profiles.
pub struct QaProfileRepo;

impl QaProfileRepo {
    /// List all profiles ordered by name.
    pub async fn list(pool: &PgPool) -> Result<Vec<QaProfile>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM qa_profiles ORDER BY name");
        sqlx::query_as::<_, QaProfile>(&query).fetch_all(pool).await
    }

    /// List only built-in profiles.
    pub async fn list_builtin(pool: &PgPool) -> Result<Vec<QaProfile>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM qa_profiles WHERE is_builtin = true ORDER BY name");
        sqlx::query_as::<_, QaProfile>(&query).fetch_all(pool).await
    }

    /// Find a profile by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<QaProfile>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM qa_profiles WHERE id = $1");
        sqlx::query_as::<_, QaProfile>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a profile by its unique name.
    pub async fn find_by_name(pool: &PgPool, name: &str) -> Result<Option<QaProfile>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM qa_profiles WHERE name = $1");
        sqlx::query_as::<_, QaProfile>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Insert a new profile, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateQaProfile) -> Result<QaProfile, sqlx::Error> {
        let query = format!(
            "INSERT INTO qa_profiles (name, description, thresholds) \
             VALUES ($1, $2, $3) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, QaProfile>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.thresholds)
            .fetch_one(pool)
            .await
    }

    /// Update a profile. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateQaProfile,
    ) -> Result<Option<QaProfile>, sqlx::Error> {
        let query = format!(
            "UPDATE qa_profiles SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                thresholds = COALESCE($4, thresholds) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, QaProfile>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.thresholds)
            .fetch_optional(pool)
            .await
    }

    /// Delete a profile by ID. Returns `true` if a row was removed.
    ///
    /// Built-in profiles cannot be deleted; returns `false` for those.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM qa_profiles WHERE id = $1 AND is_builtin = false")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
