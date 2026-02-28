//! Repository for backup & disaster recovery tables (PRD-81).
//!
//! Provides data access for `backups` and `backup_schedules`.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::backup_recovery::{
    Backup, BackupSchedule, BackupSummary, CreateBackup, CreateBackupSchedule, UpdateBackup,
    UpdateBackupSchedule,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

/// Column list for `backups` queries.
const BACKUP_COLUMNS: &str = "\
    id, backup_type, destination, file_path, size_bytes, status, \
    started_at, completed_at, verified, verified_at, \
    verification_result_json, error_message, triggered_by, \
    retention_expires_at, created_at, updated_at";

/// Column list for `backup_schedules` queries.
const SCHEDULE_COLUMNS: &str = "\
    id, backup_type, cron_expression, destination, retention_days, \
    enabled, last_run_at, next_run_at, created_at, updated_at";

// ---------------------------------------------------------------------------
// BackupRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `backups` table.
pub struct BackupRepo;

impl BackupRepo {
    /// List backups with optional filters for type and status.
    pub async fn list(
        pool: &PgPool,
        backup_type: Option<&str>,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Backup>, sqlx::Error> {
        let query = format!(
            "SELECT {BACKUP_COLUMNS} FROM backups \
             WHERE ($1::TEXT IS NULL OR backup_type = $1) \
               AND ($2::TEXT IS NULL OR status = $2) \
             ORDER BY created_at DESC \
             LIMIT $3 OFFSET $4"
        );
        sqlx::query_as::<_, Backup>(&query)
            .bind(backup_type)
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Find a single backup by its ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Backup>, sqlx::Error> {
        let query = format!("SELECT {BACKUP_COLUMNS} FROM backups WHERE id = $1");
        sqlx::query_as::<_, Backup>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new backup record.
    pub async fn create(pool: &PgPool, input: &CreateBackup) -> Result<Backup, sqlx::Error> {
        let triggered_by = input.triggered_by.as_deref().unwrap_or("manual");
        let query = format!(
            "INSERT INTO backups (backup_type, destination, triggered_by, status) \
             VALUES ($1, $2, $3, 'pending') \
             RETURNING {BACKUP_COLUMNS}"
        );
        sqlx::query_as::<_, Backup>(&query)
            .bind(&input.backup_type)
            .bind(&input.destination)
            .bind(triggered_by)
            .fetch_one(pool)
            .await
    }

    /// Update an existing backup record. Only non-None fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateBackup,
    ) -> Result<Option<Backup>, sqlx::Error> {
        let query = format!(
            "UPDATE backups SET \
                status                   = COALESCE($2, status), \
                file_path                = COALESCE($3, file_path), \
                size_bytes               = COALESCE($4, size_bytes), \
                started_at               = COALESCE($5, started_at), \
                completed_at             = COALESCE($6, completed_at), \
                error_message            = COALESCE($7, error_message), \
                verified                 = COALESCE($8, verified), \
                verified_at              = COALESCE($9, verified_at), \
                verification_result_json = COALESCE($10, verification_result_json), \
                retention_expires_at     = COALESCE($11, retention_expires_at) \
             WHERE id = $1 \
             RETURNING {BACKUP_COLUMNS}"
        );
        sqlx::query_as::<_, Backup>(&query)
            .bind(id)
            .bind(&input.status)
            .bind(&input.file_path)
            .bind(input.size_bytes)
            .bind(input.started_at)
            .bind(input.completed_at)
            .bind(&input.error_message)
            .bind(input.verified)
            .bind(input.verified_at)
            .bind(&input.verification_result_json)
            .bind(input.retention_expires_at)
            .fetch_optional(pool)
            .await
    }

    /// Delete a backup record by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM backups WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get the latest backup of a given type.
    pub async fn get_latest_by_type(
        pool: &PgPool,
        backup_type: &str,
    ) -> Result<Option<Backup>, sqlx::Error> {
        let query = format!(
            "SELECT {BACKUP_COLUMNS} FROM backups \
             WHERE backup_type = $1 \
             ORDER BY created_at DESC \
             LIMIT 1"
        );
        sqlx::query_as::<_, Backup>(&query)
            .bind(backup_type)
            .fetch_optional(pool)
            .await
    }

    /// Get a dashboard summary of backup state.
    pub async fn get_summary(pool: &PgPool) -> Result<BackupSummary, sqlx::Error> {
        let row = sqlx::query_as::<_, (Option<i64>, Option<i64>)>(
            "SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM backups",
        )
        .fetch_one(pool)
        .await?;

        let total_count = row.0.unwrap_or(0);
        let total_size_bytes = row.1.unwrap_or(0);

        let last_full_at: Option<Timestamp> = sqlx::query_scalar(
            "SELECT completed_at FROM backups \
             WHERE backup_type = 'full' AND status IN ('completed', 'verified') \
             ORDER BY completed_at DESC LIMIT 1",
        )
        .fetch_optional(pool)
        .await?
        .flatten();

        let last_verified_at: Option<Timestamp> = sqlx::query_scalar(
            "SELECT verified_at FROM backups \
             WHERE verified = true \
             ORDER BY verified_at DESC LIMIT 1",
        )
        .fetch_optional(pool)
        .await?
        .flatten();

        let next_scheduled_at: Option<Timestamp> = sqlx::query_scalar(
            "SELECT next_run_at FROM backup_schedules \
             WHERE enabled = true \
             ORDER BY next_run_at ASC LIMIT 1",
        )
        .fetch_optional(pool)
        .await?
        .flatten();

        Ok(BackupSummary {
            total_count,
            total_size_bytes,
            last_full_at,
            last_verified_at,
            next_scheduled_at,
        })
    }

    /// Count overdue scheduled backups (where next_run_at < now and enabled).
    pub async fn count_overdue(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let count: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM backup_schedules \
             WHERE enabled = true AND next_run_at < NOW()",
        )
        .fetch_one(pool)
        .await?;
        Ok(count.unwrap_or(0))
    }

    /// List backups whose retention has expired.
    pub async fn list_expired(
        pool: &PgPool,
        retention_cutoff: Timestamp,
    ) -> Result<Vec<Backup>, sqlx::Error> {
        let query = format!(
            "SELECT {BACKUP_COLUMNS} FROM backups \
             WHERE retention_expires_at IS NOT NULL \
               AND retention_expires_at <= $1 \
             ORDER BY retention_expires_at ASC"
        );
        sqlx::query_as::<_, Backup>(&query)
            .bind(retention_cutoff)
            .fetch_all(pool)
            .await
    }
}

// ---------------------------------------------------------------------------
// BackupScheduleRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `backup_schedules` table.
pub struct BackupScheduleRepo;

impl BackupScheduleRepo {
    /// List all backup schedules.
    pub async fn list(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BackupSchedule>, sqlx::Error> {
        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM backup_schedules \
             ORDER BY created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, BackupSchedule>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Find a single backup schedule by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<BackupSchedule>, sqlx::Error> {
        let query = format!("SELECT {SCHEDULE_COLUMNS} FROM backup_schedules WHERE id = $1");
        sqlx::query_as::<_, BackupSchedule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new backup schedule.
    pub async fn create(
        pool: &PgPool,
        input: &CreateBackupSchedule,
        next_run_at: Option<Timestamp>,
    ) -> Result<BackupSchedule, sqlx::Error> {
        let retention_days = input.retention_days.unwrap_or(30);
        let enabled = input.enabled.unwrap_or(true);
        let query = format!(
            "INSERT INTO backup_schedules \
                 (backup_type, cron_expression, destination, retention_days, enabled, next_run_at) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, BackupSchedule>(&query)
            .bind(&input.backup_type)
            .bind(&input.cron_expression)
            .bind(&input.destination)
            .bind(retention_days)
            .bind(enabled)
            .bind(next_run_at)
            .fetch_one(pool)
            .await
    }

    /// Update an existing backup schedule. Only non-None fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateBackupSchedule,
        next_run_at: Option<Timestamp>,
    ) -> Result<Option<BackupSchedule>, sqlx::Error> {
        let query = format!(
            "UPDATE backup_schedules SET \
                backup_type     = COALESCE($2, backup_type), \
                cron_expression = COALESCE($3, cron_expression), \
                destination     = COALESCE($4, destination), \
                retention_days  = COALESCE($5, retention_days), \
                enabled         = COALESCE($6, enabled), \
                next_run_at     = COALESCE($7, next_run_at) \
             WHERE id = $1 \
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, BackupSchedule>(&query)
            .bind(id)
            .bind(&input.backup_type)
            .bind(&input.cron_expression)
            .bind(&input.destination)
            .bind(input.retention_days)
            .bind(input.enabled)
            .bind(next_run_at)
            .fetch_optional(pool)
            .await
    }

    /// Delete a backup schedule by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM backup_schedules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List schedules that are due (enabled and next_run_at <= now).
    pub async fn list_due(
        pool: &PgPool,
        now: Timestamp,
    ) -> Result<Vec<BackupSchedule>, sqlx::Error> {
        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM backup_schedules \
             WHERE enabled = true AND next_run_at <= $1 \
             ORDER BY next_run_at ASC"
        );
        sqlx::query_as::<_, BackupSchedule>(&query)
            .bind(now)
            .fetch_all(pool)
            .await
    }

    /// Update the last_run_at and next_run_at for a schedule after execution.
    pub async fn update_last_run(
        pool: &PgPool,
        id: DbId,
        last_run_at: Timestamp,
        next_run_at: Timestamp,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE backup_schedules \
             SET last_run_at = $2, next_run_at = $3 \
             WHERE id = $1",
        )
        .bind(id)
        .bind(last_run_at)
        .bind(next_run_at)
        .execute(pool)
        .await?;
        Ok(())
    }
}
