//! Repository for the `transcode_jobs` polymorphic queue (PRD-169).
//!
//! Provides the atomic claim query used by the background worker, retry
//! bookkeeping with exponential backoff, and the worker-startup stalled-job
//! recovery pass. Follows the `(status_id, next_attempt_at)` index for O(1)
//! claims even under 10k+ historical rows.

use std::time::Duration;

use sqlx::{PgPool, Postgres, Transaction};
use x121_core::types::DbId;

use crate::models::transcode_job::{
    AdminListFilter, CreateTranscodeJob, RecoverResult, TranscodeJob,
    TRANSCODE_STATUS_FAILED, TRANSCODE_STATUS_IN_PROGRESS, TRANSCODE_STATUS_PENDING,
};

/// Column list shared across queries.
const COLUMNS: &str = "id, uuid, entity_type, entity_id, status_id, attempts, max_attempts, \
    next_attempt_at, source_codec, source_storage_key, target_storage_key, error_message, \
    started_at, completed_at, created_at, updated_at, deleted_at";

/// Repository providing CRUD, claim, and recovery operations for transcode jobs.
pub struct TranscodeJobRepo;

impl TranscodeJobRepo {
    // ── CRUD ─────────────────────────────────────────────────────────

    /// Insert a new transcode job in `pending` state. Respects the unique
    /// partial index on `(entity_type, entity_id)` — callers must first check
    /// `find_active_by_entity` to avoid violations on duplicate enqueue.
    pub async fn create(
        pool: &PgPool,
        input: &CreateTranscodeJob,
    ) -> Result<TranscodeJob, sqlx::Error> {
        let query = format!(
            "INSERT INTO transcode_jobs \
                (entity_type, entity_id, status_id, source_codec, source_storage_key) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(TRANSCODE_STATUS_PENDING)
            .bind(&input.source_codec)
            .bind(&input.source_storage_key)
            .fetch_one(pool)
            .await
    }

    /// Find the currently-active (pending or in_progress) job for an entity.
    pub async fn find_active_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<TranscodeJob>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM transcode_jobs \
             WHERE entity_type = $1 AND entity_id = $2 \
               AND deleted_at IS NULL \
               AND status_id IN ($3, $4) \
             ORDER BY created_at DESC LIMIT 1"
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(TRANSCODE_STATUS_PENDING)
            .bind(TRANSCODE_STATUS_IN_PROGRESS)
            .fetch_optional(pool)
            .await
    }

    /// Find a job by its numeric ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<TranscodeJob>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM transcode_jobs \
             WHERE id = $1 AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find the most recent job (active or terminal) for an entity.
    /// Used by API responses to surface `transcode_job_id` / error fields.
    pub async fn find_latest_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<TranscodeJob>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM transcode_jobs \
             WHERE entity_type = $1 AND entity_id = $2 \
               AND deleted_at IS NULL \
             ORDER BY created_at DESC LIMIT 1"
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_optional(pool)
            .await
    }

    // ── Worker claim ─────────────────────────────────────────────────

    /// Atomically claim up to `limit` pending jobs whose `next_attempt_at` is
    /// due. Single `UPDATE … RETURNING` to prevent double-claim in a
    /// single-instance worker. Global FIFO by `created_at`.
    ///
    /// Multi-instance coordination is deferred to v2 (PRD §7 "Deferred to v2");
    /// that would rewrite this as `SELECT … FOR UPDATE SKIP LOCKED` followed
    /// by the update.
    pub async fn claim_pending(
        pool: &PgPool,
        limit: i32,
    ) -> Result<Vec<TranscodeJob>, sqlx::Error> {
        let query = format!(
            "UPDATE transcode_jobs \
             SET status_id = $1, started_at = NOW(), attempts = attempts + 1, updated_at = NOW() \
             WHERE id IN ( \
                 SELECT id FROM transcode_jobs \
                 WHERE status_id = $2 \
                   AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()) \
                   AND deleted_at IS NULL \
                 ORDER BY created_at ASC \
                 LIMIT $3 \
             ) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(TRANSCODE_STATUS_IN_PROGRESS)
            .bind(TRANSCODE_STATUS_PENDING)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    // ── State transitions ────────────────────────────────────────────

    /// Mark a job as `completed`. Accepts a transaction so callers can couple
    /// the update with `scene_video_versions.transcode_state = 'completed'`.
    pub async fn mark_completed<'c>(
        tx: &mut Transaction<'c, Postgres>,
        job_id: DbId,
        target_key: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE transcode_jobs \
             SET status_id = 3, completed_at = NOW(), target_storage_key = $2, \
                 error_message = NULL, updated_at = NOW() \
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(target_key)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    /// Schedule a retry: set `status_id = pending`, `next_attempt_at = NOW() + backoff`,
    /// record the error. Leaves `attempts` as-is (it was already incremented on claim).
    pub async fn mark_failed_retry(
        pool: &PgPool,
        job_id: DbId,
        error: &str,
        backoff: Duration,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE transcode_jobs \
             SET status_id = $2, \
                 next_attempt_at = NOW() + make_interval(secs => $3::bigint), \
                 error_message = $4, \
                 started_at = NULL, \
                 updated_at = NOW() \
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(TRANSCODE_STATUS_PENDING)
        .bind(backoff.as_secs() as i64)
        .bind(error)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Mark a job as terminally `failed`. Accepts a transaction so callers can
    /// set `scene_video_versions.transcode_state = 'failed'` in the same commit.
    pub async fn mark_failed_terminal<'c>(
        tx: &mut Transaction<'c, Postgres>,
        job_id: DbId,
        error: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE transcode_jobs \
             SET status_id = $2, completed_at = NOW(), error_message = $3, updated_at = NOW() \
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(TRANSCODE_STATUS_FAILED)
        .bind(error)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    /// Reset a failed (or otherwise-terminal) job to pending with fresh counters.
    /// Used by the admin/editor retry endpoint.
    pub async fn retry(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<Option<TranscodeJob>, sqlx::Error> {
        let query = format!(
            "UPDATE transcode_jobs \
             SET status_id = $2, attempts = 0, next_attempt_at = NULL, \
                 error_message = NULL, started_at = NULL, completed_at = NULL, \
                 updated_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(job_id)
            .bind(TRANSCODE_STATUS_PENDING)
            .fetch_optional(pool)
            .await
    }

    // ── Startup recovery (PRD Requirement 1.4a) ──────────────────────

    /// Reset stalled `in_progress` jobs older than `threshold` back to `pending`
    /// with `attempts` incremented. If `attempts + 1 >= max_attempts`, mark
    /// `failed` instead. Also syncs `scene_video_versions.transcode_state`.
    /// Returns a count struct the worker logs at boot.
    pub async fn recover_stalled(
        pool: &PgPool,
        threshold: Duration,
    ) -> Result<RecoverResult, sqlx::Error> {
        let mut tx = pool.begin().await?;

        let threshold_secs = threshold.as_secs() as i64;

        // Step 1: rows that would exhaust retries when attempts is incremented
        // → mark failed. Sync SVV transcode_state in a single CTE.
        let failed_ids: Vec<(DbId,)> = sqlx::query_as(
            "WITH updated AS ( \
                 UPDATE transcode_jobs \
                 SET status_id = $1, completed_at = NOW(), updated_at = NOW(), \
                     error_message = COALESCE(error_message, '') \
                                     || E'\\n[recovery] attempts exhausted after stall' \
                 WHERE status_id = $2 \
                   AND started_at < NOW() - make_interval(secs => $3::bigint) \
                   AND deleted_at IS NULL \
                   AND attempts + 1 >= max_attempts \
                 RETURNING id, entity_type, entity_id \
             ) \
             SELECT id FROM updated",
        )
        .bind(TRANSCODE_STATUS_FAILED)
        .bind(TRANSCODE_STATUS_IN_PROGRESS)
        .bind(threshold_secs)
        .fetch_all(&mut *tx)
        .await?;
        let failed_count = failed_ids.len() as i64;

        // For newly-failed scene_video_version entities, flip their
        // transcode_state from 'in_progress' → 'failed'.
        sqlx::query(
            "UPDATE scene_video_versions svv \
             SET transcode_state = 'failed', updated_at = NOW() \
             FROM transcode_jobs tj \
             WHERE tj.entity_type = 'scene_video_version' \
               AND tj.entity_id = svv.id \
               AND tj.status_id = $1 \
               AND tj.completed_at >= NOW() - INTERVAL '1 minute' \
               AND svv.transcode_state = 'in_progress'",
        )
        .bind(TRANSCODE_STATUS_FAILED)
        .execute(&mut *tx)
        .await?;

        // Step 2: remaining stalled rows → reset to pending, bump attempts.
        let reset_ids: Vec<(DbId,)> = sqlx::query_as(
            "UPDATE transcode_jobs \
             SET status_id = $1, attempts = attempts + 1, started_at = NULL, \
                 updated_at = NOW() \
             WHERE status_id = $2 \
               AND started_at < NOW() - make_interval(secs => $3::bigint) \
               AND deleted_at IS NULL \
             RETURNING id",
        )
        .bind(TRANSCODE_STATUS_PENDING)
        .bind(TRANSCODE_STATUS_IN_PROGRESS)
        .bind(threshold_secs)
        .fetch_all(&mut *tx)
        .await?;
        let reset_count = reset_ids.len() as i64;

        // Sync SVV rows from 'in_progress' → 'pending' for reset jobs.
        sqlx::query(
            "UPDATE scene_video_versions svv \
             SET transcode_state = 'pending', updated_at = NOW() \
             FROM transcode_jobs tj \
             WHERE tj.entity_type = 'scene_video_version' \
               AND tj.entity_id = svv.id \
               AND tj.status_id = $1 \
               AND svv.transcode_state = 'in_progress'",
        )
        .bind(TRANSCODE_STATUS_PENDING)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(RecoverResult {
            reset_count,
            failed_count,
        })
    }

    // ── Admin list ───────────────────────────────────────────────────

    /// List jobs with optional status/entity_type/created_since filters.
    pub async fn list_admin(
        pool: &PgPool,
        filter: &AdminListFilter,
    ) -> Result<Vec<TranscodeJob>, sqlx::Error> {
        let limit = filter.limit.unwrap_or(50).clamp(1, 500);
        let offset = filter.offset.unwrap_or(0).max(0);

        let query = format!(
            "SELECT tj.{cols_qualified} FROM transcode_jobs tj \
             LEFT JOIN transcode_job_statuses s ON s.id = tj.status_id \
             WHERE tj.deleted_at IS NULL \
               AND ($1::text IS NULL OR s.name = $1) \
               AND ($2::text IS NULL OR tj.entity_type = $2) \
               AND ($3::timestamptz IS NULL OR tj.created_at >= $3) \
             ORDER BY tj.created_at DESC \
             LIMIT $4 OFFSET $5",
            cols_qualified = qualify_columns("tj")
        );
        sqlx::query_as::<_, TranscodeJob>(&query)
            .bind(&filter.status)
            .bind(&filter.entity_type)
            .bind(filter.created_since)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return `COLUMNS` with an `alias.` prefix on every column.
fn qualify_columns(alias: &str) -> String {
    COLUMNS
        .split(',')
        .map(|c| format!("{alias}.{}", c.trim()))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Exponential backoff schedule for retry attempts: 30s / 60s / 120s (capped).
/// `attempts` is the number of attempts already made (1-based for the first retry).
pub fn backoff_for(attempts: i32) -> Duration {
    let exp = attempts.max(1).saturating_sub(1) as u32;
    let secs = 30u64.saturating_mul(2u64.saturating_pow(exp));
    // Cap at 300s so an external `attempts` misconfig can't create multi-minute waits.
    Duration::from_secs(secs.min(300))
}

// ---------------------------------------------------------------------------
// Unit tests (pure math)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_sequence_is_30_60_120() {
        assert_eq!(backoff_for(1), Duration::from_secs(30));
        assert_eq!(backoff_for(2), Duration::from_secs(60));
        assert_eq!(backoff_for(3), Duration::from_secs(120));
    }

    #[test]
    fn backoff_is_capped() {
        // 2^9 * 30 = 15360 but capped at 300.
        assert_eq!(backoff_for(10), Duration::from_secs(300));
    }

    #[test]
    fn backoff_clamps_zero_to_one() {
        assert_eq!(backoff_for(0), Duration::from_secs(30));
        assert_eq!(backoff_for(-1), Duration::from_secs(30));
    }
}

// Re-export status constants and helpers for the worker so it does not have to
// import them from the model module directly (keeps the repo as one import).
pub use crate::models::transcode_job::{
    status_name_for, TRANSCODE_ENTITY_SCENE_VIDEO_VERSION, TRANSCODE_STATUS_CANCELLED,
    TRANSCODE_STATUS_COMPLETED,
};
