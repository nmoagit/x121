//! Repository for the `user_theme_preferences` and `custom_themes` tables (PRD-29).
//!
//! Provides CRUD operations for user theme preferences and admin-managed
//! custom themes (token overrides).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::theme::{
    CreateCustomTheme, CustomTheme, UpdateCustomTheme, UpsertThemePreference, UserThemePreference,
};

/// Column list for `user_theme_preferences` queries.
const PREF_COLUMNS: &str = "\
    id, user_id, color_scheme, brand_palette, high_contrast, \
    custom_theme_id, created_at, updated_at";

/// Column list for `custom_themes` queries.
const THEME_COLUMNS: &str = "\
    id, name, description, status_id, tokens, \
    created_by, created_at, updated_at";

/// Provides data access for theme preferences and custom themes.
pub struct ThemeRepo;

impl ThemeRepo {
    // -----------------------------------------------------------------------
    // User theme preferences
    // -----------------------------------------------------------------------

    /// Get the theme preference for a specific user.
    ///
    /// Returns `None` if the user has never saved a preference.
    pub async fn get_user_preference(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<UserThemePreference>, sqlx::Error> {
        let query = format!("SELECT {PREF_COLUMNS} FROM user_theme_preferences WHERE user_id = $1");
        sqlx::query_as::<_, UserThemePreference>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Insert or update the theme preference for a user.
    ///
    /// Uses `ON CONFLICT (user_id) DO UPDATE` to ensure idempotent upserts.
    pub async fn upsert_user_preference(
        pool: &PgPool,
        user_id: DbId,
        dto: &UpsertThemePreference,
    ) -> Result<UserThemePreference, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_theme_preferences \
                 (user_id, color_scheme, brand_palette, high_contrast, custom_theme_id) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (user_id) DO UPDATE SET \
                 color_scheme = EXCLUDED.color_scheme, \
                 brand_palette = EXCLUDED.brand_palette, \
                 high_contrast = EXCLUDED.high_contrast, \
                 custom_theme_id = EXCLUDED.custom_theme_id \
             RETURNING {PREF_COLUMNS}"
        );
        sqlx::query_as::<_, UserThemePreference>(&query)
            .bind(user_id)
            .bind(&dto.color_scheme)
            .bind(&dto.brand_palette)
            .bind(dto.high_contrast)
            .bind(dto.custom_theme_id)
            .fetch_one(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Custom themes (admin)
    // -----------------------------------------------------------------------

    /// List all active custom themes (status = 'active').
    pub async fn list_custom_themes(pool: &PgPool) -> Result<Vec<CustomTheme>, sqlx::Error> {
        let query = format!(
            "SELECT {THEME_COLUMNS} FROM custom_themes \
             WHERE status_id = (SELECT id FROM theme_statuses WHERE name = 'active') \
             ORDER BY name"
        );
        sqlx::query_as::<_, CustomTheme>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a custom theme by its ID.
    pub async fn find_custom_theme_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CustomTheme>, sqlx::Error> {
        let query = format!("SELECT {THEME_COLUMNS} FROM custom_themes WHERE id = $1");
        sqlx::query_as::<_, CustomTheme>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new custom theme.
    pub async fn create_custom_theme(
        pool: &PgPool,
        dto: &CreateCustomTheme,
        created_by: DbId,
    ) -> Result<CustomTheme, sqlx::Error> {
        let query = format!(
            "INSERT INTO custom_themes (name, description, tokens, created_by) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {THEME_COLUMNS}"
        );
        sqlx::query_as::<_, CustomTheme>(&query)
            .bind(&dto.name)
            .bind(&dto.description)
            .bind(&dto.tokens)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Partially update a custom theme.
    ///
    /// Uses `COALESCE` so only provided fields are changed.
    pub async fn update_custom_theme(
        pool: &PgPool,
        id: DbId,
        dto: &UpdateCustomTheme,
    ) -> Result<Option<CustomTheme>, sqlx::Error> {
        let query = format!(
            "UPDATE custom_themes SET \
                 name = COALESCE($2, name), \
                 description = COALESCE($3, description), \
                 status_id = COALESCE($4, status_id), \
                 tokens = COALESCE($5, tokens) \
             WHERE id = $1 \
             RETURNING {THEME_COLUMNS}"
        );
        sqlx::query_as::<_, CustomTheme>(&query)
            .bind(id)
            .bind(&dto.name)
            .bind(&dto.description)
            .bind(dto.status_id)
            .bind(&dto.tokens)
            .fetch_optional(pool)
            .await
    }

    /// Delete a custom theme by ID.
    ///
    /// Returns `true` if a row was deleted.
    pub async fn delete_custom_theme(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM custom_themes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Export a custom theme's token set as raw JSONB.
    ///
    /// Returns the `tokens` column value, or `None` if the theme does not exist.
    pub async fn export_custom_theme(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        sqlx::query_scalar::<_, serde_json::Value>("SELECT tokens FROM custom_themes WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}
