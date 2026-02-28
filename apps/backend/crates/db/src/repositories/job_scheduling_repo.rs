//! Repositories for time-based job scheduling tables (PRD-119).
//!
//! Covers: `schedules`, `schedule_history`, `off_peak_config`.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::job_scheduling::{
    CreateSchedule, OffPeakConfig, Schedule, ScheduleHistory, UpdateSchedule, UpsertOffPeakConfig,
};

// ===========================================================================
// ScheduleRepo
// ===========================================================================

const SCHEDULE_COLUMNS: &str = "\
    id, name, description, schedule_type, cron_expression, scheduled_at, \
    timezone, is_off_peak_only, action_type, action_config, owner_id, \
    is_active, last_run_at, next_run_at, run_count, created_at, updated_at";

/// CRUD for the `schedules` table.
pub struct ScheduleRepo;

impl ScheduleRepo {
    /// Create a new schedule.
    pub async fn create(
        pool: &PgPool,
        owner_id: DbId,
        input: &CreateSchedule,
    ) -> Result<Schedule, sqlx::Error> {
        let query = format!(
            "INSERT INTO schedules \
                (name, description, schedule_type, cron_expression, scheduled_at, \
                 timezone, is_off_peak_only, action_type, action_config, owner_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) \
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, Schedule>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.schedule_type)
            .bind(&input.cron_expression)
            .bind(input.scheduled_at)
            .bind(&input.timezone)
            .bind(input.is_off_peak_only)
            .bind(&input.action_type)
            .bind(&input.action_config)
            .bind(owner_id)
            .fetch_one(pool)
            .await
    }

    /// Find a schedule by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Schedule>, sqlx::Error> {
        let query = format!("SELECT {SCHEDULE_COLUMNS} FROM schedules WHERE id = $1");
        sqlx::query_as::<_, Schedule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List schedules with optional filters for schedule_type, is_active,
    /// and owner_id. Results ordered newest-first.
    pub async fn list_filtered(
        pool: &PgPool,
        owner_id: Option<DbId>,
        schedule_type: Option<&str>,
        is_active: Option<bool>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Schedule>, sqlx::Error> {
        let mut conditions: Vec<String> = Vec::new();
        let mut param_idx: usize = 1;

        if owner_id.is_some() {
            conditions.push(format!("owner_id = ${param_idx}"));
            param_idx += 1;
        }
        if schedule_type.is_some() {
            conditions.push(format!("schedule_type = ${param_idx}"));
            param_idx += 1;
        }
        if is_active.is_some() {
            conditions.push(format!("is_active = ${param_idx}"));
            param_idx += 1;
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM schedules {where_clause} \
             ORDER BY created_at DESC \
             LIMIT ${param_idx} OFFSET ${}",
            param_idx + 1
        );

        let mut q = sqlx::query_as::<_, Schedule>(&query);

        if let Some(oid) = owner_id {
            q = q.bind(oid);
        }
        if let Some(st) = schedule_type {
            q = q.bind(st);
        }
        if let Some(active) = is_active {
            q = q.bind(active);
        }
        q = q.bind(limit).bind(offset);

        q.fetch_all(pool).await
    }

    /// Update a schedule. Only updates provided (non-None) fields.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSchedule,
    ) -> Result<Option<Schedule>, sqlx::Error> {
        let mut sets: Vec<String> = Vec::new();
        let mut param_idx: usize = 2; // $1 = id

        if input.name.is_some() {
            sets.push(format!("name = ${param_idx}"));
            param_idx += 1;
        }
        if input.description.is_some() {
            sets.push(format!("description = ${param_idx}"));
            param_idx += 1;
        }
        if input.schedule_type.is_some() {
            sets.push(format!("schedule_type = ${param_idx}"));
            param_idx += 1;
        }
        if input.cron_expression.is_some() {
            sets.push(format!("cron_expression = ${param_idx}"));
            param_idx += 1;
        }
        if input.scheduled_at.is_some() {
            sets.push(format!("scheduled_at = ${param_idx}"));
            param_idx += 1;
        }
        if input.timezone.is_some() {
            sets.push(format!("timezone = ${param_idx}"));
            param_idx += 1;
        }
        if input.is_off_peak_only.is_some() {
            sets.push(format!("is_off_peak_only = ${param_idx}"));
            param_idx += 1;
        }
        if input.action_type.is_some() {
            sets.push(format!("action_type = ${param_idx}"));
            param_idx += 1;
        }
        if input.action_config.is_some() {
            sets.push(format!("action_config = ${param_idx}"));
            // param_idx not needed after last field
        }

        if sets.is_empty() {
            // Nothing to update; just return the current row.
            return Self::find_by_id(pool, id).await;
        }

        let query = format!(
            "UPDATE schedules SET {} WHERE id = $1 RETURNING {SCHEDULE_COLUMNS}",
            sets.join(", ")
        );

        let mut q = sqlx::query_as::<_, Schedule>(&query);
        q = q.bind(id);

        if let Some(ref name) = input.name {
            q = q.bind(name);
        }
        if let Some(ref desc) = input.description {
            q = q.bind(desc);
        }
        if let Some(ref st) = input.schedule_type {
            q = q.bind(st);
        }
        if let Some(ref cron) = input.cron_expression {
            q = q.bind(cron);
        }
        if let Some(scheduled_at) = input.scheduled_at {
            q = q.bind(scheduled_at);
        }
        if let Some(ref tz) = input.timezone {
            q = q.bind(tz);
        }
        if let Some(off_peak) = input.is_off_peak_only {
            q = q.bind(off_peak);
        }
        if let Some(ref at) = input.action_type {
            q = q.bind(at);
        }
        if let Some(ref ac) = input.action_config {
            q = q.bind(ac);
        }

        q.fetch_optional(pool).await
    }

    /// Delete a schedule by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM schedules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set a schedule's `is_active` flag (pause/resume).
    pub async fn set_active(
        pool: &PgPool,
        id: DbId,
        is_active: bool,
    ) -> Result<Option<Schedule>, sqlx::Error> {
        let query = format!(
            "UPDATE schedules SET is_active = $2 WHERE id = $1 \
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, Schedule>(&query)
            .bind(id)
            .bind(is_active)
            .fetch_optional(pool)
            .await
    }

    /// Update `next_run_at` for a schedule (called after computing next run).
    pub async fn set_next_run(
        pool: &PgPool,
        id: DbId,
        next_run_at: Option<Timestamp>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE schedules SET next_run_at = $2 WHERE id = $1")
            .bind(id)
            .bind(next_run_at)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Record that a schedule was executed: bump run_count and set last_run_at.
    pub async fn record_execution(
        pool: &PgPool,
        id: DbId,
        executed_at: Timestamp,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE schedules SET run_count = run_count + 1, last_run_at = $2 WHERE id = $1",
        )
        .bind(id)
        .bind(executed_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Find all active schedules whose `next_run_at` is at or before `now`.
    pub async fn find_due(pool: &PgPool, now: Timestamp) -> Result<Vec<Schedule>, sqlx::Error> {
        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM schedules \
             WHERE is_active = true AND next_run_at <= $1 \
             ORDER BY next_run_at ASC"
        );
        sqlx::query_as::<_, Schedule>(&query)
            .bind(now)
            .fetch_all(pool)
            .await
    }
}

// ===========================================================================
// ScheduleHistoryRepo
// ===========================================================================

const HISTORY_COLUMNS: &str = "\
    id, schedule_id, executed_at, status, result_job_id, \
    error_message, execution_duration_ms, created_at";

/// Read/write operations for the `schedule_history` table.
pub struct ScheduleHistoryRepo;

impl ScheduleHistoryRepo {
    /// Record an execution in the history log.
    pub async fn record(
        pool: &PgPool,
        schedule_id: DbId,
        status: &str,
        result_job_id: Option<DbId>,
        error_message: Option<&str>,
        execution_duration_ms: Option<i32>,
    ) -> Result<ScheduleHistory, sqlx::Error> {
        let query = format!(
            "INSERT INTO schedule_history \
                (schedule_id, status, result_job_id, error_message, execution_duration_ms) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {HISTORY_COLUMNS}"
        );
        sqlx::query_as::<_, ScheduleHistory>(&query)
            .bind(schedule_id)
            .bind(status)
            .bind(result_job_id)
            .bind(error_message)
            .bind(execution_duration_ms)
            .fetch_one(pool)
            .await
    }

    /// List execution history for a schedule with optional status filter.
    pub async fn list_by_schedule(
        pool: &PgPool,
        schedule_id: DbId,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ScheduleHistory>, sqlx::Error> {
        let mut conditions = vec!["schedule_id = $1".to_string()];
        let mut param_idx: usize = 2;

        if status.is_some() {
            conditions.push(format!("status = ${param_idx}"));
            param_idx += 1;
        }

        let where_clause = format!("WHERE {}", conditions.join(" AND "));

        let query = format!(
            "SELECT {HISTORY_COLUMNS} FROM schedule_history {where_clause} \
             ORDER BY executed_at DESC \
             LIMIT ${param_idx} OFFSET ${}",
            param_idx + 1
        );

        let mut q = sqlx::query_as::<_, ScheduleHistory>(&query);
        q = q.bind(schedule_id);

        if let Some(s) = status {
            q = q.bind(s);
        }
        q = q.bind(limit).bind(offset);

        q.fetch_all(pool).await
    }
}

// ===========================================================================
// OffPeakConfigRepo
// ===========================================================================

const OFF_PEAK_COLUMNS: &str = "\
    id, day_of_week, start_hour, end_hour, timezone, created_at, updated_at";

/// CRUD for the `off_peak_config` table.
pub struct OffPeakConfigRepo;

impl OffPeakConfigRepo {
    /// List all off-peak config entries, ordered by day_of_week.
    pub async fn list(pool: &PgPool) -> Result<Vec<OffPeakConfig>, sqlx::Error> {
        let query = format!("SELECT {OFF_PEAK_COLUMNS} FROM off_peak_config ORDER BY day_of_week");
        sqlx::query_as::<_, OffPeakConfig>(&query)
            .fetch_all(pool)
            .await
    }

    /// Upsert a single off-peak config entry (by day_of_week + timezone).
    pub async fn upsert(
        pool: &PgPool,
        input: &UpsertOffPeakConfig,
    ) -> Result<OffPeakConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO off_peak_config (day_of_week, start_hour, end_hour, timezone) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (day_of_week, timezone) \
             DO UPDATE SET start_hour = $2, end_hour = $3 \
             RETURNING {OFF_PEAK_COLUMNS}"
        );
        sqlx::query_as::<_, OffPeakConfig>(&query)
            .bind(input.day_of_week)
            .bind(input.start_hour)
            .bind(input.end_hour)
            .bind(&input.timezone)
            .fetch_one(pool)
            .await
    }

    /// Replace the entire off-peak config for a timezone in a single transaction.
    ///
    /// Deletes all existing entries for the timezone, then inserts the new ones.
    pub async fn replace_all(
        pool: &PgPool,
        timezone: &str,
        entries: &[UpsertOffPeakConfig],
    ) -> Result<Vec<OffPeakConfig>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        sqlx::query("DELETE FROM off_peak_config WHERE timezone = $1")
            .bind(timezone)
            .execute(&mut *tx)
            .await?;

        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            let query = format!(
                "INSERT INTO off_peak_config (day_of_week, start_hour, end_hour, timezone) \
                 VALUES ($1, $2, $3, $4) \
                 RETURNING {OFF_PEAK_COLUMNS}"
            );
            let row = sqlx::query_as::<_, OffPeakConfig>(&query)
                .bind(entry.day_of_week)
                .bind(entry.start_hour)
                .bind(entry.end_hour)
                .bind(&entry.timezone)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }
}
