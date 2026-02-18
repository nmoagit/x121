# Task List: Queue Management & Job Scheduling

**PRD Reference:** `design/prds/008-prd-queue-management-job-scheduling.md`
**Scope:** Implement priority-based job ordering, job lifecycle state machine, fair scheduling with GPU quotas, time-based scheduling, off-peak policies, and queue visibility on top of the PRD-007 execution engine.

## Overview

This PRD extends the job execution engine (PRD-007) with intelligent scheduling. We add priority tiers (Urgent/Normal/Background), a strict state machine for job lifecycle transitions, per-user GPU time quotas, scheduled job submission (start_after), and off-peak policies. The scheduler replaces the simple dispatcher from PRD-007 with a policy-aware version that respects priorities, quotas, and time windows. The frontend gets a queue view with estimated wait times and drag-and-drop reordering for admins.

### What Already Exists
- PRD-000: `job_statuses` lookup table
- PRD-007: `jobs` table with `priority`, `status_id`, `claimed_at`, `worker_id`; `JobRepo` with `claim_next`; background dispatcher
- PRD-002: Axum server, WebSocket infrastructure
- PRD-003: Auth/RBAC middleware

### What We're Building
1. Database migrations: extend `jobs` table, create `scheduling_policies`, `gpu_quotas`, `job_state_transitions`
2. Job state machine with validated transitions
3. Enhanced scheduler that respects priorities, quotas, and schedules
4. Scheduled job trigger service
5. Off-peak policy engine
6. Queue status and estimated wait time API
7. Admin queue management endpoints (reorder, pause, resume)
8. Frontend queue view

### Key Design Decisions
1. **Three priority tiers** — Urgent (10), Normal (0), Background (-10). Numeric values allow future fine-grained priority without schema changes.
2. **State machine in Rust** — Transitions are validated in the repository layer. Invalid transitions return errors, never silently succeed.
3. **Quota tracking as materialized view** — GPU time consumed per user is tracked by summing `actual_duration_secs` from completed jobs. A background task refreshes this periodically.
4. **Scheduler replaces dispatcher** — The PRD-007 dispatcher's `try_dispatch` is replaced by a scheduler-aware version that checks quotas and time windows before dispatching.

---

## Phase 1: Database Schema Extensions

### Task 1.1: Extend Jobs Table
**File:** `migrations/20260218700001_extend_jobs_table.sql`

```sql
-- Add scheduling columns to jobs table
ALTER TABLE jobs ADD COLUMN scheduled_start_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN is_off_peak_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN resumed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN queue_position INTEGER;

-- Update job_statuses with additional states
INSERT INTO job_statuses (name, description) VALUES
    ('scheduled', 'Job is waiting for its scheduled start time'),
    ('paused', 'Job has been paused by user or admin'),
    ('dispatched', 'Job has been assigned to a worker but not yet started');
```

**Acceptance Criteria:**
- [ ] `scheduled_start_at TIMESTAMPTZ` for deferred jobs
- [ ] `is_off_peak_only BOOLEAN` for off-peak-only jobs
- [ ] `is_paused BOOLEAN` with `paused_at`/`resumed_at` timestamps
- [ ] New job statuses seeded: scheduled, paused, dispatched
- [ ] Migration applies cleanly on top of PRD-007 schema

### Task 1.2: Create Scheduling Policies Table
**File:** `migrations/20260218700002_create_scheduling_policies_table.sql`

```sql
CREATE TABLE scheduling_policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    policy_type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON scheduling_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Default off-peak policy
INSERT INTO scheduling_policies (name, policy_type, config) VALUES
    ('default_off_peak', 'off_peak', '{"start_hour": 22, "end_hour": 8, "timezone": "UTC"}');
```

**Acceptance Criteria:**
- [ ] Flexible policy storage with JSONB config
- [ ] `policy_type` distinguishes off_peak, quota, fair_share, etc.
- [ ] Default off-peak policy seeded (10pm-8am UTC)
- [ ] Policies can be enabled/disabled

### Task 1.3: Create GPU Quotas Table
**File:** `migrations/20260218700003_create_gpu_quotas_table.sql`

```sql
CREATE TABLE gpu_quotas (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    daily_limit_secs INTEGER,
    weekly_limit_secs INTEGER,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gpu_quotas_user_id ON gpu_quotas(user_id);
CREATE INDEX idx_gpu_quotas_project_id ON gpu_quotas(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON gpu_quotas
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Per-user and/or per-project GPU time quotas
- [ ] `daily_limit_secs` and `weekly_limit_secs` (both optional)
- [ ] `user_id` and `project_id` are optional (either or both can be set)
- [ ] FK indexes on both columns

### Task 1.4: Create Job State Transitions Log
**File:** `migrations/20260218700004_create_job_state_transitions_table.sql`

```sql
CREATE TABLE job_state_transitions (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    from_status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    to_status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    triggered_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    reason TEXT,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_state_transitions_job_id ON job_state_transitions(job_id);
```

**Acceptance Criteria:**
- [ ] Logs every state transition with from/to status and timestamp
- [ ] `triggered_by` tracks who caused the transition (NULL for system-triggered)
- [ ] `reason` for admin-initiated transitions (e.g., "Reordered by admin")
- [ ] FK index on `job_id`
- [ ] No `updated_at` trigger (append-only log)

---

## Phase 2: Job State Machine

### Task 2.1: State Machine Definition
**File:** `src/engine/state_machine.rs`

```rust
use crate::types::DbId;

/// Job status IDs matching seed data
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i64)]
pub enum JobState {
    Pending = 1,
    Running = 2,
    Completed = 3,
    Failed = 4,
    Cancelled = 5,
    Retrying = 6,
    Scheduled = 7,
    Paused = 8,
    Dispatched = 9,
}

impl JobState {
    pub fn id(&self) -> DbId {
        *self as DbId
    }

    pub fn from_id(id: DbId) -> Option<Self> {
        match id {
            1 => Some(Self::Pending),
            2 => Some(Self::Running),
            3 => Some(Self::Completed),
            4 => Some(Self::Failed),
            5 => Some(Self::Cancelled),
            6 => Some(Self::Retrying),
            7 => Some(Self::Scheduled),
            8 => Some(Self::Paused),
            9 => Some(Self::Dispatched),
            _ => None,
        }
    }

    /// Returns valid transitions FROM this state
    pub fn valid_transitions(&self) -> &[JobState] {
        match self {
            Self::Scheduled => &[Self::Pending, Self::Cancelled],
            Self::Pending => &[Self::Dispatched, Self::Paused, Self::Cancelled],
            Self::Dispatched => &[Self::Running, Self::Failed, Self::Cancelled],
            Self::Running => &[Self::Completed, Self::Failed, Self::Cancelled, Self::Paused],
            Self::Paused => &[Self::Pending, Self::Cancelled],
            Self::Completed => &[],
            Self::Failed => &[],
            Self::Cancelled => &[],
            Self::Retrying => &[Self::Pending],
        }
    }

    pub fn can_transition_to(&self, target: JobState) -> bool {
        self.valid_transitions().contains(&target)
    }
}

pub fn validate_transition(from: DbId, to: DbId) -> Result<(), String> {
    let from_state = JobState::from_id(from).ok_or("Invalid from state")?;
    let to_state = JobState::from_id(to).ok_or("Invalid to state")?;
    if from_state.can_transition_to(to_state) {
        Ok(())
    } else {
        Err(format!("Invalid transition: {:?} -> {:?}", from_state, to_state))
    }
}
```

**Acceptance Criteria:**
- [ ] All 9 states defined with their status IDs
- [ ] `valid_transitions()` returns allowed next states for each state
- [ ] Terminal states (Completed, Failed, Cancelled) have no transitions
- [ ] `validate_transition()` returns error for invalid transitions
- [ ] Unit tests for all valid and invalid transitions

### Task 2.2: State Transition Repository
**File:** `src/repositories/job_repo.rs` (extend)

```rust
impl JobRepo {
    pub async fn transition_state(
        pool: &PgPool,
        job_id: DbId,
        to_status_id: DbId,
        triggered_by: Option<DbId>,
        reason: Option<&str>,
    ) -> Result<Job, AppError> {
        // 1. Get current status
        let job = Self::find_by_id(pool, job_id).await?
            .ok_or(AppError::NotFound("Job not found".to_string()))?;

        // 2. Validate transition
        validate_transition(job.status_id, to_status_id)
            .map_err(|e| AppError::BadRequest(e))?;

        // 3. Update job status
        let updated = sqlx::query_as::<_, Job>(
            "UPDATE jobs SET status_id = $2 WHERE id = $1 RETURNING *"
        )
        .bind(job_id)
        .bind(to_status_id)
        .fetch_one(pool)
        .await?;

        // 4. Log transition
        sqlx::query(
            "INSERT INTO job_state_transitions (job_id, from_status_id, to_status_id, triggered_by, reason)
             VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(job_id)
        .bind(job.status_id)
        .bind(to_status_id)
        .bind(triggered_by)
        .bind(reason)
        .execute(pool)
        .await?;

        Ok(updated)
    }
}
```

**Acceptance Criteria:**
- [ ] All state changes go through `transition_state` (no direct status updates)
- [ ] Invalid transitions return 400 Bad Request
- [ ] Every transition is logged in `job_state_transitions`
- [ ] `triggered_by` is NULL for system transitions, user ID for manual

---

## Phase 3: Enhanced Scheduler

### Task 3.1: Priority-Aware Scheduler
**File:** `src/engine/scheduler.rs`

```rust
pub struct JobScheduler {
    pool: PgPool,
    comfyui_manager: Arc<ComfyUIManager>,
    poll_interval: Duration,
}

impl JobScheduler {
    pub async fn run(&self, cancel_token: CancellationToken) {
        let mut ticker = interval(self.poll_interval);
        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = ticker.tick() => {
                    self.tick_scheduled_jobs().await;
                    self.tick_dispatch().await;
                }
            }
        }
    }

    /// Move scheduled jobs to pending when their start time arrives
    async fn tick_scheduled_jobs(&self) {
        sqlx::query(
            "UPDATE jobs SET status_id = 1
             WHERE status_id = 7 AND scheduled_start_at <= NOW()"
        )
        .execute(&self.pool)
        .await
        .ok();
    }

    /// Dispatch pending jobs to available workers
    async fn tick_dispatch(&self) {
        let available = self.available_workers().await;
        for worker_id in available {
            if let Ok(Some(job)) = self.claim_next_eligible(worker_id).await {
                self.dispatch_to_worker(job, worker_id).await;
            }
        }
    }

    /// Claim next eligible job, respecting priority, quotas, and off-peak rules
    async fn claim_next_eligible(&self, worker_id: DbId) -> Result<Option<Job>, sqlx::Error> {
        let now_hour = Utc::now().hour();
        let is_off_peak = self.is_off_peak_hours(now_hour).await;

        // Build query:
        // 1. Pending (status_id = 1) and not paused
        // 2. Not quota-exceeded for the submitting user
        // 3. Off-peak-only jobs only dispatched during off-peak hours
        // 4. Ordered by priority DESC, submitted_at ASC
        sqlx::query_as::<_, Job>(
            "UPDATE jobs SET worker_id = $1, claimed_at = NOW(), status_id = 9
             WHERE id = (
                SELECT j.id FROM jobs j
                WHERE j.status_id = 1
                  AND j.is_paused = false
                  AND (j.is_off_peak_only = false OR $2 = true)
                ORDER BY j.priority DESC, j.submitted_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
             )
             RETURNING *"
        )
        .bind(worker_id)
        .bind(is_off_peak)
        .fetch_optional(&self.pool)
        .await
    }
}
```

**Acceptance Criteria:**
- [ ] Scheduled jobs auto-transition to pending at their `scheduled_start_at`
- [ ] Priority ordering: Urgent (10) > Normal (0) > Background (-10)
- [ ] Off-peak-only jobs dispatched only during off-peak hours
- [ ] Paused jobs skipped
- [ ] Atomic claim with `FOR UPDATE SKIP LOCKED`
- [ ] Replaces the simple dispatcher from PRD-007

### Task 3.2: Quota Enforcement
**File:** `src/engine/quotas.rs`

```rust
pub async fn check_user_quota(pool: &PgPool, user_id: DbId) -> Result<QuotaStatus, sqlx::Error> {
    // Get user's quota
    let quota = sqlx::query_as::<_, GpuQuota>(
        "SELECT * FROM gpu_quotas WHERE user_id = $1 AND is_enabled = true"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(quota) = quota else {
        return Ok(QuotaStatus::NoQuota); // No quota = unlimited
    };

    // Sum actual_duration_secs for today
    let today_used: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(actual_duration_secs), 0) FROM jobs
         WHERE submitted_by = $1
           AND completed_at >= CURRENT_DATE
           AND status_id = 3"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if let Some(daily_limit) = quota.daily_limit_secs {
        if today_used >= daily_limit as i64 {
            return Ok(QuotaStatus::Exceeded { used: today_used, limit: daily_limit as i64 });
        }
    }

    Ok(QuotaStatus::WithinLimits { used: today_used, limit: quota.daily_limit_secs.map(|l| l as i64) })
}

pub enum QuotaStatus {
    NoQuota,
    WithinLimits { used: i64, limit: Option<i64> },
    Exceeded { used: i64, limit: i64 },
}
```

**Acceptance Criteria:**
- [ ] Sums `actual_duration_secs` for completed jobs today/this week
- [ ] Compares against daily/weekly limits
- [ ] Returns quota status: no quota, within limits, or exceeded
- [ ] Users with no quota record have unlimited GPU time
- [ ] Quota check called by scheduler before dispatching

### Task 3.3: Off-Peak Policy
**File:** `src/engine/scheduler.rs` (extend)

```rust
impl JobScheduler {
    async fn is_off_peak_hours(&self, current_hour: u32) -> bool {
        // Load off-peak policy from scheduling_policies table
        let policy = sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT config FROM scheduling_policies
             WHERE policy_type = 'off_peak' AND is_enabled = true LIMIT 1"
        )
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten();

        match policy {
            Some(config) => {
                let start = config["start_hour"].as_u64().unwrap_or(22) as u32;
                let end = config["end_hour"].as_u64().unwrap_or(8) as u32;
                if start > end {
                    // Wraps midnight: 22-8 means 22,23,0,1,2,3,4,5,6,7
                    current_hour >= start || current_hour < end
                } else {
                    current_hour >= start && current_hour < end
                }
            }
            None => false,
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Off-peak hours loaded from `scheduling_policies` table
- [ ] Handles midnight wrap-around (e.g., 22:00-08:00)
- [ ] Returns `false` (not off-peak) if no policy is configured
- [ ] Policy is configurable without code changes

---

## Phase 4: Queue Management API

### Task 4.1: Queue Status Endpoint
**File:** `src/api/handlers/queue.rs`

```rust
#[derive(Serialize)]
pub struct QueueStatus {
    pub total_queued: i64,
    pub total_running: i64,
    pub total_scheduled: i64,
    pub jobs: Vec<QueuedJob>,
    pub estimated_wait_secs: Option<i64>,
}

#[derive(Serialize)]
pub struct QueuedJob {
    pub job_id: DbId,
    pub job_type: String,
    pub priority: i32,
    pub submitted_by: DbId,
    pub submitted_at: DateTime<Utc>,
    pub queue_position: i32,
    pub estimated_start_at: Option<DateTime<Utc>>,
}

pub async fn get_queue_status(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<QueueStatus>, AppError> {
    // Query pending jobs ordered by priority/submitted_at
    // Calculate estimated wait based on average job duration and available workers
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/queue` — returns queue state with counts and ordered job list
- [ ] Each queued job shows position and estimated start time
- [ ] Estimated wait calculated from average job duration and worker count
- [ ] Authenticated users see all queued jobs; filtering by own jobs is optional

### Task 4.2: Job Pause/Resume Endpoints
**File:** `src/api/handlers/queue.rs`

```rust
pub async fn pause_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> Result<Json<Job>, AppError> {
    let job = JobRepo::transition_state(
        &state.pool, job_id,
        JobState::Paused.id(),
        Some(auth.user_id),
        Some("Paused by user"),
    ).await?;
    Ok(Json(job))
}

pub async fn resume_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> Result<Json<Job>, AppError> {
    let job = JobRepo::transition_state(
        &state.pool, job_id,
        JobState::Pending.id(),
        Some(auth.user_id),
        Some("Resumed by user"),
    ).await?;
    Ok(Json(job))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/jobs/:id/pause` — pause a pending or running job
- [ ] `POST /api/v1/jobs/:id/resume` — resume a paused job (back to pending)
- [ ] State transitions validated (only valid transitions succeed)
- [ ] Transitions logged in `job_state_transitions`

### Task 4.3: Admin Queue Reordering
**File:** `src/api/handlers/queue.rs`

```rust
#[derive(Deserialize)]
pub struct ReorderRequest {
    pub job_id: DbId,
    pub new_priority: i32,
}

pub async fn reorder_queue(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<ReorderRequest>,
) -> Result<Json<Job>, AppError> {
    let job = sqlx::query_as::<_, Job>(
        "UPDATE jobs SET priority = $2 WHERE id = $1 RETURNING *"
    )
    .bind(input.job_id)
    .bind(input.new_priority)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(job))
}
```

**Acceptance Criteria:**
- [ ] `PUT /api/v1/admin/queue/reorder` — change job priority (admin only)
- [ ] New priority takes effect on next scheduler tick
- [ ] Transition logged with admin's user ID

### Task 4.4: Quota Management API
**File:** `src/api/handlers/queue.rs`

```rust
pub async fn set_user_quota(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
    Path(user_id): Path<DbId>,
    Json(input): Json<SetQuotaRequest>,
) -> Result<Json<GpuQuota>, AppError> { ... }

pub async fn get_user_quota_status(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<QuotaStatus>, AppError> { ... }
```

**Acceptance Criteria:**
- [ ] `PUT /api/v1/admin/users/:id/quota` — set user quota (admin only)
- [ ] `GET /api/v1/quota/status` — get current user's quota usage
- [ ] Shows used time, remaining time, and quota limits
- [ ] Warning threshold at 80% of quota

### Task 4.5: Register Queue Routes
**File:** `src/api/routes.rs` (update)

**Acceptance Criteria:**
- [ ] Queue routes under `/api/v1/queue`
- [ ] Admin routes under `/api/v1/admin/queue`
- [ ] Quota routes under `/api/v1/quota` and `/api/v1/admin/users/:id/quota`

---

## Phase 5: Frontend Queue View

### Task 5.1: Queue Status Page
**File:** `frontend/src/pages/QueuePage.tsx`

**Acceptance Criteria:**
- [ ] Shows ordered list of queued jobs with position, priority, estimated start
- [ ] Color-coded priority indicators (Urgent=red, Normal=blue, Background=gray)
- [ ] Auto-refreshes via WebSocket events
- [ ] Pause/Resume buttons per job

### Task 5.2: Admin Queue Controls
**File:** `frontend/src/pages/admin/QueueManagement.tsx`

**Acceptance Criteria:**
- [ ] Drag-and-drop reordering of queued jobs
- [ ] Priority change dropdown per job
- [ ] Quota management interface per user
- [ ] Queue statistics summary (total queued, avg wait, running count)

---

## Phase 6: Integration Tests

### Task 6.1: State Machine Tests
**File:** `src/engine/state_machine.rs` (test module)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_pending_to_dispatched() {
        assert!(validate_transition(JobState::Pending.id(), JobState::Dispatched.id()).is_ok());
    }

    #[test]
    fn test_invalid_completed_to_running() {
        assert!(validate_transition(JobState::Completed.id(), JobState::Running.id()).is_err());
    }

    #[test]
    fn test_terminal_states_have_no_transitions() {
        assert!(JobState::Completed.valid_transitions().is_empty());
        assert!(JobState::Failed.valid_transitions().is_empty());
        assert!(JobState::Cancelled.valid_transitions().is_empty());
    }
}
```

**Acceptance Criteria:**
- [ ] Test all valid transitions
- [ ] Test all invalid transitions from terminal states
- [ ] Test `from_id` mapping correctness

### Task 6.2: Scheduler Tests
**File:** `tests/scheduler_tests.rs`

**Acceptance Criteria:**
- [ ] Test: urgent jobs dispatched before normal jobs
- [ ] Test: off-peak-only jobs skip during peak hours
- [ ] Test: paused jobs are skipped by scheduler
- [ ] Test: scheduled jobs transition to pending at start time
- [ ] Test: quota-exceeded users' jobs are held
- [ ] Test: fair scheduling with multiple users

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218700001_extend_jobs_table.sql` | Scheduling columns on jobs |
| `migrations/20260218700002_create_scheduling_policies_table.sql` | Policy configuration |
| `migrations/20260218700003_create_gpu_quotas_table.sql` | Per-user/project quotas |
| `migrations/20260218700004_create_job_state_transitions_table.sql` | State transition log |
| `src/engine/state_machine.rs` | Job state enum and transition validation |
| `src/engine/scheduler.rs` | Priority-aware job scheduler |
| `src/engine/quotas.rs` | GPU quota checking |
| `src/api/handlers/queue.rs` | Queue management API handlers |
| `src/repositories/quota_repo.rs` | Quota CRUD |
| `src/repositories/policy_repo.rs` | Scheduling policy CRUD |
| `frontend/src/pages/QueuePage.tsx` | Queue status page |
| `frontend/src/pages/admin/QueueManagement.tsx` | Admin queue controls |

---

## Dependencies

### Existing Components to Reuse
- PRD-007: `jobs` table, `JobRepo`, dispatcher pattern, `job_statuses` lookup
- PRD-002: Axum server, WebSocket for real-time queue updates
- PRD-003: `RequireAdmin`, `AuthUser` extractors
- PRD-005: `ComfyUIManager` for dispatch

### New Infrastructure Needed
- No new Rust crates needed
- Frontend drag-and-drop library (react-dnd or dnd-kit)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.4
2. Phase 2: Job State Machine — Tasks 2.1–2.2
3. Phase 3: Enhanced Scheduler — Tasks 3.1, 3.3
4. Phase 4: Queue API — Tasks 4.1–4.2, 4.5

**MVP Success Criteria:**
- Priority-based ordering works (urgent > normal > background)
- State machine prevents invalid transitions
- Off-peak-only jobs respect configured hours
- Queue status shows position and estimated wait
- Pause/resume works with state validation

### Post-MVP Enhancements
1. Phase 3: Quota Enforcement — Task 3.2
2. Phase 4: Admin/Quota APIs — Tasks 4.3–4.4
3. Phase 5: Frontend Queue View — Tasks 5.1–5.2
4. Phase 6: Integration Tests — Tasks 6.1–6.2

---

## Notes

1. **Scheduler replaces dispatcher:** The PRD-007 dispatcher should be refactored to use this scheduler. The scheduler is a superset of the dispatcher — it does everything the dispatcher does plus priority, quotas, and time windows.
2. **Priority values:** Using numeric values (10, 0, -10) rather than enums allows admin reordering within a tier. A job set to priority 5 sits between urgent and normal.
3. **Estimated wait time:** Calculation is approximate: (queue_position * average_job_duration) / available_workers. This gets more accurate as the system collects historical data.
4. **Quota reset:** Daily quotas reset at midnight UTC. Weekly quotas reset on Monday midnight. The timezone for reset is configurable in the scheduling policy.
5. **State transition log:** This table grows over the lifetime of all jobs. Consider periodic archival of transitions for completed/cancelled jobs older than 90 days.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
