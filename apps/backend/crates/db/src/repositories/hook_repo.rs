//! Repository for the `hooks` table (PRD-77).

use sqlx::PgPool;
use trulience_core::search::{clamp_limit, clamp_offset};
use trulience_core::types::DbId;

use crate::models::hook::{CreateHook, Hook, HookFilter, UpdateHook};

/// Column list for hooks queries.
const COLUMNS: &str = "id, name, description, hook_type, hook_point, scope_type, scope_id, \
    failure_mode, config_json, sort_order, enabled, created_by, created_at, updated_at";

/// Provides CRUD operations for pipeline hooks.
pub struct HookRepo;

impl HookRepo {
    /// Insert a new hook, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateHook) -> Result<Hook, sqlx::Error> {
        let query = format!(
            "INSERT INTO hooks
                (name, description, hook_type, hook_point, scope_type, scope_id,
                 failure_mode, config_json, sort_order, enabled, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'warn'), $8, COALESCE($9, 0), COALESCE($10, true), $11)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Hook>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.hook_type)
            .bind(&input.hook_point)
            .bind(&input.scope_type)
            .bind(input.scope_id)
            .bind(&input.failure_mode)
            .bind(&input.config_json)
            .bind(input.sort_order)
            .bind(input.enabled)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a hook by its primary key.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Hook>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM hooks WHERE id = $1");
        sqlx::query_as::<_, Hook>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List hooks with optional filtering by scope, hook point, and enabled status.
    pub async fn list(pool: &PgPool, filter: &HookFilter) -> Result<Vec<Hook>, sqlx::Error> {
        let mut conditions: Vec<String> = Vec::new();
        let mut param_idx: usize = 0;

        if filter.scope_type.is_some() {
            param_idx += 1;
            conditions.push(format!("scope_type = ${param_idx}"));
        }
        if filter.scope_id.is_some() {
            param_idx += 1;
            conditions.push(format!("scope_id = ${param_idx}"));
        }
        if filter.hook_point.is_some() {
            param_idx += 1;
            conditions.push(format!("hook_point = ${param_idx}"));
        }
        if filter.enabled.is_some() {
            param_idx += 1;
            conditions.push(format!("enabled = ${param_idx}"));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let limit_val = clamp_limit(filter.limit, 100, 500);
        let offset_val = clamp_offset(filter.offset);
        param_idx += 1;
        let limit_idx = param_idx;
        param_idx += 1;
        let offset_idx = param_idx;

        let query = format!(
            "SELECT {COLUMNS} FROM hooks {where_clause} \
             ORDER BY sort_order ASC, created_at DESC \
             LIMIT ${limit_idx} OFFSET ${offset_idx}"
        );

        let mut q = sqlx::query_as::<_, Hook>(&query);

        if let Some(ref st) = filter.scope_type {
            q = q.bind(st);
        }
        if let Some(si) = filter.scope_id {
            q = q.bind(si);
        }
        if let Some(ref hp) = filter.hook_point {
            q = q.bind(hp);
        }
        if let Some(en) = filter.enabled {
            q = q.bind(en);
        }

        q = q.bind(limit_val).bind(offset_val);
        q.fetch_all(pool).await
    }

    /// List hooks for a specific scope and hook point (used for inheritance resolution).
    pub async fn list_by_scope(
        pool: &PgPool,
        scope_type: &str,
        scope_id: Option<DbId>,
        hook_point: &str,
    ) -> Result<Vec<Hook>, sqlx::Error> {
        let query = if scope_id.is_some() {
            format!(
                "SELECT {COLUMNS} FROM hooks \
                 WHERE scope_type = $1 AND scope_id = $2 AND hook_point = $3 \
                 ORDER BY sort_order ASC"
            )
        } else {
            format!(
                "SELECT {COLUMNS} FROM hooks \
                 WHERE scope_type = $1 AND scope_id IS NULL AND hook_point = $2 \
                 ORDER BY sort_order ASC"
            )
        };

        if let Some(sid) = scope_id {
            sqlx::query_as::<_, Hook>(&query)
                .bind(scope_type)
                .bind(sid)
                .bind(hook_point)
                .fetch_all(pool)
                .await
        } else {
            sqlx::query_as::<_, Hook>(&query)
                .bind(scope_type)
                .bind(hook_point)
                .fetch_all(pool)
                .await
        }
    }

    /// Update an existing hook. Returns the updated row, or `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateHook,
    ) -> Result<Option<Hook>, sqlx::Error> {
        let query = format!(
            "UPDATE hooks SET
                name         = COALESCE($1, name),
                description  = COALESCE($2, description),
                hook_type    = COALESCE($3, hook_type),
                failure_mode = COALESCE($4, failure_mode),
                config_json  = COALESCE($5, config_json),
                sort_order   = COALESCE($6, sort_order),
                enabled      = COALESCE($7, enabled)
             WHERE id = $8
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Hook>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.hook_type)
            .bind(&input.failure_mode)
            .bind(&input.config_json)
            .bind(input.sort_order)
            .bind(input.enabled)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a hook by its ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM hooks WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Toggle a hook's enabled status. Returns `true` if a row was updated.
    pub async fn toggle_enabled(
        pool: &PgPool,
        id: DbId,
        enabled: bool,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE hooks SET enabled = $1 WHERE id = $2")
            .bind(enabled)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
