//! Repository for the `user_layouts` and `admin_layout_presets` tables (PRD-30).
//!
//! Provides CRUD operations for user-saved layouts and admin-managed
//! layout presets used by the modular panel management system.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::layout::{
    AdminLayoutPreset, CreateAdminPreset, CreateUserLayout, UpdateAdminPreset, UpdateUserLayout,
    UserLayout,
};

/// Column list for `user_layouts` queries.
const USER_LAYOUT_COLUMNS: &str = "\
    id, user_id, layout_name, layout_json, is_default, \
    is_shared, created_at, updated_at";

/// Column list for `admin_layout_presets` queries.
const PRESET_COLUMNS: &str = "\
    id, name, role_default_for, layout_json, created_by, \
    created_at, updated_at";

/// Provides data access for layouts and layout presets.
pub struct LayoutRepo;

impl LayoutRepo {
    // -----------------------------------------------------------------------
    // User layouts
    // -----------------------------------------------------------------------

    /// Create a new user layout.
    pub async fn create_user_layout(
        pool: &PgPool,
        user_id: DbId,
        dto: &CreateUserLayout,
    ) -> Result<UserLayout, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_layouts (user_id, layout_name, layout_json, is_default) \
             VALUES ($1, $2, $3, COALESCE($4, FALSE)) \
             RETURNING {USER_LAYOUT_COLUMNS}"
        );
        sqlx::query_as::<_, UserLayout>(&query)
            .bind(user_id)
            .bind(&dto.layout_name)
            .bind(&dto.layout_json)
            .bind(dto.is_default)
            .fetch_one(pool)
            .await
    }

    /// List all layouts for a specific user.
    pub async fn list_user_layouts(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<UserLayout>, sqlx::Error> {
        let query = format!(
            "SELECT {USER_LAYOUT_COLUMNS} FROM user_layouts \
             WHERE user_id = $1 ORDER BY layout_name"
        );
        sqlx::query_as::<_, UserLayout>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Find a single user layout by its ID.
    pub async fn find_user_layout_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<UserLayout>, sqlx::Error> {
        let query = format!(
            "SELECT {USER_LAYOUT_COLUMNS} FROM user_layouts WHERE id = $1"
        );
        sqlx::query_as::<_, UserLayout>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Partially update a user layout.
    ///
    /// Uses `COALESCE` so only provided fields are changed.
    pub async fn update_user_layout(
        pool: &PgPool,
        id: DbId,
        dto: &UpdateUserLayout,
    ) -> Result<Option<UserLayout>, sqlx::Error> {
        let query = format!(
            "UPDATE user_layouts SET \
                 layout_name = COALESCE($2, layout_name), \
                 layout_json = COALESCE($3, layout_json), \
                 is_default  = COALESCE($4, is_default), \
                 is_shared   = COALESCE($5, is_shared) \
             WHERE id = $1 \
             RETURNING {USER_LAYOUT_COLUMNS}"
        );
        sqlx::query_as::<_, UserLayout>(&query)
            .bind(id)
            .bind(&dto.layout_name)
            .bind(&dto.layout_json)
            .bind(dto.is_default)
            .bind(dto.is_shared)
            .fetch_optional(pool)
            .await
    }

    /// Delete a user layout by ID.
    ///
    /// Returns `true` if a row was deleted.
    pub async fn delete_user_layout(
        pool: &PgPool,
        id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM user_layouts WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Admin layout presets
    // -----------------------------------------------------------------------

    /// Get the default preset for a given role.
    ///
    /// Returns `None` if no preset is assigned as the default for the role.
    pub async fn get_default_for_role(
        pool: &PgPool,
        role: &str,
    ) -> Result<Option<AdminLayoutPreset>, sqlx::Error> {
        let query = format!(
            "SELECT {PRESET_COLUMNS} FROM admin_layout_presets \
             WHERE role_default_for = $1"
        );
        sqlx::query_as::<_, AdminLayoutPreset>(&query)
            .bind(role)
            .fetch_optional(pool)
            .await
    }

    /// Create a new admin layout preset.
    pub async fn create_admin_preset(
        pool: &PgPool,
        dto: &CreateAdminPreset,
        created_by: DbId,
    ) -> Result<AdminLayoutPreset, sqlx::Error> {
        let query = format!(
            "INSERT INTO admin_layout_presets (name, role_default_for, layout_json, created_by) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {PRESET_COLUMNS}"
        );
        sqlx::query_as::<_, AdminLayoutPreset>(&query)
            .bind(&dto.name)
            .bind(&dto.role_default_for)
            .bind(&dto.layout_json)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// List all admin layout presets.
    pub async fn list_admin_presets(
        pool: &PgPool,
    ) -> Result<Vec<AdminLayoutPreset>, sqlx::Error> {
        let query = format!(
            "SELECT {PRESET_COLUMNS} FROM admin_layout_presets ORDER BY name"
        );
        sqlx::query_as::<_, AdminLayoutPreset>(&query)
            .fetch_all(pool)
            .await
    }

    /// Partially update an admin layout preset.
    ///
    /// Uses `COALESCE` so only provided fields are changed.
    /// `role_default_for` uses `Option<Option<String>>` to allow clearing the value.
    pub async fn update_admin_preset(
        pool: &PgPool,
        id: DbId,
        dto: &UpdateAdminPreset,
    ) -> Result<Option<AdminLayoutPreset>, sqlx::Error> {
        // For role_default_for: if the outer Option is Some, use the inner value
        // (which may be None to clear). If the outer Option is None, keep existing.
        let role_default_for_provided = dto.role_default_for.is_some();
        let role_default_for_value = dto.role_default_for.as_ref().and_then(|v| v.as_deref());

        let query = format!(
            "UPDATE admin_layout_presets SET \
                 name             = COALESCE($2, name), \
                 role_default_for = CASE WHEN $3 THEN $4 ELSE role_default_for END, \
                 layout_json      = COALESCE($5, layout_json) \
             WHERE id = $1 \
             RETURNING {PRESET_COLUMNS}"
        );
        sqlx::query_as::<_, AdminLayoutPreset>(&query)
            .bind(id)
            .bind(&dto.name)
            .bind(role_default_for_provided)
            .bind(role_default_for_value)
            .bind(&dto.layout_json)
            .fetch_optional(pool)
            .await
    }

    /// Delete an admin layout preset by ID.
    ///
    /// Returns `true` if a row was deleted.
    pub async fn delete_admin_preset(
        pool: &PgPool,
        id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM admin_layout_presets WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
