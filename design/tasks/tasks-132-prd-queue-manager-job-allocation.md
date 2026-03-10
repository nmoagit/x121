# Task List: Queue Manager & Intelligent Job Allocation

**PRD Reference:** `design/prds/132-prd-queue-manager-job-allocation.md`
**Scope:** Full operational control over job lifecycle, allocation, and distribution across the ComfyUI worker pool (Phase 1 MVP)

## Overview

This implementation extends the existing job queue system (PRD-07/08) with intelligent allocation, job reassignment, worker drain mode, admin queue manipulation, and complete visibility. The backend changes center on the `submitter.rs` allocator, `job_repo.rs` bulk operations, `manager.rs` drain support, and new admin handler endpoints. The frontend expands `QueueStatusView` into a full operations dashboard with table, filters, stats, and an embedded Activity Console panel.

### What Already Exists
- **Job state machine** (`core/src/scheduling.rs`) — 9-state FSM with `validate_transition()` (Pending=1, Running=2, Completed=3, Failed=4, Cancelled=5, Retrying=6, Scheduled=7, Paused=8, Dispatched=9)
- **Job repo** (`db/src/repositories/job_repo.rs`) — submit, cancel, transition_state, claim_next, list_queue, queue_counts, update_priority
- **Job handlers** (`api/src/handlers/jobs.rs`) — submit, list, get, cancel (with ComfyUI cancel), retry, pause, resume, transitions
- **ComfyUI API** (`comfyui/src/api.rs`) — `cancel_execution()` (POST /queue delete), `interrupt()` (POST /interrupt), `health_check()`
- **ComfyUI Manager** (`comfyui/src/manager.rs`) — `cancel_job()`, `connected_instance_ids()`, `submit_workflow()`, `refresh_instances()`
- **Submitter** (`pipeline/src/submitter.rs`) — `pick_instance()` takes first available instance (naive)
- **Event loop** (`worker/src/event_loop.rs`) — handles GenerationCompleted/Error/Cancelled events
- **Queue UI** (`features/queue/QueueStatusView.tsx`) — simple list of pending/scheduled jobs with pause/resume/cancel
- **Queue hooks** (`features/queue/hooks/use-queue.ts`) — useQueueStatus (10s poll), usePauseJob, useResumeJob, useCancelJob, useReorderJob
- **Activity log system** (`core/src/activity.rs`, `events/src/activity.rs`) — `ActivityLogEntry::curated()`, `ActivityLogBroadcaster`
- **Activity Console UI** (`features/activity-console/ActivityConsolePanel.tsx`) — embeddable panel with filter toolbar, streaming, pause/clear
- **`JobStatus` enum** (`db/src/models/status.rs`) — 9 variants (no Held yet)
- **`WorkerStatus` enum** (`db/src/models/status.rs`) — includes `Draining = 4`
- **`ComfyUIInstance` model** — has `metadata` JSONB field, `is_enabled`, `status_id`

### What We're Building
1. Database: `held` job status (id=10), `drain_mode` column on instances, `comfyui_instance_id` on jobs, reassignment tracking on transitions
2. Backend: Intelligent allocator (least-loaded), job reassignment, hold/release, move-to-front, bulk cancel, redistribute, queue stats, worker drain mode
3. Backend: Curated activity log emissions for all queue lifecycle events
4. Frontend: Full queue table with all-state visibility, filters, sorting, stats dashboard, job action controls, drain controls, embedded Activity Console

### Key Design Decisions
1. **Held status = 10** — follows the existing SMALLSERIAL pattern; added as new row in `job_statuses` seed table
2. **`drain_mode` as boolean column** — simpler than JSONB metadata; the `WorkerStatus::Draining` enum already exists at id=4
3. **`comfyui_instance_id` on jobs** — direct FK provides cleaner queries than joining through `comfyui_executions`
4. **Least-loaded allocator** — count active jobs per instance via DB query, not in-memory tracking (source of truth is DB)
5. **Embedded Activity Console** — reuse existing `ActivityConsolePanel` with a source filter prop, not build new log UI

---

## Phase 1: Database Schema Changes [COMPLETE]

### Task 1.1: Add Held Job Status [COMPLETE]
**File:** `apps/db/migrations/20260311000001_queue_manager_schema.sql`

Add the `held` status to the `job_statuses` lookup table (id=10).

```sql
INSERT INTO job_statuses (id, name, description)
VALUES (10, 'held', 'Job is held by admin and will not be dispatched')
ON CONFLICT (id) DO NOTHING;
```

**Acceptance Criteria:**
- [x] `held` status inserted with id=10
- [x] Does not conflict with existing 9 statuses (1-9)

### Task 1.2: Add Held Variant to JobStatus Enum [COMPLETE]
**Files:** `apps/backend/crates/db/src/models/status.rs`, `apps/backend/crates/core/src/scheduling.rs`, `apps/backend/crates/core/src/job_status.rs`

Add `Held = 10` to `JobStatus` enum. Update the state machine to support:
- Pending (1) -> Held (10)
- Held (10) -> Pending (1)
- Held (10) -> Cancelled (5)

Update `status_name()` to include "Held" for id=10.

**Acceptance Criteria:**
- [x] `JobStatus::Held` variant exists with id=10
- [x] `valid_transitions(1)` includes 10 (Pending -> Held)
- [x] `valid_transitions(10)` returns `[1, 5]` (Held -> Pending, Held -> Cancelled)
- [x] `status_name(10)` returns `"Held"`
- [x] `JOB_STATUS_ID_HELD: i64 = 10` constant added to `job_status.rs`
- [x] Existing tests pass; new tests added for Held transitions

### Task 1.3: Add drain_mode Column to comfyui_instances [COMPLETE]
**File:** `apps/db/migrations/20260311000001_queue_manager_schema.sql` (same migration)

```sql
ALTER TABLE comfyui_instances
    ADD COLUMN IF NOT EXISTS drain_mode BOOLEAN NOT NULL DEFAULT false;
```

**Acceptance Criteria:**
- [x] `drain_mode` column exists with default `false`
- [x] All existing instances remain active (drain_mode = false)

### Task 1.4: Add comfyui_instance_id to Jobs Table [COMPLETE]
**File:** `apps/db/migrations/20260311000001_queue_manager_schema.sql` (same migration)

Track which ComfyUI instance a job is assigned to, and add reassignment tracking to transitions.

```sql
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS comfyui_instance_id BIGINT REFERENCES comfyui_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_comfyui_instance
    ON jobs(comfyui_instance_id) WHERE comfyui_instance_id IS NOT NULL;

ALTER TABLE job_state_transitions
    ADD COLUMN IF NOT EXISTS from_instance_id BIGINT REFERENCES comfyui_instances(id),
    ADD COLUMN IF NOT EXISTS to_instance_id BIGINT REFERENCES comfyui_instances(id);
```

**Acceptance Criteria:**
- [x] `jobs.comfyui_instance_id` FK column created with index
- [x] `job_state_transitions.from_instance_id` and `to_instance_id` columns created
- [x] ON DELETE SET NULL preserves job history when instance is removed

### Task 1.5: Update Job Model with comfyui_instance_id [COMPLETE]
**Files:** `apps/backend/crates/db/src/models/job.rs`, `apps/backend/crates/db/src/repositories/job_repo.rs`

Add `comfyui_instance_id: Option<DbId>` to the `Job` struct and update `COLUMNS` constant to include it.

**Acceptance Criteria:**
- [x] `Job` struct has `comfyui_instance_id: Option<DbId>` field
- [x] `COLUMNS` string includes `comfyui_instance_id`
- [x] `QUEUE_VIEW_COLUMNS` includes `comfyui_instance_id` and `status_id`
- [x] `QueuedJobView` struct includes `comfyui_instance_id` and `status_id`
- [x] Existing queries compile and work

### Task 1.6: Update ComfyUIInstance Model with drain_mode [COMPLETE]
**File:** `apps/backend/crates/db/src/models/comfyui.rs`

Add `drain_mode: bool` to `ComfyUIInstance`.

**Acceptance Criteria:**
- [x] `ComfyUIInstance` struct has `drain_mode: bool` field
- [x] COLUMNS constant in `comfyui_instance_repo.rs` includes `drain_mode`

---

## Phase 2: Backend — Intelligent Allocator [COMPLETE]

### Task 2.1: Replace pick_instance() with Least-Loaded Allocator [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/submitter.rs`

Replace the naive `pick_instance()` with a load-aware allocator that:
1. Gets connected, non-draining instance IDs from `ComfyUIManager`
2. Queries active job counts per instance: `SELECT comfyui_instance_id, COUNT(*) FROM jobs WHERE comfyui_instance_id = ANY($1) AND status_id IN (1, 2, 9) GROUP BY comfyui_instance_id`
3. Selects the instance with fewest active jobs
4. On tie, picks the one with the oldest `last_connected_at` (idle longest)
5. If a `target_instance_id` is provided, uses that specific instance

**Acceptance Criteria:**
- [x] `pick_instance()` considers active job count per instance
- [x] Draining instances are excluded (checked via DB or manager)
- [x] Disabled instances are excluded
- [x] Ties broken by least-recently-active preference
- [x] Function accepts optional `target_instance_id` for forced assignment
- [x] Allocation decision logged at debug level

### Task 2.2: Add Instance Load Query to Job Repo [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/job_repo.rs`

Add method to count active jobs per instance for allocation decisions.

```rust
/// Count active (pending/dispatched/running) jobs per ComfyUI instance.
pub async fn active_jobs_by_instance(
    pool: &PgPool,
    instance_ids: &[DbId],
) -> Result<Vec<(DbId, i64)>, sqlx::Error>
```

**Acceptance Criteria:**
- [x] Returns `(instance_id, active_job_count)` tuples
- [x] Counts jobs with status_id IN (Pending, Dispatched, Running)
- [x] Only counts jobs assigned to the given instance IDs
- [x] Instances with zero jobs included (via LEFT JOIN or post-processing)

### Task 2.3: Set comfyui_instance_id on Job Dispatch [COMPLETE]
**Files:** `apps/backend/crates/pipeline/src/submitter.rs`, `apps/backend/crates/db/src/repositories/job_repo.rs`

When a job is dispatched to an instance, set `comfyui_instance_id` on the job record.

Add `JobRepo::assign_instance()`:
```rust
pub async fn assign_instance(pool: &PgPool, job_id: DbId, instance_id: DbId) -> Result<(), sqlx::Error>
```

Call it in `submit_to_comfyui()` after `pick_instance()` succeeds.

**Acceptance Criteria:**
- [x] `jobs.comfyui_instance_id` set when a job is dispatched to a ComfyUI instance
- [x] Method available for reassignment flow

### Task 2.4: Filter Draining Instances from Allocator [COMPLETE]
**Files:** `apps/backend/crates/comfyui/src/manager.rs`, `apps/backend/crates/db/src/repositories/comfyui_instance_repo.rs`

Add `ComfyUIManager::connected_non_draining_instance_ids()` that returns only instances where `drain_mode = false`.

Add `ComfyUIInstanceRepo::list_enabled_non_draining()`.

**Acceptance Criteria:**
- [x] Allocator never assigns work to draining instances
- [x] Method used by `pick_instance()` in place of `connected_instance_ids()`

---

## Phase 3: Backend — Job Cancellation with ComfyUI Interrupt [COMPLETE]

### Task 3.1: Enhance cancel_job Handler to Use ComfyUI Interrupt [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

The current `cancel_job` handler already calls `state.comfyui_manager.cancel_job()` which uses `cancel_execution` (POST /queue delete). Enhance it to also try `interrupt()` for currently running jobs, and add the cancelling user's info.

**Acceptance Criteria:**
- [x] Cancel sends both queue delete AND interrupt for running jobs
- [x] Cancellation reason and user recorded in job transition
- [x] If ComfyUI interrupt fails, job is still cancelled in DB with warning logged
- [x] Activity log entry emitted for cancellation (see Phase 6)

### Task 3.2: Add Interrupt Method to ComfyUI Manager [COMPLETE]
**File:** `apps/backend/crates/comfyui/src/manager.rs`

Add `interrupt_instance()` that sends POST /interrupt to a specific instance:

```rust
pub async fn interrupt_instance(&self, instance_id: DbId) -> Result<(), ComfyUIManagerError>
```

**Acceptance Criteria:**
- [x] Sends POST /interrupt to the instance's API
- [x] Returns error if instance not connected
- [x] Used by cancel handler when job is in Running state

---

## Phase 4: Backend — Job Reassignment [COMPLETE]

### Task 4.1: Add Reassign Job Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

`POST /api/v1/admin/jobs/:id/reassign`

Request body:
```json
{
  "target_instance_id": 5    // null = auto-assign
}
```

Flow:
1. Verify job is in Dispatched or Running state
2. Cancel on current instance (interrupt + queue delete)
3. Clear `comfyui_instance_id` on job
4. Reset job status to Pending (with optional `target_instance_id` stored)
5. Reset segment if applicable (clear output, reset status)
6. Log transition with from_instance_id and to_instance_id

**Acceptance Criteria:**
- [x] Only admin can reassign
- [x] Reassignment available for Dispatched and Running jobs
- [x] Job retains priority and parameters after reassignment
- [x] Transition logged with instance IDs
- [x] Segment state reset if job is segment_generation type
- [x] Activity log entry emitted

### Task 4.2: Add Reassignment Support to Job Repo [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/job_repo.rs`

```rust
/// Reset a job for reassignment: set status to Pending, clear instance, update transition log.
pub async fn reassign(
    pool: &PgPool,
    job_id: DbId,
    from_instance_id: Option<DbId>,
    to_instance_id: Option<DbId>,
    triggered_by: DbId,
) -> Result<Job, sqlx::Error>
```

**Acceptance Criteria:**
- [x] Job status reset to Pending
- [x] `comfyui_instance_id` cleared (or set to target)
- [x] Transition recorded with from/to instance IDs
- [x] `claimed_at` and `started_at` cleared

### Task 4.3: List Available Instances for Reassignment [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs` (or new `queue_admin.rs`)

`GET /api/v1/admin/comfyui/instances` — returns instances with their health and active job count for the reassignment modal.

Reuse `ComfyUIInstanceRepo::list_enabled` and join with active job counts.

**Acceptance Criteria:**
- [x] Returns instance id, name, status, drain_mode, active_job_count
- [x] Only healthy/connected instances shown
- [x] Admin-only endpoint

---

## Phase 5: Backend — Worker Drain Mode [COMPLETE]

### Task 5.1: Add Drain/Undrain Endpoints [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs` (or new `queue_admin.rs`)

`POST /api/v1/admin/comfyui/:id/drain` — set `drain_mode = true`
`POST /api/v1/admin/comfyui/:id/undrain` — set `drain_mode = false`

**Acceptance Criteria:**
- [x] Drain sets `drain_mode = true` in DB
- [x] Undrain sets `drain_mode = false`
- [x] Admin-only endpoints
- [x] Activity log entries emitted for both actions

### Task 5.2: Add Drain Mode Repo Methods [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/comfyui_instance_repo.rs`

```rust
pub async fn set_drain_mode(pool: &PgPool, id: DbId, drain: bool) -> Result<bool, sqlx::Error>
pub async fn count_active_jobs(pool: &PgPool, instance_id: DbId) -> Result<i64, sqlx::Error>
```

**Acceptance Criteria:**
- [x] `set_drain_mode` updates `drain_mode` column
- [x] `count_active_jobs` counts non-terminal jobs assigned to instance
- [x] Used by drain/undrain handlers and auto-drain-completion check

### Task 5.3: Auto-Transition Draining to Drained [COMPLETE]
**File:** `apps/backend/crates/worker/src/event_loop.rs`

After a job completes on an instance, check if the instance is draining and has no remaining active jobs. If so, emit a "worker drained" activity log entry.

**Acceptance Criteria:**
- [x] After `handle_generation_completed` and `handle_generation_cancelled`, check drain state
- [x] If instance is draining and active_jobs == 0, emit "Worker drained" log
- [x] Drained state visible in instance listing response

---

## Phase 6: Backend — Admin Queue Manipulation [COMPLETE]

### Task 6.1: Hold and Release Endpoints [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

`POST /api/v1/admin/jobs/:id/hold` — transition Pending -> Held
`POST /api/v1/admin/jobs/:id/release` — transition Held -> Pending

Use existing `JobRepo::transition_state()`.

**Acceptance Criteria:**
- [x] Hold only works on Pending jobs
- [x] Release only works on Held jobs
- [x] Admin-only endpoints
- [x] Transition logged with admin user ID and reason
- [x] Activity log entries emitted

### Task 6.2: Move to Front Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

`POST /api/v1/admin/jobs/:id/move-to-front`

Sets priority to `min(current_priorities) - 1` to ensure it runs first.

**Acceptance Criteria:**
- [x] Only works on Pending/Held jobs
- [x] Admin-only endpoint
- [x] Priority set to minimum existing priority minus 1
- [x] Activity log entry emitted

### Task 6.3: Bulk Cancel Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

`POST /api/v1/admin/jobs/bulk-cancel`

Request body:
```json
{
  "filter": {
    "scene_id": 42,          // optional
    "character_id": 7,       // optional
    "project_id": 3,         // optional
    "submitted_by": 12,      // optional
    "status_ids": [1, 10]    // optional, defaults to [pending, held]
  }
}
```

**Acceptance Criteria:**
- [x] Cancels all matching pending/held jobs in a single SQL UPDATE
- [x] Returns count of cancelled jobs
- [x] Activity log entry emitted with count
- [x] Admin-only endpoint
- [x] Processes 100 jobs in under 2 seconds

### Task 6.4: Add Bulk Cancel to Job Repo [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/job_repo.rs`

```rust
pub async fn bulk_cancel(
    pool: &PgPool,
    filter: &BulkCancelFilter,
) -> Result<u64, sqlx::Error>
```

Builds a dynamic WHERE clause from filter criteria and sets status_id to Cancelled.

**Acceptance Criteria:**
- [x] Filters by scene_id (via parameters JSONB), character_id, project_id, submitted_by
- [x] Only cancels non-terminal jobs
- [x] Returns row count affected

### Task 6.5: Redistribute Queue Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

`POST /api/v1/admin/jobs/redistribute`

Request body:
```json
{
  "from_instance_id": 5
}
```

Clears `comfyui_instance_id` on all pending jobs assigned to the specified instance.

**Acceptance Criteria:**
- [x] Only affects pending/held jobs (not running/dispatched)
- [x] Sets `comfyui_instance_id = NULL` for auto-assignment
- [x] Returns count of redistributed jobs
- [x] Activity log entry emitted

### Task 6.6: Held Jobs Skipped by Dispatcher [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/job_repo.rs`

Update `claim_next` and `claim_next_scheduled` to exclude Held jobs (status_id = 10).

**Acceptance Criteria:**
- [x] Held jobs not picked up by any dispatcher query
- [x] Existing scheduling/off-peak logic unaffected

---

## Phase 7: Backend — Queue Statistics & Admin Routes [COMPLETE]

### Task 7.1: Queue Statistics Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

`GET /api/v1/admin/queue/stats`

Returns:
```json
{
  "counts_by_status": { "pending": 5, "running": 2, "dispatched": 1, "held": 3, ... },
  "avg_wait_secs": 12.5,
  "avg_execution_secs": 45.2,
  "throughput_per_hour": 80,
  "per_worker_load": [
    { "instance_id": 1, "name": "runpod-abc", "active_jobs": 2, "drain_mode": false }
  ]
}
```

**Acceptance Criteria:**
- [x] Status counts from real data (all 10 statuses)
- [x] Average wait time from last 50 completed jobs (submitted_at to claimed_at)
- [x] Average execution time from last 50 completed jobs (started_at to completed_at)
- [x] Throughput = completed jobs in last hour
- [x] Per-worker load from active job counts

### Task 7.2: Add Statistics Queries to Job Repo [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/job_repo.rs`

```rust
pub async fn counts_by_status(pool: &PgPool) -> Result<Vec<(StatusId, i64)>, sqlx::Error>
pub async fn avg_wait_time_secs(pool: &PgPool, limit: i64) -> Result<Option<f64>, sqlx::Error>
pub async fn avg_execution_time_secs(pool: &PgPool, limit: i64) -> Result<Option<f64>, sqlx::Error>
pub async fn completed_in_last_hour(pool: &PgPool) -> Result<i64, sqlx::Error>
```

**Acceptance Criteria:**
- [x] `counts_by_status` returns all statuses with their counts
- [x] `avg_wait_time_secs` calculates from `claimed_at - submitted_at` for last N jobs
- [x] `avg_execution_time_secs` calculates from `completed_at - started_at` for last N jobs
- [x] `completed_in_last_hour` counts jobs completed in rolling 1-hour window

### Task 7.3: Enhanced Queue List Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/jobs.rs`

Enhance `GET /api/v1/queue` (or create `GET /api/v1/admin/queue/jobs`) to return ALL job states with filters.

Query params: `status_ids`, `instance_id`, `job_type`, `submitted_by`, `sort_by`, `sort_dir`, `limit`, `offset`

**Acceptance Criteria:**
- [x] Returns jobs in ALL states (not just pending/scheduled)
- [x] Filter by multiple status IDs
- [x] Filter by instance, job type, user
- [x] Sortable by priority, submitted_at, status, duration
- [x] Completed jobs limited to last 100 by default

### Task 7.4: Register Admin Routes [COMPLETE]
**File:** `apps/backend/crates/api/src/routes/mod.rs` (or appropriate route file)

Wire all new admin endpoints under `/api/v1/admin/`:
- `POST /admin/jobs/:id/reassign`
- `POST /admin/jobs/:id/hold`
- `POST /admin/jobs/:id/release`
- `POST /admin/jobs/:id/move-to-front`
- `POST /admin/jobs/bulk-cancel`
- `POST /admin/jobs/redistribute`
- `GET /admin/queue/stats`
- `GET /admin/queue/jobs`
- `POST /admin/comfyui/:id/drain`
- `POST /admin/comfyui/:id/undrain`
- `GET /admin/comfyui/instances` (with load data)

**Acceptance Criteria:**
- [x] All endpoints routed and require admin role
- [x] No conflicts with existing routes
- [x] Consistent with existing admin route patterns

---

## Phase 8: Backend — Activity Log Emissions [COMPLETE]

### Task 8.1: Emit Curated Activity Logs for Queue Lifecycle Events [COMPLETE]
**Files:** `apps/backend/crates/api/src/handlers/jobs.rs`, `apps/backend/crates/pipeline/src/submitter.rs`, `apps/backend/crates/worker/src/event_loop.rs`

Add `ActivityLogBroadcaster` as a parameter (via AppState) to all queue-related handlers and emit curated entries for:

| Event | Level | Location |
|-------|-------|----------|
| Job submitted | Info | `submitter.rs` |
| Job dispatched | Info | `submitter.rs` |
| Job completed | Info | `event_loop.rs` |
| Job failed | Error | `event_loop.rs` |
| Job cancelled | Warn | `jobs.rs` cancel handler |
| Job cancelled (interrupt failed) | Error | `jobs.rs` cancel handler |
| Job reassigned | Info | `jobs.rs` reassign handler |
| Job held | Info | `jobs.rs` hold handler |
| Job released | Info | `jobs.rs` release handler |
| Job moved to front | Info | `jobs.rs` move-to-front handler |
| Bulk cancel | Warn | `jobs.rs` bulk-cancel handler |
| Worker drain started | Info | drain handler |
| Worker drained | Info | `event_loop.rs` auto-detect |
| Worker undrained | Info | undrain handler |
| Allocation decision | Debug | `submitter.rs` |
| Queue redistributed | Info | redistribute handler |

**Acceptance Criteria:**
- [x] All 16 event types emit curated activity log entries
- [x] Source is `ActivityLogSource::Pipeline` for all entries
- [x] Entries include `job_id`, `entity_type`/`entity_id`, `user_id` where applicable
- [x] Entries include structured `fields` with instance names, durations, counts
- [x] Admin identity included in manually-triggered actions
- [x] Error entries include ComfyUI error messages when available
- [x] Allocation decisions at Debug level

### Task 8.2: Pass ActivityLogBroadcaster to Pipeline and Worker [COMPLETE]
**Files:** `apps/backend/crates/pipeline/src/submitter.rs`, `apps/backend/crates/worker/src/event_loop.rs`, `apps/backend/crates/worker/src/main.rs`

The broadcaster is already in `AppState`. For the worker/pipeline, pass the broadcaster (or a reference) into `submit_segment()` and the event loop so they can emit curated entries.

**Acceptance Criteria:**
- [x] Submitter has access to broadcaster for job submitted/dispatched/allocation events
- [x] Event loop has access to broadcaster for completion/failure/drain events
- [x] Existing `gen_log` per-scene logging continues to work alongside system-wide logs

---

## Phase 9: Frontend — Queue Types & API Hooks [COMPLETE]

### Task 9.1: Expand Queue Types [COMPLETE]
**File:** `apps/frontend/src/features/queue/types.ts`

Add types for the expanded queue view:

```typescript
export interface FullQueueJob {
  id: number;
  job_type: string;
  status_id: number;
  priority: number;
  submitted_by: number;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  actual_duration_secs: number | null;
  error_message: string | null;
  comfyui_instance_id: number | null;
  is_paused: boolean;
  progress_percent: number;
  parameters: Record<string, unknown>;
}

export interface QueueStats {
  counts_by_status: Record<string, number>;
  avg_wait_secs: number | null;
  avg_execution_secs: number | null;
  throughput_per_hour: number;
  per_worker_load: WorkerLoad[];
}

export interface WorkerLoad {
  instance_id: number;
  name: string;
  active_jobs: number;
  drain_mode: boolean;
}

export interface BulkCancelFilter {
  scene_id?: number;
  character_id?: number;
  project_id?: number;
  submitted_by?: number;
  status_ids?: number[];
}

export interface QueueJobFilter {
  status_ids?: number[];
  instance_id?: number;
  job_type?: string;
  submitted_by?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
```

**Acceptance Criteria:**
- [x] Types match backend API response shapes
- [x] Status constants added for Held (10)
- [x] `statusLabel()` and `statusColor()` helpers for all 10 statuses

### Task 9.2: Add Admin Queue Hooks [COMPLETE]
**File:** `apps/frontend/src/features/queue/hooks/use-queue.ts`

Add hooks for all new admin endpoints:

```typescript
export function useAdminQueueJobs(filter: QueueJobFilter)  // GET /admin/queue/jobs
export function useQueueStats()                             // GET /admin/queue/stats (5s poll)
export function useHoldJob()                                // POST /admin/jobs/:id/hold
export function useReleaseJob()                             // POST /admin/jobs/:id/release
export function useMoveToFront()                            // POST /admin/jobs/:id/move-to-front
export function useReassignJob()                            // POST /admin/jobs/:id/reassign
export function useBulkCancel()                             // POST /admin/jobs/bulk-cancel
export function useRedistributeQueue()                      // POST /admin/jobs/redistribute
export function useDrainWorker()                            // POST /admin/comfyui/:id/drain
export function useUndrainWorker()                          // POST /admin/comfyui/:id/undrain
export function useWorkerInstances()                        // GET /admin/comfyui/instances
```

**Acceptance Criteria:**
- [x] All hooks follow existing key factory pattern (`queueKeys`)
- [x] Mutation hooks invalidate `queueKeys.status()` and `queueKeys.stats()` on success
- [x] `useAdminQueueJobs` supports filter parameters
- [x] `useQueueStats` polls at 5-second interval
- [x] Polling interval reduced from 10s to 5s for queue status

---

## Phase 10: Frontend — Queue Dashboard UI [COMPLETE]

### Task 10.1: Build Full Queue Table Component [COMPLETE]
**File:** `apps/frontend/src/features/queue/QueueTable.tsx`

Replace the simple job list in `QueueStatusView` with a full table showing all states:

Columns: Job ID, Type, Entity, Status (badge), Priority (editable), Worker, Submitted, Started, Duration, Submitted By

Row actions: Cancel, Reassign, Hold/Release, Move to Front (via dropdown menu)

**Acceptance Criteria:**
- [x] Table shows ALL job states (pending, dispatched, running, scheduled, paused, held, failed, completed, cancelled)
- [x] Running jobs show assigned worker name
- [x] Failed jobs show error message on hover/expand
- [x] Duration column shows live timer for running jobs
- [x] Priority column allows inline edit (admin only)
- [x] Row checkbox for bulk select
- [x] Color-coded status badges for all 10 states

### Task 10.2: Build Queue Filter Bar [COMPLETE]
**File:** `apps/frontend/src/features/queue/QueueFilterBar.tsx`

Filter toolbar above the queue table:

Filters: Status (multi-select), Worker (dropdown), Job Type (dropdown), Submitted By (typeahead)

Sort: Priority, Submitted Time, Status, Duration

**Acceptance Criteria:**
- [x] Filters update the `useAdminQueueJobs` query params
- [x] Sorting cycles through asc/desc on column header click
- [x] Active filters shown as removable chips
- [x] "Clear all" button resets filters
- [x] Filters persist in URL search params

### Task 10.3: Build Queue Statistics Panel [COMPLETE]
**File:** `apps/frontend/src/features/queue/QueueStatsPanel.tsx`

Stats bar at top of queue page showing:
- Job counts by status (badge per status)
- Average wait time
- Average execution time
- Throughput (jobs/hour)
- Per-worker load (horizontal bars)

**Acceptance Criteria:**
- [x] All metrics from real data via `useQueueStats`
- [x] Per-worker load chart shows bars per instance
- [x] Metrics auto-refresh at 5-second interval
- [x] Draining workers shown with visual indicator

### Task 10.4: Build Job Action Controls [COMPLETE]
**File:** `apps/frontend/src/features/queue/JobActions.tsx`

Row-level action menu and bulk action toolbar:

Row actions:
- Cancel (with confirm dialog, calls interrupt for running jobs)
- Reassign (opens instance picker modal)
- Hold / Release (toggle)
- Move to Front

Bulk actions (toolbar appears when rows selected):
- Bulk Cancel
- Bulk Hold / Release

**Acceptance Criteria:**
- [x] Cancel shows confirmation dialog
- [x] Reassign opens modal with instance list (name, active jobs, drain status)
- [x] "Auto-assign" option in reassign modal
- [x] Hold/Release correctly toggles based on current state
- [x] Move to Front updates immediately (optimistic)
- [x] Bulk cancel shows count confirmation

### Task 10.5: Build Worker Drain Controls [COMPLETE]
**File:** `apps/frontend/src/features/queue/WorkerDrainPanel.tsx`

Worker section in the queue dashboard showing each instance with:
- Name, status, active jobs count
- "Drain" / "Undrain" toggle button
- "Redistribute" button (moves pending jobs off this worker)
- "Ready to stop" indicator when drained

**Acceptance Criteria:**
- [x] Lists all connected instances with their drain state
- [x] Drain/Undrain toggle calls appropriate endpoint
- [x] Redistribute button calls redistribute endpoint
- [x] Drained workers show green "Ready to stop" badge
- [x] Draining workers show amber "Draining (N jobs remaining)" badge

### Task 10.6: Embed Activity Console Panel [COMPLETE]
**File:** `apps/frontend/src/features/queue/QueueManagerPage.tsx` (or extend existing page)

Embed the existing `ActivityConsolePanel` with a Pipeline source filter at the bottom of the queue page.

**Acceptance Criteria:**
- [x] Activity Console panel appears below the queue table
- [x] Filtered to show only `source: "pipeline"` entries
- [x] Resizable/collapsible panel
- [x] Shows live queue events (job dispatched, completed, failed, etc.)

### Task 10.7: Assemble Queue Manager Page [COMPLETE]
**File:** `apps/frontend/src/app/pages/QueueManagerPage.tsx`

Create the page wrapper that combines all queue components:
1. QueueStatsPanel (top)
2. QueueFilterBar
3. QueueTable (center, scrollable)
4. WorkerDrainPanel (sidebar or panel)
5. ActivityConsolePanel (bottom, collapsible)

**Acceptance Criteria:**
- [x] Page layout combines all components
- [x] Auto-refresh at 5-second interval
- [x] Page accessible from navigation
- [x] Responsive layout for different screen sizes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260311000001_queue_manager_schema.sql` | Migration: held status, drain_mode, comfyui_instance_id, transition tracking |
| `apps/backend/crates/db/src/models/status.rs` | Add `Held = 10` to `JobStatus` enum |
| `apps/backend/crates/db/src/models/job.rs` | Add `comfyui_instance_id` to Job struct |
| `apps/backend/crates/db/src/models/comfyui.rs` | Add `drain_mode` to ComfyUIInstance |
| `apps/backend/crates/db/src/repositories/job_repo.rs` | Bulk cancel, stats queries, instance assignment, held filtering |
| `apps/backend/crates/db/src/repositories/comfyui_instance_repo.rs` | Drain mode, active job counting |
| `apps/backend/crates/core/src/scheduling.rs` | Add Held state transitions to FSM |
| `apps/backend/crates/core/src/job_status.rs` | Add `JOB_STATUS_ID_HELD` constant |
| `apps/backend/crates/api/src/handlers/jobs.rs` | Admin endpoints: hold, release, reassign, move-to-front, bulk-cancel, redistribute, stats |
| `apps/backend/crates/api/src/routes/mod.rs` | Register admin queue routes |
| `apps/backend/crates/pipeline/src/submitter.rs` | Intelligent allocator replacing `pick_instance()` |
| `apps/backend/crates/comfyui/src/manager.rs` | `interrupt_instance()`, drain-aware instance listing |
| `apps/backend/crates/worker/src/event_loop.rs` | Auto-drain completion detection, activity log emissions |
| `apps/frontend/src/features/queue/types.ts` | Expanded TypeScript types for queue manager |
| `apps/frontend/src/features/queue/hooks/use-queue.ts` | Admin queue hooks |
| `apps/frontend/src/features/queue/QueueTable.tsx` | Full queue table component |
| `apps/frontend/src/features/queue/QueueFilterBar.tsx` | Filter toolbar |
| `apps/frontend/src/features/queue/QueueStatsPanel.tsx` | Statistics dashboard panel |
| `apps/frontend/src/features/queue/JobActions.tsx` | Job action controls |
| `apps/frontend/src/features/queue/WorkerDrainPanel.tsx` | Worker drain controls |
| `apps/frontend/src/app/pages/QueueManagerPage.tsx` | Page wrapper combining all components |

---

## Dependencies

### Existing Components to Reuse
- `JobRepo::transition_state()` — for hold/release state changes
- `JobRepo::update_priority()` — for move-to-front
- `ComfyUIManager::cancel_job()` — for cancellation with queue delete
- `ComfyUIApi::interrupt()` — for interrupting running executions
- `ActivityLogEntry::curated()` — for all queue event logging
- `ActivityLogBroadcaster::publish()` — for broadcasting to Activity Console
- `ActivityConsolePanel` component — for embedded log view
- `find_and_authorize()` helper — for job ownership checks

### New Infrastructure Needed
- Intelligent allocator function (replaces `pick_instance()`)
- Bulk cancel with JSONB parameter filtering
- Queue statistics aggregation queries
- Drain mode lifecycle management
- Admin queue route group

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema Changes — Tasks 1.1–1.6
2. Phase 2: Intelligent Allocator — Tasks 2.1–2.4
3. Phase 3: Cancellation with Interrupt — Tasks 3.1–3.2
4. Phase 4: Job Reassignment — Tasks 4.1–4.3
5. Phase 5: Worker Drain Mode — Tasks 5.1–5.3
6. Phase 6: Admin Queue Manipulation — Tasks 6.1–6.6
7. Phase 7: Queue Statistics & Routes — Tasks 7.1–7.4
8. Phase 8: Activity Log Emissions — Tasks 8.1–8.2
9. Phase 9: Frontend Types & Hooks — Tasks 9.1–9.2
10. Phase 10: Frontend Dashboard UI — Tasks 10.1–10.7

**MVP Success Criteria:**
- Admins can see all jobs (pending, running, completed) in one view
- Cancelling a running job frees the GPU within 5 seconds (ComfyUI interrupt)
- Job reassignment works without losing job parameters
- Worker drain completes gracefully (no jobs killed)
- Intelligent allocation distributes jobs evenly (least-loaded wins)
- Bulk cancel processes 100 jobs in under 2 seconds
- All queue events visible in embedded Activity Console

### Post-MVP Enhancements
- VRAM-aware allocation (PRD Req 2.1)
- Priority lanes (PRD Req 2.2)
- Job dependency chains (PRD Req 2.3)
- SSE real-time queue updates (PRD Req 2.4)

---

## Notes

1. The `held` status ID must be 10 to avoid conflicting with existing statuses 1-9. Verify seed migration runs after existing job_statuses seed.
2. The `comfyui_instance_id` column on `jobs` supplements (does not replace) the `worker_id` column. `worker_id` refers to internal worker processes; `comfyui_instance_id` refers to the ComfyUI server receiving the workflow.
3. The allocator queries the DB for active job counts (not in-memory) to ensure consistency across API server restarts and multiple server instances.
4. Drain mode is a soft concept — the instance stays connected and can still be manually assigned jobs via reassignment. Only automatic allocation skips draining instances.
5. Bulk cancel filters by JSONB `parameters` content (e.g., `parameters->>'scene_id'`). This requires the parameters to follow the `SegmentJobParams` structure — verify all job types use consistent parameter formats.
6. The Activity Console embedding reuses the existing `ActivityConsolePanel` component with a source filter. No new WebSocket connection or log infrastructure needed.

---

## Version History

- **v1.0** (2026-03-10): Initial task list creation from PRD-132
