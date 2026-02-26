//! Repository for disk reclamation: protection rules, policies, trash queue, and runs (PRD-15).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::reclamation::{
    AssetProtectionRule, CreateProtectionRule, CreateReclamationPolicy, CreateReclamationRun,
    CreateTrashEntry, ReclamationPolicy, ReclamationRun, TrashQueueEntry, UpdateProtectionRule,
    UpdateReclamationPolicy,
};

/// Status ID constants matching `trash_queue_statuses` seed data.
const TRASH_STATUS_PENDING: DbId = 1;
const TRASH_STATUS_DELETED: DbId = 3;
const TRASH_STATUS_RESTORED: DbId = 4;

/// Column list for `asset_protection_rules` queries.
const RULE_COLUMNS: &str = "\
    id, name, description, entity_type, condition_field, \
    condition_operator, condition_value, is_active, created_at, updated_at";

/// Column list for `reclamation_policies` queries.
const POLICY_COLUMNS: &str = "\
    id, name, description, scope_id, project_id, entity_type, \
    condition_field, condition_operator, condition_value, \
    age_threshold_days, grace_period_days, is_active, priority, \
    created_at, updated_at";

/// Column list for `trash_queue` queries.
const TRASH_COLUMNS: &str = "\
    id, status_id, entity_type, entity_id, file_path, file_size_bytes, \
    policy_id, marked_at, delete_after, deleted_at, restored_at, \
    restored_by, project_id, created_at, updated_at";

/// Column list for `reclamation_runs` queries.
const RUN_COLUMNS: &str = "\
    id, run_type, policy_id, project_id, files_scanned, files_marked, \
    files_deleted, bytes_reclaimed, started_at, completed_at, \
    error_message, created_at, updated_at";

/// Provides CRUD operations for disk reclamation entities.
pub struct ReclamationRepo;

impl ReclamationRepo {
    // ── Protection Rules ────────────────────────────────────────────

    /// List all protection rules, ordered by entity type and name.
    pub async fn list_protection_rules(
        pool: &PgPool,
    ) -> Result<Vec<AssetProtectionRule>, sqlx::Error> {
        let query =
            format!("SELECT {RULE_COLUMNS} FROM asset_protection_rules ORDER BY entity_type, name");
        sqlx::query_as::<_, AssetProtectionRule>(&query)
            .fetch_all(pool)
            .await
    }

    /// Create a new protection rule.
    pub async fn create_protection_rule(
        pool: &PgPool,
        input: &CreateProtectionRule,
    ) -> Result<AssetProtectionRule, sqlx::Error> {
        let query = format!(
            "INSERT INTO asset_protection_rules \
                 (name, description, entity_type, condition_field, \
                  condition_operator, condition_value, is_active) \
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true)) \
             RETURNING {RULE_COLUMNS}"
        );
        sqlx::query_as::<_, AssetProtectionRule>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.entity_type)
            .bind(&input.condition_field)
            .bind(&input.condition_operator)
            .bind(&input.condition_value)
            .bind(input.is_active)
            .fetch_one(pool)
            .await
    }

    /// Update an existing protection rule. Returns `None` if not found.
    pub async fn update_protection_rule(
        pool: &PgPool,
        id: DbId,
        input: &UpdateProtectionRule,
    ) -> Result<Option<AssetProtectionRule>, sqlx::Error> {
        let query = format!(
            "UPDATE asset_protection_rules SET \
                 name = COALESCE($2, name), \
                 description = COALESCE($3, description), \
                 entity_type = COALESCE($4, entity_type), \
                 condition_field = COALESCE($5, condition_field), \
                 condition_operator = COALESCE($6, condition_operator), \
                 condition_value = COALESCE($7, condition_value), \
                 is_active = COALESCE($8, is_active) \
             WHERE id = $1 \
             RETURNING {RULE_COLUMNS}"
        );
        sqlx::query_as::<_, AssetProtectionRule>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.entity_type)
            .bind(&input.condition_field)
            .bind(&input.condition_operator)
            .bind(&input.condition_value)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Delete a protection rule by ID. Returns `true` if a row was removed.
    pub async fn delete_protection_rule(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM asset_protection_rules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Load active protection rules for a specific entity type.
    pub async fn get_active_rules_for_type(
        pool: &PgPool,
        entity_type: &str,
    ) -> Result<Vec<AssetProtectionRule>, sqlx::Error> {
        let query = format!(
            "SELECT {RULE_COLUMNS} FROM asset_protection_rules \
             WHERE entity_type = $1 AND is_active = true \
             ORDER BY name"
        );
        sqlx::query_as::<_, AssetProtectionRule>(&query)
            .bind(entity_type)
            .fetch_all(pool)
            .await
    }

    // ── Reclamation Policies ────────────────────────────────────────

    /// List policies, optionally filtered by project.
    pub async fn list_policies(
        pool: &PgPool,
        project_id: Option<DbId>,
    ) -> Result<Vec<ReclamationPolicy>, sqlx::Error> {
        let query = format!(
            "SELECT {POLICY_COLUMNS} FROM reclamation_policies \
             WHERE (project_id IS NULL OR project_id = $1) \
             ORDER BY priority, name"
        );
        sqlx::query_as::<_, ReclamationPolicy>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new reclamation policy.
    pub async fn create_policy(
        pool: &PgPool,
        input: &CreateReclamationPolicy,
    ) -> Result<ReclamationPolicy, sqlx::Error> {
        let query = format!(
            "INSERT INTO reclamation_policies \
                 (name, description, scope_id, project_id, entity_type, \
                  condition_field, condition_operator, condition_value, \
                  age_threshold_days, grace_period_days, is_active, priority) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, \
                     COALESCE($9, 30), COALESCE($10, 7), COALESCE($11, true), COALESCE($12, 0)) \
             RETURNING {POLICY_COLUMNS}"
        );
        sqlx::query_as::<_, ReclamationPolicy>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.scope_id)
            .bind(input.project_id)
            .bind(&input.entity_type)
            .bind(&input.condition_field)
            .bind(&input.condition_operator)
            .bind(&input.condition_value)
            .bind(input.age_threshold_days)
            .bind(input.grace_period_days)
            .bind(input.is_active)
            .bind(input.priority)
            .fetch_one(pool)
            .await
    }

    /// Update an existing reclamation policy. Returns `None` if not found.
    pub async fn update_policy(
        pool: &PgPool,
        id: DbId,
        input: &UpdateReclamationPolicy,
    ) -> Result<Option<ReclamationPolicy>, sqlx::Error> {
        let query = format!(
            "UPDATE reclamation_policies SET \
                 name = COALESCE($2, name), \
                 description = COALESCE($3, description), \
                 scope_id = COALESCE($4, scope_id), \
                 project_id = COALESCE($5, project_id), \
                 entity_type = COALESCE($6, entity_type), \
                 condition_field = COALESCE($7, condition_field), \
                 condition_operator = COALESCE($8, condition_operator), \
                 condition_value = COALESCE($9, condition_value), \
                 age_threshold_days = COALESCE($10, age_threshold_days), \
                 grace_period_days = COALESCE($11, grace_period_days), \
                 is_active = COALESCE($12, is_active), \
                 priority = COALESCE($13, priority) \
             WHERE id = $1 \
             RETURNING {POLICY_COLUMNS}"
        );
        sqlx::query_as::<_, ReclamationPolicy>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.scope_id)
            .bind(input.project_id)
            .bind(&input.entity_type)
            .bind(&input.condition_field)
            .bind(&input.condition_operator)
            .bind(&input.condition_value)
            .bind(input.age_threshold_days)
            .bind(input.grace_period_days)
            .bind(input.is_active)
            .bind(input.priority)
            .fetch_optional(pool)
            .await
    }

    /// Delete a reclamation policy by ID. Returns `true` if a row was removed.
    pub async fn delete_policy(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM reclamation_policies WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Trash Queue ─────────────────────────────────────────────────

    /// Insert a new entry into the trash queue with "pending" status.
    pub async fn mark_for_deletion(
        pool: &PgPool,
        input: &CreateTrashEntry,
    ) -> Result<TrashQueueEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO trash_queue \
                 (status_id, entity_type, entity_id, file_path, file_size_bytes, \
                  policy_id, delete_after, project_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {TRASH_COLUMNS}"
        );
        sqlx::query_as::<_, TrashQueueEntry>(&query)
            .bind(TRASH_STATUS_PENDING)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(&input.file_path)
            .bind(input.file_size_bytes)
            .bind(input.policy_id)
            .bind(input.delete_after)
            .bind(input.project_id)
            .fetch_one(pool)
            .await
    }

    /// List trash queue entries with filtering. All filter parameters are optional.
    pub async fn list_trash_queue(
        pool: &PgPool,
        status: Option<&str>,
        project_id: Option<DbId>,
        entity_type: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<TrashQueueEntry>, sqlx::Error> {
        // Use table alias for the JOIN, but select all TRASH_COLUMNS from tq.
        let prefixed_columns = TRASH_COLUMNS
            .split(", ")
            .map(|c| format!("tq.{c}"))
            .collect::<Vec<_>>()
            .join(", ");

        let query = format!(
            "SELECT {prefixed_columns} \
             FROM trash_queue tq \
             LEFT JOIN trash_queue_statuses tqs ON tqs.id = tq.status_id \
             WHERE ($1::TEXT IS NULL OR tqs.name = $1) \
               AND ($2::BIGINT IS NULL OR tq.project_id = $2) \
               AND ($3::TEXT IS NULL OR tq.entity_type = $3) \
             ORDER BY tq.delete_after ASC \
             LIMIT $4 OFFSET $5"
        );
        sqlx::query_as::<_, TrashQueueEntry>(&query)
            .bind(status)
            .bind(project_id)
            .bind(entity_type)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Restore a trash queue entry by setting status to "restored".
    pub async fn restore_from_trash(
        pool: &PgPool,
        id: DbId,
        restored_by: DbId,
    ) -> Result<Option<TrashQueueEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE trash_queue SET \
                 status_id = $2, \
                 restored_at = NOW(), \
                 restored_by = $3 \
             WHERE id = $1 AND status_id = $4 \
             RETURNING {TRASH_COLUMNS}"
        );
        sqlx::query_as::<_, TrashQueueEntry>(&query)
            .bind(id)
            .bind(TRASH_STATUS_RESTORED)
            .bind(restored_by)
            .bind(TRASH_STATUS_PENDING)
            .fetch_optional(pool)
            .await
    }

    /// Find all pending entries whose grace period has expired.
    pub async fn get_expired_entries(pool: &PgPool) -> Result<Vec<TrashQueueEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {TRASH_COLUMNS} FROM trash_queue \
             WHERE status_id = $1 AND delete_after <= NOW() \
             ORDER BY delete_after ASC"
        );
        sqlx::query_as::<_, TrashQueueEntry>(&query)
            .bind(TRASH_STATUS_PENDING)
            .fetch_all(pool)
            .await
    }

    /// Mark a trash entry as permanently deleted.
    pub async fn mark_as_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<TrashQueueEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE trash_queue SET \
                 status_id = $2, \
                 deleted_at = NOW() \
             WHERE id = $1 \
             RETURNING {TRASH_COLUMNS}"
        );
        sqlx::query_as::<_, TrashQueueEntry>(&query)
            .bind(id)
            .bind(TRASH_STATUS_DELETED)
            .fetch_optional(pool)
            .await
    }

    /// Get a single trash entry by ID.
    pub async fn get_trash_entry(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<TrashQueueEntry>, sqlx::Error> {
        let query = format!("SELECT {TRASH_COLUMNS} FROM trash_queue WHERE id = $1");
        sqlx::query_as::<_, TrashQueueEntry>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    // ── Reclamation Runs ────────────────────────────────────────────

    /// Create a new reclamation run record (at the start of a cleanup operation).
    pub async fn create_run(
        pool: &PgPool,
        input: &CreateReclamationRun,
    ) -> Result<ReclamationRun, sqlx::Error> {
        let query = format!(
            "INSERT INTO reclamation_runs \
                 (run_type, policy_id, project_id, files_scanned, files_marked) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {RUN_COLUMNS}"
        );
        sqlx::query_as::<_, ReclamationRun>(&query)
            .bind(&input.run_type)
            .bind(input.policy_id)
            .bind(input.project_id)
            .bind(input.files_scanned)
            .bind(input.files_marked)
            .fetch_one(pool)
            .await
    }

    /// Complete a reclamation run by updating final statistics.
    pub async fn complete_run(
        pool: &PgPool,
        id: DbId,
        files_deleted: i32,
        bytes_reclaimed: i64,
        error_message: Option<&str>,
    ) -> Result<Option<ReclamationRun>, sqlx::Error> {
        let query = format!(
            "UPDATE reclamation_runs SET \
                 files_deleted = $2, \
                 bytes_reclaimed = $3, \
                 error_message = $4, \
                 completed_at = NOW() \
             WHERE id = $1 \
             RETURNING {RUN_COLUMNS}"
        );
        sqlx::query_as::<_, ReclamationRun>(&query)
            .bind(id)
            .bind(files_deleted)
            .bind(bytes_reclaimed)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// List reclamation runs, most recent first.
    pub async fn list_runs(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ReclamationRun>, sqlx::Error> {
        let query = format!(
            "SELECT {RUN_COLUMNS} FROM reclamation_runs \
             ORDER BY started_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ReclamationRun>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}
