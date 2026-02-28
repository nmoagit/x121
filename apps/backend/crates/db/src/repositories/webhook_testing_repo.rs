//! Repositories for the webhook testing console tables (PRD-99).
//!
//! Provides `DeliveryLogRepo`, `MockEndpointRepo`, and `MockCaptureRepo`.

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;

use crate::models::webhook_testing::{
    CreateDeliveryLog, CreateMockCapture, CreateMockEndpoint, MockEndpoint, MockEndpointCapture,
    WebhookDeliveryLog,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const DELIVERY_COLUMNS: &str = "\
    id, endpoint_id, endpoint_type, event_type, request_method, request_url, \
    request_headers_json, request_body_json, response_status, response_headers_json, \
    response_body, duration_ms, success, error_message, is_test, is_replay, \
    replay_of_id, retry_count, created_at";

const MOCK_ENDPOINT_COLUMNS: &str = "\
    id, name, token, webhook_endpoint_id, capture_enabled, retention_hours, \
    created_by, created_at, updated_at";

const CAPTURE_COLUMNS: &str = "\
    id, mock_endpoint_id, request_method, request_headers_json, \
    request_body_json, source_ip, received_at";

// ===========================================================================
// DeliveryLogRepo
// ===========================================================================

/// Repository for the `webhook_delivery_log` table.
pub struct DeliveryLogRepo;

impl DeliveryLogRepo {
    /// Insert a new delivery log record.
    pub async fn insert(
        pool: &PgPool,
        input: &CreateDeliveryLog,
    ) -> Result<WebhookDeliveryLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO webhook_delivery_log
                (endpoint_id, endpoint_type, event_type, request_method, request_url,
                 request_headers_json, request_body_json, response_status, response_headers_json,
                 response_body, duration_ms, success, error_message, is_test, is_replay,
                 replay_of_id, retry_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING {DELIVERY_COLUMNS}"
        );
        sqlx::query_as::<_, WebhookDeliveryLog>(&query)
            .bind(input.endpoint_id)
            .bind(&input.endpoint_type)
            .bind(&input.event_type)
            .bind(&input.request_method)
            .bind(&input.request_url)
            .bind(&input.request_headers_json)
            .bind(&input.request_body_json)
            .bind(input.response_status)
            .bind(&input.response_headers_json)
            .bind(&input.response_body)
            .bind(input.duration_ms)
            .bind(input.success)
            .bind(&input.error_message)
            .bind(input.is_test)
            .bind(input.is_replay)
            .bind(input.replay_of_id)
            .bind(input.retry_count)
            .fetch_one(pool)
            .await
    }

    /// Find a delivery log by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<WebhookDeliveryLog>, sqlx::Error> {
        let query = format!("SELECT {DELIVERY_COLUMNS} FROM webhook_delivery_log WHERE id = $1");
        sqlx::query_as::<_, WebhookDeliveryLog>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List delivery logs with optional filters.
    ///
    /// All filter parameters are optional; when `None` the condition is skipped.
    #[allow(clippy::too_many_arguments)]
    pub async fn list_filtered(
        pool: &PgPool,
        endpoint_id: Option<DbId>,
        endpoint_type: Option<&str>,
        event_type: Option<&str>,
        success: Option<bool>,
        is_test: Option<bool>,
        is_replay: Option<bool>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<WebhookDeliveryLog>, sqlx::Error> {
        let mut conditions: Vec<String> = Vec::new();
        let mut param_idx: usize = 0;

        if endpoint_id.is_some() {
            param_idx += 1;
            conditions.push(format!("endpoint_id = ${param_idx}"));
        }
        if endpoint_type.is_some() {
            param_idx += 1;
            conditions.push(format!("endpoint_type = ${param_idx}"));
        }
        if event_type.is_some() {
            param_idx += 1;
            conditions.push(format!("event_type = ${param_idx}"));
        }
        if success.is_some() {
            param_idx += 1;
            conditions.push(format!("success = ${param_idx}"));
        }
        if is_test.is_some() {
            param_idx += 1;
            conditions.push(format!("is_test = ${param_idx}"));
        }
        if is_replay.is_some() {
            param_idx += 1;
            conditions.push(format!("is_replay = ${param_idx}"));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let limit_val = clamp_limit(limit, 50, 200);
        let offset_val = clamp_offset(offset);
        param_idx += 1;
        let limit_idx = param_idx;
        param_idx += 1;
        let offset_idx = param_idx;

        let query = format!(
            "SELECT {DELIVERY_COLUMNS} FROM webhook_delivery_log {where_clause} \
             ORDER BY created_at DESC \
             LIMIT ${limit_idx} OFFSET ${offset_idx}"
        );

        let mut q = sqlx::query_as::<_, WebhookDeliveryLog>(&query);

        if let Some(eid) = endpoint_id {
            q = q.bind(eid);
        }
        if let Some(et) = endpoint_type {
            q = q.bind(et);
        }
        if let Some(ev) = event_type {
            q = q.bind(ev);
        }
        if let Some(s) = success {
            q = q.bind(s);
        }
        if let Some(t) = is_test {
            q = q.bind(t);
        }
        if let Some(r) = is_replay {
            q = q.bind(r);
        }

        q = q.bind(limit_val).bind(offset_val);
        q.fetch_all(pool).await
    }

    /// Count delivery logs matching the given filters.
    #[allow(clippy::too_many_arguments)]
    pub async fn count_filtered(
        pool: &PgPool,
        endpoint_id: Option<DbId>,
        endpoint_type: Option<&str>,
        event_type: Option<&str>,
        success: Option<bool>,
        is_test: Option<bool>,
        is_replay: Option<bool>,
    ) -> Result<i64, sqlx::Error> {
        let mut conditions: Vec<String> = Vec::new();
        let mut param_idx: usize = 0;

        if endpoint_id.is_some() {
            param_idx += 1;
            conditions.push(format!("endpoint_id = ${param_idx}"));
        }
        if endpoint_type.is_some() {
            param_idx += 1;
            conditions.push(format!("endpoint_type = ${param_idx}"));
        }
        if event_type.is_some() {
            param_idx += 1;
            conditions.push(format!("event_type = ${param_idx}"));
        }
        if success.is_some() {
            param_idx += 1;
            conditions.push(format!("success = ${param_idx}"));
        }
        if is_test.is_some() {
            param_idx += 1;
            conditions.push(format!("is_test = ${param_idx}"));
        }
        if is_replay.is_some() {
            param_idx += 1;
            conditions.push(format!("is_replay = ${param_idx}"));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let query = format!("SELECT COUNT(*) as count FROM webhook_delivery_log {where_clause}");

        let mut q = sqlx::query_scalar::<_, i64>(&query);

        if let Some(eid) = endpoint_id {
            q = q.bind(eid);
        }
        if let Some(et) = endpoint_type {
            q = q.bind(et);
        }
        if let Some(ev) = event_type {
            q = q.bind(ev);
        }
        if let Some(s) = success {
            q = q.bind(s);
        }
        if let Some(t) = is_test {
            q = q.bind(t);
        }
        if let Some(r) = is_replay {
            q = q.bind(r);
        }

        q.fetch_one(pool).await
    }

    /// Aggregate health statistics for an endpoint over the last N deliveries.
    ///
    /// Returns `(total, successful, total_duration_ms, recent_failures)`.
    pub async fn health_stats(
        pool: &PgPool,
        endpoint_id: DbId,
        endpoint_type: &str,
        last_n: i64,
    ) -> Result<(i64, i64, i64, i32), sqlx::Error> {
        let row = sqlx::query_as::<_, (i64, i64, i64)>(
            "SELECT \
                 COUNT(*)::bigint, \
                 COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END), 0)::bigint, \
                 COALESCE(SUM(duration_ms), 0)::bigint \
             FROM ( \
                 SELECT success, duration_ms \
                 FROM webhook_delivery_log \
                 WHERE endpoint_id = $1 AND endpoint_type = $2 \
                 ORDER BY created_at DESC LIMIT $3 \
             ) sub",
        )
        .bind(endpoint_id)
        .bind(endpoint_type)
        .bind(last_n)
        .fetch_one(pool)
        .await?;

        // Count recent consecutive failures from the most recent delivery backward.
        let recent_failures = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::bigint FROM ( \
                 SELECT success FROM webhook_delivery_log \
                 WHERE endpoint_id = $1 AND endpoint_type = $2 \
                 ORDER BY created_at DESC LIMIT $3 \
             ) sub \
             WHERE NOT success",
        )
        .bind(endpoint_id)
        .bind(endpoint_type)
        .bind(last_n)
        .fetch_one(pool)
        .await?;

        Ok((row.0, row.1, row.2, recent_failures as i32))
    }

    /// List failed deliveries for an endpoint.
    pub async fn list_failed_by_endpoint(
        pool: &PgPool,
        endpoint_id: DbId,
        endpoint_type: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WebhookDeliveryLog>, sqlx::Error> {
        let limit_val = clamp_limit(Some(limit), 50, 200);
        let offset_val = clamp_offset(Some(offset));
        let query = format!(
            "SELECT {DELIVERY_COLUMNS} FROM webhook_delivery_log \
             WHERE endpoint_id = $1 AND endpoint_type = $2 AND NOT success \
             ORDER BY created_at DESC LIMIT $3 OFFSET $4"
        );
        sqlx::query_as::<_, WebhookDeliveryLog>(&query)
            .bind(endpoint_id)
            .bind(endpoint_type)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }
}

// ===========================================================================
// MockEndpointRepo
// ===========================================================================

/// Repository for the `mock_endpoints` table.
pub struct MockEndpointRepo;

impl MockEndpointRepo {
    /// Create a new mock endpoint.
    pub async fn create(
        pool: &PgPool,
        input: &CreateMockEndpoint,
    ) -> Result<MockEndpoint, sqlx::Error> {
        let query = format!(
            "INSERT INTO mock_endpoints
                (name, token, webhook_endpoint_id, capture_enabled, retention_hours, created_by)
             VALUES ($1, $2, $3, COALESCE($4, true), COALESCE($5, 24), $6)
             RETURNING {MOCK_ENDPOINT_COLUMNS}"
        );
        sqlx::query_as::<_, MockEndpoint>(&query)
            .bind(&input.name)
            .bind(&input.token)
            .bind(input.webhook_endpoint_id)
            .bind(input.capture_enabled)
            .bind(input.retention_hours)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a mock endpoint by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<MockEndpoint>, sqlx::Error> {
        let query = format!("SELECT {MOCK_ENDPOINT_COLUMNS} FROM mock_endpoints WHERE id = $1");
        sqlx::query_as::<_, MockEndpoint>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a mock endpoint by its unique token.
    pub async fn find_by_token(
        pool: &PgPool,
        token: &str,
    ) -> Result<Option<MockEndpoint>, sqlx::Error> {
        let query = format!("SELECT {MOCK_ENDPOINT_COLUMNS} FROM mock_endpoints WHERE token = $1");
        sqlx::query_as::<_, MockEndpoint>(&query)
            .bind(token)
            .fetch_optional(pool)
            .await
    }

    /// List all mock endpoints with pagination.
    pub async fn list_all(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<MockEndpoint>, sqlx::Error> {
        let limit_val = clamp_limit(limit, 50, 200);
        let offset_val = clamp_offset(offset);
        let query = format!(
            "SELECT {MOCK_ENDPOINT_COLUMNS} FROM mock_endpoints \
             ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, MockEndpoint>(&query)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }

    /// Count all mock endpoints.
    pub async fn count_all(pool: &PgPool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*)::bigint FROM mock_endpoints")
            .fetch_one(pool)
            .await
    }

    /// Delete a mock endpoint and its captures (cascade).
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM mock_endpoints WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

// ===========================================================================
// MockCaptureRepo
// ===========================================================================

/// Repository for the `mock_endpoint_captures` table.
pub struct MockCaptureRepo;

impl MockCaptureRepo {
    /// Insert a captured payload.
    pub async fn insert(
        pool: &PgPool,
        input: &CreateMockCapture,
    ) -> Result<MockEndpointCapture, sqlx::Error> {
        let query = format!(
            "INSERT INTO mock_endpoint_captures
                (mock_endpoint_id, request_method, request_headers_json, request_body_json, source_ip)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {CAPTURE_COLUMNS}"
        );
        sqlx::query_as::<_, MockEndpointCapture>(&query)
            .bind(input.mock_endpoint_id)
            .bind(&input.request_method)
            .bind(&input.request_headers_json)
            .bind(&input.request_body_json)
            .bind(&input.source_ip)
            .fetch_one(pool)
            .await
    }

    /// List captures for a mock endpoint with pagination.
    pub async fn list_by_endpoint(
        pool: &PgPool,
        mock_endpoint_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<MockEndpointCapture>, sqlx::Error> {
        let limit_val = clamp_limit(limit, 50, 200);
        let offset_val = clamp_offset(offset);
        let query = format!(
            "SELECT {CAPTURE_COLUMNS} FROM mock_endpoint_captures \
             WHERE mock_endpoint_id = $1 \
             ORDER BY received_at DESC LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, MockEndpointCapture>(&query)
            .bind(mock_endpoint_id)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }

    /// Count captures for a mock endpoint.
    pub async fn count_by_endpoint(
        pool: &PgPool,
        mock_endpoint_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::bigint FROM mock_endpoint_captures WHERE mock_endpoint_id = $1",
        )
        .bind(mock_endpoint_id)
        .fetch_one(pool)
        .await
    }

    /// Delete captures older than `retention_hours` for a given mock endpoint.
    pub async fn cleanup_expired(
        pool: &PgPool,
        mock_endpoint_id: DbId,
        retention_hours: i32,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM mock_endpoint_captures \
             WHERE mock_endpoint_id = $1 \
               AND received_at < NOW() - ($2 || ' hours')::INTERVAL",
        )
        .bind(mock_endpoint_id)
        .bind(retention_hours.to_string())
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
