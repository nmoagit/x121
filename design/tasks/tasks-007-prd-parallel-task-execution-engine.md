# Task List: Parallel Task Execution Engine

**PRD Reference:** `design/prds/007-prd-parallel-task-execution-engine.md`
**Scope:** Build a background job execution engine that dispatches tasks to workers, tracks real-time progress, supports parallel execution, and enforces a strict "no silent retries" policy.

## Overview

This PRD creates the core job execution infrastructure. Jobs are submitted via API, persisted in PostgreSQL, dispatched to available workers by a background dispatcher task, and tracked through their full lifecycle. Progress updates flow from workers through the ComfyUI bridge (PRD-005) to the event bus and into WebSocket-connected frontend clients. The engine is intentionally simple: it dispatches and tracks, but does not implement priority scheduling (PRD-008) or worker pool management (PRD-046).

### What Already Exists
- PRD-000: Database with migration framework, `job_statuses` lookup table (pending, running, completed, failed, cancelled, retrying)
- PRD-002: Axum server, `AppState`, WebSocket infrastructure, Tokio runtime
- PRD-003: Auth middleware for API access
- PRD-005: ComfyUI bridge for workflow submission and progress events

### What We're Building
1. Database table: `jobs` with full lifecycle tracking
2. Job submission API (returns immediately with job ID)
3. Background dispatcher that assigns jobs to available workers
4. Progress tracking and aggregation
5. Job cancellation and manual retry
6. "No silent retries" enforcement
7. Job status WebSocket notifications

### Key Design Decisions
1. **Database-backed queue** — Jobs are stored in PostgreSQL, not an in-memory queue. This ensures durability across server restarts and supports the query patterns needed by the scheduler (PRD-008).
2. **Dispatcher as Tokio task** — A single background task polls for pending jobs and dispatches them. This avoids complex distributed locking.
3. **No automatic retry** — Failed jobs stay failed until the user explicitly retries. This is a core design principle of the platform.
4. **Worker assignment via claimed_at** — Jobs are assigned to workers using an atomic UPDATE with `WHERE claimed_at IS NULL` to prevent double-dispatch.

---

## Phase 1: Database Schema

### Task 1.1: Create Jobs Table
**File:** `migrations/20260218600001_create_jobs_table.sql`

```sql
CREATE TABLE jobs (
    id BIGSERIAL PRIMARY KEY,
    job_type TEXT NOT NULL,
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    submitted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    worker_id BIGINT,
    priority INTEGER NOT NULL DEFAULT 0,
    parameters JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    error_details JSONB,
    progress_percent SMALLINT NOT NULL DEFAULT 0,
    progress_message TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_duration_secs INTEGER,
    actual_duration_secs INTEGER,
    retry_of_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_status_id ON jobs(status_id);
CREATE INDEX idx_jobs_submitted_by ON jobs(submitted_by);
CREATE INDEX idx_jobs_worker_id ON jobs(worker_id);
CREATE INDEX idx_jobs_retry_of_job_id ON jobs(retry_of_job_id);
-- Partial index for dispatcher: unclaimed pending jobs
CREATE INDEX idx_jobs_pending_unclaimed ON jobs(priority DESC, submitted_at ASC)
    WHERE status_id = 1 AND claimed_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `jobs` table with all lifecycle columns
- [ ] `status_id BIGINT NOT NULL REFERENCES job_statuses(id)` — uses PRD-000 lookup table
- [ ] `submitted_by` FK to users table
- [ ] `worker_id` nullable (assigned on dispatch)
- [ ] `parameters JSONB` for job-type-specific configuration
- [ ] `result JSONB` for job output
- [ ] `error_message TEXT` and `error_details JSONB` for failure info
- [ ] `retry_of_job_id` self-referencing FK for manual retry tracking
- [ ] Partial index on pending unclaimed jobs for fast dispatcher queries
- [ ] All FK columns indexed

---

## Phase 2: Rust Models and Repository

### Task 2.1: Job Model Structs
**File:** `src/models/job.rs`

```rust
use sqlx::FromRow;
use serde::{Serialize, Deserialize};
use crate::types::DbId;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Job {
    pub id: DbId,
    pub job_type: String,
    pub status_id: DbId,
    pub submitted_by: DbId,
    pub worker_id: Option<DbId>,
    pub priority: i32,
    pub parameters: serde_json::Value,
    pub result: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub error_details: Option<serde_json::Value>,
    pub progress_percent: i16,
    pub progress_message: Option<String>,
    pub submitted_at: DateTime<Utc>,
    pub claimed_at: Option<DateTime<Utc>>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub estimated_duration_secs: Option<i32>,
    pub actual_duration_secs: Option<i32>,
    pub retry_of_job_id: Option<DbId>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitJob {
    pub job_type: String,
    pub parameters: serde_json::Value,
    pub priority: Option<i32>,
    pub estimated_duration_secs: Option<i32>,
}
```

**Acceptance Criteria:**
- [ ] `Job` struct maps to all database columns with correct types
- [ ] All IDs use `DbId`
- [ ] `SubmitJob` DTO for job creation
- [ ] `Serialize` on `Job` for API responses
- [ ] `Deserialize` on `SubmitJob` for API requests

### Task 2.2: Job Repository
**File:** `src/repositories/job_repo.rs`

```rust
pub struct JobRepo;

impl JobRepo {
    pub async fn submit(pool: &PgPool, user_id: DbId, input: &SubmitJob) -> Result<Job, sqlx::Error> {
        let status_pending = 1i64; // job_statuses: pending
        sqlx::query_as::<_, Job>(
            "INSERT INTO jobs (job_type, status_id, submitted_by, priority, parameters, estimated_duration_secs)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *"
        )
        .bind(&input.job_type)
        .bind(status_pending)
        .bind(user_id)
        .bind(input.priority.unwrap_or(0))
        .bind(&input.parameters)
        .bind(input.estimated_duration_secs)
        .fetch_one(pool)
        .await
    }

    /// Atomically claim the next unclaimed pending job for a worker.
    pub async fn claim_next(pool: &PgPool, worker_id: DbId) -> Result<Option<Job>, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            "UPDATE jobs SET worker_id = $1, claimed_at = NOW(), status_id = 2
             WHERE id = (
                SELECT id FROM jobs
                WHERE status_id = 1 AND claimed_at IS NULL
                ORDER BY priority DESC, submitted_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
             )
             RETURNING *"
        )
        .bind(worker_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn update_progress(
        pool: &PgPool,
        job_id: DbId,
        percent: i16,
        message: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE jobs SET progress_percent = $2, progress_message = $3 WHERE id = $1"
        )
        .bind(job_id)
        .bind(percent)
        .bind(message)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn complete(pool: &PgPool, job_id: DbId, result: &serde_json::Value) -> Result<(), sqlx::Error> {
        let status_completed = 3i64;
        sqlx::query(
            "UPDATE jobs SET status_id = $2, result = $3, completed_at = NOW(),
                    progress_percent = 100,
                    actual_duration_secs = EXTRACT(EPOCH FROM NOW() - started_at)::INTEGER
             WHERE id = $1"
        )
        .bind(job_id)
        .bind(status_completed)
        .bind(result)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn fail(pool: &PgPool, job_id: DbId, error: &str, details: Option<&serde_json::Value>) -> Result<(), sqlx::Error> {
        let status_failed = 4i64;
        sqlx::query(
            "UPDATE jobs SET status_id = $2, error_message = $3, error_details = $4,
                    completed_at = NOW(),
                    actual_duration_secs = EXTRACT(EPOCH FROM COALESCE(NOW() - started_at, INTERVAL '0'))::INTEGER
             WHERE id = $1"
        )
        .bind(job_id)
        .bind(status_failed)
        .bind(error)
        .bind(details)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn cancel(pool: &PgPool, job_id: DbId) -> Result<bool, sqlx::Error> {
        let status_cancelled = 5i64;
        let result = sqlx::query(
            "UPDATE jobs SET status_id = $2, completed_at = NOW() WHERE id = $1 AND status_id NOT IN (3, 4, 5)"
        )
        .bind(job_id)
        .bind(status_cancelled)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn retry(pool: &PgPool, job_id: DbId, user_id: DbId) -> Result<Job, sqlx::Error> {
        // Get original job parameters, create new job with retry_of_job_id set
        let original = Self::find_by_id(pool, job_id).await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let status_pending = 1i64;
        sqlx::query_as::<_, Job>(
            "INSERT INTO jobs (job_type, status_id, submitted_by, priority, parameters, estimated_duration_secs, retry_of_job_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *"
        )
        .bind(&original.job_type)
        .bind(status_pending)
        .bind(user_id)
        .bind(original.priority)
        .bind(&original.parameters)
        .bind(original.estimated_duration_secs)
        .bind(job_id)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Job>, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            "SELECT * FROM jobs WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn list_by_user(pool: &PgPool, user_id: DbId) -> Result<Vec<Job>, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            "SELECT * FROM jobs WHERE submitted_by = $1 ORDER BY submitted_at DESC LIMIT 100"
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
    }
}
```

**Acceptance Criteria:**
- [ ] `submit` creates pending job, returns immediately with ID
- [ ] `claim_next` atomically assigns job to worker (SELECT FOR UPDATE SKIP LOCKED)
- [ ] `update_progress` updates percentage and message
- [ ] `complete` marks job done with result
- [ ] `fail` marks job failed with error details (no automatic retry)
- [ ] `cancel` marks job cancelled (only if not already completed/failed)
- [ ] `retry` creates new job referencing the original via `retry_of_job_id`

---

## Phase 3: Job Dispatcher

### Task 3.1: Background Dispatcher Task
**File:** `src/engine/dispatcher.rs`

```rust
use tokio::time::{interval, Duration};
use crate::types::DbId;

pub struct JobDispatcher {
    pool: PgPool,
    comfyui_manager: Arc<ComfyUIManager>,
    poll_interval: Duration,
}

impl JobDispatcher {
    pub fn new(pool: PgPool, comfyui_manager: Arc<ComfyUIManager>) -> Self {
        Self {
            pool,
            comfyui_manager,
            poll_interval: Duration::from_secs(1),
        }
    }

    pub async fn run(&self, cancel_token: CancellationToken) {
        let mut ticker = interval(self.poll_interval);
        tracing::info!("Job dispatcher started");

        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    tracing::info!("Job dispatcher shutting down");
                    break;
                }
                _ = ticker.tick() => {
                    self.try_dispatch().await;
                }
            }
        }
    }

    async fn try_dispatch(&self) {
        // Get available worker IDs from comfyui_manager
        // For each available worker, try to claim a job
        // If claimed, submit workflow to ComfyUI via bridge
    }
}
```

**Acceptance Criteria:**
- [ ] Polls for pending jobs every 1 second (configurable)
- [ ] Matches pending jobs with available workers
- [ ] Uses `claim_next` for atomic job assignment (no double-dispatch)
- [ ] Submits workflow to ComfyUI bridge after claiming
- [ ] Respects cancellation token for graceful shutdown
- [ ] Runs as a spawned Tokio task in `main.rs`

### Task 3.2: Worker Availability Check
**File:** `src/engine/dispatcher.rs` (extend)

```rust
impl JobDispatcher {
    async fn available_workers(&self) -> Vec<DbId> {
        // Query workers that are:
        // 1. Connected (ComfyUI bridge status = connected)
        // 2. Not currently running a job (no active claimed job)
        // Returns list of worker IDs
    }
}
```

**Acceptance Criteria:**
- [ ] Only dispatches to workers with active ComfyUI connections
- [ ] Workers with running jobs are excluded
- [ ] Empty worker list means no dispatch this cycle (job stays pending)

---

## Phase 4: Progress Tracking

### Task 4.1: Progress Event Handler
**File:** `src/engine/progress.rs`

Connect ComfyUI bridge events to job progress updates.

```rust
pub async fn handle_comfyui_event(
    pool: &PgPool,
    ws_manager: &WsManager,
    event: ComfyUIEvent,
) {
    match event {
        ComfyUIEvent::GenerationProgress { platform_job_id, percent, current_node, .. } => {
            JobRepo::update_progress(pool, platform_job_id, percent, current_node.as_deref()).await.ok();
            // Forward to WebSocket for UI
            let msg = serde_json::json!({
                "type": "job_progress",
                "job_id": platform_job_id,
                "percent": percent,
                "current_node": current_node,
            });
            ws_manager.broadcast(axum::extract::ws::Message::Text(msg.to_string())).await;
        }
        ComfyUIEvent::GenerationCompleted { platform_job_id, outputs, .. } => {
            JobRepo::complete(pool, platform_job_id, &outputs).await.ok();
            // Notify UI
        }
        ComfyUIEvent::GenerationError { platform_job_id, error, .. } => {
            JobRepo::fail(pool, platform_job_id, &error, None).await.ok();
            // Notify UI — NO automatic retry
        }
        _ => {}
    }
}
```

**Acceptance Criteria:**
- [ ] Progress events update `jobs.progress_percent` and `progress_message`
- [ ] Completion events mark job as completed with result
- [ ] Error events mark job as failed with error details
- [ ] All events forwarded to WebSocket for UI consumption
- [ ] No automatic retry on failure (strict policy)

### Task 4.2: Duration Tracking
**File:** `src/engine/progress.rs` (extend)

```rust
// When job transitions from claimed to running:
pub async fn mark_started(pool: &PgPool, job_id: DbId) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE jobs SET started_at = NOW(), status_id = 2 WHERE id = $1"
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] `started_at` set when job begins execution (not when claimed)
- [ ] `completed_at` set when job completes or fails
- [ ] `actual_duration_secs` calculated from `started_at` to `completed_at`
- [ ] Estimated remaining time: `estimated_duration_secs - elapsed`

---

## Phase 5: Job API Endpoints

### Task 5.1: Job Submission Endpoint
**File:** `src/api/handlers/jobs.rs`

```rust
pub async fn submit_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<SubmitJob>,
) -> Result<(StatusCode, Json<Job>), AppError> {
    let job = JobRepo::submit(&state.pool, auth.user_id, &input).await?;
    tracing::info!(job_id = job.id, job_type = %job.job_type, "Job submitted");
    Ok((StatusCode::CREATED, Json(job)))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/jobs` — submit job, returns 201 with job object
- [ ] Returns immediately (sub-200ms)
- [ ] Job is in `pending` status
- [ ] Requires authentication

### Task 5.2: Job Query Endpoints
**File:** `src/api/handlers/jobs.rs`

```rust
pub async fn list_jobs(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<JobListQuery>,
) -> Result<Json<Vec<Job>>, AppError> { ... }

pub async fn get_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> Result<Json<Job>, AppError> { ... }
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/jobs` — list jobs for current user (with optional status filter)
- [ ] `GET /api/v1/jobs/:id` — get job details
- [ ] Admin can list all jobs; users see only their own
- [ ] Pagination support (limit/offset)

### Task 5.3: Job Cancel Endpoint
**File:** `src/api/handlers/jobs.rs`

```rust
pub async fn cancel_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> Result<StatusCode, AppError> {
    // Verify user owns the job or is admin
    let job = JobRepo::find_by_id(&state.pool, job_id).await?
        .ok_or(AppError::NotFound("Job not found".to_string()))?;

    if job.submitted_by != auth.user_id && auth.role != "admin" {
        return Err(AppError::Forbidden("Cannot cancel another user's job".to_string()));
    }

    // Cancel in database
    JobRepo::cancel(&state.pool, job_id).await?;

    // If running, send cancel to ComfyUI bridge
    if job.worker_id.is_some() {
        state.comfyui_manager.cancel_job(job_id).await.ok();
    }

    Ok(StatusCode::NO_CONTENT)
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/jobs/:id/cancel` — cancel a pending or running job
- [ ] Users can only cancel their own jobs (admin can cancel any)
- [ ] Running jobs have cancel signal sent to ComfyUI
- [ ] Already completed/failed jobs cannot be cancelled (returns 409)

### Task 5.4: Job Retry Endpoint
**File:** `src/api/handlers/jobs.rs`

```rust
pub async fn retry_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> Result<(StatusCode, Json<Job>), AppError> {
    let original = JobRepo::find_by_id(&state.pool, job_id).await?
        .ok_or(AppError::NotFound("Job not found".to_string()))?;

    if original.status_id != 4 { // not failed
        return Err(AppError::BadRequest("Only failed jobs can be retried".to_string()));
    }

    let new_job = JobRepo::retry(&state.pool, job_id, auth.user_id).await?;
    Ok((StatusCode::CREATED, Json(new_job)))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/jobs/:id/retry` — create new job from failed job's parameters
- [ ] Only failed jobs can be retried
- [ ] New job has `retry_of_job_id` pointing to original
- [ ] New job starts in `pending` status (goes through normal dispatch)
- [ ] This is the ONLY way to retry — no automatic retry exists

### Task 5.5: Register Job Routes
**File:** `src/api/routes.rs` (update)

```rust
fn job_routes() -> Router<AppState> {
    Router::new()
        .route("/", axum::routing::get(handlers::jobs::list_jobs)
            .post(handlers::jobs::submit_job))
        .route("/:id", axum::routing::get(handlers::jobs::get_job))
        .route("/:id/cancel", axum::routing::post(handlers::jobs::cancel_job))
        .route("/:id/retry", axum::routing::post(handlers::jobs::retry_job))
}
```

**Acceptance Criteria:**
- [ ] All job routes registered under `/api/v1/jobs`
- [ ] All routes require authentication

---

## Phase 6: Integration Tests

### Task 6.1: Job Lifecycle Tests
**File:** `tests/job_tests.rs`

```rust
#[tokio::test]
async fn test_submit_returns_pending_job() {
    // Submit job, verify status is pending, verify ID returned
}

#[tokio::test]
async fn test_claim_next_atomic() {
    // Submit 2 jobs, claim with 2 workers concurrently
    // Each worker should get a different job
}

#[tokio::test]
async fn test_fail_no_auto_retry() {
    // Submit job, fail it, verify status stays failed
    // No new pending job should be created
}

#[tokio::test]
async fn test_manual_retry_creates_new_job() {
    // Submit and fail job, retry it
    // Verify new job created with retry_of_job_id
}

#[tokio::test]
async fn test_cancel_running_job() {
    // Submit, claim, cancel
    // Verify status transitions correctly
}
```

**Acceptance Criteria:**
- [ ] Test: submit returns pending job with ID
- [ ] Test: claim_next is atomic (no double-dispatch with concurrent workers)
- [ ] Test: failed job stays failed (no auto-retry)
- [ ] Test: manual retry creates new job linked to original
- [ ] Test: cancel transitions correctly based on current state
- [ ] Test: completed job cannot be cancelled or retried

### Task 6.2: API Endpoint Tests
**File:** `tests/job_api_tests.rs`

**Acceptance Criteria:**
- [ ] Test: POST /jobs returns 201 with job body
- [ ] Test: GET /jobs filters by user
- [ ] Test: POST /jobs/:id/cancel returns 204
- [ ] Test: POST /jobs/:id/retry returns 201 with new job
- [ ] Test: non-owner cannot cancel another user's job (403)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218600001_create_jobs_table.sql` | Jobs table DDL |
| `src/models/job.rs` | Job model struct and DTOs |
| `src/repositories/job_repo.rs` | Job CRUD with atomic claim |
| `src/engine/mod.rs` | Engine module barrel file |
| `src/engine/dispatcher.rs` | Background job dispatcher |
| `src/engine/progress.rs` | Progress event handling |
| `src/api/handlers/jobs.rs` | Job API handlers |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `job_statuses` lookup table (pending=1, running=2, completed=3, failed=4, cancelled=5, retrying=6)
- PRD-002: Axum server, `AppState`, WebSocket `WsManager`, Tokio runtime
- PRD-003: `AuthUser` extractor
- PRD-005: `ComfyUIManager` for workflow submission and cancellation

### New Infrastructure Needed
- `tokio-util` (for `CancellationToken`, likely already added by PRD-005)
- No new crates needed

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Task 1.1
2. Phase 2: Models and Repository — Tasks 2.1–2.2
3. Phase 3: Job Dispatcher — Tasks 3.1–3.2
4. Phase 4: Progress Tracking — Tasks 4.1–4.2
5. Phase 5: Job API Endpoints — Tasks 5.1–5.5

**MVP Success Criteria:**
- Jobs submit instantly (<200ms) and return job ID
- Dispatcher assigns jobs to available workers
- Progress updates flow to WebSocket in real-time
- Failed jobs stay failed (no silent retries)
- Manual retry creates new linked job

### Post-MVP Enhancements
1. Phase 6: Integration Tests — Tasks 6.1–6.2

---

## Notes

1. **SELECT FOR UPDATE SKIP LOCKED:** This PostgreSQL feature is critical for the dispatcher. It allows multiple dispatcher instances (future scaling) to claim jobs without conflicts. `SKIP LOCKED` means if another transaction is claiming a job, it skips to the next one instead of waiting.
2. **Status IDs are hardcoded:** The repository uses `1` for pending, `2` for running, etc., matching the PRD-000 seed data. The status enum from PRD-001 (`models/status.rs`) should be used instead of magic numbers.
3. **ComfyUI bridge integration:** The dispatcher calls `comfyui_manager.submit_workflow()` after claiming a job. The bridge handles the WebSocket communication with ComfyUI and emits events that the progress handler consumes.
4. **Job Tray (PRD-054):** The frontend component that shows running jobs is defined by PRD-054. This PRD provides the API and WebSocket events it consumes.
5. **No priority scheduling:** The `priority` column exists in the schema for PRD-008 to use. The MVP dispatcher uses a simple `ORDER BY priority DESC, submitted_at ASC`.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
