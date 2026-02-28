//! Repository for budget & quota management tables (PRD-93).

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use crate::models::budget_quota::{
    BudgetExemption, ConsumptionLedgerEntry, CreateBudgetExemption, CreateConsumptionEntry,
    CreateProjectBudget, CreateUserQuota, DailyConsumption, ProjectBudget, UpdateBudgetExemption,
    UserQuota,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const BUDGET_COLUMNS: &str = "id, project_id, budget_gpu_hours, period_type, period_start, \
    warning_threshold_pct, critical_threshold_pct, hard_limit_enabled, \
    rollover_enabled, created_by, created_at, updated_at";

const QUOTA_COLUMNS: &str = "id, user_id, quota_gpu_hours, period_type, period_start, \
    hard_limit_enabled, created_by, created_at, updated_at";

const LEDGER_COLUMNS: &str = "id, project_id, user_id, job_id, gpu_hours, job_type, \
    resolution_tier, is_exempt, exemption_reason, recorded_at";

const EXEMPTION_COLUMNS: &str = "id, name, description, job_type, resolution_tier, \
    is_enabled, created_by, created_at, updated_at";

// ===========================================================================
// ProjectBudgetRepo
// ===========================================================================

/// CRUD operations for the `project_budgets` table.
pub struct ProjectBudgetRepo;

impl ProjectBudgetRepo {
    /// Find a project budget by project id.
    pub async fn find_by_project_id(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Option<ProjectBudget>, sqlx::Error> {
        let query = format!("SELECT {BUDGET_COLUMNS} FROM project_budgets WHERE project_id = $1");
        sqlx::query_as::<_, ProjectBudget>(&query)
            .bind(project_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a project budget (INSERT ... ON CONFLICT UPDATE).
    pub async fn upsert(
        pool: &PgPool,
        project_id: DbId,
        input: &CreateProjectBudget,
        created_by: DbId,
    ) -> Result<ProjectBudget, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_budgets \
                (project_id, budget_gpu_hours, period_type, period_start, \
                 warning_threshold_pct, critical_threshold_pct, \
                 hard_limit_enabled, rollover_enabled, created_by) \
             VALUES ($1, $2, $3, COALESCE($4, NOW()), \
                     COALESCE($5, 75), COALESCE($6, 90), \
                     COALESCE($7, true), COALESCE($8, false), $9) \
             ON CONFLICT (project_id) DO UPDATE SET \
                budget_gpu_hours       = EXCLUDED.budget_gpu_hours, \
                period_type            = EXCLUDED.period_type, \
                period_start           = EXCLUDED.period_start, \
                warning_threshold_pct  = EXCLUDED.warning_threshold_pct, \
                critical_threshold_pct = EXCLUDED.critical_threshold_pct, \
                hard_limit_enabled     = EXCLUDED.hard_limit_enabled, \
                rollover_enabled       = EXCLUDED.rollover_enabled \
             RETURNING {BUDGET_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectBudget>(&query)
            .bind(project_id)
            .bind(input.budget_gpu_hours)
            .bind(&input.period_type)
            .bind(input.period_start)
            .bind(input.warning_threshold_pct)
            .bind(input.critical_threshold_pct)
            .bind(input.hard_limit_enabled)
            .bind(input.rollover_enabled)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Delete a project budget. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, project_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM project_budgets WHERE project_id = $1")
            .bind(project_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all project budgets with pagination.
    pub async fn list_all(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ProjectBudget>, sqlx::Error> {
        let limit_val = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset_val = clamp_offset(offset);
        let query = format!(
            "SELECT {BUDGET_COLUMNS} FROM project_budgets \
             ORDER BY created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ProjectBudget>(&query)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }
}

// ===========================================================================
// UserQuotaRepo
// ===========================================================================

/// CRUD operations for the `user_quotas` table.
pub struct UserQuotaRepo;

impl UserQuotaRepo {
    /// Find a user quota by user id.
    pub async fn find_by_user_id(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<UserQuota>, sqlx::Error> {
        let query = format!("SELECT {QUOTA_COLUMNS} FROM user_quotas WHERE user_id = $1");
        sqlx::query_as::<_, UserQuota>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a user quota (INSERT ... ON CONFLICT UPDATE).
    pub async fn upsert(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateUserQuota,
        created_by: DbId,
    ) -> Result<UserQuota, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_quotas \
                (user_id, quota_gpu_hours, period_type, period_start, \
                 hard_limit_enabled, created_by) \
             VALUES ($1, $2, $3, COALESCE($4, NOW()), \
                     COALESCE($5, true), $6) \
             ON CONFLICT (user_id) DO UPDATE SET \
                quota_gpu_hours    = EXCLUDED.quota_gpu_hours, \
                period_type        = EXCLUDED.period_type, \
                period_start       = EXCLUDED.period_start, \
                hard_limit_enabled = EXCLUDED.hard_limit_enabled \
             RETURNING {QUOTA_COLUMNS}"
        );
        sqlx::query_as::<_, UserQuota>(&query)
            .bind(user_id)
            .bind(input.quota_gpu_hours)
            .bind(&input.period_type)
            .bind(input.period_start)
            .bind(input.hard_limit_enabled)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Delete a user quota. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, user_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM user_quotas WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all user quotas with pagination.
    pub async fn list_all(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<UserQuota>, sqlx::Error> {
        let limit_val = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset_val = clamp_offset(offset);
        let query = format!(
            "SELECT {QUOTA_COLUMNS} FROM user_quotas \
             ORDER BY created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, UserQuota>(&query)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }
}

// ===========================================================================
// ConsumptionLedgerRepo
// ===========================================================================

/// Operations for the `budget_consumption_ledger` table.
pub struct ConsumptionLedgerRepo;

impl ConsumptionLedgerRepo {
    /// Insert a new consumption entry, returning the created row.
    pub async fn insert(
        pool: &PgPool,
        input: &CreateConsumptionEntry,
    ) -> Result<ConsumptionLedgerEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO budget_consumption_ledger \
                (project_id, user_id, job_id, gpu_hours, job_type, \
                 resolution_tier, is_exempt, exemption_reason) \
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), $8) \
             RETURNING {LEDGER_COLUMNS}"
        );
        sqlx::query_as::<_, ConsumptionLedgerEntry>(&query)
            .bind(input.project_id)
            .bind(input.user_id)
            .bind(input.job_id)
            .bind(input.gpu_hours)
            .bind(&input.job_type)
            .bind(&input.resolution_tier)
            .bind(input.is_exempt)
            .bind(&input.exemption_reason)
            .fetch_one(pool)
            .await
    }

    /// Sum non-exempt GPU hours for a project since a given timestamp.
    pub async fn sum_for_project_period(
        pool: &PgPool,
        project_id: DbId,
        since: chrono::DateTime<chrono::Utc>,
    ) -> Result<f64, sqlx::Error> {
        let row: (Option<f64>,) = sqlx::query_as(
            "SELECT COALESCE(SUM(gpu_hours), 0.0) \
             FROM budget_consumption_ledger \
             WHERE project_id = $1 AND recorded_at >= $2 AND is_exempt = false",
        )
        .bind(project_id)
        .bind(since)
        .fetch_one(pool)
        .await?;
        Ok(row.0.unwrap_or(0.0))
    }

    /// Sum non-exempt GPU hours for a user since a given timestamp.
    pub async fn sum_for_user_period(
        pool: &PgPool,
        user_id: DbId,
        since: chrono::DateTime<chrono::Utc>,
    ) -> Result<f64, sqlx::Error> {
        let row: (Option<f64>,) = sqlx::query_as(
            "SELECT COALESCE(SUM(gpu_hours), 0.0) \
             FROM budget_consumption_ledger \
             WHERE user_id = $1 AND recorded_at >= $2 AND is_exempt = false",
        )
        .bind(user_id)
        .bind(since)
        .fetch_one(pool)
        .await?;
        Ok(row.0.unwrap_or(0.0))
    }

    /// Get daily aggregated consumption for a project over the last N days.
    pub async fn daily_aggregates(
        pool: &PgPool,
        project_id: DbId,
        days: i32,
    ) -> Result<Vec<DailyConsumption>, sqlx::Error> {
        sqlx::query_as::<_, DailyConsumption>(
            "SELECT recorded_at::date AS day, \
                    COALESCE(SUM(gpu_hours), 0.0) AS total_gpu_hours \
             FROM budget_consumption_ledger \
             WHERE project_id = $1 \
               AND recorded_at >= NOW() - ($2 || ' days')::interval \
               AND is_exempt = false \
             GROUP BY recorded_at::date \
             ORDER BY day ASC",
        )
        .bind(project_id)
        .bind(days)
        .fetch_all(pool)
        .await
    }

    /// Get daily aggregated consumption for a user over the last N days.
    pub async fn daily_aggregates_by_user(
        pool: &PgPool,
        user_id: DbId,
        days: i32,
    ) -> Result<Vec<DailyConsumption>, sqlx::Error> {
        sqlx::query_as::<_, DailyConsumption>(
            "SELECT recorded_at::date AS day, \
                    COALESCE(SUM(gpu_hours), 0.0) AS total_gpu_hours \
             FROM budget_consumption_ledger \
             WHERE user_id = $1 \
               AND recorded_at >= NOW() - ($2 || ' days')::interval \
               AND is_exempt = false \
             GROUP BY recorded_at::date \
             ORDER BY day ASC",
        )
        .bind(user_id)
        .bind(days)
        .fetch_all(pool)
        .await
    }
}

// ===========================================================================
// BudgetExemptionRepo
// ===========================================================================

/// CRUD operations for the `budget_exemptions` table.
pub struct BudgetExemptionRepo;

impl BudgetExemptionRepo {
    /// List all enabled exemption rules.
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<BudgetExemption>, sqlx::Error> {
        let query = format!(
            "SELECT {EXEMPTION_COLUMNS} FROM budget_exemptions \
             WHERE is_enabled = true \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, BudgetExemption>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find an exemption by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<BudgetExemption>, sqlx::Error> {
        let query = format!("SELECT {EXEMPTION_COLUMNS} FROM budget_exemptions WHERE id = $1");
        sqlx::query_as::<_, BudgetExemption>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new exemption, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateBudgetExemption,
        created_by: DbId,
    ) -> Result<BudgetExemption, sqlx::Error> {
        let query = format!(
            "INSERT INTO budget_exemptions \
                (name, description, job_type, resolution_tier, created_by) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {EXEMPTION_COLUMNS}"
        );
        sqlx::query_as::<_, BudgetExemption>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.job_type)
            .bind(&input.resolution_tier)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Update an exemption. Returns the updated row, or `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateBudgetExemption,
    ) -> Result<Option<BudgetExemption>, sqlx::Error> {
        let query = format!(
            "UPDATE budget_exemptions SET \
                name            = COALESCE($1, name), \
                description     = COALESCE($2, description), \
                job_type        = COALESCE($3, job_type), \
                resolution_tier = COALESCE($4, resolution_tier), \
                is_enabled      = COALESCE($5, is_enabled) \
             WHERE id = $6 \
             RETURNING {EXEMPTION_COLUMNS}"
        );
        sqlx::query_as::<_, BudgetExemption>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.job_type)
            .bind(&input.resolution_tier)
            .bind(input.is_enabled)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete an exemption. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM budget_exemptions WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all exemptions (enabled and disabled) with pagination.
    pub async fn list_all(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<BudgetExemption>, sqlx::Error> {
        let limit_val = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset_val = clamp_offset(offset);
        let query = format!(
            "SELECT {EXEMPTION_COLUMNS} FROM budget_exemptions \
             ORDER BY name ASC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, BudgetExemption>(&query)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }
}
