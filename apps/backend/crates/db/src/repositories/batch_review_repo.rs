//! Repository for `review_assignments` and `review_sessions` tables (PRD-92).
//!
//! Provides CRUD for review assignments, session lifecycle tracking,
//! batch approve/reject operations (creating `segment_approvals` rows),
//! and progress queries.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::batch_review::{ReviewAssignment, ReviewSession};

// ---------------------------------------------------------------------------
// Column constants
// ---------------------------------------------------------------------------

/// Column list for `review_assignments` queries.
const ASSIGNMENT_COLUMNS: &str = "id, project_id, reviewer_user_id, filter_criteria_json, \
    deadline, status, assigned_by, created_at, updated_at";

/// Column list for `review_sessions` queries.
const SESSION_COLUMNS: &str = "id, user_id, started_at, ended_at, segments_reviewed, \
    segments_approved, segments_rejected, avg_pace_seconds, created_at, updated_at";

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/// Provides data access for batch review assignments, sessions, and operations.
pub struct BatchReviewRepo;

impl BatchReviewRepo {
    // -----------------------------------------------------------------------
    // Assignment CRUD
    // -----------------------------------------------------------------------

    /// Create a new review assignment.
    pub async fn create_assignment(
        pool: &PgPool,
        project_id: DbId,
        reviewer_user_id: DbId,
        filter_criteria_json: &serde_json::Value,
        deadline: Option<chrono::DateTime<chrono::Utc>>,
        assigned_by: DbId,
    ) -> Result<ReviewAssignment, sqlx::Error> {
        let query = format!(
            "INSERT INTO review_assignments
                (project_id, reviewer_user_id, filter_criteria_json, deadline, assigned_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {ASSIGNMENT_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewAssignment>(&query)
            .bind(project_id)
            .bind(reviewer_user_id)
            .bind(filter_criteria_json)
            .bind(deadline)
            .bind(assigned_by)
            .fetch_one(pool)
            .await
    }

    /// Find a review assignment by ID.
    pub async fn find_assignment_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ReviewAssignment>, sqlx::Error> {
        let query = format!("SELECT {ASSIGNMENT_COLUMNS} FROM review_assignments WHERE id = $1");
        sqlx::query_as::<_, ReviewAssignment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List review assignments for a project, ordered by creation date descending.
    pub async fn list_assignments(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ReviewAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {ASSIGNMENT_COLUMNS} FROM review_assignments
             WHERE project_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, ReviewAssignment>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List review assignments for a specific reviewer.
    pub async fn list_assignments_by_reviewer(
        pool: &PgPool,
        user_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ReviewAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {ASSIGNMENT_COLUMNS} FROM review_assignments
             WHERE reviewer_user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, ReviewAssignment>(&query)
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update a review assignment (status, deadline, filter criteria).
    ///
    /// Only non-`None` fields are updated.
    pub async fn update_assignment(
        pool: &PgPool,
        id: DbId,
        status: Option<&str>,
        deadline: Option<chrono::DateTime<chrono::Utc>>,
        filter_criteria_json: Option<&serde_json::Value>,
    ) -> Result<Option<ReviewAssignment>, sqlx::Error> {
        let query = format!(
            "UPDATE review_assignments SET
                status = COALESCE($2, status),
                deadline = COALESCE($3, deadline),
                filter_criteria_json = COALESCE($4, filter_criteria_json)
             WHERE id = $1
             RETURNING {ASSIGNMENT_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewAssignment>(&query)
            .bind(id)
            .bind(status)
            .bind(deadline)
            .bind(filter_criteria_json)
            .fetch_optional(pool)
            .await
    }

    /// Delete a review assignment. Returns `true` if a row was deleted.
    pub async fn delete_assignment(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM review_assignments WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Find all overdue assignments (active with deadline in the past).
    pub async fn find_overdue_assignments(
        pool: &PgPool,
    ) -> Result<Vec<ReviewAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {ASSIGNMENT_COLUMNS} FROM review_assignments
             WHERE status = 'active'
               AND deadline IS NOT NULL
               AND deadline < NOW()
             ORDER BY deadline ASC"
        );
        sqlx::query_as::<_, ReviewAssignment>(&query)
            .fetch_all(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Session tracking
    // -----------------------------------------------------------------------

    /// Start a new review session for a user.
    pub async fn start_session(pool: &PgPool, user_id: DbId) -> Result<ReviewSession, sqlx::Error> {
        let query = format!(
            "INSERT INTO review_sessions (user_id)
             VALUES ($1)
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewSession>(&query)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// End a review session, recording the final pace.
    pub async fn end_session(
        pool: &PgPool,
        session_id: DbId,
        avg_pace_seconds: Option<f32>,
    ) -> Result<Option<ReviewSession>, sqlx::Error> {
        let query = format!(
            "UPDATE review_sessions SET
                ended_at = NOW(),
                avg_pace_seconds = COALESCE($2, avg_pace_seconds)
             WHERE id = $1
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ReviewSession>(&query)
            .bind(session_id)
            .bind(avg_pace_seconds)
            .fetch_optional(pool)
            .await
    }

    /// Update session counts after a review action.
    pub async fn update_session_counts(
        pool: &PgPool,
        session_id: DbId,
        approved_delta: i32,
        rejected_delta: i32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE review_sessions SET
                segments_reviewed = segments_reviewed + $2 + $3,
                segments_approved = segments_approved + $2,
                segments_rejected = segments_rejected + $3
             WHERE id = $1",
        )
        .bind(session_id)
        .bind(approved_delta)
        .bind(rejected_delta)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get the active (un-ended) session for a user, if any.
    pub async fn get_active_session(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<ReviewSession>, sqlx::Error> {
        let query = format!(
            "SELECT {SESSION_COLUMNS} FROM review_sessions
             WHERE user_id = $1 AND ended_at IS NULL
             ORDER BY started_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, ReviewSession>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Batch operations (create segment_approvals rows)
    // -----------------------------------------------------------------------

    /// Batch-approve segments by inserting approval records.
    ///
    /// Returns the number of approval records created.
    pub async fn batch_approve_segments(
        pool: &PgPool,
        segment_ids: &[DbId],
        user_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        if segment_ids.is_empty() {
            return Ok(0);
        }
        // Use UNNEST to insert one approval per segment in a single query.
        let result = sqlx::query(
            "INSERT INTO segment_approvals
                (segment_id, user_id, decision, segment_version)
             SELECT unnest($1::BIGINT[]), $2, 'approved', 1",
        )
        .bind(segment_ids)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() as i64)
    }

    /// Batch-reject segments by inserting rejection records.
    ///
    /// Returns the number of rejection records created.
    pub async fn batch_reject_segments(
        pool: &PgPool,
        segment_ids: &[DbId],
        user_id: DbId,
        reason: Option<&str>,
    ) -> Result<i64, sqlx::Error> {
        if segment_ids.is_empty() {
            return Ok(0);
        }
        let result = sqlx::query(
            "INSERT INTO segment_approvals
                (segment_id, user_id, decision, comment, segment_version)
             SELECT unnest($1::BIGINT[]), $2, 'rejected', $3, 1",
        )
        .bind(segment_ids)
        .bind(user_id)
        .bind(reason)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() as i64)
    }

    // -----------------------------------------------------------------------
    // Progress queries
    // -----------------------------------------------------------------------

    /// Count total segments in a project (via scenes -> avatars -> projects).
    pub async fn count_project_segments(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_as::<_, CountRow>(
            "SELECT COUNT(*)::BIGINT AS count
             FROM segments seg
             JOIN scenes sc ON sc.id = seg.scene_id
             JOIN avatars ch ON ch.id = sc.avatar_id
             WHERE ch.project_id = $1
               AND seg.deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;
        Ok(row.count)
    }

    /// Count segments that have at least one approval decision in a project.
    pub async fn count_reviewed_segments(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_as::<_, CountRow>(
            "SELECT COUNT(DISTINCT seg.id)::BIGINT AS count
             FROM segments seg
             JOIN scenes sc ON sc.id = seg.scene_id
             JOIN avatars ch ON ch.id = sc.avatar_id
             JOIN segment_approvals sa ON sa.segment_id = seg.id
             WHERE ch.project_id = $1
               AND seg.deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;
        Ok(row.count)
    }

    /// Count segments whose latest decision matches the given value.
    ///
    /// Shared implementation for `count_approved_segments` and
    /// `count_rejected_segments` to eliminate structural duplication (DRY-535).
    async fn count_segments_by_decision(
        pool: &PgPool,
        project_id: DbId,
        decision: &str,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_as::<_, CountRow>(
            "SELECT COUNT(*)::BIGINT AS count
             FROM (
                SELECT DISTINCT ON (seg.id) sa.decision
                FROM segments seg
                JOIN scenes sc ON sc.id = seg.scene_id
                JOIN avatars ch ON ch.id = sc.avatar_id
                JOIN segment_approvals sa ON sa.segment_id = seg.id
                WHERE ch.project_id = $1
                  AND seg.deleted_at IS NULL
                ORDER BY seg.id, sa.decided_at DESC
             ) latest
             WHERE latest.decision = $2",
        )
        .bind(project_id)
        .bind(decision)
        .fetch_one(pool)
        .await?;
        Ok(row.count)
    }

    /// Count segments with an approved decision as the latest decision.
    pub async fn count_approved_segments(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        Self::count_segments_by_decision(pool, project_id, "approved").await
    }

    /// Count segments with a rejected decision as the latest decision.
    pub async fn count_rejected_segments(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        Self::count_segments_by_decision(pool, project_id, "rejected").await
    }

    /// Get average QA scores per segment for a project.
    ///
    /// Returns `(segment_id, avg_score)` pairs for segments that have
    /// quality scores recorded.
    pub async fn get_segment_scores(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<(DbId, f64)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, SegmentScoreRow>(
            "SELECT seg.id AS segment_id, AVG(qs.score) AS avg_score
             FROM segments seg
             JOIN scenes sc ON sc.id = seg.scene_id
             JOIN avatars ch ON ch.id = sc.avatar_id
             JOIN quality_scores qs ON qs.segment_id = seg.id
             WHERE ch.project_id = $1
               AND seg.deleted_at IS NULL
             GROUP BY seg.id",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| (r.segment_id, r.avg_score))
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

/// Helper for segment score queries.
#[derive(sqlx::FromRow)]
struct SegmentScoreRow {
    segment_id: DbId,
    avg_score: f64,
}
