//! Models for disk reclamation: protection rules, policies, trash queue, and runs (PRD-15).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ── Asset Protection Rules ──────────────────────────────────────────

/// A row from the `asset_protection_rules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetProtectionRule {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub entity_type: String,
    pub condition_field: String,
    pub condition_operator: String,
    pub condition_value: String,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating an asset protection rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProtectionRule {
    pub name: String,
    pub description: Option<String>,
    pub entity_type: String,
    pub condition_field: String,
    pub condition_operator: String,
    pub condition_value: String,
    pub is_active: Option<bool>,
}

/// DTO for updating an asset protection rule. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProtectionRule {
    pub name: Option<String>,
    pub description: Option<String>,
    pub entity_type: Option<String>,
    pub condition_field: Option<String>,
    pub condition_operator: Option<String>,
    pub condition_value: Option<String>,
    pub is_active: Option<bool>,
}

// ── Reclamation Policy Scopes ───────────────────────────────────────

/// A row from the `reclamation_policy_scopes` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReclamationPolicyScope {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ── Reclamation Policies ────────────────────────────────────────────

/// A row from the `reclamation_policies` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReclamationPolicy {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub scope_id: DbId,
    pub project_id: Option<DbId>,
    pub entity_type: String,
    pub condition_field: String,
    pub condition_operator: String,
    pub condition_value: String,
    pub age_threshold_days: i32,
    pub grace_period_days: i32,
    pub is_active: bool,
    pub priority: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a reclamation policy.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateReclamationPolicy {
    pub name: String,
    pub description: Option<String>,
    pub scope_id: DbId,
    pub project_id: Option<DbId>,
    pub entity_type: String,
    pub condition_field: String,
    pub condition_operator: String,
    pub condition_value: String,
    pub age_threshold_days: Option<i32>,
    pub grace_period_days: Option<i32>,
    pub is_active: Option<bool>,
    pub priority: Option<i32>,
}

/// DTO for updating a reclamation policy. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReclamationPolicy {
    pub name: Option<String>,
    pub description: Option<String>,
    pub scope_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub entity_type: Option<String>,
    pub condition_field: Option<String>,
    pub condition_operator: Option<String>,
    pub condition_value: Option<String>,
    pub age_threshold_days: Option<i32>,
    pub grace_period_days: Option<i32>,
    pub is_active: Option<bool>,
    pub priority: Option<i32>,
}

// ── Trash Queue ─────────────────────────────────────────────────────

/// A row from the `trash_queue_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TrashQueueStatus {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `trash_queue` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TrashQueueEntry {
    pub id: DbId,
    pub status_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub policy_id: Option<DbId>,
    pub marked_at: Timestamp,
    pub delete_after: Timestamp,
    pub deleted_at: Option<Timestamp>,
    pub restored_at: Option<Timestamp>,
    pub restored_by: Option<DbId>,
    pub project_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for inserting a new trash queue entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTrashEntry {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub policy_id: Option<DbId>,
    pub delete_after: Timestamp,
    pub project_id: Option<DbId>,
}

// ── Reclamation Runs ────────────────────────────────────────────────

/// A row from the `reclamation_runs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReclamationRun {
    pub id: DbId,
    pub run_type: String,
    pub policy_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub files_scanned: i32,
    pub files_marked: i32,
    pub files_deleted: i32,
    pub bytes_reclaimed: i64,
    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub error_message: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a reclamation run record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateReclamationRun {
    pub run_type: String,
    pub policy_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub files_scanned: i32,
    pub files_marked: i32,
}
