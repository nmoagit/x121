//! Repository for the `presets` and `preset_ratings` tables (PRD-27).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::preset::{
    CreatePreset, CreatePresetRating, Preset, PresetRating, PresetWithRating, UpdatePreset,
};

const COLUMNS: &str = "id, name, description, owner_id, scope, project_id, \
     parameters, version, usage_count, is_active, created_at, updated_at";

/// Provides CRUD operations for presets and preset ratings.
pub struct PresetRepo;

impl PresetRepo {
    /// Insert a new preset, returning the created row.
    pub async fn create(
        pool: &PgPool,
        owner_id: DbId,
        input: &CreatePreset,
    ) -> Result<Preset, sqlx::Error> {
        let query = format!(
            "INSERT INTO presets \
                (name, description, owner_id, scope, project_id, parameters) \
             VALUES ($1, $2, $3, COALESCE($4, 'personal'), $5, $6) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Preset>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(owner_id)
            .bind(&input.scope)
            .bind(input.project_id)
            .bind(&input.parameters)
            .fetch_one(pool)
            .await
    }

    /// Find a preset by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Preset>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM presets WHERE id = $1");
        sqlx::query_as::<_, Preset>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List presets visible to a user: their own personal, project-scoped, and studio-scoped.
    pub async fn list_for_user(
        pool: &PgPool,
        user_id: DbId,
        project_id: Option<DbId>,
    ) -> Result<Vec<Preset>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM presets \
             WHERE is_active = true \
               AND ( \
                   (scope = 'personal' AND owner_id = $1) \
                   OR (scope = 'project' AND project_id = $2) \
                   OR scope = 'studio' \
               ) \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, Preset>(&query)
            .bind(user_id)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List shared presets for the marketplace with average rating.
    ///
    /// `sort_by` supports: `"popular"` (usage_count), `"rating"` (avg_rating), `"recent"` (created_at).
    pub async fn list_marketplace(
        pool: &PgPool,
        sort_by: &str,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<PresetWithRating>, sqlx::Error> {
        let order_clause = match sort_by {
            "popular" => "p.usage_count DESC",
            "rating" => "avg_rating DESC NULLS LAST",
            "recent" => "p.created_at DESC",
            _ => "p.usage_count DESC",
        };

        let query = format!(
            "SELECT p.id, p.name, p.description, p.owner_id, p.scope, p.project_id, \
                    p.parameters, p.version, p.usage_count, p.is_active, \
                    p.created_at, p.updated_at, \
                    COALESCE(AVG(r.rating)::float8, NULL) AS avg_rating, \
                    COUNT(r.id) AS rating_count \
             FROM presets p \
             LEFT JOIN preset_ratings r ON r.preset_id = p.id \
             WHERE p.is_active = true AND p.scope IN ('project', 'studio') \
             GROUP BY p.id \
             ORDER BY {order_clause} \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, PresetWithRating>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update a preset. Only non-`None` fields are applied. Increments version.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePreset,
    ) -> Result<Option<Preset>, sqlx::Error> {
        let query = format!(
            "UPDATE presets SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                scope = COALESCE($4, scope), \
                project_id = COALESCE($5, project_id), \
                parameters = COALESCE($6, parameters), \
                version = version + 1 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Preset>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.scope)
            .bind(input.project_id)
            .bind(&input.parameters)
            .fetch_optional(pool)
            .await
    }

    /// Atomically increment the usage count for a preset.
    pub async fn increment_usage(
        pool: &PgPool,
        id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE presets SET usage_count = usage_count + 1 WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft-deactivate a preset (set is_active = false).
    pub async fn deactivate(
        pool: &PgPool,
        id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE presets SET is_active = false WHERE id = $1 AND is_active = true",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Hard-delete a preset by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM presets WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Upsert a rating for a preset by a user.
    pub async fn rate(
        pool: &PgPool,
        preset_id: DbId,
        user_id: DbId,
        input: &CreatePresetRating,
    ) -> Result<PresetRating, sqlx::Error> {
        let query = "\
            INSERT INTO preset_ratings (preset_id, user_id, rating, comment) \
            VALUES ($1, $2, $3, $4) \
            ON CONFLICT (preset_id, user_id) \
            DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment \
            RETURNING id, preset_id, user_id, rating, comment, created_at, updated_at";
        sqlx::query_as::<_, PresetRating>(query)
            .bind(preset_id)
            .bind(user_id)
            .bind(input.rating)
            .bind(&input.comment)
            .fetch_one(pool)
            .await
    }

    /// List all ratings for a preset.
    pub async fn get_ratings(
        pool: &PgPool,
        preset_id: DbId,
    ) -> Result<Vec<PresetRating>, sqlx::Error> {
        let query = "SELECT id, preset_id, user_id, rating, comment, created_at, updated_at \
                     FROM preset_ratings WHERE preset_id = $1 ORDER BY created_at DESC";
        sqlx::query_as::<_, PresetRating>(query)
            .bind(preset_id)
            .fetch_all(pool)
            .await
    }

    /// Get the average rating and count for a preset.
    pub async fn get_avg_rating(
        pool: &PgPool,
        preset_id: DbId,
    ) -> Result<(Option<f64>, i64), sqlx::Error> {
        let row: (Option<f64>, i64) = sqlx::query_as(
            "SELECT COALESCE(AVG(rating)::float8, NULL), COUNT(*) \
             FROM preset_ratings WHERE preset_id = $1",
        )
        .bind(preset_id)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }
}
