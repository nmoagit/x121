//! Repository for platform setup wizard table (PRD-105).
//!
//! Provides data access for `platform_setup`.

use chrono::Utc;
use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::setup_wizard::PlatformSetup;

// ---------------------------------------------------------------------------
// Column list
// ---------------------------------------------------------------------------

/// Column list for `platform_setup` queries.
const COLUMNS: &str = "\
    id, step_name, completed, config_json, validated_at, \
    configured_by, error_message, created_at, updated_at";

// ---------------------------------------------------------------------------
// PlatformSetupRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `platform_setup` table.
pub struct PlatformSetupRepo;

impl PlatformSetupRepo {
    /// List all setup steps in ID (insertion) order.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<PlatformSetup>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM platform_setup ORDER BY id ASC");
        sqlx::query_as::<_, PlatformSetup>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a single setup step by its step name.
    pub async fn find_by_step_name(
        pool: &PgPool,
        step_name: &str,
    ) -> Result<Option<PlatformSetup>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM platform_setup WHERE step_name = $1");
        sqlx::query_as::<_, PlatformSetup>(&query)
            .bind(step_name)
            .fetch_optional(pool)
            .await
    }

    /// Generic update for a step. Only non-None fields are applied.
    pub async fn update_step(
        pool: &PgPool,
        step_name: &str,
        completed: Option<bool>,
        config_json: Option<&serde_json::Value>,
        validated_at: Option<chrono::DateTime<Utc>>,
        configured_by: Option<DbId>,
        error_message: Option<&str>,
    ) -> Result<Option<PlatformSetup>, sqlx::Error> {
        let query = format!(
            "UPDATE platform_setup SET \
                completed     = COALESCE($2, completed), \
                config_json   = COALESCE($3, config_json), \
                validated_at  = COALESCE($4, validated_at), \
                configured_by = COALESCE($5, configured_by), \
                error_message = COALESCE($6, error_message) \
             WHERE step_name = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlatformSetup>(&query)
            .bind(step_name)
            .bind(completed)
            .bind(config_json)
            .bind(validated_at)
            .bind(configured_by)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// Mark a step as completed with its configuration and the user who did it.
    pub async fn mark_complete(
        pool: &PgPool,
        step_name: &str,
        config_json: Option<&serde_json::Value>,
        configured_by: DbId,
    ) -> Result<Option<PlatformSetup>, sqlx::Error> {
        let now = Utc::now();
        let query = format!(
            "UPDATE platform_setup SET \
                completed     = true, \
                config_json   = COALESCE($2, config_json), \
                validated_at  = $3, \
                configured_by = $4, \
                error_message = NULL \
             WHERE step_name = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlatformSetup>(&query)
            .bind(step_name)
            .bind(config_json)
            .bind(now)
            .bind(configured_by)
            .fetch_optional(pool)
            .await
    }

    /// Mark a step as failed with an error message.
    pub async fn mark_failed(
        pool: &PgPool,
        step_name: &str,
        error_message: &str,
    ) -> Result<Option<PlatformSetup>, sqlx::Error> {
        let query = format!(
            "UPDATE platform_setup SET \
                completed     = false, \
                error_message = $2, \
                validated_at  = NULL \
             WHERE step_name = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlatformSetup>(&query)
            .bind(step_name)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// Reset a step back to its initial state.
    pub async fn reset_step(
        pool: &PgPool,
        step_name: &str,
    ) -> Result<Option<PlatformSetup>, sqlx::Error> {
        let query = format!(
            "UPDATE platform_setup SET \
                completed     = false, \
                config_json   = NULL, \
                validated_at  = NULL, \
                configured_by = NULL, \
                error_message = NULL \
             WHERE step_name = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlatformSetup>(&query)
            .bind(step_name)
            .fetch_optional(pool)
            .await
    }

    /// Check whether all required steps are complete.
    ///
    /// Returns `true` if every step except `integrations` is marked complete.
    pub async fn is_wizard_complete(pool: &PgPool) -> Result<bool, sqlx::Error> {
        let count: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM platform_setup \
             WHERE step_name != 'integrations' AND completed = false",
        )
        .fetch_one(pool)
        .await?;
        Ok(count.unwrap_or(1) == 0)
    }
}
