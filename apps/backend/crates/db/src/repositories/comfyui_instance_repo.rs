//! Repository for the `comfyui_instances` and `comfyui_instance_statuses` tables.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::comfyui::{ComfyUIInstance, ComfyUIInstanceStatus};

/// Column list for `comfyui_instances` queries.
const COLUMNS: &str = "\
    id, name, ws_url, api_url, status_id, \
    last_connected_at, last_disconnected_at, reconnect_attempts, \
    is_enabled, metadata, created_at, updated_at";

/// Column list for `comfyui_instance_statuses` queries.
const STATUS_COLUMNS: &str = "id, name, description, created_at, updated_at";

/// Provides query operations for ComfyUI instances and their statuses.
pub struct ComfyUIInstanceRepo;

impl ComfyUIInstanceRepo {
    // ── Instance status lookups ──────────────────────────────────────

    /// List all instance statuses.
    pub async fn list_statuses(
        pool: &PgPool,
    ) -> Result<Vec<ComfyUIInstanceStatus>, sqlx::Error> {
        let query = format!(
            "SELECT {STATUS_COLUMNS} FROM comfyui_instance_statuses ORDER BY id ASC"
        );
        sqlx::query_as::<_, ComfyUIInstanceStatus>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a status by name (e.g. "connected", "disconnected").
    pub async fn find_status_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<ComfyUIInstanceStatus>, sqlx::Error> {
        let query =
            format!("SELECT {STATUS_COLUMNS} FROM comfyui_instance_statuses WHERE name = $1");
        sqlx::query_as::<_, ComfyUIInstanceStatus>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    // ── Instance queries ─────────────────────────────────────────────

    /// List all instances ordered by ID (including disabled).
    pub async fn list(pool: &PgPool) -> Result<Vec<ComfyUIInstance>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM comfyui_instances ORDER BY id ASC");
        sqlx::query_as::<_, ComfyUIInstance>(&query)
            .fetch_all(pool)
            .await
    }

    /// List all enabled instances.
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<ComfyUIInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM comfyui_instances WHERE is_enabled = true ORDER BY id ASC"
        );
        sqlx::query_as::<_, ComfyUIInstance>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find an instance by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ComfyUIInstance>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM comfyui_instances WHERE id = $1");
        sqlx::query_as::<_, ComfyUIInstance>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    // ── Instance mutations ───────────────────────────────────────────

    /// Update the connection status of an instance. Returns `true` if a row was updated.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE comfyui_instances SET status_id = $2 WHERE id = $1")
                .bind(id)
                .bind(status_id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Record a successful connection (sets `last_connected_at`, resets reconnect counter).
    pub async fn record_connection(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_instances \
             SET last_connected_at = NOW(), reconnect_attempts = 0 \
             WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Record a disconnection (sets `last_disconnected_at`).
    pub async fn record_disconnection(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_instances SET last_disconnected_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Increment the reconnect attempt counter for an instance.
    pub async fn increment_reconnect_attempts(
        pool: &PgPool,
        id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_instances \
             SET reconnect_attempts = reconnect_attempts + 1 \
             WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
