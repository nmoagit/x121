//! Repository for dashboard widget customization tables (PRD-89).

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use crate::models::dashboard_customization::{
    CreateDashboardPreset, DashboardPreset, DashboardRoleDefault, UpdateDashboardPreset,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const PRESET_COLUMNS: &str = "id, user_id, name, layout_json, widget_settings_json, \
    is_active, share_token, created_at, updated_at";

const ROLE_DEFAULT_COLUMNS: &str = "id, role_name, layout_json, widget_settings_json, \
    configured_by, created_at, updated_at";

// ===========================================================================
// DashboardPresetRepo
// ===========================================================================

/// CRUD operations for the `dashboard_presets` table.
pub struct DashboardPresetRepo;

impl DashboardPresetRepo {
    /// List all presets for a given user.
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<DashboardPreset>, sqlx::Error> {
        let limit_val = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset_val = clamp_offset(offset);
        let query = format!(
            "SELECT {PRESET_COLUMNS} FROM dashboard_presets \
             WHERE user_id = $1 \
             ORDER BY is_active DESC, updated_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(user_id)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }

    /// Find a preset by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<DashboardPreset>, sqlx::Error> {
        let query = format!("SELECT {PRESET_COLUMNS} FROM dashboard_presets WHERE id = $1");
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a preset by its share token.
    pub async fn find_by_share_token(
        pool: &PgPool,
        share_token: &str,
    ) -> Result<Option<DashboardPreset>, sqlx::Error> {
        let query =
            format!("SELECT {PRESET_COLUMNS} FROM dashboard_presets WHERE share_token = $1");
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(share_token)
            .fetch_optional(pool)
            .await
    }

    /// Create a new preset, returning the created row.
    pub async fn create(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateDashboardPreset,
    ) -> Result<DashboardPreset, sqlx::Error> {
        let query = format!(
            "INSERT INTO dashboard_presets \
                (user_id, name, layout_json, widget_settings_json) \
             VALUES ($1, $2, $3, COALESCE($4, '{{}}'::jsonb)) \
             RETURNING {PRESET_COLUMNS}"
        );
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(user_id)
            .bind(&input.name)
            .bind(&input.layout_json)
            .bind(&input.widget_settings_json)
            .fetch_one(pool)
            .await
    }

    /// Update an existing preset. Returns the updated row, or `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateDashboardPreset,
    ) -> Result<Option<DashboardPreset>, sqlx::Error> {
        let query = format!(
            "UPDATE dashboard_presets SET \
                name                = COALESCE($1, name), \
                layout_json         = COALESCE($2, layout_json), \
                widget_settings_json = COALESCE($3, widget_settings_json) \
             WHERE id = $4 \
             RETURNING {PRESET_COLUMNS}"
        );
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(&input.name)
            .bind(&input.layout_json)
            .bind(&input.widget_settings_json)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a preset. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM dashboard_presets WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set a preset as active for a user, deactivating all others.
    ///
    /// Returns the activated preset, or `None` if the preset was not found.
    pub async fn set_active(
        pool: &PgPool,
        user_id: DbId,
        preset_id: DbId,
    ) -> Result<Option<DashboardPreset>, sqlx::Error> {
        // Deactivate all presets for this user first.
        sqlx::query("UPDATE dashboard_presets SET is_active = false WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;

        // Activate the requested preset.
        let query = format!(
            "UPDATE dashboard_presets SET is_active = true \
             WHERE id = $1 AND user_id = $2 \
             RETURNING {PRESET_COLUMNS}"
        );
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(preset_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Get the currently active preset for a user.
    pub async fn get_active(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<DashboardPreset>, sqlx::Error> {
        let query = format!(
            "SELECT {PRESET_COLUMNS} FROM dashboard_presets \
             WHERE user_id = $1 AND is_active = true \
             LIMIT 1"
        );
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Set the share token on a preset, returning the updated row.
    pub async fn set_share_token(
        pool: &PgPool,
        id: DbId,
        share_token: &str,
    ) -> Result<Option<DashboardPreset>, sqlx::Error> {
        let query = format!(
            "UPDATE dashboard_presets SET share_token = $1 \
             WHERE id = $2 \
             RETURNING {PRESET_COLUMNS}"
        );
        sqlx::query_as::<_, DashboardPreset>(&query)
            .bind(share_token)
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}

// ===========================================================================
// DashboardRoleDefaultRepo
// ===========================================================================

/// CRUD operations for the `dashboard_role_defaults` table.
pub struct DashboardRoleDefaultRepo;

impl DashboardRoleDefaultRepo {
    /// List all role defaults.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<DashboardRoleDefault>, sqlx::Error> {
        let query = format!(
            "SELECT {ROLE_DEFAULT_COLUMNS} FROM dashboard_role_defaults \
             ORDER BY role_name ASC"
        );
        sqlx::query_as::<_, DashboardRoleDefault>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a role default by role name.
    pub async fn find_by_role(
        pool: &PgPool,
        role_name: &str,
    ) -> Result<Option<DashboardRoleDefault>, sqlx::Error> {
        let query = format!(
            "SELECT {ROLE_DEFAULT_COLUMNS} FROM dashboard_role_defaults \
             WHERE role_name = $1"
        );
        sqlx::query_as::<_, DashboardRoleDefault>(&query)
            .bind(role_name)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a role default (INSERT ... ON CONFLICT UPDATE).
    pub async fn upsert(
        pool: &PgPool,
        role_name: &str,
        layout_json: &serde_json::Value,
        widget_settings_json: Option<&serde_json::Value>,
        configured_by: Option<DbId>,
    ) -> Result<DashboardRoleDefault, sqlx::Error> {
        let query = format!(
            "INSERT INTO dashboard_role_defaults \
                (role_name, layout_json, widget_settings_json, configured_by) \
             VALUES ($1, $2, COALESCE($3, '{{}}'::jsonb), $4) \
             ON CONFLICT (role_name) DO UPDATE SET \
                layout_json          = EXCLUDED.layout_json, \
                widget_settings_json = EXCLUDED.widget_settings_json, \
                configured_by        = EXCLUDED.configured_by \
             RETURNING {ROLE_DEFAULT_COLUMNS}"
        );
        sqlx::query_as::<_, DashboardRoleDefault>(&query)
            .bind(role_name)
            .bind(layout_json)
            .bind(widget_settings_json)
            .bind(configured_by)
            .fetch_one(pool)
            .await
    }
}
