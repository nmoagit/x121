//! Repository for the `audit_logs` and `audit_retention_policies` tables (PRD-45).

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::audit::{
    AuditLog, AuditQuery, AuditRetentionPolicy, CreateAuditLog, UpdateRetentionPolicy,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

/// Column list for `audit_logs` SELECT queries.
const COLUMNS: &str = "\
    id, timestamp, user_id, session_id, action_type, \
    entity_type, entity_id, details_json, ip_address, \
    user_agent, integrity_hash, created_at";

/// Column list for INSERT (excludes auto-generated `id`, `timestamp`, `created_at`).
const INSERT_COLUMNS: &str = "\
    user_id, session_id, action_type, entity_type, entity_id, \
    details_json, ip_address, user_agent, integrity_hash";

/// Column list for `audit_retention_policies` SELECT queries.
const RETENTION_COLUMNS: &str = "\
    id, log_category, active_retention_days, archive_retention_days, \
    enabled, created_at, updated_at";

// ---------------------------------------------------------------------------
// AuditLogRepo
// ---------------------------------------------------------------------------

/// Provides query and insert operations for audit logs.
pub struct AuditLogRepo;

impl AuditLogRepo {
    /// Batch insert multiple audit log entries.
    ///
    /// Uses a single INSERT with multiple value rows for efficiency.
    pub async fn batch_insert(
        pool: &PgPool,
        entries: &[CreateAuditLog],
    ) -> Result<Vec<AuditLog>, sqlx::Error> {
        if entries.is_empty() {
            return Ok(Vec::new());
        }

        // Build a multi-row INSERT statement.
        let mut query = format!("INSERT INTO audit_logs ({INSERT_COLUMNS}) VALUES ");
        let mut param_idx = 1u32;
        let mut first = true;

        for _ in entries {
            if !first {
                query.push_str(", ");
            }
            first = false;
            query.push('(');
            for i in 0..9 {
                if i > 0 {
                    query.push_str(", ");
                }
                query.push_str(&format!("${param_idx}"));
                param_idx += 1;
            }
            query.push(')');
        }

        query.push_str(&format!(" RETURNING {COLUMNS}"));

        let mut q = sqlx::query_as::<_, AuditLog>(&query);
        for entry in entries {
            q = q
                .bind(entry.user_id)
                .bind(&entry.session_id)
                .bind(&entry.action_type)
                .bind(&entry.entity_type)
                .bind(entry.entity_id)
                .bind(&entry.details_json)
                .bind(&entry.ip_address)
                .bind(&entry.user_agent)
                .bind(&entry.integrity_hash);
        }

        q.fetch_all(pool).await
    }

    /// Query audit logs with filtering and pagination.
    pub async fn query(pool: &PgPool, params: &AuditQuery) -> Result<Vec<AuditLog>, sqlx::Error> {
        let limit = params.limit.unwrap_or(50).min(500);
        let offset = params.offset.unwrap_or(0);

        let (where_clause, bind_values, bind_idx) = build_audit_filter(params);

        let query = format!(
            "SELECT {COLUMNS} FROM audit_logs {where_clause} \
             ORDER BY timestamp DESC \
             LIMIT ${bind_idx} OFFSET ${}",
            bind_idx + 1
        );

        let q = bind_audit_values(sqlx::query_as::<_, AuditLog>(&query), &bind_values);
        q.bind(limit).bind(offset).fetch_all(pool).await
    }

    /// Count audit logs matching the given filter (for pagination metadata).
    pub async fn count(pool: &PgPool, params: &AuditQuery) -> Result<i64, sqlx::Error> {
        let (where_clause, bind_values, _) = build_audit_filter(params);

        let query = format!("SELECT COUNT(*)::BIGINT AS count FROM audit_logs {where_clause}");

        let q = bind_audit_values_scalar(sqlx::query_scalar::<_, i64>(&query), &bind_values);
        q.fetch_one(pool).await
    }

    /// Find the integrity hash of the most recent audit log entry.
    pub async fn find_last_hash(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar::<_, Option<String>>(
            "SELECT integrity_hash FROM audit_logs ORDER BY id DESC LIMIT 1",
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.flatten())
    }

    /// Export audit log entries within a time range.
    ///
    /// Returns all entries between `from` and `to` ordered by timestamp.
    pub async fn export_range(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
    ) -> Result<Vec<AuditLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM audit_logs \
             WHERE timestamp >= $1 AND timestamp <= $2 \
             ORDER BY timestamp ASC"
        );
        sqlx::query_as::<_, AuditLog>(&query)
            .bind(from)
            .bind(to)
            .fetch_all(pool)
            .await
    }

    /// Fetch a range of entries by ID for integrity verification.
    ///
    /// Returns entries ordered by id ASC for sequential hash chain checking.
    pub async fn fetch_for_integrity_check(
        pool: &PgPool,
        from_id: Option<DbId>,
        to_id: Option<DbId>,
    ) -> Result<Vec<AuditLog>, sqlx::Error> {
        let query = match (from_id, to_id) {
            (Some(_), Some(_)) => format!(
                "SELECT {COLUMNS} FROM audit_logs WHERE id >= $1 AND id <= $2 ORDER BY id ASC"
            ),
            (Some(_), None) => {
                format!("SELECT {COLUMNS} FROM audit_logs WHERE id >= $1 ORDER BY id ASC")
            }
            (None, Some(_)) => {
                format!("SELECT {COLUMNS} FROM audit_logs WHERE id <= $1 ORDER BY id ASC")
            }
            (None, None) => format!("SELECT {COLUMNS} FROM audit_logs ORDER BY id ASC"),
        };

        match (from_id, to_id) {
            (Some(f), Some(t)) => {
                sqlx::query_as::<_, AuditLog>(&query)
                    .bind(f)
                    .bind(t)
                    .fetch_all(pool)
                    .await
            }
            (Some(f), None) => {
                sqlx::query_as::<_, AuditLog>(&query)
                    .bind(f)
                    .fetch_all(pool)
                    .await
            }
            (None, Some(t)) => {
                sqlx::query_as::<_, AuditLog>(&query)
                    .bind(t)
                    .fetch_all(pool)
                    .await
            }
            (None, None) => sqlx::query_as::<_, AuditLog>(&query).fetch_all(pool).await,
        }
    }
}

// ---------------------------------------------------------------------------
// AuditRetentionPolicyRepo
// ---------------------------------------------------------------------------

/// Provides CRUD operations for audit retention policies.
pub struct AuditRetentionPolicyRepo;

impl AuditRetentionPolicyRepo {
    /// List all retention policies.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<AuditRetentionPolicy>, sqlx::Error> {
        let query = format!(
            "SELECT {RETENTION_COLUMNS} FROM audit_retention_policies ORDER BY log_category"
        );
        sqlx::query_as::<_, AuditRetentionPolicy>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a retention policy by category name.
    pub async fn find_by_category(
        pool: &PgPool,
        category: &str,
    ) -> Result<Option<AuditRetentionPolicy>, sqlx::Error> {
        let query = format!(
            "SELECT {RETENTION_COLUMNS} FROM audit_retention_policies WHERE log_category = $1"
        );
        sqlx::query_as::<_, AuditRetentionPolicy>(&query)
            .bind(category)
            .fetch_optional(pool)
            .await
    }

    /// Update a retention policy by category.
    pub async fn update(
        pool: &PgPool,
        category: &str,
        dto: &UpdateRetentionPolicy,
    ) -> Result<Option<AuditRetentionPolicy>, sqlx::Error> {
        let mut sets: Vec<String> = Vec::new();
        let mut bind_idx = 2u32; // $1 is category
        let mut bind_values: Vec<RetentionBindValue> = Vec::new();

        if let Some(days) = dto.active_retention_days {
            sets.push(format!("active_retention_days = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(RetentionBindValue::Int(days));
        }

        if let Some(days) = dto.archive_retention_days {
            sets.push(format!("archive_retention_days = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(RetentionBindValue::Int(days));
        }

        if let Some(enabled) = dto.enabled {
            sets.push(format!("enabled = ${bind_idx}"));
            let _ = bind_idx;
            bind_values.push(RetentionBindValue::Bool(enabled));
        }

        if sets.is_empty() {
            return Self::find_by_category(pool, category).await;
        }

        let query = format!(
            "UPDATE audit_retention_policies SET {} WHERE log_category = $1 RETURNING {RETENTION_COLUMNS}",
            sets.join(", ")
        );

        let mut q = sqlx::query_as::<_, AuditRetentionPolicy>(&query).bind(category);
        for val in &bind_values {
            match val {
                RetentionBindValue::Int(v) => q = q.bind(*v),
                RetentionBindValue::Bool(v) => q = q.bind(*v),
            }
        }

        q.fetch_optional(pool).await
    }
}

// ---------------------------------------------------------------------------
// Internal helpers for dynamic query building
// ---------------------------------------------------------------------------

/// Typed bind value for dynamically-built audit log queries.
enum BindValue {
    BigInt(i64),
    Text(String),
    Timestamp(Timestamp),
}

/// Typed bind value for dynamically-built retention policy queries.
enum RetentionBindValue {
    Int(i32),
    Bool(bool),
}

/// Build a WHERE clause and bind values from `AuditQuery` filter parameters.
///
/// Returns `(where_clause, bind_values, next_bind_index)`.
/// The `where_clause` is empty if no filters are active, or starts with `WHERE `.
fn build_audit_filter(params: &AuditQuery) -> (String, Vec<BindValue>, u32) {
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_idx = 1u32;
    let mut bind_values: Vec<BindValue> = Vec::new();

    if let Some(user_id) = params.user_id {
        conditions.push(format!("user_id = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::BigInt(user_id));
    }

    if let Some(ref action_type) = params.action_type {
        conditions.push(format!("action_type = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Text(action_type.clone()));
    }

    if let Some(ref entity_type) = params.entity_type {
        conditions.push(format!("entity_type = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Text(entity_type.clone()));
    }

    if let Some(entity_id) = params.entity_id {
        conditions.push(format!("entity_id = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::BigInt(entity_id));
    }

    if let Some(from) = params.from {
        conditions.push(format!("timestamp >= ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Timestamp(from));
    }

    if let Some(to) = params.to {
        conditions.push(format!("timestamp <= ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Timestamp(to));
    }

    if let Some(ref search_text) = params.search_text {
        conditions.push(format!("details_json::text ILIKE ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Text(format!("%{search_text}%")));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (where_clause, bind_values, bind_idx)
}

/// Bind a slice of `BindValue` to a sqlx `QueryAs`.
fn bind_audit_values<'q, O>(
    mut q: sqlx::query::QueryAs<'q, sqlx::Postgres, O, sqlx::postgres::PgArguments>,
    bind_values: &'q [BindValue],
) -> sqlx::query::QueryAs<'q, sqlx::Postgres, O, sqlx::postgres::PgArguments> {
    for val in bind_values {
        match val {
            BindValue::BigInt(v) => q = q.bind(*v),
            BindValue::Text(v) => q = q.bind(v.as_str()),
            BindValue::Timestamp(v) => q = q.bind(*v),
        }
    }
    q
}

/// Bind a slice of `BindValue` to a sqlx `QueryScalar`.
fn bind_audit_values_scalar<'q>(
    mut q: sqlx::query::QueryScalar<'q, sqlx::Postgres, i64, sqlx::postgres::PgArguments>,
    bind_values: &'q [BindValue],
) -> sqlx::query::QueryScalar<'q, sqlx::Postgres, i64, sqlx::postgres::PgArguments> {
    for val in bind_values {
        match val {
            BindValue::BigInt(v) => q = q.bind(*v),
            BindValue::Text(v) => q = q.bind(v.as_str()),
            BindValue::Timestamp(v) => q = q.bind(*v),
        }
    }
    q
}
