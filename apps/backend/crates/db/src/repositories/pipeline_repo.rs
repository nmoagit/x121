//! Repository for the `pipelines` table (PRD-138).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::pipeline::{CreatePipeline, Pipeline, UpdatePipeline};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, code, name, description, seed_slots, naming_rules, delivery_config, \
     is_active, created_at, updated_at";

/// Provides CRUD operations for pipelines.
pub struct PipelineRepo;

impl PipelineRepo {
    /// Insert a new pipeline, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreatePipeline) -> Result<Pipeline, sqlx::Error> {
        let query = format!(
            "INSERT INTO pipelines (code, name, description, seed_slots, naming_rules, delivery_config) \
             VALUES ($1, $2, $3, $4, COALESCE($5, '{{}}'::jsonb), COALESCE($6, '{{}}'::jsonb)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Pipeline>(&query)
            .bind(&input.code)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.seed_slots)
            .bind(&input.naming_rules)
            .bind(&input.delivery_config)
            .fetch_one(pool)
            .await
    }

    /// Find a pipeline by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Pipeline>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM pipelines WHERE id = $1");
        sqlx::query_as::<_, Pipeline>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a pipeline by its unique code.
    pub async fn find_by_code(pool: &PgPool, code: &str) -> Result<Option<Pipeline>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM pipelines WHERE code = $1");
        sqlx::query_as::<_, Pipeline>(&query)
            .bind(code)
            .fetch_optional(pool)
            .await
    }

    /// List pipelines, optionally filtering by active status.
    ///
    /// When `is_active_filter` is `Some(true)`, only active pipelines are returned.
    /// When `Some(false)`, only inactive. When `None`, all pipelines are returned.
    pub async fn list(
        pool: &PgPool,
        is_active_filter: Option<bool>,
    ) -> Result<Vec<Pipeline>, sqlx::Error> {
        if let Some(active) = is_active_filter {
            let query =
                format!("SELECT {COLUMNS} FROM pipelines WHERE is_active = $1 ORDER BY name");
            sqlx::query_as::<_, Pipeline>(&query)
                .bind(active)
                .fetch_all(pool)
                .await
        } else {
            let query = format!("SELECT {COLUMNS} FROM pipelines ORDER BY name");
            sqlx::query_as::<_, Pipeline>(&query).fetch_all(pool).await
        }
    }

    /// Update a pipeline. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePipeline,
    ) -> Result<Option<Pipeline>, sqlx::Error> {
        let query = format!(
            "UPDATE pipelines SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                seed_slots = COALESCE($4, seed_slots), \
                naming_rules = COALESCE($5, naming_rules), \
                delivery_config = COALESCE($6, delivery_config), \
                is_active = COALESCE($7, is_active) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Pipeline>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.seed_slots)
            .bind(&input.naming_rules)
            .bind(&input.delivery_config)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Return the ID of the first active pipeline (ordered by id), or `None` if
    /// no active pipeline exists.
    ///
    /// Useful as a fallback when callers don't explicitly specify a pipeline.
    pub async fn default_id(pool: &PgPool) -> Result<Option<DbId>, sqlx::Error> {
        let row: Option<(DbId,)> =
            sqlx::query_as("SELECT id FROM pipelines WHERE is_active = true ORDER BY id LIMIT 1")
                .fetch_optional(pool)
                .await?;
        Ok(row.map(|(id,)| id))
    }

    /// Soft-delete a pipeline by setting `is_active = false`.
    ///
    /// Returns `true` if a row was deactivated.
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE pipelines SET is_active = false WHERE id = $1 AND is_active = true",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
