//! Repository for the `platform_settings` table (PRD-110).

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::platform_setting::PlatformSetting;

const COLUMNS: &str = "id, key, value, category, updated_by, created_at, updated_at";

/// Provides CRUD operations for platform settings.
pub struct PlatformSettingRepo;

impl PlatformSettingRepo {
    /// Upsert a setting. Inserts on first use, updates value/category on conflict.
    pub async fn upsert(
        pool: &PgPool,
        key: &str,
        value: &str,
        category: &str,
        user_id: DbId,
    ) -> Result<PlatformSetting, sqlx::Error> {
        let query = format!(
            "INSERT INTO platform_settings (key, value, category, updated_by) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (key) DO UPDATE SET \
                 value = EXCLUDED.value, \
                 category = EXCLUDED.category, \
                 updated_by = EXCLUDED.updated_by \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlatformSetting>(&query)
            .bind(key)
            .bind(value)
            .bind(category)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find a setting by its unique key.
    pub async fn find_by_key(
        pool: &PgPool,
        key: &str,
    ) -> Result<Option<PlatformSetting>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM platform_settings WHERE key = $1");
        sqlx::query_as::<_, PlatformSetting>(&query)
            .bind(key)
            .fetch_optional(pool)
            .await
    }

    /// List all settings, optionally filtered by category.
    pub async fn list(
        pool: &PgPool,
        category: Option<&str>,
    ) -> Result<Vec<PlatformSetting>, sqlx::Error> {
        if let Some(cat) = category {
            let query = format!(
                "SELECT {COLUMNS} FROM platform_settings WHERE category = $1 ORDER BY key ASC"
            );
            sqlx::query_as::<_, PlatformSetting>(&query)
                .bind(cat)
                .fetch_all(pool)
                .await
        } else {
            let query = format!("SELECT {COLUMNS} FROM platform_settings ORDER BY key ASC");
            sqlx::query_as::<_, PlatformSetting>(&query)
                .fetch_all(pool)
                .await
        }
    }

    /// Delete a setting by key. Returns `true` if a row was removed.
    pub async fn delete_by_key(pool: &PgPool, key: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM platform_settings WHERE key = $1")
            .bind(key)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Return the most recent `updated_at` among the given keys.
    ///
    /// Used to check whether any restart-requiring setting has changed since
    /// the server booted.
    pub async fn last_restart_change(
        pool: &PgPool,
        keys: &[&str],
    ) -> Result<Option<Timestamp>, sqlx::Error> {
        if keys.is_empty() {
            return Ok(None);
        }
        // Build a parameterised IN clause.
        let placeholders: Vec<String> = (1..=keys.len()).map(|i| format!("${i}")).collect();
        let query = format!(
            "SELECT MAX(updated_at) as \"max!: Timestamp\" \
             FROM platform_settings \
             WHERE key IN ({})",
            placeholders.join(", ")
        );
        let mut q = sqlx::query_scalar::<_, Option<Timestamp>>(&query);
        for key in keys {
            q = q.bind(*key);
        }
        // query_scalar returns Option<Option<Timestamp>> — flatten.
        q.fetch_optional(pool).await.map(|opt| opt.flatten())
    }
}
