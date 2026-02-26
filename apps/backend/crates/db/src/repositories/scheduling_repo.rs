//! Repositories for scheduling-related tables (PRD-08).
//!
//! Covers: `scheduling_policies`, `gpu_quotas`, `job_state_transitions`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scheduling::{
    GpuQuota, JobStateTransition, QuotaStatus, SchedulingPolicy, SetGpuQuota,
    UpsertSchedulingPolicy,
};
use crate::models::status::JobStatus;

// ===========================================================================
// SchedulingPolicyRepo
// ===========================================================================

const POLICY_COLUMNS: &str = "\
    id, name, policy_type, config, is_enabled, created_at, updated_at";

/// CRUD for the `scheduling_policies` table.
pub struct SchedulingPolicyRepo;

impl SchedulingPolicyRepo {
    /// List all scheduling policies.
    pub async fn list(pool: &PgPool) -> Result<Vec<SchedulingPolicy>, sqlx::Error> {
        let query = format!("SELECT {POLICY_COLUMNS} FROM scheduling_policies ORDER BY id");
        sqlx::query_as::<_, SchedulingPolicy>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a policy by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SchedulingPolicy>, sqlx::Error> {
        let query = format!("SELECT {POLICY_COLUMNS} FROM scheduling_policies WHERE id = $1");
        sqlx::query_as::<_, SchedulingPolicy>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find the active off-peak policy (if any).
    pub async fn find_active_off_peak(
        pool: &PgPool,
    ) -> Result<Option<SchedulingPolicy>, sqlx::Error> {
        let query = format!(
            "SELECT {POLICY_COLUMNS} FROM scheduling_policies \
             WHERE policy_type = 'off_peak' AND is_enabled = true \
             LIMIT 1"
        );
        sqlx::query_as::<_, SchedulingPolicy>(&query)
            .fetch_optional(pool)
            .await
    }

    /// Create a new scheduling policy.
    pub async fn create(
        pool: &PgPool,
        input: &UpsertSchedulingPolicy,
    ) -> Result<SchedulingPolicy, sqlx::Error> {
        let query = format!(
            "INSERT INTO scheduling_policies (name, policy_type, config, is_enabled) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {POLICY_COLUMNS}"
        );
        sqlx::query_as::<_, SchedulingPolicy>(&query)
            .bind(&input.name)
            .bind(&input.policy_type)
            .bind(&input.config)
            .bind(input.is_enabled)
            .fetch_one(pool)
            .await
    }

    /// Update an existing scheduling policy.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpsertSchedulingPolicy,
    ) -> Result<SchedulingPolicy, sqlx::Error> {
        let query = format!(
            "UPDATE scheduling_policies \
             SET name = $2, policy_type = $3, config = $4, is_enabled = $5 \
             WHERE id = $1 \
             RETURNING {POLICY_COLUMNS}"
        );
        sqlx::query_as::<_, SchedulingPolicy>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.policy_type)
            .bind(&input.config)
            .bind(input.is_enabled)
            .fetch_one(pool)
            .await
    }
}

// ===========================================================================
// GpuQuotaRepo
// ===========================================================================

const QUOTA_COLUMNS: &str = "\
    id, user_id, project_id, daily_limit_secs, weekly_limit_secs, \
    is_enabled, created_at, updated_at";

/// CRUD for the `gpu_quotas` table.
pub struct GpuQuotaRepo;

impl GpuQuotaRepo {
    /// Find the active quota for a user.
    pub async fn find_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<GpuQuota>, sqlx::Error> {
        let query = format!(
            "SELECT {QUOTA_COLUMNS} FROM gpu_quotas \
             WHERE user_id = $1 AND is_enabled = true \
             LIMIT 1"
        );
        sqlx::query_as::<_, GpuQuota>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Set or update a user's GPU quota (upsert by user_id where project_id IS NULL).
    pub async fn set_user_quota(
        pool: &PgPool,
        user_id: DbId,
        input: &SetGpuQuota,
    ) -> Result<GpuQuota, sqlx::Error> {
        let query = format!(
            "INSERT INTO gpu_quotas (user_id, daily_limit_secs, weekly_limit_secs, is_enabled) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (user_id) WHERE project_id IS NULL \
             DO UPDATE SET daily_limit_secs = $2, weekly_limit_secs = $3, is_enabled = $4 \
             RETURNING {QUOTA_COLUMNS}"
        );
        // Note: The ON CONFLICT needs a partial unique index. Fall back to
        // check-then-insert/update if the partial index doesn't exist.
        let result = sqlx::query_as::<_, GpuQuota>(&query)
            .bind(user_id)
            .bind(input.daily_limit_secs)
            .bind(input.weekly_limit_secs)
            .bind(input.is_enabled)
            .fetch_optional(pool)
            .await;

        match result {
            Ok(Some(quota)) => Ok(quota),
            Ok(None) | Err(_) => {
                // Fallback: try update, then insert.
                Self::upsert_user_quota_fallback(pool, user_id, input).await
            }
        }
    }

    /// Fallback upsert for user quota when partial unique index is missing.
    async fn upsert_user_quota_fallback(
        pool: &PgPool,
        user_id: DbId,
        input: &SetGpuQuota,
    ) -> Result<GpuQuota, sqlx::Error> {
        let existing = Self::find_by_user(pool, user_id).await?;
        if let Some(existing) = existing {
            let query = format!(
                "UPDATE gpu_quotas \
                 SET daily_limit_secs = $2, weekly_limit_secs = $3, is_enabled = $4 \
                 WHERE id = $1 \
                 RETURNING {QUOTA_COLUMNS}"
            );
            sqlx::query_as::<_, GpuQuota>(&query)
                .bind(existing.id)
                .bind(input.daily_limit_secs)
                .bind(input.weekly_limit_secs)
                .bind(input.is_enabled)
                .fetch_one(pool)
                .await
        } else {
            let query = format!(
                "INSERT INTO gpu_quotas (user_id, daily_limit_secs, weekly_limit_secs, is_enabled) \
                 VALUES ($1, $2, $3, $4) \
                 RETURNING {QUOTA_COLUMNS}"
            );
            sqlx::query_as::<_, GpuQuota>(&query)
                .bind(user_id)
                .bind(input.daily_limit_secs)
                .bind(input.weekly_limit_secs)
                .bind(input.is_enabled)
                .fetch_one(pool)
                .await
        }
    }

    /// Check a user's quota status by summing completed job durations.
    pub async fn check_quota(pool: &PgPool, user_id: DbId) -> Result<QuotaStatus, sqlx::Error> {
        let quota = Self::find_by_user(pool, user_id).await?;

        let Some(quota) = quota else {
            return Ok(QuotaStatus::NoQuota);
        };

        // Sum actual_duration_secs for completed jobs today.
        let today_used: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(actual_duration_secs), 0)::BIGINT FROM jobs \
             WHERE submitted_by = $1 \
               AND completed_at >= CURRENT_DATE \
               AND status_id = $2",
        )
        .bind(user_id)
        .bind(JobStatus::Completed.id())
        .fetch_one(pool)
        .await?;

        // Sum actual_duration_secs for completed jobs this week (Monday start).
        let week_used: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(actual_duration_secs), 0)::BIGINT FROM jobs \
             WHERE submitted_by = $1 \
               AND completed_at >= date_trunc('week', CURRENT_DATE) \
               AND status_id = $2",
        )
        .bind(user_id)
        .bind(JobStatus::Completed.id())
        .fetch_one(pool)
        .await?;

        // Check daily limit exceeded.
        if let Some(daily_limit) = quota.daily_limit_secs {
            if today_used >= daily_limit as i64 {
                return Ok(QuotaStatus::Exceeded {
                    used_today_secs: today_used,
                    daily_limit_secs: quota.daily_limit_secs,
                    used_this_week_secs: week_used,
                    weekly_limit_secs: quota.weekly_limit_secs,
                    exceeded_type: "daily".into(),
                });
            }
        }

        // Check weekly limit exceeded.
        if let Some(weekly_limit) = quota.weekly_limit_secs {
            if week_used >= weekly_limit as i64 {
                return Ok(QuotaStatus::Exceeded {
                    used_today_secs: today_used,
                    daily_limit_secs: quota.daily_limit_secs,
                    used_this_week_secs: week_used,
                    weekly_limit_secs: quota.weekly_limit_secs,
                    exceeded_type: "weekly".into(),
                });
            }
        }

        Ok(QuotaStatus::WithinLimits {
            used_today_secs: today_used,
            daily_limit_secs: quota.daily_limit_secs,
            used_this_week_secs: week_used,
            weekly_limit_secs: quota.weekly_limit_secs,
        })
    }
}

// ===========================================================================
// JobTransitionRepo
// ===========================================================================

const TRANSITION_COLUMNS: &str = "\
    id, job_id, from_status_id, to_status_id, triggered_by, reason, transitioned_at";

/// Read operations for the `job_state_transitions` table.
///
/// Inserts are done by `JobRepo::transition_state` to ensure atomicity.
pub struct JobTransitionRepo;

impl JobTransitionRepo {
    /// List all transitions for a specific job, ordered chronologically.
    pub async fn list_by_job(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<Vec<JobStateTransition>, sqlx::Error> {
        let query = format!(
            "SELECT {TRANSITION_COLUMNS} FROM job_state_transitions \
             WHERE job_id = $1 \
             ORDER BY transitioned_at ASC"
        );
        sqlx::query_as::<_, JobStateTransition>(&query)
            .bind(job_id)
            .fetch_all(pool)
            .await
    }
}
