//! Repository for the `activity_logs` table and lookup tables (PRD-118).

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::Timestamp;

use crate::models::activity_log::{ActivityLog, ActivityLogQuery, CreateActivityLog};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

/// Column list for `activity_logs` SELECT queries.
const COLUMNS: &str = "\
    id, timestamp, level_id, source_id, message, fields, \
    category, entity_type, entity_id, user_id, job_id, \
    project_id, trace_id, created_at";

/// Column list for INSERT (excludes auto-generated `id`, `timestamp`, `created_at`).
const INSERT_COLUMNS: &str = "\
    level_id, source_id, message, fields, category, \
    entity_type, entity_id, user_id, job_id, project_id, trace_id";

/// Number of columns in INSERT_COLUMNS.
const INSERT_COL_COUNT: u32 = 11;

// ---------------------------------------------------------------------------
// ActivityLogRepo
// ---------------------------------------------------------------------------

/// Provides batch insert, query, and cleanup operations for activity logs.
pub struct ActivityLogRepo;

impl ActivityLogRepo {
    /// Batch insert multiple activity log entries.
    ///
    /// Uses a single INSERT with multiple value rows for throughput.
    /// Returns the number of rows affected.
    pub async fn batch_insert(
        pool: &PgPool,
        entries: &[CreateActivityLog],
    ) -> Result<u64, sqlx::Error> {
        if entries.is_empty() {
            return Ok(0);
        }

        let mut query = format!("INSERT INTO activity_logs ({INSERT_COLUMNS}) VALUES ");
        let mut param_idx = 1u32;
        let mut first = true;

        for _ in entries {
            if !first {
                query.push_str(", ");
            }
            first = false;
            query.push('(');
            for i in 0..INSERT_COL_COUNT {
                if i > 0 {
                    query.push_str(", ");
                }
                query.push_str(&format!("${param_idx}"));
                param_idx += 1;
            }
            query.push(')');
        }

        let mut q = sqlx::query(&query);
        for entry in entries {
            q = q
                .bind(entry.level_id)
                .bind(entry.source_id)
                .bind(&entry.message)
                .bind(&entry.fields)
                .bind(&entry.category)
                .bind(&entry.entity_type)
                .bind(entry.entity_id)
                .bind(entry.user_id)
                .bind(entry.job_id)
                .bind(entry.project_id)
                .bind(&entry.trace_id);
        }

        let result = q.execute(pool).await?;
        Ok(result.rows_affected())
    }

    /// Query activity logs with filtering and pagination.
    pub async fn query(
        pool: &PgPool,
        params: &ActivityLogQuery,
    ) -> Result<Vec<ActivityLog>, sqlx::Error> {
        let limit = clamp_limit(params.limit, 25, 100);
        let offset = clamp_offset(params.offset);

        let (where_clause, bind_values, bind_idx) = build_activity_filter(params, pool).await?;

        let query = format!(
            "SELECT {COLUMNS} FROM activity_logs {where_clause} \
             ORDER BY timestamp DESC \
             LIMIT ${bind_idx} OFFSET ${}",
            bind_idx + 1
        );

        let q = bind_activity_values(sqlx::query_as::<_, ActivityLog>(&query), &bind_values);
        q.bind(limit).bind(offset).fetch_all(pool).await
    }

    /// Count activity logs matching the given filter.
    pub async fn count(pool: &PgPool, params: &ActivityLogQuery) -> Result<i64, sqlx::Error> {
        let (where_clause, bind_values, _) = build_activity_filter(params, pool).await?;

        let query = format!("SELECT COUNT(*)::BIGINT FROM activity_logs {where_clause}");

        let q = bind_activity_values_scalar(sqlx::query_scalar::<_, i64>(&query), &bind_values);
        q.fetch_one(pool).await
    }

    /// Export activity logs within a time range with optional filters.
    pub async fn export_range(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
        params: &ActivityLogQuery,
    ) -> Result<Vec<ActivityLog>, sqlx::Error> {
        let (extra_where, bind_values, _) = build_activity_filter(params, pool).await?;

        // Merge the time range with any extra filter conditions.
        let where_clause = if extra_where.is_empty() {
            format!(
                "WHERE timestamp >= ${} AND timestamp <= ${}",
                bind_values.len() as u32 + 1,
                bind_values.len() as u32 + 2
            )
        } else {
            format!(
                "{extra_where} AND timestamp >= ${} AND timestamp <= ${}",
                bind_values.len() as u32 + 1,
                bind_values.len() as u32 + 2
            )
        };

        let query =
            format!("SELECT {COLUMNS} FROM activity_logs {where_clause} ORDER BY timestamp ASC");

        let q = bind_activity_values(sqlx::query_as::<_, ActivityLog>(&query), &bind_values);
        q.bind(from).bind(to).fetch_all(pool).await
    }

    /// Delete entries older than a given timestamp for a specific level.
    pub async fn delete_older_than(
        pool: &PgPool,
        level_id: i16,
        cutoff: Timestamp,
    ) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM activity_logs WHERE level_id = $1 AND timestamp < $2")
                .bind(level_id)
                .bind(cutoff)
                .execute(pool)
                .await?;

        Ok(result.rows_affected())
    }

    /// Resolve a level name (e.g. "info") to its `activity_log_levels.id`.
    pub async fn resolve_level_id(pool: &PgPool, name: &str) -> Result<Option<i16>, sqlx::Error> {
        sqlx::query_scalar::<_, i16>("SELECT id FROM activity_log_levels WHERE name = $1")
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Resolve a source name (e.g. "api") to its `activity_log_sources.id`.
    pub async fn resolve_source_id(pool: &PgPool, name: &str) -> Result<Option<i16>, sqlx::Error> {
        sqlx::query_scalar::<_, i16>("SELECT id FROM activity_log_sources WHERE name = $1")
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Load all level rows for caching.
    pub async fn list_levels(
        pool: &PgPool,
    ) -> Result<Vec<crate::models::activity_log::ActivityLogLevelRow>, sqlx::Error> {
        sqlx::query_as::<_, crate::models::activity_log::ActivityLogLevelRow>(
            "SELECT id, name, label FROM activity_log_levels ORDER BY id",
        )
        .fetch_all(pool)
        .await
    }

    /// Load all source rows for caching.
    pub async fn list_sources(
        pool: &PgPool,
    ) -> Result<Vec<crate::models::activity_log::ActivityLogSourceRow>, sqlx::Error> {
        sqlx::query_as::<_, crate::models::activity_log::ActivityLogSourceRow>(
            "SELECT id, name, label FROM activity_log_sources ORDER BY id",
        )
        .fetch_all(pool)
        .await
    }
}

// ---------------------------------------------------------------------------
// Internal helpers for dynamic query building
// ---------------------------------------------------------------------------

/// Typed bind value for dynamically-built activity log queries.
enum BindValue {
    BigInt(i64),
    SmallInt(i16),
    Text(String),
    Timestamp(Timestamp),
}

/// Build a WHERE clause and bind values from `ActivityLogQuery` filter parameters.
///
/// Returns `(where_clause, bind_values, next_bind_index)`.
async fn build_activity_filter(
    params: &ActivityLogQuery,
    pool: &PgPool,
) -> Result<(String, Vec<BindValue>, u32), sqlx::Error> {
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_idx = 1u32;
    let mut bind_values: Vec<BindValue> = Vec::new();

    // Level filter — resolve name to id.
    if let Some(ref level_name) = params.level {
        if let Some(level_id) = ActivityLogRepo::resolve_level_id(pool, level_name).await? {
            conditions.push(format!("level_id = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(BindValue::SmallInt(level_id));
        }
    }

    // Source filter — resolve name to id.
    if let Some(ref source_name) = params.source {
        if let Some(source_id) = ActivityLogRepo::resolve_source_id(pool, source_name).await? {
            conditions.push(format!("source_id = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(BindValue::SmallInt(source_id));
        }
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

    if let Some(job_id) = params.job_id {
        conditions.push(format!("job_id = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::BigInt(job_id));
    }

    if let Some(user_id) = params.user_id {
        conditions.push(format!("user_id = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::BigInt(user_id));
    }

    if let Some(project_id) = params.project_id {
        conditions.push(format!("project_id = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::BigInt(project_id));
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

    if let Some(ref search_text) = params.search {
        conditions.push(format!("message ILIKE ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Text(format!("%{search_text}%")));
    }

    if let Some(ref mode) = params.mode {
        conditions.push(format!("category = ${bind_idx}"));
        bind_idx += 1;
        bind_values.push(BindValue::Text(mode.clone()));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    Ok((where_clause, bind_values, bind_idx))
}

/// Bind a slice of `BindValue` to a sqlx `QueryAs`.
fn bind_activity_values<'q, O>(
    mut q: sqlx::query::QueryAs<'q, sqlx::Postgres, O, sqlx::postgres::PgArguments>,
    bind_values: &'q [BindValue],
) -> sqlx::query::QueryAs<'q, sqlx::Postgres, O, sqlx::postgres::PgArguments> {
    for val in bind_values {
        match val {
            BindValue::BigInt(v) => q = q.bind(*v),
            BindValue::SmallInt(v) => q = q.bind(*v),
            BindValue::Text(v) => q = q.bind(v.as_str()),
            BindValue::Timestamp(v) => q = q.bind(*v),
        }
    }
    q
}

/// Bind a slice of `BindValue` to a sqlx `QueryScalar`.
fn bind_activity_values_scalar<'q>(
    mut q: sqlx::query::QueryScalar<'q, sqlx::Postgres, i64, sqlx::postgres::PgArguments>,
    bind_values: &'q [BindValue],
) -> sqlx::query::QueryScalar<'q, sqlx::Postgres, i64, sqlx::postgres::PgArguments> {
    for val in bind_values {
        match val {
            BindValue::BigInt(v) => q = q.bind(*v),
            BindValue::SmallInt(v) => q = q.bind(*v),
            BindValue::Text(v) => q = q.bind(v.as_str()),
            BindValue::Timestamp(v) => q = q.bind(*v),
        }
    }
    q
}
