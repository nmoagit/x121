//! Repository for character review assignment, decision, and audit tables (PRD-129).
//!
//! Provides CRUD for review assignments, decision recording,
//! workload summaries, and audit log queries.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::character_review::{
    CharacterReviewAssignment, CharacterReviewAuditEntry, CharacterReviewDecision,
    ReviewQueueCharacter, ReviewerWorkload,
};

// ---------------------------------------------------------------------------
// Column constants
// ---------------------------------------------------------------------------

/// Column list for `character_review_assignments` queries.
const ASSIGNMENT_COLUMNS: &str = "id, character_id, reviewer_user_id, assigned_by, \
    reassigned_from, review_round, status, started_at, completed_at, deadline, \
    created_at, updated_at";

/// Column list for `character_review_decisions` queries.
const DECISION_COLUMNS: &str = "id, assignment_id, character_id, reviewer_user_id, \
    decision, comment, review_round, review_duration_sec, decided_at, created_at";

/// Column list for `character_review_audit_log` queries.
const AUDIT_COLUMNS: &str = "id, character_id, action, actor_user_id, target_user_id, \
    comment, metadata, created_at";

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/// Provides data access for character review assignments, decisions, and audit log.
pub struct CharacterReviewRepo;

impl CharacterReviewRepo {
    // -----------------------------------------------------------------------
    // Assignment CRUD
    // -----------------------------------------------------------------------

    /// Create a new review assignment for a character.
    pub async fn create_assignment(
        pool: &PgPool,
        character_id: DbId,
        reviewer_user_id: DbId,
        assigned_by: DbId,
        review_round: i32,
        deadline: Option<Timestamp>,
    ) -> Result<CharacterReviewAssignment, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_review_assignments
                (character_id, reviewer_user_id, assigned_by, review_round, deadline)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {ASSIGNMENT_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(character_id)
            .bind(reviewer_user_id)
            .bind(assigned_by)
            .bind(review_round)
            .bind(deadline)
            .fetch_one(pool)
            .await
    }

    /// Create a new review assignment with `reassigned_from` set.
    ///
    /// Used when reassigning a character to a different reviewer.
    pub async fn create_assignment_with_reassign(
        pool: &PgPool,
        character_id: DbId,
        reviewer_user_id: DbId,
        assigned_by: DbId,
        review_round: i32,
        deadline: Option<Timestamp>,
        reassigned_from: Option<DbId>,
    ) -> Result<CharacterReviewAssignment, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_review_assignments
                (character_id, reviewer_user_id, assigned_by, review_round, deadline, reassigned_from)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {ASSIGNMENT_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(character_id)
            .bind(reviewer_user_id)
            .bind(assigned_by)
            .bind(review_round)
            .bind(deadline)
            .bind(reassigned_from)
            .fetch_one(pool)
            .await
    }

    /// Find the active assignment for a character, if any.
    pub async fn find_active_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Option<CharacterReviewAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {ASSIGNMENT_COLUMNS} FROM character_review_assignments
             WHERE character_id = $1 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(character_id)
            .fetch_optional(pool)
            .await
    }

    /// Find an assignment by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterReviewAssignment>, sqlx::Error> {
        let query =
            format!("SELECT {ASSIGNMENT_COLUMNS} FROM character_review_assignments WHERE id = $1");
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List the reviewer's active queue with character and project details.
    pub async fn list_by_reviewer(
        pool: &PgPool,
        reviewer_user_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ReviewQueueCharacter>, sqlx::Error> {
        sqlx::query_as::<_, ReviewQueueCharacter>(
            "SELECT
                cra.id AS assignment_id,
                c.id AS character_id,
                c.name AS character_name,
                p.id AS project_id,
                p.name AS project_name,
                cra.review_round,
                (SELECT COUNT(*) FROM scenes s
                 WHERE s.character_id = c.id AND s.deleted_at IS NULL) AS scene_count,
                cra.created_at AS assigned_at,
                cra.deadline,
                cra.status
             FROM character_review_assignments cra
             JOIN characters c ON c.id = cra.character_id
             JOIN projects p ON p.id = c.project_id
             WHERE cra.reviewer_user_id = $1
               AND cra.status = 'active'
             ORDER BY cra.created_at DESC
             LIMIT $2 OFFSET $3",
        )
        .bind(reviewer_user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }

    /// List assignments for a project (all statuses), ordered by creation date.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<CharacterReviewAssignment>, sqlx::Error> {
        let prefixed_cols = ASSIGNMENT_COLUMNS
            .split(", ")
            .map(|col| format!("cra.{col}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT {prefixed_cols}
             FROM character_review_assignments cra
             JOIN characters c ON c.id = cra.character_id
             WHERE c.project_id = $1
             ORDER BY cra.created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&sql)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Mark an assignment as started (sets `started_at`).
    pub async fn start_review(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterReviewAssignment>, sqlx::Error> {
        let query = format!(
            "UPDATE character_review_assignments
             SET started_at = NOW()
             WHERE id = $1
             RETURNING {ASSIGNMENT_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Complete an assignment with the given status (`completed` or `reassigned`).
    pub async fn complete_assignment(
        pool: &PgPool,
        id: DbId,
        status: &str,
    ) -> Result<Option<CharacterReviewAssignment>, sqlx::Error> {
        let query = format!(
            "UPDATE character_review_assignments
             SET completed_at = NOW(), status = $2
             WHERE id = $1
             RETURNING {ASSIGNMENT_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(id)
            .bind(status)
            .fetch_optional(pool)
            .await
    }

    /// Mark an assignment as reassigned (sets status and completed_at).
    pub async fn mark_reassigned(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE character_review_assignments
             SET status = 'reassigned', completed_at = NOW()
             WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Count active assignments for a reviewer.
    pub async fn count_active_by_reviewer(
        pool: &PgPool,
        reviewer_user_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_as::<_, CountRow>(
            "SELECT COUNT(*)::BIGINT AS count
             FROM character_review_assignments
             WHERE reviewer_user_id = $1 AND status = 'active'",
        )
        .bind(reviewer_user_id)
        .fetch_one(pool)
        .await?;
        Ok(row.count)
    }

    /// Aggregate workload summary per reviewer for a project.
    pub async fn reviewer_workload_summary(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ReviewerWorkload>, sqlx::Error> {
        sqlx::query_as::<_, ReviewerWorkload>(
            "SELECT
                u.id AS reviewer_user_id,
                u.username AS reviewer_username,
                COUNT(*) FILTER (WHERE cra.status = 'active'
                    AND c.review_status_id = 2)::BIGINT AS assigned_count,
                COUNT(*) FILTER (WHERE cra.status = 'active'
                    AND c.review_status_id = 3)::BIGINT AS in_review_count,
                COUNT(*) FILTER (WHERE cra.status = 'completed')::BIGINT AS completed_count,
                COUNT(*) FILTER (WHERE cra.status = 'completed' AND EXISTS (
                    SELECT 1 FROM character_review_decisions d
                    WHERE d.assignment_id = cra.id AND d.decision = 'approved'
                ))::BIGINT AS approved_count,
                COUNT(*) FILTER (WHERE cra.status = 'completed' AND EXISTS (
                    SELECT 1 FROM character_review_decisions d
                    WHERE d.assignment_id = cra.id AND d.decision = 'rejected'
                ))::BIGINT AS rejected_count
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN character_review_assignments cra ON cra.reviewer_user_id = u.id
             LEFT JOIN characters c ON c.id = cra.character_id AND c.project_id = $1
             WHERE r.name = 'reviewer' AND u.is_active = true
             GROUP BY u.id, u.username",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Find the last completed assignment for a character (for re-assignment to the same reviewer).
    pub async fn last_completed_for_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Option<CharacterReviewAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {ASSIGNMENT_COLUMNS} FROM character_review_assignments
             WHERE character_id = $1 AND status = 'completed'
             ORDER BY completed_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, CharacterReviewAssignment>(&query)
            .bind(character_id)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Decision methods
    // -----------------------------------------------------------------------

    /// Record a review decision for an assignment.
    pub async fn create_decision(
        pool: &PgPool,
        assignment_id: DbId,
        character_id: DbId,
        reviewer_user_id: DbId,
        decision: &str,
        comment: Option<&str>,
        review_round: i32,
        review_duration_sec: Option<i32>,
    ) -> Result<CharacterReviewDecision, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_review_decisions
                (assignment_id, character_id, reviewer_user_id, decision,
                 comment, review_round, review_duration_sec)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {DECISION_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReviewDecision>(&query)
            .bind(assignment_id)
            .bind(character_id)
            .bind(reviewer_user_id)
            .bind(decision)
            .bind(comment)
            .bind(review_round)
            .bind(review_duration_sec)
            .fetch_one(pool)
            .await
    }

    /// List all decisions for a character, most recent first.
    pub async fn list_decisions_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterReviewDecision>, sqlx::Error> {
        let query = format!(
            "SELECT {DECISION_COLUMNS} FROM character_review_decisions
             WHERE character_id = $1
             ORDER BY decided_at DESC"
        );
        sqlx::query_as::<_, CharacterReviewDecision>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Audit log methods
    // -----------------------------------------------------------------------

    /// Record an audit log entry for a character review action.
    pub async fn log_action(
        pool: &PgPool,
        character_id: DbId,
        action: &str,
        actor_user_id: DbId,
        target_user_id: Option<DbId>,
        comment: Option<&str>,
        metadata: &serde_json::Value,
    ) -> Result<CharacterReviewAuditEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_review_audit_log
                (character_id, action, actor_user_id, target_user_id, comment, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {AUDIT_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReviewAuditEntry>(&query)
            .bind(character_id)
            .bind(action)
            .bind(actor_user_id)
            .bind(target_user_id)
            .bind(comment)
            .bind(metadata)
            .fetch_one(pool)
            .await
    }

    /// List audit log entries for a character, most recent first.
    pub async fn list_audit_by_character(
        pool: &PgPool,
        character_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<CharacterReviewAuditEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {AUDIT_COLUMNS} FROM character_review_audit_log
             WHERE character_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, CharacterReviewAuditEntry>(&query)
            .bind(character_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List audit log entries for a project with optional filters.
    ///
    /// Joins through `characters` to filter by `project_id`, and supports
    /// optional filtering by reviewer, action, and date range.
    pub async fn list_audit_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
        reviewer_filter: Option<DbId>,
        action_filter: Option<&str>,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<Vec<CharacterReviewAuditEntry>, sqlx::Error> {
        let mut conditions = vec!["c.project_id = $1".to_string()];
        let mut bind_idx: usize = 4; // $1=project_id, $2=limit, $3=offset

        if reviewer_filter.is_some() {
            conditions.push(format!("a.actor_user_id = ${bind_idx}"));
            bind_idx += 1;
        }
        if action_filter.is_some() {
            conditions.push(format!("a.action = ${bind_idx}"));
            bind_idx += 1;
        }
        if from_date.is_some() {
            conditions.push(format!("a.created_at >= ${bind_idx}::timestamptz"));
            bind_idx += 1;
        }
        if to_date.is_some() {
            conditions.push(format!("a.created_at <= ${bind_idx}::timestamptz"));
            bind_idx += 1;
        }

        let _ = bind_idx; // suppress unused warning

        let where_clause = conditions.join(" AND ");
        let prefixed_cols = AUDIT_COLUMNS
            .split(", ")
            .map(|col| format!("a.{col}"))
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "SELECT {prefixed_cols}
             FROM character_review_audit_log a
             JOIN characters c ON c.id = a.character_id
             WHERE {where_clause}
             ORDER BY a.created_at DESC
             LIMIT $2 OFFSET $3"
        );

        let mut q = sqlx::query_as::<_, CharacterReviewAuditEntry>(&sql)
            .bind(project_id)
            .bind(limit)
            .bind(offset);

        if let Some(reviewer_id) = reviewer_filter {
            q = q.bind(reviewer_id);
        }
        if let Some(action) = action_filter {
            q = q.bind(action);
        }
        if let Some(from) = from_date {
            q = q.bind(from);
        }
        if let Some(to) = to_date {
            q = q.bind(to);
        }

        q.fetch_all(pool).await
    }

    /// Export all audit log entries for a project (no pagination).
    pub async fn export_audit_by_project(
        pool: &PgPool,
        project_id: DbId,
        reviewer_filter: Option<DbId>,
        action_filter: Option<&str>,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<Vec<CharacterReviewAuditEntry>, sqlx::Error> {
        let mut conditions = vec!["c.project_id = $1".to_string()];
        let mut bind_idx: usize = 2;

        if reviewer_filter.is_some() {
            conditions.push(format!("a.actor_user_id = ${bind_idx}"));
            bind_idx += 1;
        }
        if action_filter.is_some() {
            conditions.push(format!("a.action = ${bind_idx}"));
            bind_idx += 1;
        }
        if from_date.is_some() {
            conditions.push(format!("a.created_at >= ${bind_idx}::timestamptz"));
            bind_idx += 1;
        }
        if to_date.is_some() {
            conditions.push(format!("a.created_at <= ${bind_idx}::timestamptz"));
            bind_idx += 1;
        }

        let _ = bind_idx;

        let where_clause = conditions.join(" AND ");
        let prefixed_cols = AUDIT_COLUMNS
            .split(", ")
            .map(|col| format!("a.{col}"))
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "SELECT {prefixed_cols}
             FROM character_review_audit_log a
             JOIN characters c ON c.id = a.character_id
             WHERE {where_clause}
             ORDER BY a.created_at DESC"
        );

        let mut q = sqlx::query_as::<_, CharacterReviewAuditEntry>(&sql).bind(project_id);

        if let Some(reviewer_id) = reviewer_filter {
            q = q.bind(reviewer_id);
        }
        if let Some(action) = action_filter {
            q = q.bind(action);
        }
        if let Some(from) = from_date {
            q = q.bind(from);
        }
        if let Some(to) = to_date {
            q = q.bind(to);
        }

        q.fetch_all(pool).await
    }

    // -----------------------------------------------------------------------
    // Character status update
    // -----------------------------------------------------------------------

    /// Update the review status of a character.
    pub async fn update_review_status(
        pool: &PgPool,
        character_id: DbId,
        review_status_id: i16,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE characters SET review_status_id = $2 WHERE id = $1")
            .bind(character_id)
            .bind(review_status_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// List unassigned characters for a project (review_status_id IN (1=unassigned, 7=re_queued)).
    pub async fn list_unassigned(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<(DbId, String)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, IdNameRow>(
            "SELECT id, name FROM characters
             WHERE project_id = $1
               AND review_status_id IN (1, 7)
               AND deleted_at IS NULL
             ORDER BY name ASC",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|r| (r.id, r.name)).collect())
    }

    // -----------------------------------------------------------------------
    // Reviewer list
    // -----------------------------------------------------------------------

    /// List users with the 'reviewer' role, with their latest assignment date.
    pub async fn list_reviewers(
        pool: &PgPool,
    ) -> Result<Vec<(DbId, String, Option<Timestamp>)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ReviewerRow>(
            "SELECT
                u.id,
                u.username,
                MAX(cra.created_at) AS last_assigned_at
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN character_review_assignments cra ON cra.reviewer_user_id = u.id
             WHERE r.name = 'reviewer' AND u.is_active = true
             GROUP BY u.id, u.username
             ORDER BY u.username ASC",
        )
        .fetch_all(pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| (r.id, r.username, r.last_assigned_at))
            .collect())
    }
}

// ---------------------------------------------------------------------------
// Internal helper rows
// ---------------------------------------------------------------------------

/// Helper for single-count queries.
#[derive(sqlx::FromRow)]
struct CountRow {
    count: i64,
}

/// Helper for id + name queries.
#[derive(sqlx::FromRow)]
struct IdNameRow {
    id: DbId,
    name: String,
}

/// Helper for reviewer list queries.
#[derive(sqlx::FromRow)]
struct ReviewerRow {
    id: DbId,
    username: String,
    last_assigned_at: Option<Timestamp>,
}
