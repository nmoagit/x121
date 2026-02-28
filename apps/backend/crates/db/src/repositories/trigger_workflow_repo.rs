//! Repository for `triggers` and `trigger_log` tables (PRD-97).

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use crate::models::trigger_workflow::{
    CreateTrigger, CreateTriggerLog, Trigger, TriggerLog, TriggerWithStats, UpdateTrigger,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const TRIGGER_COLUMNS: &str = "\
    id, project_id, name, description, event_type, entity_type, \
    scope, conditions, actions, execution_mode, max_chain_depth, \
    requires_approval, is_enabled, sort_order, created_by_id, \
    created_at, updated_at";

const TRIGGER_LOG_COLUMNS: &str = "\
    id, trigger_id, event_data, actions_taken, chain_depth, \
    result, error_message, created_at";

// ---------------------------------------------------------------------------
// TriggerRepo
// ---------------------------------------------------------------------------

/// CRUD operations for the `triggers` table.
pub struct TriggerRepo;

impl TriggerRepo {
    /// List triggers for a given project.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<Trigger>, sqlx::Error> {
        let lim = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let off = clamp_offset(offset);

        let query = format!(
            "SELECT {TRIGGER_COLUMNS} FROM triggers \
             WHERE project_id = $1 \
             ORDER BY sort_order ASC, created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, Trigger>(&query)
            .bind(project_id)
            .bind(lim)
            .bind(off)
            .fetch_all(pool)
            .await
    }

    /// Find a trigger by primary key.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Trigger>, sqlx::Error> {
        let query = format!("SELECT {TRIGGER_COLUMNS} FROM triggers WHERE id = $1");
        sqlx::query_as::<_, Trigger>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a trigger by id and return it with aggregated stats.
    pub async fn find_by_id_with_stats(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<TriggerWithStats>, sqlx::Error> {
        let query = "\
            SELECT t.id, t.project_id, t.name, t.description, t.event_type, t.entity_type, \
                   t.scope, t.conditions, t.actions, t.execution_mode, t.max_chain_depth, \
                   t.requires_approval, t.is_enabled, t.sort_order, t.created_by_id, \
                   t.created_at, t.updated_at, \
                   COALESCE(s.fire_count, 0) AS fire_count, \
                   s.last_fired_at \
            FROM triggers t \
            LEFT JOIN LATERAL ( \
                SELECT COUNT(*) AS fire_count, MAX(tl.created_at) AS last_fired_at \
                FROM trigger_log tl \
                WHERE tl.trigger_id = t.id \
            ) s ON true \
            WHERE t.id = $1";
        sqlx::query_as::<_, TriggerWithStats>(query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Insert a new trigger, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateTrigger,
        created_by_id: Option<DbId>,
    ) -> Result<Trigger, sqlx::Error> {
        let query = format!(
            "INSERT INTO triggers \
                (project_id, name, description, event_type, entity_type, \
                 scope, conditions, actions, execution_mode, max_chain_depth, \
                 requires_approval, is_enabled, sort_order, created_by_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, \
                     COALESCE($9, 'sequential'), COALESCE($10, 10), \
                     COALESCE($11, false), COALESCE($12, true), \
                     COALESCE($13, 0), $14) \
             RETURNING {TRIGGER_COLUMNS}"
        );
        sqlx::query_as::<_, Trigger>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.event_type)
            .bind(&input.entity_type)
            .bind(&input.scope)
            .bind(&input.conditions)
            .bind(&input.actions)
            .bind(&input.execution_mode)
            .bind(input.max_chain_depth)
            .bind(input.requires_approval)
            .bind(input.is_enabled)
            .bind(input.sort_order)
            .bind(created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Update an existing trigger. Returns the updated row, or `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateTrigger,
    ) -> Result<Option<Trigger>, sqlx::Error> {
        let query = format!(
            "UPDATE triggers SET \
                name              = COALESCE($1, name), \
                description       = COALESCE($2, description), \
                event_type        = COALESCE($3, event_type), \
                entity_type       = COALESCE($4, entity_type), \
                scope             = COALESCE($5, scope), \
                conditions        = COALESCE($6, conditions), \
                actions           = COALESCE($7, actions), \
                execution_mode    = COALESCE($8, execution_mode), \
                max_chain_depth   = COALESCE($9, max_chain_depth), \
                requires_approval = COALESCE($10, requires_approval), \
                is_enabled        = COALESCE($11, is_enabled), \
                sort_order        = COALESCE($12, sort_order) \
             WHERE id = $13 \
             RETURNING {TRIGGER_COLUMNS}"
        );
        sqlx::query_as::<_, Trigger>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.event_type)
            .bind(&input.entity_type)
            .bind(&input.scope)
            .bind(&input.conditions)
            .bind(&input.actions)
            .bind(&input.execution_mode)
            .bind(input.max_chain_depth)
            .bind(input.requires_approval)
            .bind(input.is_enabled)
            .bind(input.sort_order)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a trigger by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM triggers WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List enabled triggers matching a specific event type and entity type for a project.
    pub async fn list_enabled_by_event(
        pool: &PgPool,
        event_type: &str,
        entity_type: &str,
        project_id: DbId,
    ) -> Result<Vec<Trigger>, sqlx::Error> {
        let query = format!(
            "SELECT {TRIGGER_COLUMNS} FROM triggers \
             WHERE event_type = $1 \
               AND entity_type = $2 \
               AND project_id = $3 \
               AND is_enabled = true \
             ORDER BY sort_order ASC"
        );
        sqlx::query_as::<_, Trigger>(&query)
            .bind(event_type)
            .bind(entity_type)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List all triggers (admin view), optionally filtered by project_id.
    pub async fn list_all(
        pool: &PgPool,
        project_id: Option<DbId>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<Trigger>, sqlx::Error> {
        let lim = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let off = clamp_offset(offset);

        if let Some(pid) = project_id {
            let query = format!(
                "SELECT {TRIGGER_COLUMNS} FROM triggers \
                 WHERE project_id = $1 \
                 ORDER BY sort_order ASC, created_at DESC \
                 LIMIT $2 OFFSET $3"
            );
            sqlx::query_as::<_, Trigger>(&query)
                .bind(pid)
                .bind(lim)
                .bind(off)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {TRIGGER_COLUMNS} FROM triggers \
                 ORDER BY sort_order ASC, created_at DESC \
                 LIMIT $1 OFFSET $2"
            );
            sqlx::query_as::<_, Trigger>(&query)
                .bind(lim)
                .bind(off)
                .fetch_all(pool)
                .await
        }
    }

    /// Pause all triggers (emergency disable).
    pub async fn pause_all(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("UPDATE triggers SET is_enabled = false WHERE is_enabled = true")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Resume all triggers (re-enable).
    pub async fn resume_all(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("UPDATE triggers SET is_enabled = true WHERE is_enabled = false")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

// ---------------------------------------------------------------------------
// TriggerLogRepo
// ---------------------------------------------------------------------------

/// CRUD operations for the `trigger_log` table.
pub struct TriggerLogRepo;

impl TriggerLogRepo {
    /// Insert a new trigger execution log entry.
    pub async fn insert(
        pool: &PgPool,
        input: &CreateTriggerLog,
    ) -> Result<TriggerLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO trigger_log \
                (trigger_id, event_data, actions_taken, chain_depth, result, error_message) \
             VALUES ($1, COALESCE($2, '{{}}'), COALESCE($3, '[]'), COALESCE($4, 0), $5, $6) \
             RETURNING {TRIGGER_LOG_COLUMNS}"
        );
        sqlx::query_as::<_, TriggerLog>(&query)
            .bind(input.trigger_id)
            .bind(&input.event_data)
            .bind(&input.actions_taken)
            .bind(input.chain_depth)
            .bind(&input.result)
            .bind(&input.error_message)
            .fetch_one(pool)
            .await
    }

    /// List execution logs for a specific trigger.
    pub async fn list_by_trigger(
        pool: &PgPool,
        trigger_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<TriggerLog>, sqlx::Error> {
        let lim = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let off = clamp_offset(offset);

        let query = format!(
            "SELECT {TRIGGER_LOG_COLUMNS} FROM trigger_log \
             WHERE trigger_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, TriggerLog>(&query)
            .bind(trigger_id)
            .bind(lim)
            .bind(off)
            .fetch_all(pool)
            .await
    }

    /// List recent trigger execution logs across all triggers.
    pub async fn list_recent(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<TriggerLog>, sqlx::Error> {
        let lim = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let off = clamp_offset(offset);

        let query = format!(
            "SELECT {TRIGGER_LOG_COLUMNS} FROM trigger_log \
             ORDER BY created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, TriggerLog>(&query)
            .bind(lim)
            .bind(off)
            .fetch_all(pool)
            .await
    }

    /// Count execution logs for a specific trigger.
    pub async fn count_by_trigger(pool: &PgPool, trigger_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM trigger_log WHERE trigger_id = $1")
            .bind(trigger_id)
            .fetch_one(pool)
            .await?;
        Ok(row.0)
    }
}
