//! Repository for the `comfyui_instances` and `comfyui_instance_statuses` tables.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::comfyui::{ComfyUIInstance, ComfyUIInstanceStatus};

/// Column list for `comfyui_instances` queries.
const COLUMNS: &str = "\
    id, name, ws_url, api_url, status_id, \
    last_connected_at, last_disconnected_at, reconnect_attempts, \
    is_enabled, drain_mode, metadata, cloud_instance_id, created_at, updated_at";

/// Column list for `comfyui_instance_statuses` queries.
const STATUS_COLUMNS: &str = "id, name, description, created_at, updated_at";

/// Provides query operations for ComfyUI instances and their statuses.
pub struct ComfyUIInstanceRepo;

impl ComfyUIInstanceRepo {
    // ── Instance status lookups ──────────────────────────────────────

    /// List all instance statuses.
    pub async fn list_statuses(pool: &PgPool) -> Result<Vec<ComfyUIInstanceStatus>, sqlx::Error> {
        let query =
            format!("SELECT {STATUS_COLUMNS} FROM comfyui_instance_statuses ORDER BY id ASC");
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

    /// List all enabled instances that are not in drain mode (PRD-132).
    ///
    /// Used by the allocator to find instances eligible for new job dispatch.
    pub async fn list_enabled_non_draining(
        pool: &PgPool,
    ) -> Result<Vec<ComfyUIInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM comfyui_instances \
             WHERE is_enabled = true AND drain_mode = false \
             ORDER BY id ASC"
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
        let result = sqlx::query("UPDATE comfyui_instances SET status_id = $2 WHERE id = $1")
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
        sqlx::query("UPDATE comfyui_instances SET last_disconnected_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Find all enabled instances whose name starts with a given prefix.
    ///
    /// Used by the pod orchestrator to discover previously registered
    /// RunPod instances (names like `runpod-{pod_id}`).
    pub async fn find_by_name_prefix(
        pool: &PgPool,
        prefix: &str,
    ) -> Result<Vec<ComfyUIInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM comfyui_instances \
             WHERE name LIKE $1 AND is_enabled = true \
             ORDER BY updated_at DESC"
        );
        sqlx::query_as::<_, ComfyUIInstance>(&query)
            .bind(format!("{prefix}%"))
            .fetch_all(pool)
            .await
    }

    /// Upsert an instance by name — insert if not exists, update URLs if it does.
    ///
    /// Used by the pod orchestrator to register a RunPod pod's ComfyUI
    /// endpoints after the pod is ready. Delegates to
    /// [`upsert_by_name_with_cloud`] with `cloud_instance_id = None`.
    pub async fn upsert_by_name(
        pool: &PgPool,
        name: &str,
        ws_url: &str,
        api_url: &str,
    ) -> Result<ComfyUIInstance, sqlx::Error> {
        Self::upsert_by_name_with_cloud(pool, name, ws_url, api_url, None).await
    }

    /// Upsert an instance by name with an optional link to a cloud instance.
    ///
    /// Used by the lifecycle bridge (PRD-130) to register a cloud pod's
    /// ComfyUI endpoints and link them to the cloud_instances row.
    pub async fn upsert_by_name_with_cloud(
        pool: &PgPool,
        name: &str,
        ws_url: &str,
        api_url: &str,
        cloud_instance_id: Option<DbId>,
    ) -> Result<ComfyUIInstance, sqlx::Error> {
        let query = format!(
            "INSERT INTO comfyui_instances (name, ws_url, api_url, status_id, is_enabled, cloud_instance_id) \
             VALUES ($1, $2, $3, 2, true, $4) \
             ON CONFLICT (name) DO UPDATE SET ws_url = $2, api_url = $3, is_enabled = true, cloud_instance_id = $4, updated_at = NOW() \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ComfyUIInstance>(&query)
            .bind(name)
            .bind(ws_url)
            .bind(api_url)
            .bind(cloud_instance_id)
            .fetch_one(pool)
            .await
    }

    /// Find the ComfyUI instance linked to a cloud instance.
    pub async fn find_by_cloud_instance_id(
        pool: &PgPool,
        cloud_instance_id: DbId,
    ) -> Result<Option<ComfyUIInstance>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM comfyui_instances WHERE cloud_instance_id = $1");
        sqlx::query_as::<_, ComfyUIInstance>(&query)
            .bind(cloud_instance_id)
            .fetch_optional(pool)
            .await
    }

    /// Disable all instances whose name starts with a given prefix.
    ///
    /// Used when provisioning a new RunPod pod — disables stale
    /// `runpod-{old_pod_id}` entries so the ComfyUI manager ignores them.
    pub async fn disable_by_name_prefix(pool: &PgPool, prefix: &str) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE comfyui_instances SET is_enabled = false \
             WHERE name LIKE $1 AND is_enabled = true",
        )
        .bind(format!("{prefix}%"))
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Disable a single instance by ID.
    pub async fn disable_by_id(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE comfyui_instances SET is_enabled = false WHERE id = $1 AND is_enabled = true",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set or clear drain mode on an instance (PRD-132).
    ///
    /// Returns `true` if a row was updated, `false` if the instance was not found.
    pub async fn set_drain_mode(pool: &PgPool, id: DbId, drain: bool) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE comfyui_instances SET drain_mode = $2, updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .bind(drain)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Count active (pending/dispatched/running) jobs assigned to an instance (PRD-132).
    pub async fn count_active_jobs(pool: &PgPool, instance_id: DbId) -> Result<i64, sqlx::Error> {
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM jobs \
             WHERE comfyui_instance_id = $1 \
               AND status_id IN ($2, $3, $4)",
        )
        .bind(instance_id)
        .bind(1_i16) // Pending
        .bind(9_i16) // Dispatched
        .bind(2_i16) // Running
        .fetch_one(pool)
        .await?;
        Ok(count.0)
    }

    /// Increment the reconnect attempt counter for an instance.
    pub async fn increment_reconnect_attempts(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
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
