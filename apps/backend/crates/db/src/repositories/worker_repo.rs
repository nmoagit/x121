//! Repository for the `workers` and `worker_health_log` tables (PRD-46).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::status::{StatusId, WorkerStatus};
use crate::models::worker::{
    CreateHealthLogEntry, CreateWorker, FleetStats, UpdateWorker, Worker, WorkerHealthLogEntry,
};

/// Column list for `workers` queries.
const COLUMNS: &str = "\
    id, name, hostname, ip_address, gpu_model, gpu_count, vram_total_mb, \
    status_id, tags, comfyui_instance_id, is_approved, is_enabled, \
    last_heartbeat_at, registered_at, decommissioned_at, metadata, \
    created_at, updated_at";

/// Column list for `worker_health_log` queries.
const HEALTH_COLUMNS: &str = "\
    id, worker_id, from_status_id, to_status_id, reason, transitioned_at";

/// Provides CRUD operations for workers and health-log entries.
pub struct WorkerRepo;

impl WorkerRepo {
    // ── Registration ─────────────────────────────────────────────────────

    /// Register a new worker, or update fields on name conflict (upsert).
    ///
    /// On conflict the hostname, ip_address, gpu_model, gpu_count,
    /// vram_total_mb, and metadata are updated from the new values.
    pub async fn register(pool: &PgPool, input: &CreateWorker) -> Result<Worker, sqlx::Error> {
        let tags_json = input
            .tags
            .as_ref()
            .map(|t| serde_json::to_value(t).unwrap_or_default())
            .unwrap_or_else(|| serde_json::json!([]));

        let query = format!(
            "INSERT INTO workers (name, hostname, ip_address, gpu_model, gpu_count, vram_total_mb, \
                status_id, tags, comfyui_instance_id, metadata)
             VALUES ($1, $2, $3, $4, COALESCE($5, 1), $6, $10, $7, $8, COALESCE($9, '{{}}'::jsonb))
             ON CONFLICT (name) DO UPDATE SET
                hostname = EXCLUDED.hostname,
                ip_address = EXCLUDED.ip_address,
                gpu_model = EXCLUDED.gpu_model,
                gpu_count = EXCLUDED.gpu_count,
                vram_total_mb = EXCLUDED.vram_total_mb,
                metadata = EXCLUDED.metadata,
                last_heartbeat_at = NOW()
             RETURNING {COLUMNS}"
        );

        sqlx::query_as::<_, Worker>(&query)
            .bind(&input.name)
            .bind(&input.hostname)
            .bind(&input.ip_address)
            .bind(&input.gpu_model)
            .bind(input.gpu_count)
            .bind(input.vram_total_mb)
            .bind(&tags_json)
            .bind(input.comfyui_instance_id)
            .bind(&input.metadata)
            .bind(WorkerStatus::Offline.id()) // $10: initial status = Offline (DRY-213)
            .fetch_one(pool)
            .await
    }

    // ── Queries ──────────────────────────────────────────────────────────

    /// Find a worker by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Worker>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workers WHERE id = $1");
        sqlx::query_as::<_, Worker>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all workers ordered by name (admin view).
    pub async fn list(pool: &PgPool) -> Result<Vec<Worker>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workers ORDER BY name ASC");
        sqlx::query_as::<_, Worker>(&query)
            .fetch_all(pool)
            .await
    }

    /// List only available workers: idle, enabled, approved, not decommissioned.
    pub async fn list_available(pool: &PgPool) -> Result<Vec<Worker>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM workers \
             WHERE status_id = $1 AND is_enabled = true AND is_approved = true \
                   AND decommissioned_at IS NULL \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, Worker>(&query)
            .bind(WorkerStatus::Idle.id()) // DRY-213
            .fetch_all(pool)
            .await
    }

    /// Find workers whose `tags` JSONB array contains all of the `required_tags`.
    ///
    /// Uses the `@>` containment operator: worker.tags @> '["gpu","a100"]'.
    pub async fn find_by_tags(
        pool: &PgPool,
        required_tags: &[String],
    ) -> Result<Vec<Worker>, sqlx::Error> {
        let tags_json = serde_json::to_value(required_tags).unwrap_or_default();
        let query = format!(
            "SELECT {COLUMNS} FROM workers \
             WHERE tags @> $1::jsonb \
                   AND is_enabled = true AND is_approved = true \
                   AND decommissioned_at IS NULL \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, Worker>(&query)
            .bind(&tags_json)
            .fetch_all(pool)
            .await
    }

    // ── Mutations ────────────────────────────────────────────────────────

    /// Update a worker. Only non-`None` fields in `input` are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateWorker,
    ) -> Result<Option<Worker>, sqlx::Error> {
        let query = format!(
            "UPDATE workers SET
                hostname = COALESCE($2, hostname),
                ip_address = COALESCE($3, ip_address),
                gpu_model = COALESCE($4, gpu_model),
                gpu_count = COALESCE($5, gpu_count),
                vram_total_mb = COALESCE($6, vram_total_mb),
                tags = COALESCE($7, tags),
                comfyui_instance_id = COALESCE($8, comfyui_instance_id),
                is_enabled = COALESCE($9, is_enabled),
                metadata = COALESCE($10, metadata)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Worker>(&query)
            .bind(id)
            .bind(&input.hostname)
            .bind(&input.ip_address)
            .bind(&input.gpu_model)
            .bind(input.gpu_count)
            .bind(input.vram_total_mb)
            .bind(&input.tags)
            .bind(input.comfyui_instance_id)
            .bind(input.is_enabled)
            .bind(&input.metadata)
            .fetch_optional(pool)
            .await
    }

    /// Touch the heartbeat timestamp for a worker.
    pub async fn update_heartbeat(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE workers SET last_heartbeat_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Update the status of a worker.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE workers SET status_id = $2 WHERE id = $1")
            .bind(id)
            .bind(status_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Approve a worker for receiving jobs.
    pub async fn approve(pool: &PgPool, id: DbId) -> Result<Option<Worker>, sqlx::Error> {
        let query = format!(
            "UPDATE workers SET is_approved = true, status_id = $2 \
             WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Worker>(&query)
            .bind(id)
            .bind(WorkerStatus::Idle.id()) // DRY-213
            .fetch_optional(pool)
            .await
    }

    /// Decommission a worker: mark it as offline and set decommissioned_at.
    pub async fn decommission(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE workers SET status_id = $2, is_enabled = false, decommissioned_at = NOW() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(WorkerStatus::Offline.id()) // DRY-213
        .execute(pool)
        .await?;
        Ok(())
    }

    // ── Fleet stats ──────────────────────────────────────────────────────

    /// Aggregate fleet-level statistics.
    pub async fn fleet_stats(pool: &PgPool) -> Result<FleetStats, sqlx::Error> {
        let query = "\
            SELECT \
                COUNT(*) AS total_workers, \
                COUNT(*) FILTER (WHERE status_id = 1) AS idle_workers, \
                COUNT(*) FILTER (WHERE status_id = 2) AS busy_workers, \
                COUNT(*) FILTER (WHERE status_id = 3) AS offline_workers, \
                COUNT(*) FILTER (WHERE status_id = 4) AS draining_workers, \
                COUNT(*) FILTER (WHERE is_approved = true) AS approved_workers, \
                COUNT(*) FILTER (WHERE is_enabled = true) AS enabled_workers \
            FROM workers";
        sqlx::query_as::<_, FleetStats>(query)
            .fetch_one(pool)
            .await
    }

    // ── Health log ───────────────────────────────────────────────────────

    /// Insert a health-log entry recording a status transition.
    pub async fn log_transition(
        pool: &PgPool,
        entry: &CreateHealthLogEntry,
    ) -> Result<WorkerHealthLogEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO worker_health_log (worker_id, from_status_id, to_status_id, reason) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {HEALTH_COLUMNS}"
        );
        sqlx::query_as::<_, WorkerHealthLogEntry>(&query)
            .bind(entry.worker_id)
            .bind(entry.from_status_id)
            .bind(entry.to_status_id)
            .bind(&entry.reason)
            .fetch_one(pool)
            .await
    }

    /// Get the health log for a worker, ordered by most recent first.
    pub async fn get_health_log(
        pool: &PgPool,
        worker_id: DbId,
    ) -> Result<Vec<WorkerHealthLogEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {HEALTH_COLUMNS} FROM worker_health_log \
             WHERE worker_id = $1 \
             ORDER BY transitioned_at DESC"
        );
        sqlx::query_as::<_, WorkerHealthLogEntry>(&query)
            .bind(worker_id)
            .fetch_all(pool)
            .await
    }
}
