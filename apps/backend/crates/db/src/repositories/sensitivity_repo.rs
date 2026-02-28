//! Repository for the `user_sensitivity_settings` and `studio_sensitivity_config`
//! tables (PRD-82).
//!
//! Provides upsert-based CRUD for per-user sensitivity preferences
//! and the studio-wide minimum sensitivity floor.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::sensitivity::{
    StudioSensitivityConfig, UpsertSensitivitySettings, UpsertStudioSensitivityConfig,
    UserSensitivitySettings,
};

/// Column list for `user_sensitivity_settings` queries.
const USS_COLUMNS: &str = "\
    id, user_id, global_level, view_overrides_json, \
    watermark_enabled, watermark_text, watermark_position, watermark_opacity, \
    screen_share_mode, sound_enabled, created_at, updated_at";

/// Column list for `studio_sensitivity_config` queries.
const SSC_COLUMNS: &str = "\
    id, min_level, updated_by, created_at, updated_at";

/// Provides data access for sensitivity settings and studio config.
pub struct SensitivityRepo;

impl SensitivityRepo {
    // -----------------------------------------------------------------------
    // User sensitivity settings
    // -----------------------------------------------------------------------

    /// Get user sensitivity settings. Returns `None` if no settings exist.
    pub async fn get_user_settings(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<UserSensitivitySettings>, sqlx::Error> {
        let query =
            format!("SELECT {USS_COLUMNS} FROM user_sensitivity_settings WHERE user_id = $1");
        sqlx::query_as::<_, UserSensitivitySettings>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert user sensitivity settings.
    ///
    /// Uses `ON CONFLICT (user_id) DO UPDATE` so that only provided
    /// optional fields are changed; omitted fields retain their current
    /// (or default) values via `COALESCE`.
    pub async fn upsert_user_settings(
        pool: &PgPool,
        user_id: DbId,
        dto: &UpsertSensitivitySettings,
    ) -> Result<UserSensitivitySettings, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_sensitivity_settings \
                (user_id, global_level, view_overrides_json, watermark_enabled, \
                 watermark_text, watermark_position, watermark_opacity, \
                 screen_share_mode, sound_enabled) \
             VALUES ($1, $2, COALESCE($3, '{{}}'), COALESCE($4, FALSE), \
                     $5, COALESCE($6, 'center'), COALESCE($7, 0.3), \
                     COALESCE($8, FALSE), COALESCE($9, TRUE)) \
             ON CONFLICT (user_id) DO UPDATE SET \
                 global_level = EXCLUDED.global_level, \
                 view_overrides_json = COALESCE(EXCLUDED.view_overrides_json, \
                     user_sensitivity_settings.view_overrides_json), \
                 watermark_enabled = COALESCE(EXCLUDED.watermark_enabled, \
                     user_sensitivity_settings.watermark_enabled), \
                 watermark_text = EXCLUDED.watermark_text, \
                 watermark_position = COALESCE(EXCLUDED.watermark_position, \
                     user_sensitivity_settings.watermark_position), \
                 watermark_opacity = COALESCE(EXCLUDED.watermark_opacity, \
                     user_sensitivity_settings.watermark_opacity), \
                 screen_share_mode = COALESCE(EXCLUDED.screen_share_mode, \
                     user_sensitivity_settings.screen_share_mode), \
                 sound_enabled = COALESCE(EXCLUDED.sound_enabled, \
                     user_sensitivity_settings.sound_enabled) \
             RETURNING {USS_COLUMNS}"
        );
        sqlx::query_as::<_, UserSensitivitySettings>(&query)
            .bind(user_id)
            .bind(&dto.global_level)
            .bind(&dto.view_overrides_json)
            .bind(dto.watermark_enabled)
            .bind(&dto.watermark_text)
            .bind(&dto.watermark_position)
            .bind(dto.watermark_opacity)
            .bind(dto.screen_share_mode)
            .bind(dto.sound_enabled)
            .fetch_one(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Studio sensitivity config (singleton row)
    // -----------------------------------------------------------------------

    /// Get the current studio sensitivity config.
    ///
    /// Returns the row with `id = 1`, or `None` if no config has been set.
    pub async fn get_studio_config(
        pool: &PgPool,
    ) -> Result<Option<StudioSensitivityConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {SSC_COLUMNS} FROM studio_sensitivity_config \
             ORDER BY id ASC LIMIT 1"
        );
        sqlx::query_as::<_, StudioSensitivityConfig>(&query)
            .fetch_optional(pool)
            .await
    }

    /// Upsert studio sensitivity config.
    ///
    /// Uses `ON CONFLICT (id) DO UPDATE` with `id = 1` to maintain a
    /// singleton row pattern.
    pub async fn upsert_studio_config(
        pool: &PgPool,
        dto: &UpsertStudioSensitivityConfig,
        updated_by: DbId,
    ) -> Result<StudioSensitivityConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO studio_sensitivity_config (id, min_level, updated_by) \
             VALUES (1, $1, $2) \
             ON CONFLICT (id) DO UPDATE SET \
                 min_level = EXCLUDED.min_level, \
                 updated_by = EXCLUDED.updated_by \
             RETURNING {SSC_COLUMNS}"
        );
        sqlx::query_as::<_, StudioSensitivityConfig>(&query)
            .bind(&dto.min_level)
            .bind(updated_by)
            .fetch_one(pool)
            .await
    }
}
