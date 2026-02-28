//! Repository for system health tables (PRD-80).
//!
//! Provides data access for `health_checks`, `uptime_records`, and
//! `health_alert_configs`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::system_health::{HealthAlertConfig, HealthCheck, UptimeRecord};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

/// Column list for `health_checks` queries.
const HC_COLUMNS: &str = "\
    id, service_name, status, latency_ms, error_message, \
    details_json, checked_at";

/// Column list for `uptime_records` queries.
const UR_COLUMNS: &str = "\
    id, service_name, status, started_at, ended_at, \
    duration_seconds, created_at, updated_at";

/// Column list for `health_alert_configs` queries.
const HAC_COLUMNS: &str = "\
    id, service_name, escalation_delay_seconds, webhook_url, \
    notification_channels_json, enabled, created_at, updated_at";

// ---------------------------------------------------------------------------
// HealthCheckRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `health_checks` time-series table.
pub struct HealthCheckRepo;

impl HealthCheckRepo {
    /// Record a new health check result.
    pub async fn record(
        pool: &PgPool,
        service_name: &str,
        status: &str,
        latency_ms: Option<i32>,
        error_message: Option<&str>,
        details: Option<serde_json::Value>,
    ) -> Result<HealthCheck, sqlx::Error> {
        let query = format!(
            "INSERT INTO health_checks \
                 (service_name, status, latency_ms, error_message, details_json) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {HC_COLUMNS}"
        );
        sqlx::query_as::<_, HealthCheck>(&query)
            .bind(service_name)
            .bind(status)
            .bind(latency_ms)
            .bind(error_message)
            .bind(&details)
            .fetch_one(pool)
            .await
    }

    /// Get the latest health check for each service (one row per service).
    pub async fn get_latest_per_service(pool: &PgPool) -> Result<Vec<HealthCheck>, sqlx::Error> {
        let query = format!(
            "SELECT DISTINCT ON (service_name) {HC_COLUMNS} \
             FROM health_checks \
             ORDER BY service_name, checked_at DESC"
        );
        sqlx::query_as::<_, HealthCheck>(&query)
            .fetch_all(pool)
            .await
    }

    /// Get the latest check for a specific service.
    pub async fn get_latest_for_service(
        pool: &PgPool,
        service_name: &str,
    ) -> Result<Option<HealthCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {HC_COLUMNS} FROM health_checks \
             WHERE service_name = $1 \
             ORDER BY checked_at DESC \
             LIMIT 1"
        );
        sqlx::query_as::<_, HealthCheck>(&query)
            .bind(service_name)
            .fetch_optional(pool)
            .await
    }

    /// Get recent check history for a specific service.
    pub async fn get_service_history(
        pool: &PgPool,
        service_name: &str,
        limit: i64,
    ) -> Result<Vec<HealthCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {HC_COLUMNS} FROM health_checks \
             WHERE service_name = $1 \
             ORDER BY checked_at DESC \
             LIMIT $2"
        );
        sqlx::query_as::<_, HealthCheck>(&query)
            .bind(service_name)
            .bind(limit)
            .fetch_all(pool)
            .await
    }
}

// ---------------------------------------------------------------------------
// UptimeRecordRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `uptime_records` table.
pub struct UptimeRecordRepo;

impl UptimeRecordRepo {
    /// Close the current open uptime record for a service (if any) and open a
    /// new one with the given status.
    ///
    /// Idempotent: if the current open record already has the same status,
    /// no change is made.
    pub async fn upsert(
        pool: &PgPool,
        service_name: &str,
        status: &str,
    ) -> Result<(), sqlx::Error> {
        // Check the current open record.
        let current = sqlx::query_as::<_, UptimeRecord>(&format!(
            "SELECT {UR_COLUMNS} FROM uptime_records \
             WHERE service_name = $1 AND ended_at IS NULL \
             ORDER BY started_at DESC LIMIT 1"
        ))
        .bind(service_name)
        .fetch_optional(pool)
        .await?;

        if let Some(ref record) = current {
            if record.status == status {
                // Same status -- nothing to do.
                return Ok(());
            }
            // Close current record.
            sqlx::query(
                "UPDATE uptime_records \
                 SET ended_at = NOW(), \
                     duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::BIGINT \
                 WHERE id = $1",
            )
            .bind(record.id)
            .execute(pool)
            .await?;
        }

        // Open a new record.
        sqlx::query(
            "INSERT INTO uptime_records (service_name, status, started_at) \
             VALUES ($1, $2, NOW())",
        )
        .bind(service_name)
        .bind(status)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Get uptime records for a service since a given timestamp.
    pub async fn get_since(
        pool: &PgPool,
        service_name: &str,
        since: chrono::DateTime<chrono::Utc>,
    ) -> Result<Vec<UptimeRecord>, sqlx::Error> {
        let query = format!(
            "SELECT {UR_COLUMNS} FROM uptime_records \
             WHERE service_name = $1 \
               AND (ended_at IS NULL OR ended_at >= $2) \
             ORDER BY started_at ASC"
        );
        sqlx::query_as::<_, UptimeRecord>(&query)
            .bind(service_name)
            .bind(since)
            .fetch_all(pool)
            .await
    }

    /// Compute total seconds in each status for a service since a given time.
    ///
    /// Returns `(healthy_seconds, degraded_seconds, total_seconds)`.
    /// Down seconds can be derived as `total - healthy - degraded`.
    pub async fn compute_uptime_seconds(
        pool: &PgPool,
        service_name: &str,
        since: chrono::DateTime<chrono::Utc>,
    ) -> Result<(i64, i64, i64), sqlx::Error> {
        // Use a CTE to compute durations for each record overlapping the window.
        let row = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<i64>)>(
            "WITH periods AS (
                SELECT
                    status,
                    GREATEST(started_at, $2) AS effective_start,
                    COALESCE(ended_at, NOW()) AS effective_end
                FROM uptime_records
                WHERE service_name = $1
                  AND (ended_at IS NULL OR ended_at >= $2)
            )
            SELECT
                COALESCE(SUM(CASE WHEN status = 'healthy'
                    THEN EXTRACT(EPOCH FROM (effective_end - effective_start))::BIGINT
                    ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'degraded'
                    THEN EXTRACT(EPOCH FROM (effective_end - effective_start))::BIGINT
                    ELSE 0 END), 0),
                COALESCE(SUM(
                    EXTRACT(EPOCH FROM (effective_end - effective_start))::BIGINT
                ), 0)
            FROM periods",
        )
        .bind(service_name)
        .bind(since)
        .fetch_one(pool)
        .await?;

        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0)))
    }
}

// ---------------------------------------------------------------------------
// HealthAlertConfigRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `health_alert_configs` table.
pub struct HealthAlertConfigRepo;

impl HealthAlertConfigRepo {
    /// Get the alert config for a specific service.
    pub async fn get_by_service(
        pool: &PgPool,
        service_name: &str,
    ) -> Result<Option<HealthAlertConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {HAC_COLUMNS} FROM health_alert_configs \
             WHERE service_name = $1"
        );
        sqlx::query_as::<_, HealthAlertConfig>(&query)
            .bind(service_name)
            .fetch_optional(pool)
            .await
    }

    /// List all alert configs.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<HealthAlertConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {HAC_COLUMNS} FROM health_alert_configs \
             ORDER BY service_name"
        );
        sqlx::query_as::<_, HealthAlertConfig>(&query)
            .fetch_all(pool)
            .await
    }

    /// Upsert an alert config for a service.
    ///
    /// Creates a new config if none exists, otherwise updates the existing one.
    pub async fn upsert(
        pool: &PgPool,
        service_name: &str,
        escalation_delay_seconds: i32,
        webhook_url: Option<&str>,
        notification_channels_json: Option<serde_json::Value>,
        enabled: bool,
    ) -> Result<HealthAlertConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO health_alert_configs \
                 (service_name, escalation_delay_seconds, webhook_url, \
                  notification_channels_json, enabled) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (service_name) \
             DO UPDATE SET \
                 escalation_delay_seconds = EXCLUDED.escalation_delay_seconds, \
                 webhook_url = EXCLUDED.webhook_url, \
                 notification_channels_json = EXCLUDED.notification_channels_json, \
                 enabled = EXCLUDED.enabled \
             RETURNING {HAC_COLUMNS}"
        );
        sqlx::query_as::<_, HealthAlertConfig>(&query)
            .bind(service_name)
            .bind(escalation_delay_seconds)
            .bind(webhook_url)
            .bind(&notification_channels_json)
            .bind(enabled)
            .fetch_one(pool)
            .await
    }

    /// Delete the alert config for a service. Returns the deleted row if found.
    pub async fn delete_by_service(
        pool: &PgPool,
        service_name: &str,
    ) -> Result<Option<HealthAlertConfig>, sqlx::Error> {
        let query = format!(
            "DELETE FROM health_alert_configs \
             WHERE service_name = $1 \
             RETURNING {HAC_COLUMNS}"
        );
        sqlx::query_as::<_, HealthAlertConfig>(&query)
            .bind(service_name)
            .fetch_optional(pool)
            .await
    }

    /// Find an alert config by its database ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<HealthAlertConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {HAC_COLUMNS} FROM health_alert_configs \
             WHERE id = $1"
        );
        sqlx::query_as::<_, HealthAlertConfig>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}
