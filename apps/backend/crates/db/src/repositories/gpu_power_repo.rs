//! Repository for GPU power management tables (PRD-87).
//!
//! Provides CRUD operations for `power_schedules`, power state columns on
//! `workers`, and the `power_consumption_log` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::gpu_power::{
    CreatePowerSchedule, PowerConsumptionLog, PowerSchedule, UpdatePowerSchedule, WorkerPowerStatus,
};

/// Column list for `power_schedules` queries.
const SCHEDULE_COLUMNS: &str = "\
    id, worker_id, scope, schedule_json, timezone, \
    override_for_queued_jobs, enabled, created_at, updated_at";

/// Column list for `power_consumption_log` queries.
const CONSUMPTION_COLUMNS: &str = "\
    id, worker_id, date, active_minutes, idle_minutes, \
    off_minutes, estimated_kwh, created_at, updated_at";

/// Provides CRUD operations for GPU power management.
pub struct GpuPowerRepo;

impl GpuPowerRepo {
    // ── Schedule CRUD ────────────────────────────────────────────────────

    /// Create a new power schedule.
    pub async fn create_schedule(
        pool: &PgPool,
        input: &CreatePowerSchedule,
    ) -> Result<PowerSchedule, sqlx::Error> {
        let query = format!(
            "INSERT INTO power_schedules \
                (worker_id, scope, schedule_json, timezone, override_for_queued_jobs, enabled) \
             VALUES ($1, COALESCE($2, 'individual'), $3, COALESCE($4, 'UTC'), \
                     COALESCE($5, true), COALESCE($6, true)) \
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, PowerSchedule>(&query)
            .bind(input.worker_id)
            .bind(&input.scope)
            .bind(&input.schedule_json)
            .bind(&input.timezone)
            .bind(input.override_for_queued_jobs)
            .bind(input.enabled)
            .fetch_one(pool)
            .await
    }

    /// Find a power schedule by its internal ID.
    pub async fn find_schedule_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PowerSchedule>, sqlx::Error> {
        let query = format!("SELECT {SCHEDULE_COLUMNS} FROM power_schedules WHERE id = $1");
        sqlx::query_as::<_, PowerSchedule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all schedules for a specific worker.
    pub async fn list_schedules_by_worker(
        pool: &PgPool,
        worker_id: DbId,
    ) -> Result<Vec<PowerSchedule>, sqlx::Error> {
        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM power_schedules \
             WHERE worker_id = $1 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, PowerSchedule>(&query)
            .bind(worker_id)
            .fetch_all(pool)
            .await
    }

    /// List all fleet-wide schedules (scope = 'fleet').
    pub async fn list_fleet_schedules(pool: &PgPool) -> Result<Vec<PowerSchedule>, sqlx::Error> {
        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM power_schedules \
             WHERE scope = 'fleet' \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, PowerSchedule>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a power schedule. Only non-`None` fields are applied.
    pub async fn update_schedule(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePowerSchedule,
    ) -> Result<Option<PowerSchedule>, sqlx::Error> {
        let query = format!(
            "UPDATE power_schedules SET \
                schedule_json = COALESCE($2, schedule_json), \
                timezone = COALESCE($3, timezone), \
                override_for_queued_jobs = COALESCE($4, override_for_queued_jobs), \
                enabled = COALESCE($5, enabled) \
             WHERE id = $1 \
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, PowerSchedule>(&query)
            .bind(id)
            .bind(&input.schedule_json)
            .bind(&input.timezone)
            .bind(input.override_for_queued_jobs)
            .bind(input.enabled)
            .fetch_optional(pool)
            .await
    }

    /// Delete a power schedule by ID.
    pub async fn delete_schedule(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM power_schedules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Worker power state ───────────────────────────────────────────────

    /// Get the power status of a specific worker.
    pub async fn get_power_status(
        pool: &PgPool,
        worker_id: DbId,
    ) -> Result<Option<WorkerPowerStatus>, sqlx::Error> {
        let query = "\
            SELECT id AS worker_id, name AS worker_name, power_state, \
                   idle_timeout_minutes, wake_method, gpu_tdp_watts, min_fleet_member \
            FROM workers WHERE id = $1";
        sqlx::query_as::<_, WorkerPowerStatus>(query)
            .bind(worker_id)
            .fetch_optional(pool)
            .await
    }

    /// List all workers with their power status.
    pub async fn list_all_power_statuses(
        pool: &PgPool,
    ) -> Result<Vec<WorkerPowerStatus>, sqlx::Error> {
        let query = "\
            SELECT id AS worker_id, name AS worker_name, power_state, \
                   idle_timeout_minutes, wake_method, gpu_tdp_watts, min_fleet_member \
            FROM workers \
            ORDER BY id ASC";
        sqlx::query_as::<_, WorkerPowerStatus>(query)
            .fetch_all(pool)
            .await
    }

    /// Update the power state of a worker.
    pub async fn update_power_state(
        pool: &PgPool,
        worker_id: DbId,
        power_state: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE workers SET power_state = $2 WHERE id = $1")
            .bind(worker_id)
            .bind(power_state)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Update power-related settings on a worker.
    pub async fn update_worker_power_settings(
        pool: &PgPool,
        worker_id: DbId,
        idle_timeout_minutes: Option<i32>,
        wake_method: Option<&str>,
        wake_config_json: Option<&serde_json::Value>,
        gpu_tdp_watts: Option<i32>,
        min_fleet_member: Option<bool>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE workers SET \
                idle_timeout_minutes = COALESCE($2, idle_timeout_minutes), \
                wake_method = COALESCE($3, wake_method), \
                wake_config_json = COALESCE($4, wake_config_json), \
                gpu_tdp_watts = COALESCE($5, gpu_tdp_watts), \
                min_fleet_member = COALESCE($6, min_fleet_member) \
             WHERE id = $1",
        )
        .bind(worker_id)
        .bind(idle_timeout_minutes)
        .bind(wake_method)
        .bind(wake_config_json)
        .bind(gpu_tdp_watts)
        .bind(min_fleet_member)
        .execute(pool)
        .await?;
        Ok(())
    }

    // ── Consumption log ──────────────────────────────────────────────────

    /// Upsert a daily consumption log entry for a worker.
    ///
    /// On conflict with the unique `(worker_id, date)` index, the minute
    /// counters and estimated kWh are updated.
    pub async fn upsert_daily_consumption(
        pool: &PgPool,
        worker_id: DbId,
        date: chrono::NaiveDate,
        active_minutes: i32,
        idle_minutes: i32,
        off_minutes: i32,
        estimated_kwh: Option<f32>,
    ) -> Result<PowerConsumptionLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO power_consumption_log \
                (worker_id, date, active_minutes, idle_minutes, off_minutes, estimated_kwh) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (worker_id, date) DO UPDATE SET \
                active_minutes = EXCLUDED.active_minutes, \
                idle_minutes = EXCLUDED.idle_minutes, \
                off_minutes = EXCLUDED.off_minutes, \
                estimated_kwh = EXCLUDED.estimated_kwh \
             RETURNING {CONSUMPTION_COLUMNS}"
        );
        sqlx::query_as::<_, PowerConsumptionLog>(&query)
            .bind(worker_id)
            .bind(date)
            .bind(active_minutes)
            .bind(idle_minutes)
            .bind(off_minutes)
            .bind(estimated_kwh)
            .fetch_one(pool)
            .await
    }

    /// List consumption log entries for a worker, ordered by date descending.
    pub async fn list_consumption_by_worker(
        pool: &PgPool,
        worker_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<PowerConsumptionLog>, sqlx::Error> {
        let query = format!(
            "SELECT {CONSUMPTION_COLUMNS} FROM power_consumption_log \
             WHERE worker_id = $1 \
             ORDER BY date DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, PowerConsumptionLog>(&query)
            .bind(worker_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List consumption log entries for a date range across all workers.
    pub async fn list_consumption_by_date_range(
        pool: &PgPool,
        from_date: chrono::NaiveDate,
        to_date: chrono::NaiveDate,
    ) -> Result<Vec<PowerConsumptionLog>, sqlx::Error> {
        let query = format!(
            "SELECT {CONSUMPTION_COLUMNS} FROM power_consumption_log \
             WHERE date >= $1 AND date <= $2 \
             ORDER BY date DESC, worker_id ASC"
        );
        sqlx::query_as::<_, PowerConsumptionLog>(&query)
            .bind(from_date)
            .bind(to_date)
            .fetch_all(pool)
            .await
    }

    /// Get aggregated fleet consumption summary for a date range.
    pub async fn get_fleet_consumption_summary(
        pool: &PgPool,
        from_date: chrono::NaiveDate,
        to_date: chrono::NaiveDate,
    ) -> Result<FleetConsumptionRow, sqlx::Error> {
        let query = "\
            SELECT \
                COALESCE(SUM(active_minutes), 0)::BIGINT AS total_active_minutes, \
                COALESCE(SUM(idle_minutes), 0)::BIGINT AS total_idle_minutes, \
                COALESCE(SUM(off_minutes), 0)::BIGINT AS total_off_minutes, \
                COALESCE(SUM(estimated_kwh), 0)::FLOAT8 AS total_estimated_kwh \
            FROM power_consumption_log \
            WHERE date >= $1 AND date <= $2";
        sqlx::query_as::<_, FleetConsumptionRow>(query)
            .bind(from_date)
            .bind(to_date)
            .fetch_one(pool)
            .await
    }
}

/// Intermediate row type for fleet consumption aggregation.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FleetConsumptionRow {
    pub total_active_minutes: i64,
    pub total_idle_minutes: i64,
    pub total_off_minutes: i64,
    pub total_estimated_kwh: f64,
}
