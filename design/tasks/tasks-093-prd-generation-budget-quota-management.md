# Task List: Generation Budget & Quota Management

**PRD Reference:** `design/prds/093-prd-generation-budget-quota-management.md`
**Scope:** Implement per-project GPU hour budgets and per-user quotas with warning thresholds, hard limits, budget exemptions, trend projections, and a budget dashboard.

## Overview

PRD-61 estimates cost before submission, but estimates are informational -- they don't enforce limits. Without budgets, a batch submission of 160 scenes can consume all available GPU time for days, blocking other projects. This feature implements per-project and per-user GPU hour budgets with configurable warning thresholds and hard limits, turning cost awareness from "FYI" into enforceable policy. Budget exemptions allow regression tests and draft-resolution jobs to run without counting against quotas.

### What Already Exists
- PRD-08 Queue Management for job submission
- PRD-10 Event Bus for threshold notifications
- PRD-57 Batch Orchestrator for batch submissions
- PRD-61 Cost & Resource Estimation for GPU hour estimates

### What We're Building
1. Database tables for project budgets, user quotas, and consumption ledger
2. Rust budget enforcement service with threshold alerting
3. Quota tracking with scheduled resets
4. Budget exemption configuration
5. Trend projection engine
6. API endpoints for budget and quota management
7. React budget dashboard

### Key Design Decisions
1. **Ledger-based tracking** -- Every GPU hour consumed is logged as a ledger entry, enabling accurate rollback and audit. No running counters that can drift.
2. **Pre-submission check** -- Budget is checked before queuing, not at dispatch. This prevents jobs from sitting in queue only to be rejected.
3. **In-progress jobs always complete** -- Hard limits block new submissions but never kill running jobs. This prevents wasted GPU time from partial runs.
4. **Exemptions are per job type** -- Exempt jobs are tracked separately for visibility but excluded from budget calculations.

---

## Phase 1: Database Schema

### Task 1.1: Project Budgets Table
**File:** `migrations/YYYYMMDDHHMMSS_create_project_budgets.sql`

```sql
CREATE TABLE project_budgets (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    budget_gpu_hours REAL NOT NULL,
    consumed_gpu_hours REAL NOT NULL DEFAULT 0,
    period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'monthly', 'unlimited')),
    period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    warning_threshold_pct REAL NOT NULL DEFAULT 75.0,
    critical_threshold_pct REAL NOT NULL DEFAULT 90.0,
    hard_limit_enabled BOOLEAN NOT NULL DEFAULT true,
    rollover_enabled BOOLEAN NOT NULL DEFAULT false,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_project_budgets_project_id ON project_budgets(project_id);
CREATE INDEX idx_project_budgets_created_by ON project_budgets(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_budgets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One budget per project (unique constraint)
- [ ] Configurable period type: weekly, monthly, or unlimited
- [ ] Warning and critical thresholds as percentages
- [ ] Hard limit toggle for blocking vs. warning-only mode
- [ ] Rollover flag for unused budget carryover

### Task 1.2: User Quotas Table
**File:** `migrations/YYYYMMDDHHMMSS_create_user_quotas.sql`

```sql
CREATE TABLE user_quotas (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    quota_gpu_hours REAL NOT NULL,
    consumed_gpu_hours REAL NOT NULL DEFAULT 0,
    period_type TEXT NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly')),
    period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    hard_limit_enabled BOOLEAN NOT NULL DEFAULT false,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_quotas_user_id ON user_quotas(user_id);
CREATE INDEX idx_user_quotas_created_by ON user_quotas(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_quotas
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One quota per user (unique constraint)
- [ ] Daily or weekly reset period
- [ ] Hard limit toggle (default off -- quotas are advisory by default)
- [ ] Consumed hours tracked and reset on schedule

### Task 1.3: Budget Consumption Ledger Table
**File:** `migrations/YYYYMMDDHHMMSS_create_budget_consumption_ledger.sql`

```sql
CREATE TABLE budget_consumption_ledger (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    gpu_hours REAL NOT NULL,
    is_exempt BOOLEAN NOT NULL DEFAULT false,
    exemption_reason TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_consumption_ledger_project_id ON budget_consumption_ledger(project_id);
CREATE INDEX idx_budget_consumption_ledger_user_id ON budget_consumption_ledger(user_id);
CREATE INDEX idx_budget_consumption_ledger_job_id ON budget_consumption_ledger(job_id);
CREATE INDEX idx_budget_consumption_ledger_recorded_at ON budget_consumption_ledger(recorded_at);
```

**Acceptance Criteria:**
- [ ] Every GPU hour consumed is a ledger entry
- [ ] Exempt jobs flagged with reason
- [ ] No `updated_at` -- ledger entries are append-only
- [ ] Indexed by project, user, job, and time for efficient queries

### Task 1.4: Budget Exemptions Table
**File:** `migrations/YYYYMMDDHHMMSS_create_budget_exemptions.sql`

```sql
CREATE TABLE budget_exemptions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    job_type_filter TEXT NOT NULL,            -- e.g., 'regression_test', 'draft_resolution'
    resolution_tier_filter TEXT,              -- e.g., 'draft' (NULL = all resolutions)
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_budget_exemptions_name ON budget_exemptions(name);
CREATE INDEX idx_budget_exemptions_created_by ON budget_exemptions(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON budget_exemptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Named exemptions for admin clarity
- [ ] Filter by job type and optional resolution tier
- [ ] Enable/disable without deleting
- [ ] Unique name constraint

---

## Phase 2: Rust Backend

### Task 2.1: Budget Enforcement Service
**File:** `src/services/budget/enforcement.rs`

Check budget availability before job submission.

```rust
pub struct BudgetEnforcement {
    pool: PgPool,
}

pub enum BudgetCheckResult {
    Allowed,
    Warning { message: String, consumed_pct: f32 },
    Blocked { message: String, consumed_pct: f32 },
    NoBudget,  // no budget configured for this project
}

impl BudgetEnforcement {
    pub async fn check_project_budget(
        &self,
        project_id: DbId,
        estimated_gpu_hours: f32,
    ) -> Result<BudgetCheckResult, BudgetError> {
        // 1. Get project budget
        // 2. Sum ledger entries for current period (excluding exempt)
        // 3. Check if adding estimated hours exceeds limit
        // 4. Return Allowed, Warning, or Blocked
    }

    pub async fn check_user_quota(
        &self,
        user_id: DbId,
        estimated_gpu_hours: f32,
    ) -> Result<BudgetCheckResult, BudgetError> {
        // 1. Get user quota
        // 2. Sum ledger entries for current period
        // 3. Check against quota
    }

    pub async fn record_consumption(
        &self,
        project_id: DbId,
        user_id: DbId,
        job_id: DbId,
        gpu_hours: f32,
        is_exempt: bool,
        exemption_reason: Option<String>,
    ) -> Result<(), BudgetError> {
        // Insert ledger entry and update running totals
    }
}
```

**Acceptance Criteria:**
- [ ] Pre-submission check returns Allowed, Warning, or Blocked
- [ ] Budget calculated from ledger entries for the current period
- [ ] Exempt jobs excluded from budget calculation
- [ ] In-progress jobs are never killed by budget limits
- [ ] Budget check adds <50ms to submission flow

### Task 2.2: Threshold Alerting Service
**File:** `src/services/budget/threshold_alerter.rs`

Fire notifications when budget thresholds are breached.

**Acceptance Criteria:**
- [ ] Warning at configurable threshold (default 75%)
- [ ] Critical at configurable threshold (default 90%)
- [ ] Notifications delivered via PRD-10 Event Bus
- [ ] Each threshold fires once per period (no spam)
- [ ] Threshold breach events include consumption details and remaining budget

### Task 2.3: Exemption Evaluator
**File:** `src/services/budget/exemption_evaluator.rs`

Determine if a job qualifies for budget exemption.

```rust
pub struct ExemptionEvaluator {
    pool: PgPool,
}

impl ExemptionEvaluator {
    pub async fn is_exempt(
        &self,
        job_type: &str,
        resolution_tier: Option<&str>,
    ) -> Result<Option<String>, BudgetError> {
        // Check against budget_exemptions table
        // Return exemption reason if exempt, None otherwise
    }
}
```

**Acceptance Criteria:**
- [ ] Matches job type against configured exemptions
- [ ] Resolution tier filter applied when present
- [ ] Returns exemption reason for ledger logging
- [ ] Disabled exemptions are ignored

### Task 2.4: Quota Reset Service
**File:** `src/services/budget/quota_reset.rs`

Reset consumption counters on schedule.

**Acceptance Criteria:**
- [ ] Daily quotas reset at midnight in the user's configured timezone
- [ ] Weekly quotas reset on Monday at midnight
- [ ] Monthly project budgets reset on the first of the month
- [ ] Rollover: if enabled, unused hours carry forward to next period
- [ ] Reset creates a summary record for historical tracking

### Task 2.5: Trend Projection Engine
**File:** `src/services/budget/trend_projector.rs`

Project when budgets will be exhausted at current consumption rates.

```rust
pub struct TrendProjection {
    pub days_until_exhaustion: Option<f64>,
    pub projected_end_date: Option<chrono::NaiveDate>,
    pub daily_avg_consumption: f64,
    pub consumption_trend: String,          // "increasing", "stable", "decreasing"
}
```

**Acceptance Criteria:**
- [ ] Calculates daily average from last 7 days of consumption
- [ ] Projects exhaustion date: "Budget will be exhausted in N days"
- [ ] Identifies trend direction from linear regression over last 14 days
- [ ] Returns None for projects with no recent consumption

---

## Phase 3: API Endpoints

### Task 3.1: Budget CRUD Routes
**File:** `src/routes/budgets.rs`

```
GET    /admin/budgets                     -- List all project budgets
GET    /admin/budgets/:project_id         -- Get budget for a project
PUT    /admin/budgets/:project_id         -- Set or update project budget
DELETE /admin/budgets/:project_id         -- Remove budget (no limits)
```

**Acceptance Criteria:**
- [ ] Admin-only access
- [ ] Set budget with GPU hours, period, thresholds, and hard limit flag
- [ ] Returns current consumption alongside budget
- [ ] Delete removes budget enforcement (jobs are no longer limited)

### Task 3.2: Quota CRUD Routes
**File:** `src/routes/budgets.rs`

```
GET    /admin/quotas                      -- List all user quotas
GET    /admin/quotas/:user_id             -- Get quota for a user
PUT    /admin/quotas/:user_id             -- Set or update user quota
DELETE /admin/quotas/:user_id             -- Remove quota
```

**Acceptance Criteria:**
- [ ] Admin-only access
- [ ] Set quota with GPU hours, period type, and hard limit flag
- [ ] Returns current consumption alongside quota

### Task 3.3: Budget Status Routes (User-Facing)
**File:** `src/routes/budgets.rs`

```
GET /budgets/my-project/:project_id       -- Budget status for current user's project
GET /budgets/my-quota                     -- Current user's quota status
GET /budgets/check?project_id=X&estimated_hours=Y -- Pre-submission budget check
```

**Acceptance Criteria:**
- [ ] Available to all authenticated users (not admin-only)
- [ ] Returns consumed, remaining, percentage, and trend projection
- [ ] Pre-submission check returns Allowed/Warning/Blocked with message
- [ ] Shows exempt job consumption separately

### Task 3.4: Exemption Routes
**File:** `src/routes/budgets.rs`

```
GET    /admin/budget-exemptions           -- List exemptions
POST   /admin/budget-exemptions           -- Create exemption
PUT    /admin/budget-exemptions/:id       -- Update exemption
DELETE /admin/budget-exemptions/:id       -- Delete exemption
```

**Acceptance Criteria:**
- [ ] Admin-only access
- [ ] Create with name, job type filter, optional resolution tier filter
- [ ] Enable/disable without deleting

### Task 3.5: Consumption History Route
**File:** `src/routes/budgets.rs`

```
GET /admin/budgets/:project_id/history?period=30d -- Consumption history
GET /admin/quotas/:user_id/history?period=7d      -- User consumption history
```

**Acceptance Criteria:**
- [ ] Returns daily consumption aggregates for the requested period
- [ ] Includes exempt vs. non-exempt breakdown
- [ ] Supports period parameters: 7d, 30d, 90d

---

## Phase 4: React Frontend

### Task 4.1: Budget Dashboard
**File:** `frontend/src/components/budget/BudgetDashboard.tsx`

**Acceptance Criteria:**
- [ ] Per-project budget shown as progress bar with color coding (green/yellow/red)
- [ ] Trend projection: "At current rate, budget will be exhausted in N days"
- [ ] Consumption chart: daily GPU hours over the current period
- [ ] Exempt vs. non-exempt breakdown

### Task 4.2: Budget Admin Panel
**File:** `frontend/src/pages/BudgetAdmin.tsx`

**Acceptance Criteria:**
- [ ] List all projects with their budget status
- [ ] Create/edit budget: GPU hours, period, thresholds, hard limit toggle
- [ ] Per-user quota management: set daily/weekly quotas
- [ ] Exemption configuration: add/edit/disable exemptions
- [ ] Budget override: manually increase budget or allow jobs when blocked

### Task 4.3: Submission Budget Check Widget
**File:** `frontend/src/components/budget/SubmissionBudgetCheck.tsx`

Inline widget shown on the job submission form.

**Acceptance Criteria:**
- [ ] Displays budget remaining before submission
- [ ] Shows estimated cost of the current submission vs. remaining budget
- [ ] Warning state: yellow banner with threshold message
- [ ] Blocked state: red banner with "Contact Admin" message
- [ ] Exempt jobs show "This job is exempt from budget tracking"

### Task 4.4: Quota Status Widget
**File:** `frontend/src/components/budget/QuotaStatusWidget.tsx`

**Acceptance Criteria:**
- [ ] Shows current user's quota utilization as a progress bar
- [ ] Displays time until next reset ("Resets in 6h 12m")
- [ ] Available in the navigation bar or user menu

---

## Phase 5: Testing

### Task 5.1: Budget Enforcement Tests
**File:** `tests/budget_enforcement_test.rs`

**Acceptance Criteria:**
- [ ] Test budget check returns Allowed when under threshold
- [ ] Test budget check returns Warning at warning threshold
- [ ] Test budget check returns Blocked at 100% with hard limit enabled
- [ ] Test budget check returns Warning (not Blocked) when hard limit is disabled
- [ ] Test exempt jobs are excluded from budget calculation
- [ ] Test in-progress jobs are not affected by budget exhaustion

### Task 5.2: Quota and Reset Tests
**File:** `tests/budget_quota_test.rs`

**Acceptance Criteria:**
- [ ] Test daily quota resets consumption at midnight
- [ ] Test weekly quota resets on Monday
- [ ] Test monthly budget resets on the first of the month
- [ ] Test rollover carries unused hours when enabled
- [ ] Test no rollover when disabled (consumed resets to zero)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_project_budgets.sql` | Project budget table |
| `migrations/YYYYMMDDHHMMSS_create_user_quotas.sql` | User quota table |
| `migrations/YYYYMMDDHHMMSS_create_budget_consumption_ledger.sql` | Consumption ledger |
| `migrations/YYYYMMDDHHMMSS_create_budget_exemptions.sql` | Exemption configuration |
| `src/services/budget/enforcement.rs` | Budget check and enforcement |
| `src/services/budget/threshold_alerter.rs` | Threshold notifications |
| `src/services/budget/exemption_evaluator.rs` | Exemption matching |
| `src/services/budget/quota_reset.rs` | Scheduled quota resets |
| `src/services/budget/trend_projector.rs` | Trend projection engine |
| `src/routes/budgets.rs` | Budget and quota API endpoints |
| `frontend/src/components/budget/BudgetDashboard.tsx` | Budget visualization |
| `frontend/src/pages/BudgetAdmin.tsx` | Admin management page |
| `frontend/src/components/budget/SubmissionBudgetCheck.tsx` | Submission form widget |
| `frontend/src/components/budget/QuotaStatusWidget.tsx` | User quota display |

## Dependencies

### Upstream PRDs
- PRD-08: Queue Management, PRD-10: Event Bus, PRD-57: Batch Orchestrator, PRD-61: Cost Estimation

### Downstream PRDs
- PRD-73: Production Reporting (budget consumption data), PRD-97: Job Dependency Chains

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.4)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: API Endpoints (Tasks 3.1-3.5)

**MVP Success Criteria:**
- Budget consumption tracking accurate to within 1% of actual GPU hours
- Hard limits correctly block submissions at 100% consumption
- Warning notifications fire within 1 minute of threshold breach
- Exempt jobs correctly excluded from budget calculations

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Rollover & scheduled reset (PRD Requirement 2.1)

## Notes

1. **GPU hours vs. compute units** -- The open question about GPU hours vs. compute units: start with GPU hours as the simplest unit. Compute units (accounting for different GPU tiers) can be added as a multiplier later.
2. **Ledger vs. counters** -- The ledger-based approach is more expensive to query but more reliable than maintaining running counters. Counters can drift; the ledger is the source of truth. For performance, the `consumed_gpu_hours` column on the budget table acts as a cached counter, periodically reconciled with the ledger.
3. **Multi-project jobs** -- For jobs spanning multiple projects (open question), the current design attributes consumption to the project the job was submitted under. Cross-project allocation is deferred.
4. **Timezone handling** -- Quota resets use the admin's configured timezone for the instance. Daily resets happen at midnight in that timezone.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-093
