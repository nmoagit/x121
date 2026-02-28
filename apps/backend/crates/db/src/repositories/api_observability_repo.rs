//! Repository for API observability tables (PRD-106).
//!
//! Provides data access for `api_metrics`, `api_alert_configs`, and
//! `rate_limit_utilization`.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::api_observability::{
    ApiAlertConfig, ApiMetric, EndpointBreakdown, HeatmapRow, RateLimitUtilization, TopConsumer,
    UpsertApiMetric,
};

// ---------------------------------------------------------------------------
// Input structs to avoid too_many_arguments
// ---------------------------------------------------------------------------

/// Input for creating an alert configuration.
pub struct CreateAlertInput<'a> {
    pub name: &'a str,
    pub alert_type: &'a str,
    pub endpoint_filter: Option<&'a str>,
    pub api_key_filter: Option<DbId>,
    pub threshold_value: f32,
    pub comparison: &'a str,
    pub window_minutes: i32,
    pub cooldown_minutes: i32,
    pub enabled: bool,
    pub created_by: Option<DbId>,
}

/// Input for updating an alert configuration.
pub struct UpdateAlertInput<'a> {
    pub name: Option<&'a str>,
    pub alert_type: Option<&'a str>,
    pub endpoint_filter: Option<&'a str>,
    pub api_key_filter: Option<DbId>,
    pub threshold_value: Option<f32>,
    pub comparison: Option<&'a str>,
    pub window_minutes: Option<i32>,
    pub cooldown_minutes: Option<i32>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

/// Column list for `api_metrics` queries.
const AM_COLUMNS: &str = "\
    id, period_start, period_granularity, endpoint, http_method, \
    api_key_id, request_count, error_count_4xx, error_count_5xx, \
    response_time_p50_ms, response_time_p95_ms, response_time_p99_ms, \
    response_time_avg_ms, total_request_bytes, total_response_bytes, \
    created_at";

/// Column list for `api_alert_configs` queries.
const AAC_COLUMNS: &str = "\
    id, name, alert_type, endpoint_filter, api_key_filter, \
    threshold_value, comparison, window_minutes, cooldown_minutes, \
    enabled, last_fired_at, created_by, created_at, updated_at";

/// Column list for `rate_limit_utilization` queries.
const RLU_COLUMNS: &str = "\
    id, api_key_id, period_start, period_granularity, \
    requests_made, rate_limit, utilization_pct, created_at";

// ---------------------------------------------------------------------------
// ApiMetricsRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `api_metrics` table.
pub struct ApiMetricsRepo;

impl ApiMetricsRepo {
    /// Upsert a metrics bucket. On conflict, accumulate counts and update
    /// percentiles and averages.
    pub async fn upsert_bucket(
        pool: &PgPool,
        input: &UpsertApiMetric,
    ) -> Result<ApiMetric, sqlx::Error> {
        let query = format!(
            "INSERT INTO api_metrics \
                 (period_start, period_granularity, endpoint, http_method, \
                  api_key_id, request_count, error_count_4xx, error_count_5xx, \
                  response_time_p50_ms, response_time_p95_ms, response_time_p99_ms, \
                  response_time_avg_ms, total_request_bytes, total_response_bytes) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) \
             ON CONFLICT (period_start, period_granularity, endpoint, http_method, COALESCE(api_key_id, -1)) \
             DO UPDATE SET \
                 request_count = api_metrics.request_count + EXCLUDED.request_count, \
                 error_count_4xx = api_metrics.error_count_4xx + EXCLUDED.error_count_4xx, \
                 error_count_5xx = api_metrics.error_count_5xx + EXCLUDED.error_count_5xx, \
                 response_time_p50_ms = EXCLUDED.response_time_p50_ms, \
                 response_time_p95_ms = EXCLUDED.response_time_p95_ms, \
                 response_time_p99_ms = EXCLUDED.response_time_p99_ms, \
                 response_time_avg_ms = EXCLUDED.response_time_avg_ms, \
                 total_request_bytes = api_metrics.total_request_bytes + EXCLUDED.total_request_bytes, \
                 total_response_bytes = api_metrics.total_response_bytes + EXCLUDED.total_response_bytes \
             RETURNING {AM_COLUMNS}"
        );
        sqlx::query_as::<_, ApiMetric>(&query)
            .bind(input.period_start)
            .bind(&input.period_granularity)
            .bind(&input.endpoint)
            .bind(&input.http_method)
            .bind(input.api_key_id)
            .bind(input.request_count)
            .bind(input.error_count_4xx)
            .bind(input.error_count_5xx)
            .bind(input.response_time_p50_ms)
            .bind(input.response_time_p95_ms)
            .bind(input.response_time_p99_ms)
            .bind(input.response_time_avg_ms)
            .bind(input.total_request_bytes)
            .bind(input.total_response_bytes)
            .fetch_one(pool)
            .await
    }

    /// Query metrics with optional filters.
    pub async fn query_metrics(
        pool: &PgPool,
        endpoint_filter: Option<&str>,
        api_key_filter: Option<DbId>,
        granularity: Option<&str>,
        start: Timestamp,
        end: Timestamp,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApiMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {AM_COLUMNS} FROM api_metrics \
             WHERE period_start >= $1 AND period_start < $2 \
               AND ($3::TEXT IS NULL OR endpoint = $3) \
               AND ($4::BIGINT IS NULL OR api_key_id = $4) \
               AND ($5::TEXT IS NULL OR period_granularity = $5) \
             ORDER BY period_start DESC \
             LIMIT $6 OFFSET $7"
        );
        sqlx::query_as::<_, ApiMetric>(&query)
            .bind(start)
            .bind(end)
            .bind(endpoint_filter)
            .bind(api_key_filter)
            .bind(granularity)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Get a high-level summary of metrics in a time range.
    ///
    /// Returns `(total_requests, total_errors, weighted_avg_response_time)`.
    pub async fn get_summary_counts(
        pool: &PgPool,
        start: Timestamp,
        end: Timestamp,
    ) -> Result<(i64, i64, f64), sqlx::Error> {
        let row = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<f64>)>(
            "SELECT \
                 COALESCE(SUM(request_count::BIGINT), 0), \
                 COALESCE(SUM(error_count_4xx::BIGINT + error_count_5xx::BIGINT), 0), \
                 CASE WHEN SUM(request_count) > 0 \
                      THEN SUM(response_time_avg_ms::DOUBLE PRECISION * request_count::DOUBLE PRECISION) \
                           / SUM(request_count::DOUBLE PRECISION) \
                      ELSE 0.0 END \
             FROM api_metrics \
             WHERE period_start >= $1 AND period_start < $2 \
               AND period_granularity = '1h'",
        )
        .bind(start)
        .bind(end)
        .fetch_one(pool)
        .await?;

        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0.0)))
    }

    /// Get per-endpoint breakdown for a time range.
    pub async fn get_endpoint_breakdown(
        pool: &PgPool,
        start: Timestamp,
        end: Timestamp,
        limit: i64,
    ) -> Result<Vec<EndpointBreakdown>, sqlx::Error> {
        sqlx::query_as::<_, EndpointBreakdown>(
            "SELECT \
                 endpoint, \
                 http_method, \
                 SUM(request_count::BIGINT) AS request_count, \
                 CASE WHEN SUM(request_count) > 0 \
                      THEN (SUM(error_count_4xx::BIGINT + error_count_5xx::BIGINT)::DOUBLE PRECISION \
                            / SUM(request_count::BIGINT)::DOUBLE PRECISION) * 100.0 \
                      ELSE 0.0 END AS error_rate, \
                 COALESCE(AVG(response_time_p50_ms::DOUBLE PRECISION), 0.0) AS p50, \
                 COALESCE(AVG(response_time_p95_ms::DOUBLE PRECISION), 0.0) AS p95, \
                 COALESCE(AVG(response_time_p99_ms::DOUBLE PRECISION), 0.0) AS p99 \
             FROM api_metrics \
             WHERE period_start >= $1 AND period_start < $2 \
               AND period_granularity = '1h' \
             GROUP BY endpoint, http_method \
             ORDER BY request_count DESC \
             LIMIT $3",
        )
        .bind(start)
        .bind(end)
        .bind(limit)
        .fetch_all(pool)
        .await
    }

    /// Get top API key consumers ranked by volume, error rate, or bandwidth.
    pub async fn get_top_consumers(
        pool: &PgPool,
        start: Timestamp,
        end: Timestamp,
        sort_by: &str,
        limit: i64,
    ) -> Result<Vec<TopConsumer>, sqlx::Error> {
        let order_clause = match sort_by {
            "error_rate" => "error_rate DESC",
            "bandwidth" => "total_bandwidth DESC",
            _ => "request_count DESC", // default: "volume"
        };

        let query = format!(
            "SELECT \
                 api_key_id, \
                 SUM(request_count::BIGINT) AS request_count, \
                 CASE WHEN SUM(request_count) > 0 \
                      THEN (SUM(error_count_4xx::BIGINT + error_count_5xx::BIGINT)::DOUBLE PRECISION \
                            / SUM(request_count::BIGINT)::DOUBLE PRECISION) * 100.0 \
                      ELSE 0.0 END AS error_rate, \
                 SUM(total_request_bytes + total_response_bytes) AS total_bandwidth \
             FROM api_metrics \
             WHERE period_start >= $1 AND period_start < $2 \
               AND period_granularity = '1h' \
             GROUP BY api_key_id \
             ORDER BY {order_clause} \
             LIMIT $3"
        );
        sqlx::query_as::<_, TopConsumer>(&query)
            .bind(start)
            .bind(end)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Get heatmap data (endpoint x time bucket) for a time range.
    pub async fn get_heatmap_data(
        pool: &PgPool,
        granularity: &str,
        start: Timestamp,
        end: Timestamp,
    ) -> Result<Vec<HeatmapRow>, sqlx::Error> {
        sqlx::query_as::<_, HeatmapRow>(
            "SELECT \
                 endpoint, \
                 period_start AS time_bucket, \
                 SUM(request_count::BIGINT) AS request_count \
             FROM api_metrics \
             WHERE period_start >= $1 AND period_start < $2 \
               AND period_granularity = $3 \
             GROUP BY endpoint, period_start \
             ORDER BY endpoint, period_start",
        )
        .bind(start)
        .bind(end)
        .bind(granularity)
        .fetch_all(pool)
        .await
    }
}

// ---------------------------------------------------------------------------
// ApiAlertConfigRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `api_alert_configs` table.
pub struct ApiAlertConfigRepo;

impl ApiAlertConfigRepo {
    /// List all alert configurations.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<ApiAlertConfig>, sqlx::Error> {
        let query = format!("SELECT {AAC_COLUMNS} FROM api_alert_configs ORDER BY created_at DESC");
        sqlx::query_as::<_, ApiAlertConfig>(&query)
            .fetch_all(pool)
            .await
    }

    /// List only enabled alert configurations.
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<ApiAlertConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {AAC_COLUMNS} FROM api_alert_configs \
             WHERE enabled = true ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ApiAlertConfig>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find an alert config by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ApiAlertConfig>, sqlx::Error> {
        let query = format!("SELECT {AAC_COLUMNS} FROM api_alert_configs WHERE id = $1");
        sqlx::query_as::<_, ApiAlertConfig>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new alert configuration.
    pub async fn create(
        pool: &PgPool,
        input: &CreateAlertInput<'_>,
    ) -> Result<ApiAlertConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO api_alert_configs \
                 (name, alert_type, endpoint_filter, api_key_filter, \
                  threshold_value, comparison, window_minutes, cooldown_minutes, \
                  enabled, created_by) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) \
             RETURNING {AAC_COLUMNS}"
        );
        sqlx::query_as::<_, ApiAlertConfig>(&query)
            .bind(input.name)
            .bind(input.alert_type)
            .bind(input.endpoint_filter)
            .bind(input.api_key_filter)
            .bind(input.threshold_value)
            .bind(input.comparison)
            .bind(input.window_minutes)
            .bind(input.cooldown_minutes)
            .bind(input.enabled)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Update an existing alert configuration.
    ///
    /// Uses COALESCE to only update provided fields.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAlertInput<'_>,
    ) -> Result<Option<ApiAlertConfig>, sqlx::Error> {
        let query = format!(
            "UPDATE api_alert_configs SET \
                 name = COALESCE($2, name), \
                 alert_type = COALESCE($3, alert_type), \
                 endpoint_filter = COALESCE($4, endpoint_filter), \
                 api_key_filter = COALESCE($5, api_key_filter), \
                 threshold_value = COALESCE($6, threshold_value), \
                 comparison = COALESCE($7, comparison), \
                 window_minutes = COALESCE($8, window_minutes), \
                 cooldown_minutes = COALESCE($9, cooldown_minutes), \
                 enabled = COALESCE($10, enabled) \
             WHERE id = $1 \
             RETURNING {AAC_COLUMNS}"
        );
        sqlx::query_as::<_, ApiAlertConfig>(&query)
            .bind(id)
            .bind(input.name)
            .bind(input.alert_type)
            .bind(input.endpoint_filter)
            .bind(input.api_key_filter)
            .bind(input.threshold_value)
            .bind(input.comparison)
            .bind(input.window_minutes)
            .bind(input.cooldown_minutes)
            .bind(input.enabled)
            .fetch_optional(pool)
            .await
    }

    /// Delete an alert configuration by ID. Returns the deleted row if found.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<Option<ApiAlertConfig>, sqlx::Error> {
        let query = format!("DELETE FROM api_alert_configs WHERE id = $1 RETURNING {AAC_COLUMNS}");
        sqlx::query_as::<_, ApiAlertConfig>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update the `last_fired_at` timestamp for an alert configuration.
    pub async fn update_last_fired(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE api_alert_configs SET last_fired_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// RateLimitUtilRepo
// ---------------------------------------------------------------------------

/// Provides data access for the `rate_limit_utilization` table.
pub struct RateLimitUtilRepo;

impl RateLimitUtilRepo {
    /// Upsert a rate limit utilization record.
    pub async fn upsert(
        pool: &PgPool,
        api_key_id: DbId,
        period_start: Timestamp,
        period_granularity: &str,
        requests_made: i32,
        rate_limit: i32,
        utilization_pct: f32,
    ) -> Result<RateLimitUtilization, sqlx::Error> {
        let query = format!(
            "INSERT INTO rate_limit_utilization \
                 (api_key_id, period_start, period_granularity, \
                  requests_made, rate_limit, utilization_pct) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (api_key_id, period_start, period_granularity) \
             DO UPDATE SET \
                 requests_made = EXCLUDED.requests_made, \
                 rate_limit = EXCLUDED.rate_limit, \
                 utilization_pct = EXCLUDED.utilization_pct \
             RETURNING {RLU_COLUMNS}"
        );
        sqlx::query_as::<_, RateLimitUtilization>(&query)
            .bind(api_key_id)
            .bind(period_start)
            .bind(period_granularity)
            .bind(requests_made)
            .bind(rate_limit)
            .bind(utilization_pct)
            .fetch_one(pool)
            .await
    }

    /// Get the most recent utilization record for a specific API key.
    pub async fn get_current_by_key(
        pool: &PgPool,
        api_key_id: DbId,
    ) -> Result<Option<RateLimitUtilization>, sqlx::Error> {
        let query = format!(
            "SELECT {RLU_COLUMNS} FROM rate_limit_utilization \
             WHERE api_key_id = $1 \
             ORDER BY period_start DESC \
             LIMIT 1"
        );
        sqlx::query_as::<_, RateLimitUtilization>(&query)
            .bind(api_key_id)
            .fetch_optional(pool)
            .await
    }

    /// Get utilization history for an API key in a time range.
    pub async fn get_history(
        pool: &PgPool,
        api_key_id: DbId,
        start: Timestamp,
        end: Timestamp,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<RateLimitUtilization>, sqlx::Error> {
        let query = format!(
            "SELECT {RLU_COLUMNS} FROM rate_limit_utilization \
             WHERE api_key_id = $1 \
               AND period_start >= $2 AND period_start < $3 \
             ORDER BY period_start DESC \
             LIMIT $4 OFFSET $5"
        );
        sqlx::query_as::<_, RateLimitUtilization>(&query)
            .bind(api_key_id)
            .bind(start)
            .bind(end)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List the most recent utilization record for each API key.
    pub async fn list_current(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<RateLimitUtilization>, sqlx::Error> {
        let query = format!(
            "SELECT DISTINCT ON (api_key_id) {RLU_COLUMNS} \
             FROM rate_limit_utilization \
             ORDER BY api_key_id, period_start DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, RateLimitUtilization>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}
