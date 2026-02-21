//! Repository for the `extensions` table (PRD-85).
//!
//! Provides CRUD operations for the extension registry including
//! install, uninstall, enable/disable, and settings management.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::extension::{
    CreateExtension, Extension, ExtensionRegistration, UpdateExtensionSettings,
};

/// Column list for `extensions` queries.
const COLUMNS: &str = "\
    id, name, version, author, description, manifest_json, settings_json, \
    enabled, source_path, api_version, installed_by, installed_at, \
    created_at, updated_at";

/// Column list for registry (lightweight) queries.
const REGISTRY_COLUMNS: &str = "\
    id, name, version, manifest_json, settings_json, enabled";

/// Provides CRUD operations for extensions.
pub struct ExtensionRepo;

impl ExtensionRepo {
    /// List all extensions, ordered by name ascending.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Extension>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM extensions ORDER BY name");
        sqlx::query_as::<_, Extension>(&query).fetch_all(pool).await
    }

    /// List only enabled extensions, ordered by name ascending.
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<Extension>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM extensions WHERE enabled = true ORDER BY name");
        sqlx::query_as::<_, Extension>(&query).fetch_all(pool).await
    }

    /// List enabled extensions as lightweight registry entries.
    pub async fn list_registry(pool: &PgPool) -> Result<Vec<ExtensionRegistration>, sqlx::Error> {
        let query =
            format!("SELECT {REGISTRY_COLUMNS} FROM extensions WHERE enabled = true ORDER BY name");
        sqlx::query_as::<_, ExtensionRegistration>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find an extension by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Extension>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM extensions WHERE id = $1");
        sqlx::query_as::<_, Extension>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find an extension by its unique name.
    pub async fn find_by_name(pool: &PgPool, name: &str) -> Result<Option<Extension>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM extensions WHERE name = $1");
        sqlx::query_as::<_, Extension>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Insert a new extension, returning the created row.
    pub async fn insert(pool: &PgPool, input: &CreateExtension) -> Result<Extension, sqlx::Error> {
        let settings = input
            .settings_json
            .clone()
            .unwrap_or_else(|| serde_json::json!({}));

        let query = format!(
            "INSERT INTO extensions \
                (name, version, author, description, manifest_json, \
                 settings_json, source_path, api_version, installed_by) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Extension>(&query)
            .bind(&input.name)
            .bind(&input.version)
            .bind(&input.author)
            .bind(&input.description)
            .bind(&input.manifest_json)
            .bind(&settings)
            .bind(&input.source_path)
            .bind(&input.api_version)
            .bind(input.installed_by)
            .fetch_one(pool)
            .await
    }

    /// Update an extension's settings. Returns `None` if not found.
    pub async fn update_settings(
        pool: &PgPool,
        id: DbId,
        input: &UpdateExtensionSettings,
    ) -> Result<Option<Extension>, sqlx::Error> {
        let query = format!(
            "UPDATE extensions SET settings_json = $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Extension>(&query)
            .bind(id)
            .bind(&input.settings_json)
            .fetch_optional(pool)
            .await
    }

    /// Enable or disable an extension. Returns `None` if not found.
    pub async fn set_enabled(
        pool: &PgPool,
        id: DbId,
        enabled: bool,
    ) -> Result<Option<Extension>, sqlx::Error> {
        let query = format!(
            "UPDATE extensions SET enabled = $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Extension>(&query)
            .bind(id)
            .bind(enabled)
            .fetch_optional(pool)
            .await
    }

    /// Delete an extension by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM extensions WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
