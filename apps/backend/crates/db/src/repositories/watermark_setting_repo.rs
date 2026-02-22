//! Repository for the `watermark_settings` table (PRD-39).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::watermark_setting::{
    CreateWatermarkSetting, UpdateWatermarkSetting, WatermarkSetting,
};

const COLUMNS: &str = "id, name, watermark_type, content, position, opacity, \
     include_timecode, created_at, updated_at";

/// Provides CRUD operations for watermark settings.
pub struct WatermarkSettingRepo;

impl WatermarkSettingRepo {
    /// Insert a new watermark setting, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateWatermarkSetting,
    ) -> Result<WatermarkSetting, sqlx::Error> {
        let query = format!(
            "INSERT INTO watermark_settings \
                (name, watermark_type, content, position, opacity, include_timecode) \
             VALUES ($1, $2, $3, COALESCE($4, 'center'), COALESCE($5, 0.3), COALESCE($6, false)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WatermarkSetting>(&query)
            .bind(&input.name)
            .bind(&input.watermark_type)
            .bind(&input.content)
            .bind(&input.position)
            .bind(input.opacity)
            .bind(input.include_timecode)
            .fetch_one(pool)
            .await
    }

    /// Find a watermark setting by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<WatermarkSetting>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM watermark_settings WHERE id = $1");
        sqlx::query_as::<_, WatermarkSetting>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all watermark settings, ordered by name.
    pub async fn list_all(
        pool: &PgPool,
    ) -> Result<Vec<WatermarkSetting>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM watermark_settings ORDER BY name ASC");
        sqlx::query_as::<_, WatermarkSetting>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a watermark setting. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateWatermarkSetting,
    ) -> Result<Option<WatermarkSetting>, sqlx::Error> {
        let query = format!(
            "UPDATE watermark_settings SET \
                name = COALESCE($2, name), \
                watermark_type = COALESCE($3, watermark_type), \
                content = COALESCE($4, content), \
                position = COALESCE($5, position), \
                opacity = COALESCE($6, opacity), \
                include_timecode = COALESCE($7, include_timecode) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WatermarkSetting>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.watermark_type)
            .bind(&input.content)
            .bind(&input.position)
            .bind(input.opacity)
            .bind(input.include_timecode)
            .fetch_optional(pool)
            .await
    }

    /// Hard-delete a watermark setting by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM watermark_settings WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
