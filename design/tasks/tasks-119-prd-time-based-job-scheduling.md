# Task List: Time-Based Job Scheduling

**PRD Reference:** `design/prds/119-prd-time-based-job-scheduling.md`
**Scope:** Build a time-based job scheduling system with cron-style recurring schedules, one-time deferred runs, a calendar UI for visual planning, per-user timezone handling, off-peak smart slot selection, batch scheduling for production runs, and full schedule lifecycle management (create, edit, pause, resume, cancel, history).

## Overview

PRD-08 treats scheduling as a secondary concern -- a simple future `scheduled_start_at` timestamp on a job. This PRD extends that into a full scheduling system. Users can define one-time or recurring (cron) schedules targeting individual jobs or entire production runs (PRD-57). A background executor polls for due schedules and submits work through the existing job pipeline. A calendar UI provides visual planning, drag-to-reschedule, and timezone-aware display.

### What Already Exists
- `x121_db::models::job` -- `Job`, `SubmitJob`, `QueuedJobView` with `scheduled_start_at` and `is_off_peak_only` fields
- `x121_db::models::scheduling` -- `SchedulingPolicy`, `GpuQuota`, `JobStateTransition`, `QuotaStatus`
- `x121_db::repositories::scheduling_repo` -- `SchedulingPolicyRepo` with `find_active_off_peak` method
- `x121_db::repositories::job_repo` -- `JobRepo::create`, `JobRepo::list_queue`, `JobRepo::queue_counts`
- `x121_db::models::production_run` -- `ProductionRun`, `CreateProductionRun`, `SubmitCellsRequest`
- `x121_db::models::user` -- `User`, `UserResponse` (no timezone field yet)
- `x121_events::bus` -- `EventBus`, `PlatformEvent` with builder pattern (`with_source`, `with_actor`, `with_payload`)
- `x121_events::digest` -- `DigestScheduler` pattern for background periodic tasks with `CancellationToken`
- `x121_api::state::AppState` -- shared state with `pool`, `event_bus`, `config`
- `x121_api::handlers::queue` -- existing queue management handlers (PRD-08)
- `apps/frontend/src/features/queue/` -- existing queue UI
- `apps/frontend/src/features/job-tray/` -- job status tray (PRD-54)

### What We're Building
1. Database migrations: `schedule_statuses`, `schedules`, `schedule_execution_statuses`, `schedule_executions` tables, plus `schedule_id` FK on `jobs` and `timezone` column on `users`
2. `Schedule` and `ScheduleExecution` model structs with create/update DTOs
3. `ScheduleRepo` and `ScheduleExecutionRepo` repositories
4. Schedule management API (CRUD + lifecycle actions + calendar + history)
5. Schedule executor background service (polls for due schedules, submits jobs)
6. Off-peak smart slot selection logic
7. Per-user timezone handling (model update + API endpoint)
8. Calendar UI feature module with week/month views, drag-to-reschedule, color coding
9. Schedule creation form with one-time, recurring, and auto-off-peak paths
10. Integration tests for all new functionality

### Key Design Decisions
1. **Cron parsing in Rust** -- Use `croner` or `cron` crate for evaluating cron expressions and computing next occurrence times, with `chrono-tz` for IANA timezone handling.
2. **Executor follows DigestScheduler pattern** -- Background Tokio task using `tokio::time::interval` with `CancellationToken` for graceful shutdown.
3. **Row-level locking for multi-instance safety** -- `SELECT ... FOR UPDATE SKIP LOCKED` prevents duplicate schedule firings across API server instances.
4. **Status lookup tables** -- `schedule_statuses` and `schedule_execution_statuses` follow the project convention of status lookup tables with SMALLSERIAL PK.
5. **Jobs carry schedule reference** -- Nullable `schedule_id` FK on `jobs` table for traceability back to the originating schedule.
6. **Timestamps stored UTC** -- All `TIMESTAMPTZ` columns store UTC. The `timezone` field on schedules and users is purely for display and cron evaluation.
7. **Calendar data from expansion** -- The `/schedules/calendar` endpoint expands recurring schedules into individual occurrences within the requested date range.

---

## Phase 1: Database Migrations

### Task 1.1: Create `schedule_statuses` and `schedule_execution_statuses` lookup tables
**File:** `apps/db/migrations/20260225000001_create_schedule_statuses.sql`

Create the two status lookup tables for schedules and their execution log.

```sql
-- Schedule status lookup table (PRD-119)
CREATE TABLE schedule_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO schedule_statuses (name, label) VALUES
    ('active', 'Active'),
    ('paused', 'Paused'),
    ('completed', 'Completed'),
    ('disabled', 'Disabled');

-- Schedule execution status lookup table (PRD-119)
CREATE TABLE schedule_execution_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO schedule_execution_statuses (name, label) VALUES
    ('fired', 'Fired'),
    ('completed', 'Completed'),
    ('failed', 'Failed'),
    ('skipped', 'Skipped');
```

**Acceptance Criteria:**
- [ ] `schedule_statuses` table created with SMALLSERIAL PK, name UNIQUE, label
- [ ] Four status rows seeded: active (1), paused (2), completed (3), disabled (4)
- [ ] `schedule_execution_statuses` table created with same structure
- [ ] Four execution status rows seeded: fired (1), completed (2), failed (3), skipped (4)
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Create `schedules` table
**File:** `apps/db/migrations/20260225000002_create_schedules.sql`

Create the main schedules table with all PRD-119 Req 1.1 columns.

```sql
-- Schedules table (PRD-119 Req 1.1)
CREATE TABLE schedules (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    schedule_type   TEXT NOT NULL CHECK (schedule_type IN ('one_time', 'recurring')),
    cron_expression TEXT,                     -- NULL for one_time
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    run_at          TIMESTAMPTZ,              -- for one_time schedules
    next_run_at     TIMESTAMPTZ,              -- computed; NULL when disabled or completed
    last_run_at     TIMESTAMPTZ,
    priority        INTEGER NOT NULL DEFAULT 1, -- 0=urgent, 1=normal, 2=background
    target_type     TEXT NOT NULL CHECK (target_type IN ('job', 'production_run')),
    target_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_id       SMALLINT NOT NULL REFERENCES schedule_statuses(id) DEFAULT 1,
    is_off_peak     BOOLEAN NOT NULL DEFAULT false,
    created_by_id   BIGINT NOT NULL REFERENCES users(id),
    total_runs      INTEGER NOT NULL DEFAULT 0,
    failed_runs     INTEGER NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Executor query: find due schedules (active + not deleted + next_run_at in past)
CREATE INDEX idx_schedules_next_run_at ON schedules (next_run_at)
    WHERE next_run_at IS NOT NULL AND status_id = 1 AND deleted_at IS NULL;

CREATE INDEX idx_schedules_created_by_id ON schedules (created_by_id);
CREATE INDEX idx_schedules_target_type ON schedules (target_type);
CREATE INDEX idx_schedules_status_id ON schedules (status_id);
CREATE INDEX idx_schedules_deleted_at ON schedules (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` TIMESTAMPTZ, `deleted_at` nullable
- [ ] `schedule_type` CHECK constraint enforces `'one_time'` or `'recurring'`
- [ ] `target_type` CHECK constraint enforces `'job'` or `'production_run'`
- [ ] FK to `schedule_statuses(id)` with default 1 (active)
- [ ] FK to `users(id)` for `created_by_id`
- [ ] Partial index on `next_run_at` filters by active + not-deleted (for executor query performance)
- [ ] `set_updated_at()` trigger applied
- [ ] GIN index on `target_config` JSONB column NOT added (not queried by content in MVP)
- [ ] Migration runs cleanly

### Task 1.3: Create `schedule_executions` table
**File:** `apps/db/migrations/20260225000003_create_schedule_executions.sql`

Create the execution history table for schedule audit trail.

```sql
-- Schedule execution log (PRD-119 Req 1.6)
CREATE TABLE schedule_executions (
    id                BIGSERIAL PRIMARY KEY,
    schedule_id       BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    job_id            BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    production_run_id BIGINT REFERENCES production_runs(id) ON DELETE SET NULL,
    status_id         SMALLINT NOT NULL REFERENCES schedule_execution_statuses(id),
    fired_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ,
    duration_secs     INTEGER,
    error_message     TEXT,
    error_details     JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_executions_schedule_id ON schedule_executions (schedule_id);
CREATE INDEX idx_schedule_executions_job_id ON schedule_executions (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_schedule_executions_fired_at ON schedule_executions (fired_at);
CREATE INDEX idx_schedule_executions_status_id ON schedule_executions (status_id);

CREATE TRIGGER trg_schedule_executions_updated_at
    BEFORE UPDATE ON schedule_executions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` TIMESTAMPTZ
- [ ] FK to `schedules(id)` with `ON DELETE CASCADE` (execution history belongs to schedule)
- [ ] FK to `jobs(id)` with `ON DELETE SET NULL` (job may be purged independently)
- [ ] FK to `production_runs(id)` with `ON DELETE SET NULL`
- [ ] FK to `schedule_execution_statuses(id)` for status
- [ ] Indexes on `schedule_id`, `job_id` (partial), `fired_at`, `status_id`
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.4: Add `schedule_id` column to `jobs` table and `timezone` column to `users` table
**File:** `apps/db/migrations/20260225000004_add_schedule_id_to_jobs_and_timezone_to_users.sql`

Alter existing tables for schedule integration and timezone preferences.

```sql
-- Add schedule reference to jobs table (PRD-119 Req 1.8)
ALTER TABLE jobs ADD COLUMN schedule_id BIGINT REFERENCES schedules(id) ON DELETE SET NULL;
CREATE INDEX idx_jobs_schedule_id ON jobs (schedule_id) WHERE schedule_id IS NOT NULL;

-- Add timezone preference to users table (PRD-119 Req 1.4)
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
```

**Acceptance Criteria:**
- [ ] `jobs.schedule_id` column added as nullable BIGINT with FK to `schedules(id) ON DELETE SET NULL`
- [ ] Partial index on `jobs.schedule_id` (only non-NULL)
- [ ] `users.timezone` column added as `TEXT NOT NULL DEFAULT 'UTC'`
- [ ] Existing job rows unaffected (schedule_id defaults to NULL)
- [ ] Existing user rows get `timezone = 'UTC'`
- [ ] Migration runs cleanly on populated database

---

## Phase 2: Models & Repositories

### Task 2.1: Create `Schedule` model structs
**File:** `apps/backend/crates/db/src/models/schedule.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/production_run.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `schedules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Schedule {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub schedule_type: String,           // "one_time" or "recurring"
    pub cron_expression: Option<String>,
    pub timezone: String,
    pub run_at: Option<Timestamp>,
    pub next_run_at: Option<Timestamp>,
    pub last_run_at: Option<Timestamp>,
    pub priority: i32,
    pub target_type: String,             // "job" or "production_run"
    pub target_config: serde_json::Value,
    pub status_id: i16,
    pub is_off_peak: bool,
    pub created_by_id: DbId,
    pub total_runs: i32,
    pub failed_runs: i32,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new schedule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSchedule {
    pub name: String,
    pub description: Option<String>,
    pub schedule_type: String,
    pub cron_expression: Option<String>,
    pub timezone: Option<String>,        // defaults to user's timezone
    pub run_at: Option<Timestamp>,
    pub priority: Option<i32>,
    pub target_type: String,
    pub target_config: serde_json::Value,
    pub is_off_peak: Option<bool>,
}

/// DTO for updating an existing schedule. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSchedule {
    pub name: Option<String>,
    pub description: Option<String>,
    pub cron_expression: Option<String>,
    pub timezone: Option<String>,
    pub priority: Option<i32>,
    pub target_config: Option<serde_json::Value>,
    pub is_off_peak: Option<bool>,
}

/// DTO for the reschedule action (drag-to-reschedule from calendar).
#[derive(Debug, Clone, Deserialize)]
pub struct RescheduleRequest {
    pub next_run_at: Timestamp,
}

/// Calendar query parameters.
#[derive(Debug, Clone, Deserialize)]
pub struct CalendarQuery {
    pub start: chrono::NaiveDate,
    pub end: chrono::NaiveDate,
    pub timezone: Option<String>,
}

/// A single calendar event (expanded occurrence).
#[derive(Debug, Clone, Serialize)]
pub struct CalendarEvent {
    pub schedule_id: DbId,
    pub name: String,
    pub target_type: String,
    pub priority: i32,
    pub status: String,               // resolved status name
    pub scheduled_at: Timestamp,
    pub is_recurring: bool,
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTO derives `Debug, Clone, Deserialize`
- [ ] Update DTO derives `Debug, Clone, Deserialize` with all fields `Option`
- [ ] Uses `DbId` (`i64`) and `Timestamp` from `x121_core::types`
- [ ] `deleted_at: Option<Timestamp>` included in main struct
- [ ] `status_id` is `i16` (matches SQL `SMALLINT`)
- [ ] `RescheduleRequest`, `CalendarQuery`, `CalendarEvent` DTOs for calendar endpoints
- [ ] Module registered in `models/mod.rs`

### Task 2.2: Create `ScheduleExecution` model structs
**File:** `apps/backend/crates/db/src/models/schedule_execution.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `schedule_executions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ScheduleExecution {
    pub id: DbId,
    pub schedule_id: DbId,
    pub job_id: Option<DbId>,
    pub production_run_id: Option<DbId>,
    pub status_id: i16,
    pub fired_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub duration_secs: Option<i32>,
    pub error_message: Option<String>,
    pub error_details: Option<serde_json::Value>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a schedule execution log entry.
#[derive(Debug, Clone)]
pub struct CreateScheduleExecution {
    pub schedule_id: DbId,
    pub job_id: Option<DbId>,
    pub production_run_id: Option<DbId>,
    pub status_id: i16,
    pub error_message: Option<String>,
    pub error_details: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTO is internal-only (not Deserialize, not user-facing)
- [ ] Uses `DbId` and `Timestamp` from `x121_core::types`
- [ ] `status_id` is `i16` matching SMALLINT
- [ ] Module registered in `models/mod.rs`

### Task 2.3: Update `User` and `Job` model structs
**Files:** `apps/backend/crates/db/src/models/user.rs`, `apps/backend/crates/db/src/models/job.rs`

Add the new columns to existing model structs.

For `User`:
```rust
pub struct User {
    // ... existing fields ...
    pub timezone: String,    // NEW: IANA timezone, default 'UTC'
}
```

Also update `UserResponse` to include `timezone`.

For `Job`:
```rust
pub struct Job {
    // ... existing fields ...
    pub schedule_id: Option<DbId>,    // NEW: FK to schedules
}
```

**Acceptance Criteria:**
- [ ] `User.timezone: String` field added after existing fields
- [ ] `UserResponse.timezone: String` field added (included in API responses)
- [ ] `Job.schedule_id: Option<DbId>` field added
- [ ] Both structs compile with new fields
- [ ] No changes to existing Create/Update DTOs for `User` (timezone updated via dedicated endpoint)

### Task 2.4: Create `ScheduleRepo` repository
**File:** `apps/backend/crates/db/src/repositories/schedule_repo.rs`

Follow the zero-sized struct pattern from existing repos.

```rust
pub struct ScheduleRepo;

const COLUMNS: &str = "\
    id, name, description, schedule_type, cron_expression, timezone, \
    run_at, next_run_at, last_run_at, priority, target_type, target_config, \
    status_id, is_off_peak, created_by_id, total_runs, failed_runs, \
    deleted_at, created_at, updated_at";

impl ScheduleRepo {
    pub async fn create(pool: &PgPool, input: &CreateSchedule, user_id: DbId) -> Result<Schedule, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Schedule>, sqlx::Error>;
    pub async fn list(pool: &PgPool, filters: &ScheduleListFilters) -> Result<Vec<Schedule>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateSchedule) -> Result<Option<Schedule>, sqlx::Error>;
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;

    // Lifecycle actions
    pub async fn pause(pool: &PgPool, id: DbId) -> Result<Option<Schedule>, sqlx::Error>;
    pub async fn resume(pool: &PgPool, id: DbId) -> Result<Option<Schedule>, sqlx::Error>;
    pub async fn reschedule(pool: &PgPool, id: DbId, next_run_at: Timestamp) -> Result<Option<Schedule>, sqlx::Error>;

    // Executor queries
    pub async fn find_due_schedules(pool: &PgPool) -> Result<Vec<Schedule>, sqlx::Error>;
    pub async fn lock_and_fire(pool: &PgPool, id: DbId) -> Result<Option<Schedule>, sqlx::Error>;
    pub async fn mark_fired(pool: &PgPool, id: DbId, next_run_at: Option<Timestamp>) -> Result<(), sqlx::Error>;
    pub async fn increment_run_count(pool: &PgPool, id: DbId, failed: bool) -> Result<(), sqlx::Error>;

    // Calendar
    pub async fn list_for_calendar(pool: &PgPool, start: Timestamp, end: Timestamp) -> Result<Vec<Schedule>, sqlx::Error>;
}
```

Key query details:
- `find_due_schedules`: `WHERE next_run_at <= now() AND status_id = 1 AND deleted_at IS NULL`
- `lock_and_fire`: `SELECT ... FOR UPDATE SKIP LOCKED` for concurrency safety
- `list`: filters by `deleted_at IS NULL` plus optional `schedule_type`, `target_type`, `is_enabled`, `created_by_id`
- `pause`: `UPDATE SET status_id = 2 WHERE id = $1 AND status_id = 1 AND deleted_at IS NULL`
- `resume`: `UPDATE SET status_id = 1, next_run_at = {recomputed} WHERE id = $1 AND status_id = 2 AND deleted_at IS NULL`

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all `schedules` columns
- [ ] `create` inserts with computed `next_run_at` based on schedule type
- [ ] `find_by_id` filters `deleted_at IS NULL`
- [ ] `list` supports filters: schedule_type, target_type, status_id, created_by_id
- [ ] `soft_delete` sets `deleted_at = NOW()`
- [ ] `pause` sets `status_id = 2` (paused)
- [ ] `resume` sets `status_id = 1` (active) and recomputes `next_run_at`
- [ ] `find_due_schedules` returns active schedules with `next_run_at <= now()`
- [ ] `lock_and_fire` uses `FOR UPDATE SKIP LOCKED` to prevent duplicate firing
- [ ] `list_for_calendar` returns schedules with `next_run_at` within range
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 2.5: Create `ScheduleExecutionRepo` repository
**File:** `apps/backend/crates/db/src/repositories/schedule_execution_repo.rs`

```rust
pub struct ScheduleExecutionRepo;

const COLUMNS: &str = "\
    id, schedule_id, job_id, production_run_id, status_id, \
    fired_at, completed_at, duration_secs, error_message, error_details, \
    created_at, updated_at";

impl ScheduleExecutionRepo {
    pub async fn create(pool: &PgPool, input: &CreateScheduleExecution) -> Result<ScheduleExecution, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ScheduleExecution>, sqlx::Error>;
    pub async fn list_by_schedule(pool: &PgPool, schedule_id: DbId, limit: i64, offset: i64) -> Result<Vec<ScheduleExecution>, sqlx::Error>;
    pub async fn list_global(pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<ScheduleExecution>, sqlx::Error>;
    pub async fn mark_completed(pool: &PgPool, id: DbId, duration_secs: i32) -> Result<(), sqlx::Error>;
    pub async fn mark_failed(pool: &PgPool, id: DbId, error_message: &str, error_details: Option<serde_json::Value>) -> Result<(), sqlx::Error>;
    pub async fn is_previous_still_running(pool: &PgPool, schedule_id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key query details:
- `list_by_schedule`: `WHERE schedule_id = $1 ORDER BY fired_at DESC LIMIT $2 OFFSET $3`
- `list_global`: `ORDER BY fired_at DESC` (admin endpoint)
- `mark_completed`: `UPDATE SET status_id = 2, completed_at = now(), duration_secs = $2`
- `mark_failed`: `UPDATE SET status_id = 3, completed_at = now(), error_message = $3`
- `is_previous_still_running`: `SELECT EXISTS(SELECT 1 FROM schedule_executions WHERE schedule_id = $1 AND status_id = 1)` (status_id=1 is "fired")

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const
- [ ] `create` inserts execution log entry with `status_id = 1` (fired)
- [ ] `list_by_schedule` returns paginated history for one schedule
- [ ] `list_global` returns paginated global history (admin)
- [ ] `mark_completed` updates status to completed with duration
- [ ] `mark_failed` updates status to failed with error details
- [ ] `is_previous_still_running` checks for active execution of same schedule
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 2.6: Add `timezone` update method to `UserRepo`
**File:** `apps/backend/crates/db/src/repositories/user_repo.rs` (modify existing)

Add a method to update only the user's timezone preference.

```rust
impl UserRepo {
    /// Update a user's timezone preference.
    pub async fn update_timezone(pool: &PgPool, user_id: DbId, timezone: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET timezone = $2 WHERE id = $1"
        )
        .bind(user_id)
        .bind(timezone)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
```

**Acceptance Criteria:**
- [ ] `update_timezone` method added to `UserRepo`
- [ ] Updates only the `timezone` column for the given user
- [ ] Returns `true` if user found and updated, `false` if user not found
- [ ] Existing `UserRepo` methods continue to compile (add `timezone` to relevant COLUMNS/queries)

---

## Phase 3: Schedule Executor (Background Service)

### Task 3.1: Add cron parsing and timezone dependencies
**File:** `apps/backend/Cargo.toml` (workspace), `apps/backend/crates/api/Cargo.toml`

Add the `cron` (or `croner`) crate for cron expression parsing and `chrono-tz` for timezone conversions.

```toml
# In workspace Cargo.toml [workspace.dependencies]
cron = "0.15"         # Cron expression parsing
chrono-tz = "0.10"    # IANA timezone conversions

# In api crate Cargo.toml [dependencies]
cron.workspace = true
chrono-tz.workspace = true
```

**Acceptance Criteria:**
- [ ] `cron` crate added to workspace dependencies
- [ ] `chrono-tz` crate added to workspace dependencies
- [ ] Both added to `api` crate dependencies
- [ ] `cargo check` passes with new dependencies

### Task 3.2: Create cron utility module
**File:** `apps/backend/crates/api/src/scheduling/cron_utils.rs`

Utility functions for cron expression validation, next-occurrence computation, and timezone-aware scheduling.

```rust
use chrono::{DateTime, Utc};
use chrono_tz::Tz;

/// Validate a cron expression (5-field standard).
pub fn validate_cron(expression: &str) -> Result<(), String>;

/// Compute the next occurrence of a cron expression after `after`,
/// evaluated in the given timezone.
pub fn next_occurrence(expression: &str, timezone: &str, after: DateTime<Utc>) -> Result<Option<DateTime<Utc>>, String>;

/// Expand a cron expression into all occurrences within a date range.
/// Returns at most `max_count` occurrences.
pub fn expand_occurrences(
    expression: &str,
    timezone: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    max_count: usize,
) -> Result<Vec<DateTime<Utc>>, String>;

/// Validate an IANA timezone string.
pub fn validate_timezone(tz: &str) -> Result<Tz, String>;
```

**Acceptance Criteria:**
- [ ] `validate_cron` rejects malformed cron expressions with descriptive error
- [ ] `next_occurrence` computes correct UTC timestamp for next cron trigger
- [ ] `next_occurrence` handles DST transitions correctly (spring-forward and fall-back)
- [ ] `expand_occurrences` returns up to `max_count` occurrences within the range
- [ ] `validate_timezone` accepts valid IANA strings ("America/New_York") and rejects invalid ones
- [ ] Unit tests for edge cases: DST, Feb 29, "every Monday at 6am", 5-minute intervals

### Task 3.3: Create off-peak slot selection logic
**File:** `apps/backend/crates/api/src/scheduling/off_peak.rs`

Implements PRD-119 Req 1.3: smart off-peak slot selection based on queue load and scheduling policy.

```rust
use chrono::{DateTime, Utc};
use x121_db::DbPool;

/// Result of the smart slot selection algorithm.
pub struct SuggestedSlot {
    pub slot: DateTime<Utc>,
    pub reason: String,          // "lowest queue depth at 3am UTC"
    pub queue_depth: i64,        // predicted queue depth at that time
}

/// Select the optimal off-peak slot within the next 48 hours.
///
/// Algorithm:
/// 1. Read off-peak hours from scheduling_policies (PRD-08)
/// 2. Bucket the next 48 hours into 1-hour slots
/// 3. Count scheduled + queued jobs per bucket
/// 4. Pick the bucket within off-peak hours with the fewest jobs
pub async fn suggest_off_peak_slot(pool: &DbPool) -> Result<SuggestedSlot, String>;
```

**Acceptance Criteria:**
- [ ] Reads active off-peak policy via `SchedulingPolicyRepo::find_active_off_peak`
- [ ] Falls back to 10pm-8am UTC if no policy configured
- [ ] Buckets next 48 hours into 1-hour slots
- [ ] Counts scheduled jobs per bucket using existing schedule and job data
- [ ] Returns the off-peak slot with the lowest predicted queue depth
- [ ] Returns descriptive `reason` string for UI display
- [ ] Unit test with mocked data verifying slot selection logic

### Task 3.4: Create schedule executor background service
**File:** `apps/backend/crates/api/src/scheduling/executor.rs`

Background Tokio task that polls for due schedules and fires them. Modeled after `DigestScheduler` in the events crate.

```rust
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use x121_db::DbPool;
use x121_events::EventBus;

const EXECUTOR_POLL_INTERVAL: Duration = Duration::from_secs(15);

pub struct ScheduleExecutor {
    pool: DbPool,
    event_bus: Arc<EventBus>,
}

impl ScheduleExecutor {
    pub fn new(pool: DbPool, event_bus: Arc<EventBus>) -> Self;

    /// Run the executor loop. Exits when the CancellationToken is cancelled.
    pub async fn run(&self, cancel: CancellationToken);

    /// Process all due schedules. Called every poll interval.
    async fn process_due_schedules(&self) -> Result<(), Box<dyn std::error::Error>>;

    /// Fire a single schedule: submit job or production run via existing paths.
    async fn fire_schedule(&self, schedule: &Schedule) -> Result<DbId, Box<dyn std::error::Error>>;

    /// Submit a job target (reuses SubmitJob DTO from PRD-08).
    async fn submit_job_target(&self, schedule: &Schedule) -> Result<DbId, Box<dyn std::error::Error>>;

    /// Submit a production run target (calls existing production run path).
    async fn submit_production_run_target(&self, schedule: &Schedule) -> Result<DbId, Box<dyn std::error::Error>>;
}
```

Key behavior:
1. Polls every 15 seconds via `tokio::time::interval`
2. Calls `ScheduleRepo::find_due_schedules` to find schedules with `next_run_at <= now()`
3. For each due schedule, calls `ScheduleRepo::lock_and_fire` (FOR UPDATE SKIP LOCKED)
4. If lock acquired: check `is_previous_still_running` for recurring (skip if yes)
5. Submit job via `JobRepo::create` or production run via existing path
6. Log execution via `ScheduleExecutionRepo::create`
7. Update schedule: `last_run_at = now()`, compute and store new `next_run_at` (recurring) or `status_id = disabled` (one_time)
8. Publish `schedule.fired` event via `EventBus`
9. Increment `total_runs` (and `failed_runs` if submission failed)

**Acceptance Criteria:**
- [ ] Executor runs as background Tokio task with `CancellationToken` for graceful shutdown
- [ ] Polls every 15 seconds for due schedules
- [ ] Uses `SELECT ... FOR UPDATE SKIP LOCKED` to prevent duplicate firing
- [ ] For one-time schedules: submits job, then sets `status_id = disabled`
- [ ] For recurring schedules: submits job, computes next `next_run_at` from cron expression
- [ ] Skips recurring schedule if previous execution is still running (logs as "skipped")
- [ ] Publishes `schedule.fired` event via EventBus
- [ ] Logs execution to `schedule_executions` table
- [ ] Handles submission failures gracefully (logs as "failed", does not crash)
- [ ] Carries schedule's priority to the submitted job
- [ ] Sets `schedule_id` on submitted job for traceability

### Task 3.5: Register executor in API server startup
**File:** `apps/backend/crates/api/src/main.rs` (modify existing), `apps/backend/crates/api/src/scheduling/mod.rs` (new)

Create the `scheduling` module and start the executor as a background task alongside the existing `DigestScheduler`.

```rust
// In main.rs, after server setup:
let schedule_executor = ScheduleExecutor::new(pool.clone(), event_bus.clone());
let cancel = cancel_token.clone();
tokio::spawn(async move {
    schedule_executor.run(cancel).await;
});
```

**Acceptance Criteria:**
- [ ] `scheduling` module created with `mod.rs`, `executor.rs`, `cron_utils.rs`, `off_peak.rs`
- [ ] Executor spawned as background task in `main.rs`
- [ ] Uses shared `CancellationToken` for graceful shutdown alongside other background tasks
- [ ] Module structure follows existing pattern (similar to events crate's `DigestScheduler`)

---

## Phase 4: Schedule Management API

### Task 4.1: Create schedule handler module
**File:** `apps/backend/crates/api/src/handlers/scheduling.rs`

Implement all PRD-119 Req 1.5 endpoints.

```rust
/// POST /api/v1/schedules
pub async fn create_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateSchedule>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/schedules
pub async fn list_schedules(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(filters): Query<ScheduleListFilters>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/schedules/:id
pub async fn get_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse>;

/// PATCH /api/v1/schedules/:id
pub async fn update_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateSchedule>,
) -> AppResult<impl IntoResponse>;

/// DELETE /api/v1/schedules/:id
pub async fn delete_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse>;

/// POST /api/v1/schedules/:id/actions/pause
pub async fn pause_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse>;

/// POST /api/v1/schedules/:id/actions/resume
pub async fn resume_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse>;

/// POST /api/v1/schedules/:id/actions/trigger-now
pub async fn trigger_now(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse>;

/// PATCH /api/v1/schedules/:id/reschedule
pub async fn reschedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<RescheduleRequest>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/schedules/calendar?start=DATE&end=DATE
pub async fn get_calendar(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<CalendarQuery>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/schedules/:id/history
pub async fn get_schedule_history(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(pagination): Query<PaginationParams>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/schedules/history (admin)
pub async fn get_global_history(
    _admin: RequireAdmin,
    State(state): State<AppState>,
    Query(pagination): Query<PaginationParams>,
) -> AppResult<impl IntoResponse>;
```

Validation in `create_schedule`:
- If `schedule_type == "recurring"`, `cron_expression` must be present and valid
- If `schedule_type == "one_time"`, `run_at` must be present and in the future
- If `is_off_peak`, call `suggest_off_peak_slot` to populate `next_run_at`
- Validate `timezone` against IANA database
- Validate `target_type` matches `target_config` structure

Authorization:
- Creator+ can create/list/get schedules
- Owner or Admin can update/delete/pause/resume/trigger/reschedule
- Global history requires Admin

**Acceptance Criteria:**
- [ ] `POST /schedules` creates schedule with computed `next_run_at`
- [ ] `GET /schedules` lists with filters (type, enabled, target_type, created_by)
- [ ] `GET /schedules/:id` returns detail including recent execution history
- [ ] `PATCH /schedules/:id` updates mutable fields, recomputes `next_run_at` if cron/timezone changed
- [ ] `DELETE /schedules/:id` performs soft delete (sets `deleted_at`)
- [ ] `POST /schedules/:id/actions/pause` sets status to paused
- [ ] `POST /schedules/:id/actions/resume` sets status to active, recomputes `next_run_at`
- [ ] `POST /schedules/:id/actions/trigger-now` fires schedule immediately (bypasses next_run_at)
- [ ] `PATCH /schedules/:id/reschedule` updates `next_run_at` only (calendar drag)
- [ ] `GET /schedules/calendar` returns expanded occurrences within date range (max 200)
- [ ] `GET /schedules/:id/history` returns paginated execution log for one schedule
- [ ] `GET /schedules/history` (admin) returns global execution log
- [ ] All responses use `DataResponse` envelope
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.2: Create timezone update endpoint
**File:** `apps/backend/crates/api/src/handlers/auth.rs` (modify existing, or new handler)

Add endpoint for users to update their timezone preference.

```rust
/// PATCH /api/v1/users/me/timezone
pub async fn update_timezone(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<UpdateTimezoneRequest>,
) -> AppResult<impl IntoResponse>;
```

```rust
#[derive(Debug, Deserialize)]
pub struct UpdateTimezoneRequest {
    pub timezone: String,
}
```

Validation: timezone string must be a valid IANA timezone (use `validate_timezone` from cron_utils).

**Acceptance Criteria:**
- [ ] `PATCH /api/v1/users/me/timezone` updates the authenticated user's timezone
- [ ] Validates timezone against IANA database
- [ ] Returns 422 for invalid timezone strings
- [ ] Returns updated user response with new timezone
- [ ] Route registered in existing auth/user route group

### Task 4.3: Create schedule routes
**File:** `apps/backend/crates/api/src/lib.rs` (modify existing route tree)

Register all schedule endpoints in the route tree.

```rust
// Schedule management (PRD-119)
let schedule_routes = Router::new()
    .route("/", get(scheduling::list_schedules).post(scheduling::create_schedule))
    .route("/calendar", get(scheduling::get_calendar))
    .route("/history", get(scheduling::get_global_history))
    .route("/{id}", get(scheduling::get_schedule)
        .patch(scheduling::update_schedule)
        .delete(scheduling::delete_schedule))
    .route("/{id}/actions/pause", post(scheduling::pause_schedule))
    .route("/{id}/actions/resume", post(scheduling::resume_schedule))
    .route("/{id}/actions/trigger-now", post(scheduling::trigger_now))
    .route("/{id}/reschedule", patch(scheduling::reschedule))
    .route("/{id}/history", get(scheduling::get_schedule_history));

// Nest under /api/v1/schedules
.nest("/schedules", schedule_routes)
```

**Acceptance Criteria:**
- [ ] All 12 schedule endpoints registered with correct HTTP methods
- [ ] Routes nested under `/api/v1/schedules`
- [ ] `/{id}` parameter routes correctly to path extractors
- [ ] `/calendar` and `/history` static routes placed BEFORE `/{id}` to avoid capture
- [ ] Timezone update route registered under user routes
- [ ] Route tree comment in `lib.rs` updated to include new endpoints

### Task 4.4: Publish schedule lifecycle events
**File:** `apps/backend/crates/api/src/handlers/scheduling.rs` (modify)

Ensure all lifecycle actions publish events via the EventBus.

```rust
// On schedule creation:
state.event_bus.publish(
    PlatformEvent::new("schedule.created")
        .with_source("schedule", schedule.id)
        .with_actor(auth.user_id)
);

// On schedule fired (in executor):
state.event_bus.publish(
    PlatformEvent::new("schedule.fired")
        .with_source("schedule", schedule.id)
        .with_actor(schedule.created_by_id)
        .with_payload(serde_json::json!({
            "job_id": job_id,
            "schedule_name": schedule.name,
        }))
);

// On schedule execution completed/failed (triggered by job completion webhook or polling):
PlatformEvent::new("schedule.completed") / PlatformEvent::new("schedule.failed")
```

**Acceptance Criteria:**
- [ ] `schedule.created` event published on create
- [ ] `schedule.fired` event published when executor fires a schedule
- [ ] `schedule.completed` event published when the resulting job completes
- [ ] `schedule.failed` event published when the resulting job fails or schedule fails to fire
- [ ] Events include `schedule_id`, `schedule_name`, `job_id` (if applicable), and error details (if failed)
- [ ] Events use `with_source("schedule", schedule_id)` and `with_actor(user_id)` pattern

---

## Phase 5: Frontend Calendar UI

### Task 5.1: Create scheduling feature module structure
**Files:**
- `apps/frontend/src/features/scheduling/index.ts`
- `apps/frontend/src/features/scheduling/types.ts`

Set up the feature module barrel export and TypeScript types.

```typescript
// types.ts
export interface Schedule {
  id: number;
  name: string;
  description?: string;
  schedule_type: 'one_time' | 'recurring';
  cron_expression?: string;
  timezone: string;
  run_at?: string;
  next_run_at?: string;
  last_run_at?: string;
  priority: number;
  target_type: 'job' | 'production_run';
  target_config: Record<string, unknown>;
  status_id: number;
  is_off_peak: boolean;
  created_by_id: number;
  total_runs: number;
  failed_runs: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleExecution {
  id: number;
  schedule_id: number;
  job_id?: number;
  production_run_id?: number;
  status_id: number;
  fired_at: string;
  completed_at?: string;
  duration_secs?: number;
  error_message?: string;
}

export interface CalendarEvent {
  schedule_id: number;
  name: string;
  target_type: 'job' | 'production_run';
  priority: number;
  status: string;
  scheduled_at: string;
  is_recurring: boolean;
}
```

**Acceptance Criteria:**
- [ ] Feature module created at `apps/frontend/src/features/scheduling/`
- [ ] TypeScript interfaces for `Schedule`, `ScheduleExecution`, `CalendarEvent` defined
- [ ] Barrel export file with all public components and hooks
- [ ] Types match the API response shapes from backend

### Task 5.2: Create schedule data hooks
**Files:**
- `apps/frontend/src/features/scheduling/useSchedules.ts`
- `apps/frontend/src/features/scheduling/useScheduleCalendar.ts`
- `apps/frontend/src/features/scheduling/useScheduleMutations.ts`

TanStack Query hooks for all schedule API interactions.

```typescript
// useSchedules.ts
export function useSchedules(filters?: ScheduleListFilters) {
  return useQuery({
    queryKey: ['schedules', filters],
    queryFn: () => api.get('/schedules', { params: filters }),
  });
}

export function useSchedule(id: number) {
  return useQuery({
    queryKey: ['schedules', id],
    queryFn: () => api.get(`/schedules/${id}`),
  });
}

export function useScheduleHistory(id: number) {
  return useQuery({
    queryKey: ['schedules', id, 'history'],
    queryFn: () => api.get(`/schedules/${id}/history`),
  });
}

// useScheduleCalendar.ts
export function useScheduleCalendar(start: string, end: string) {
  return useQuery({
    queryKey: ['schedules', 'calendar', { start, end }],
    queryFn: () => api.get('/schedules/calendar', { params: { start, end } }),
  });
}

// useScheduleMutations.ts
export function useCreateSchedule();
export function useUpdateSchedule();
export function useDeleteSchedule();
export function usePauseSchedule();
export function useResumeSchedule();
export function useTriggerNow();
export function useReschedule();   // for drag-to-reschedule
```

**Acceptance Criteria:**
- [ ] `useSchedules` returns list with filter support
- [ ] `useSchedule` returns single schedule detail
- [ ] `useScheduleHistory` returns paginated execution log
- [ ] `useScheduleCalendar` returns calendar events for a date range
- [ ] All mutation hooks invalidate relevant query keys on success
- [ ] `useReschedule` uses optimistic update for responsive drag-to-reschedule
- [ ] All hooks use the shared `api` client from `@/lib/api`
- [ ] Query keys follow `['schedules', ...]` pattern

### Task 5.3: Create calendar grid component
**File:** `apps/frontend/src/features/scheduling/CalendarGrid.tsx`

The main calendar visualization component with week and month views.

```typescript
interface CalendarGridProps {
  events: CalendarEvent[];
  view: 'week' | 'month';
  currentDate: Date;
  userTimezone: string;
  onEventClick: (event: CalendarEvent) => void;
  onEventDrop: (eventId: number, newTime: Date) => void;
  onSlotClick: (time: Date) => void;
}

export function CalendarGrid({ events, view, ... }: CalendarGridProps) {
  // Week view: 7 columns x 24 hour rows
  // Month view: 7 columns x ~5 week rows
  // Current time indicator line
  // Drag-to-reschedule with ghost preview
}
```

**Acceptance Criteria:**
- [ ] Week view (default) with 7-day columns and hourly time slots
- [ ] Month view with day cells showing scheduled items
- [ ] Each calendar item shows: name, target type icon, priority badge, time
- [ ] Color coding: pending (blue), running (green), completed (gray), failed (red), paused (orange)
- [ ] Current time indicator line (horizontal red line at current time)
- [ ] Click event to view/edit schedule detail
- [ ] Click empty slot to create new schedule pre-filled with that time
- [ ] Responsive: collapses to day view on narrow screens (< 768px)
- [ ] Uses Tailwind classes and design tokens (no inline styles)

### Task 5.4: Create drag-to-reschedule interaction
**File:** `apps/frontend/src/features/scheduling/useDragReschedule.ts`

Custom hook for drag-to-reschedule on the calendar grid.

```typescript
export function useDragReschedule(
  onReschedule: (scheduleId: number, newTime: Date) => void,
) {
  // Handle drag start, drag over, drop
  // Show ghost preview during drag
  // Snap to 15-minute intervals
  // Confirm dialog before committing
}
```

**Acceptance Criteria:**
- [ ] Drag an event to a different time slot
- [ ] Ghost preview shown during drag
- [ ] Snaps to 15-minute time intervals
- [ ] Confirmation dialog before committing reschedule
- [ ] Calls `useReschedule` mutation on confirm
- [ ] Optimistic update: event moves immediately, rolls back on error

### Task 5.5: Create schedule creation form
**File:** `apps/frontend/src/features/scheduling/ScheduleForm.tsx`

Form for creating and editing schedules with three paths: specific time, recurring cron, auto off-peak.

```typescript
interface ScheduleFormProps {
  initialValues?: Partial<Schedule>;
  prefillTime?: Date;             // from calendar slot click
  onSubmit: (data: CreateSchedule) => void;
  onCancel: () => void;
}

export function ScheduleForm({ initialValues, prefillTime, onSubmit, onCancel }: ScheduleFormProps) {
  // Path 1: One-time -- date/time picker
  // Path 2: Recurring -- cron expression builder (UI dropdowns for common patterns)
  // Path 3: Off-peak auto -- shows suggested slot, user can accept or override
}
```

**Acceptance Criteria:**
- [ ] Three-path creation: one-time, recurring, off-peak auto
- [ ] One-time path: date/time picker for `run_at`
- [ ] Recurring path: cron expression builder with presets ("Every day at 3am", "Every Monday", etc.)
- [ ] Off-peak path: calls suggest endpoint, shows suggested slot, accept/override buttons
- [ ] Target type selection: single job (type + parameters) or production run (select existing run)
- [ ] Priority selector: Urgent (0), Normal (1), Background (2)
- [ ] Timezone selector (IANA timezone list, defaults to user preference)
- [ ] Form validation via Zod schema
- [ ] Uses React Hook Form for form state management
- [ ] Uses design system primitives (Input, Select, Button)

### Task 5.6: Create schedule detail panel
**File:** `apps/frontend/src/features/scheduling/ScheduleDetail.tsx`

Detail view for a single schedule with inline execution history.

```typescript
interface ScheduleDetailProps {
  scheduleId: number;
  onClose: () => void;
}

export function ScheduleDetail({ scheduleId, onClose }: ScheduleDetailProps) {
  const { data: schedule } = useSchedule(scheduleId);
  const { data: history } = useScheduleHistory(scheduleId);
  // Header: name, type badge, status badge
  // Info: cron expression (human-readable), next run, timezone, priority, target
  // Actions: pause/resume, trigger now, edit, delete
  // History: inline execution log table
}
```

**Acceptance Criteria:**
- [ ] Shows schedule name, type, status, cron expression (human-readable), next run time
- [ ] Displays time in user's configured timezone
- [ ] Action buttons: Pause/Resume, Trigger Now, Edit, Delete
- [ ] Inline execution history table with status, fired_at, duration, error
- [ ] Edit opens `ScheduleForm` in edit mode
- [ ] Delete shows confirmation dialog before soft-delete

### Task 5.7: Create scheduling page with calendar and list views
**File:** `apps/frontend/src/features/scheduling/SchedulingPage.tsx`

Top-level page combining calendar, schedule list, and detail panel.

```typescript
export function SchedulingPage() {
  // Header: view toggle (calendar/list), timezone selector, "New Schedule" button
  // Calendar view (default): CalendarGrid with events
  // List view: sortable table of all schedules
  // Detail panel: side panel or modal for schedule detail
}
```

**Acceptance Criteria:**
- [ ] Page header with view toggle, timezone selector, New Schedule button
- [ ] Calendar view as default with week/month toggle
- [ ] List view as alternative with sortable columns
- [ ] Click schedule opens detail panel
- [ ] New Schedule button opens ScheduleForm
- [ ] Timezone selector in header (defaults to user preference, changes calendar display)
- [ ] Page integrates into app routing

---

## Phase 6: Integration & Testing

### Task 6.1: Backend unit tests for cron utilities
**File:** `apps/backend/crates/api/src/scheduling/cron_utils.rs` (inline tests)

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_validate_cron_valid_expression();
    #[test]
    fn test_validate_cron_invalid_expression();
    #[test]
    fn test_next_occurrence_daily();
    #[test]
    fn test_next_occurrence_with_dst_spring_forward();
    #[test]
    fn test_next_occurrence_with_dst_fall_back();
    #[test]
    fn test_expand_occurrences_limited();
    #[test]
    fn test_validate_timezone_valid();
    #[test]
    fn test_validate_timezone_invalid();
}
```

**Acceptance Criteria:**
- [ ] Valid cron expressions pass validation ("0 3 * * 1-5", "*/15 * * * *")
- [ ] Invalid cron expressions fail with descriptive error ("60 * * * *", "abc")
- [ ] `next_occurrence` computes correct time for "every day at 3am" in "America/New_York"
- [ ] DST spring-forward: non-existent 2am resolved to 3am
- [ ] DST fall-back: ambiguous 1am resolved to first occurrence
- [ ] `expand_occurrences` stops at `max_count` even if range has more
- [ ] Valid IANA timezones accepted, invalid strings rejected
- [ ] All tests pass

### Task 6.2: DB-level schedule CRUD tests
**File:** `apps/backend/crates/db/tests/schedule_crud.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_schedule_one_time(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_schedule_recurring(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_schedule_by_id(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_schedules_with_filters(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_schedule(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pause_and_resume_schedule(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_reschedule_updates_next_run_at(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_due_schedules(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_execution_log_crud(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_is_previous_still_running(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Creating a one-time schedule stores `run_at` and sets `next_run_at = run_at`
- [ ] Creating a recurring schedule stores `cron_expression` and computes `next_run_at`
- [ ] `find_by_id` returns schedule; returns None for soft-deleted schedule
- [ ] `list` respects filters (schedule_type, target_type, status_id)
- [ ] `soft_delete` sets `deleted_at`, hides from `find_by_id`
- [ ] `pause` sets status_id to 2; `resume` sets to 1 with updated `next_run_at`
- [ ] `reschedule` updates `next_run_at` only
- [ ] `find_due_schedules` returns only active schedules with `next_run_at <= now()`
- [ ] Execution log entries can be created, listed, and status-updated
- [ ] `is_previous_still_running` correctly detects active executions
- [ ] All tests pass

### Task 6.3: API-level schedule endpoint tests
**File:** `apps/backend/crates/api/tests/schedule_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_schedule_201(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_schedule_invalid_cron_422(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_schedules_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_schedule_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_schedule_404(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_schedule_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_schedule_204(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pause_schedule_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_resume_schedule_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_trigger_now_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_reschedule_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_calendar_endpoint_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_schedule_history_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_user_timezone_200(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_user_timezone_invalid_422(pool: PgPool);
```

Each test uses `common::build_test_app` and shared HTTP helpers.

**Acceptance Criteria:**
- [ ] `POST /schedules` returns 201 with created schedule
- [ ] `POST /schedules` with invalid cron returns 422
- [ ] `GET /schedules` returns list of schedules
- [ ] `GET /schedules/:id` returns schedule detail or 404
- [ ] `PATCH /schedules/:id` updates fields
- [ ] `DELETE /schedules/:id` returns 204
- [ ] `POST /schedules/:id/actions/pause` returns paused schedule
- [ ] `POST /schedules/:id/actions/resume` returns resumed schedule with new `next_run_at`
- [ ] `POST /schedules/:id/actions/trigger-now` fires schedule and returns execution
- [ ] `PATCH /schedules/:id/reschedule` updates `next_run_at` only
- [ ] `GET /schedules/calendar` returns events within range
- [ ] `GET /schedules/:id/history` returns execution history
- [ ] `PATCH /users/me/timezone` updates timezone or returns 422
- [ ] All tests pass

### Task 6.4: Frontend component tests
**File:** `apps/frontend/src/features/scheduling/__tests__/`

```typescript
// CalendarGrid.test.tsx
test('renders week view with events');
test('renders month view with events');
test('shows current time indicator');
test('calls onEventClick when event clicked');
test('calls onSlotClick when empty slot clicked');
test('displays events in correct timezone');

// ScheduleForm.test.tsx
test('renders one-time schedule form');
test('renders recurring schedule form with cron builder');
test('validates cron expression');
test('submits schedule data');

// ScheduleDetail.test.tsx
test('renders schedule detail with execution history');
test('calls pause mutation on pause button click');
test('calls delete mutation with confirmation');
```

**Acceptance Criteria:**
- [ ] Calendar grid renders events in correct positions for week and month views
- [ ] Calendar navigation (prev/next week/month) works
- [ ] Event click handler fires with correct event data
- [ ] Schedule form validates required fields
- [ ] Schedule detail shows execution history
- [ ] Action buttons trigger correct mutations
- [ ] Timezone display converts correctly
- [ ] All tests pass with `vitest run`

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260225000001_create_schedule_statuses.sql` | Status lookup tables |
| `apps/db/migrations/20260225000002_create_schedules.sql` | Main schedules table |
| `apps/db/migrations/20260225000003_create_schedule_executions.sql` | Execution history table |
| `apps/db/migrations/20260225000004_add_schedule_id_to_jobs_and_timezone_to_users.sql` | ALTER existing tables |
| `apps/backend/crates/db/src/models/schedule.rs` | Schedule model structs and DTOs |
| `apps/backend/crates/db/src/models/schedule_execution.rs` | ScheduleExecution model structs |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model modules |
| `apps/backend/crates/db/src/models/user.rs` | Add `timezone` field |
| `apps/backend/crates/db/src/models/job.rs` | Add `schedule_id` field |
| `apps/backend/crates/db/src/repositories/schedule_repo.rs` | Schedule repository |
| `apps/backend/crates/db/src/repositories/schedule_execution_repo.rs` | Execution log repository |
| `apps/backend/crates/db/src/repositories/user_repo.rs` | Add `update_timezone` method |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo modules |
| `apps/backend/crates/api/src/scheduling/mod.rs` | Scheduling module root |
| `apps/backend/crates/api/src/scheduling/executor.rs` | Background schedule executor |
| `apps/backend/crates/api/src/scheduling/cron_utils.rs` | Cron parsing and timezone utilities |
| `apps/backend/crates/api/src/scheduling/off_peak.rs` | Off-peak slot selection algorithm |
| `apps/backend/crates/api/src/handlers/scheduling.rs` | Schedule API handlers |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register scheduling handler module |
| `apps/backend/crates/api/src/lib.rs` | Register schedule routes |
| `apps/backend/crates/api/src/main.rs` | Start executor background task |
| `apps/backend/Cargo.toml` | Add cron, chrono-tz dependencies |
| `apps/backend/crates/api/Cargo.toml` | Add cron, chrono-tz dependencies |
| `apps/backend/crates/db/tests/schedule_crud.rs` | DB integration tests |
| `apps/backend/crates/api/tests/schedule_api.rs` | API integration tests |
| `apps/frontend/src/features/scheduling/index.ts` | Feature barrel export |
| `apps/frontend/src/features/scheduling/types.ts` | TypeScript type definitions |
| `apps/frontend/src/features/scheduling/useSchedules.ts` | Data query hooks |
| `apps/frontend/src/features/scheduling/useScheduleCalendar.ts` | Calendar data hook |
| `apps/frontend/src/features/scheduling/useScheduleMutations.ts` | Mutation hooks |
| `apps/frontend/src/features/scheduling/CalendarGrid.tsx` | Calendar visualization component |
| `apps/frontend/src/features/scheduling/useDragReschedule.ts` | Drag-to-reschedule hook |
| `apps/frontend/src/features/scheduling/ScheduleForm.tsx` | Schedule creation/edit form |
| `apps/frontend/src/features/scheduling/ScheduleDetail.tsx` | Schedule detail panel |
| `apps/frontend/src/features/scheduling/SchedulingPage.tsx` | Top-level scheduling page |
| `apps/frontend/src/features/scheduling/__tests__/` | Frontend component tests |

---

## Dependencies

### Existing Components to Reuse
- `x121_db::models::job::SubmitJob` -- reuse for job submission when schedule fires
- `x121_db::repositories::JobRepo::create` -- job creation path for scheduled jobs
- `x121_db::repositories::SchedulingPolicyRepo::find_active_off_peak` -- read off-peak policy config
- `x121_db::models::production_run::ProductionRun` -- target reference for batch scheduling
- `x121_events::bus::{EventBus, PlatformEvent}` -- publish schedule lifecycle events
- `x121_events::digest::DigestScheduler` -- pattern for background periodic task with CancellationToken
- `x121_api::state::AppState` -- shared app state with pool, event_bus
- `x121_api::error::{AppError, AppResult}` -- HTTP error mapping
- `x121_api::middleware::auth::AuthUser` -- authentication extractor
- `x121_api::middleware::rbac::RequireAdmin` -- admin authorization
- `x121_api::response::DataResponse` -- standard response envelope
- `tests/common/mod.rs` -- `build_test_app`, `body_json`, `post_json`, `get`, `delete` helpers
- `apps/frontend/src/lib/api` -- shared API client
- `apps/frontend/src/features/job-tray/` -- job status tray for schedule event display (PRD-54)

### New Infrastructure Needed
- `cron` crate -- Rust cron expression parsing and evaluation
- `chrono-tz` crate -- IANA timezone handling in Rust
- `ScheduleExecutor` -- background Tokio task polling for due schedules
- Calendar grid component -- React calendar visualization (custom or lightweight library)
- Cron expression builder UI -- dropdown-based UI for building common cron patterns

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations -- Tasks 1.1-1.4
2. Phase 2: Models & Repositories -- Tasks 2.1-2.6
3. Phase 3: Schedule Executor -- Tasks 3.1-3.5
4. Phase 4: Schedule Management API -- Tasks 4.1-4.4
5. Phase 5: Frontend Calendar UI -- Tasks 5.1-5.7
6. Phase 6: Integration & Testing -- Tasks 6.1-6.4

**MVP Success Criteria:**
- Schedules can be created (one-time and recurring with cron expressions)
- Background executor fires due schedules and submits jobs through existing PRD-08 pipeline
- Row-level locking prevents duplicate firings across API server instances
- Off-peak smart slot selection suggests optimal execution windows
- Per-user timezone preferences stored and respected in schedule display
- Calendar UI visualizes scheduled work with week/month views
- Drag-to-reschedule works on the calendar
- Schedule lifecycle management (pause, resume, trigger-now, delete) via API
- Execution history logged for all schedule firings
- Schedule events published via EventBus (PRD-10)
- All integration tests pass (DB-level and API-level)

### Post-MVP Enhancements
- Wake-on-demand integration with PRD-87 (Req 2.1) -- wake sleeping workers before scheduled jobs
- Schedule templates (Req 2.2) -- save and reuse common schedule configurations
- Queue load heatmap on calendar (Req 2.3) -- visual GPU load prediction overlay
- Recurring schedule end dates and run counts (Req 2.4) -- `ends_at` and `max_runs` fields

---

## Notes

1. **Migration ordering matters:** Status lookup tables (Task 1.1) must run before the schedules table (Task 1.2) because of FK references. The schedule_executions table (Task 1.3) must run after both schedules and jobs tables exist. The ALTER migration (Task 1.4) runs last.
2. **FOR UPDATE SKIP LOCKED is critical:** Without row-level locking, multiple API server instances will fire the same schedule simultaneously. This is tested explicitly in Task 6.2.
3. **Cron evaluation timezone awareness:** Cron expressions are evaluated relative to the schedule's configured timezone, not UTC. The `chrono-tz` crate handles DST transitions. All stored timestamps remain UTC.
4. **Calendar occurrence expansion limit:** The `/schedules/calendar` endpoint caps expanded occurrences at 200 per request to prevent abuse from tight cron expressions (e.g., "every minute").
5. **Executor does not manage job completion tracking directly.** The `schedule.completed` and `schedule.failed` events are triggered by subscribing to existing job lifecycle events from the EventBus, not by the executor polling. The executor only handles the "fire" step.
6. **Off-peak slot selection is heuristic-based.** The initial implementation uses simple bucket counting. More sophisticated predictions (ML-based queue load forecasting) can be added post-MVP without API changes.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-119
