# Task List: Worker Pool Management

**PRD Reference:** `design/prds/046-prd-worker-pool-management.md`
**Scope:** Build a managed GPU worker fleet with registration, capability tagging, health checks, auto-failover, load balancing, and an admin dashboard.

## Overview

This PRD creates the fleet management layer that sits between individual hardware monitoring (PRD-006) and job scheduling (PRD-008). Workers are registered in a `workers` table with GPU specs, capability tags, and health status. The worker agent (extended from PRD-006) sends heartbeats to the backend. A health check service detects unresponsive workers and triggers failover by re-queuing their active jobs. The scheduler (PRD-008) is enhanced with capability-matching and load-balanced dispatch. Admins get a fleet dashboard with real-time worker status and management controls.

### What Already Exists
- PRD-002: Axum server, `AppState`, WebSocket infrastructure
- PRD-003: Admin RBAC
- PRD-006: Worker agent binary (`x121-agent`), GPU metrics collection, `gpu_metrics` table
- PRD-007: `jobs` table with `worker_id`, job dispatch, job lifecycle management
- PRD-008: Scheduler with priority ordering, `job_statuses`
- PRD-000: `worker_statuses` lookup table (idle, busy, offline, draining)

### What We're Building
1. Database tables: `workers`, `worker_tags`, `worker_health_log`
2. Worker registration API (admin + self-registration)
3. Heartbeat ingestion and health check service
4. Auto-failover coordinator
5. Capability-based load balancer
6. Enhanced scheduler integration
7. Admin worker dashboard (frontend)

### Key Design Decisions
1. **Hybrid registration** — Workers can self-register on first heartbeat (auto-discovery) or be pre-registered by an admin. Self-registration creates an "unconfirmed" worker that an admin must approve.
2. **Tags as JSONB array** — Capability tags stored as a JSONB array on the worker record. The scheduler uses `@>` containment for matching.
3. **Heartbeat via WebSocket** — Reuses the same WebSocket connection from PRD-006's metrics agent. Heartbeat is a typed message alongside metrics.
4. **Least-loaded dispatch** — Load score = (current_gpu_utilization * 0.6) + (active_job_count * 0.4). Lowest score gets the next job.

---

## Phase 1: Database Schema

### Task 1.1: Create Workers Table
**File:** `migrations/20260219200001_create_workers_table.sql`

```sql
CREATE TABLE workers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    hostname TEXT NOT NULL,
    ip_address TEXT,
    gpu_model TEXT,
    gpu_count SMALLINT NOT NULL DEFAULT 1,
    vram_total_mb INTEGER,
    status_id BIGINT NOT NULL REFERENCES worker_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    tags JSONB NOT NULL DEFAULT '[]',
    comfyui_instance_id BIGINT REFERENCES comfyui_instances(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    last_heartbeat_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decommissioned_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workers_status_id ON workers(status_id);
CREATE INDEX idx_workers_comfyui_instance_id ON workers(comfyui_instance_id);
CREATE INDEX idx_workers_tags ON workers USING gin(tags);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `workers` table with hardware specs: GPU model, count, VRAM
- [ ] `status_id` references PRD-000 `worker_statuses` (idle, busy, offline, draining)
- [ ] `tags JSONB` with GIN index for fast containment queries
- [ ] `comfyui_instance_id` FK links to PRD-005 ComfyUI instance
- [ ] `is_approved BOOLEAN` for admin confirmation of self-registered workers
- [ ] `last_heartbeat_at` for health monitoring

### Task 1.2: Create Worker Health Log Table
**File:** `migrations/20260219200002_create_worker_health_log_table.sql`

```sql
CREATE TABLE worker_health_log (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    from_status_id BIGINT NOT NULL REFERENCES worker_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    to_status_id BIGINT NOT NULL REFERENCES worker_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reason TEXT,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_health_log_worker_id ON worker_health_log(worker_id);
```

**Acceptance Criteria:**
- [ ] Logs every worker status transition with reason
- [ ] FK to workers and worker_statuses
- [ ] No `updated_at` (append-only log)

### Task 1.3: Add Worker FK to Jobs Table
**File:** `migrations/20260219200003_add_worker_fk_to_jobs.sql`

```sql
-- Add FK constraint to existing worker_id column on jobs table
-- (worker_id column already exists from PRD-007, but without FK)
ALTER TABLE jobs ADD CONSTRAINT fk_jobs_worker_id
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_jobs_worker_id_active ON jobs(worker_id)
    WHERE status_id IN (1, 2, 9); -- pending, running, dispatched
```

**Acceptance Criteria:**
- [ ] `jobs.worker_id` now has a proper FK to `workers(id)`
- [ ] `ON DELETE SET NULL` — if worker is removed, job keeps its record but loses worker reference
- [ ] Partial index for active jobs per worker

---

## Phase 2: Worker Registration

### Task 2.1: Worker Repository
**File:** `src/repositories/worker_repo.rs`

```rust
pub struct WorkerRepo;

impl WorkerRepo {
    pub async fn register(pool: &PgPool, input: &RegisterWorker) -> Result<Worker, sqlx::Error> {
        let status_offline = 3i64; // worker_statuses: offline
        sqlx::query_as::<_, Worker>(
            "INSERT INTO workers (name, hostname, ip_address, gpu_model, gpu_count, vram_total_mb,
                                  status_id, tags, is_approved)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (name) DO UPDATE SET
                 hostname = EXCLUDED.hostname,
                 ip_address = EXCLUDED.ip_address,
                 gpu_model = EXCLUDED.gpu_model,
                 gpu_count = EXCLUDED.gpu_count,
                 vram_total_mb = EXCLUDED.vram_total_mb,
                 last_heartbeat_at = NOW()
             RETURNING *"
        )
        .bind(&input.name)
        .bind(&input.hostname)
        .bind(&input.ip_address)
        .bind(&input.gpu_model)
        .bind(input.gpu_count)
        .bind(input.vram_total_mb)
        .bind(status_offline)
        .bind(&input.tags)
        .bind(input.is_admin_registered) // admin-registered = auto-approved
        .fetch_one(pool)
        .await
    }

    pub async fn list_available(pool: &PgPool) -> Result<Vec<Worker>, sqlx::Error> {
        let status_idle = 1i64;
        sqlx::query_as::<_, Worker>(
            "SELECT * FROM workers
             WHERE status_id = $1 AND is_enabled = true AND is_approved = true"
        )
        .bind(status_idle)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_tags(pool: &PgPool, required_tags: &[String]) -> Result<Vec<Worker>, sqlx::Error> {
        let tags_json = serde_json::json!(required_tags);
        sqlx::query_as::<_, Worker>(
            "SELECT * FROM workers
             WHERE is_enabled = true AND is_approved = true
               AND tags @> $1::jsonb
             ORDER BY status_id ASC" // idle first, then busy
        )
        .bind(&tags_json)
        .fetch_all(pool)
        .await
    }

    pub async fn update_heartbeat(pool: &PgPool, worker_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE workers SET last_heartbeat_at = NOW() WHERE id = $1"
        )
        .bind(worker_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn decommission(pool: &PgPool, worker_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE workers SET is_enabled = false, decommissioned_at = NOW() WHERE id = $1"
        )
        .bind(worker_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
```

**Acceptance Criteria:**
- [ ] `register` upserts (creates or updates on conflict)
- [ ] `list_available` returns idle, enabled, approved workers
- [ ] `find_by_tags` uses JSONB `@>` containment for tag matching
- [ ] `update_heartbeat` updates `last_heartbeat_at`
- [ ] `decommission` soft-disables without deleting history

### Task 2.2: Worker Registration API
**File:** `src/api/handlers/workers.rs`

```rust
pub async fn register_worker(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<RegisterWorkerRequest>,
) -> Result<(StatusCode, Json<Worker>), AppError> {
    // Admin-registered workers are auto-approved
    let mut worker_input = input.into_inner();
    worker_input.is_admin_registered = true;
    let worker = WorkerRepo::register(&state.pool, &worker_input).await?;
    Ok((StatusCode::CREATED, Json(worker)))
}

pub async fn self_register_worker(
    State(state): State<AppState>,
    Json(input): Json<SelfRegisterRequest>,
) -> Result<(StatusCode, Json<Worker>), AppError> {
    // Self-registered workers need admin approval
    let worker_input = RegisterWorker {
        is_admin_registered: false,
        ..input.into()
    };
    let worker = WorkerRepo::register(&state.pool, &worker_input).await?;
    Ok((StatusCode::CREATED, Json(worker)))
}

pub async fn approve_worker(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
    Path(worker_id): Path<DbId>,
) -> Result<Json<Worker>, AppError> {
    let worker = sqlx::query_as::<_, Worker>(
        "UPDATE workers SET is_approved = true WHERE id = $1 RETURNING *"
    )
    .bind(worker_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(worker))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/workers` — admin registers worker (auto-approved)
- [ ] `POST /api/v1/workers/register` — agent self-registers (needs approval)
- [ ] `POST /api/v1/admin/workers/:id/approve` — admin approves self-registered worker
- [ ] `GET /api/v1/admin/workers` — list all workers
- [ ] `PUT /api/v1/admin/workers/:id` — update worker config/tags
- [ ] `POST /api/v1/admin/workers/:id/decommission` — remove from pool

---

## Phase 3: Health Checks

### Task 3.1: Heartbeat Handler
**File:** `src/workers/heartbeat.rs`

```rust
pub async fn handle_heartbeat(pool: &PgPool, worker_id: DbId, metrics: Option<&GpuMetrics>) {
    WorkerRepo::update_heartbeat(pool, worker_id).await.ok();

    // Update status to idle or busy based on metrics
    if let Some(m) = metrics {
        let new_status = if m.utilization_percent > 10 { 2i64 } else { 1i64 }; // busy or idle
        sqlx::query("UPDATE workers SET status_id = $2 WHERE id = $1")
            .bind(worker_id)
            .bind(new_status)
            .execute(pool)
            .await
            .ok();
    }
}
```

**Acceptance Criteria:**
- [ ] Heartbeat updates `last_heartbeat_at` on worker record
- [ ] Worker status updated based on GPU utilization (busy vs idle)
- [ ] Heartbeat messages arrive via the same WebSocket as GPU metrics

### Task 3.2: Health Check Service
**File:** `src/workers/health_check.rs`

```rust
pub struct WorkerHealthCheck {
    pool: PgPool,
    heartbeat_timeout_secs: i64,
}

impl WorkerHealthCheck {
    pub async fn run(&self, cancel_token: CancellationToken) {
        let mut ticker = tokio::time::interval(Duration::from_secs(15));
        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = ticker.tick() => self.check_workers().await,
            }
        }
    }

    async fn check_workers(&self) {
        let threshold = Utc::now() - chrono::Duration::seconds(self.heartbeat_timeout_secs);
        let status_offline = 3i64;

        // Find workers that should be online but haven't sent heartbeat
        let stale_workers = sqlx::query_as::<_, Worker>(
            "SELECT * FROM workers
             WHERE is_enabled = true AND is_approved = true
               AND status_id != $1
               AND last_heartbeat_at < $2"
        )
        .bind(status_offline)
        .bind(threshold)
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        for worker in stale_workers {
            tracing::warn!(worker_id = worker.id, name = %worker.name, "Worker missed heartbeat, marking offline");

            // Transition to offline
            sqlx::query("UPDATE workers SET status_id = $2 WHERE id = $1")
                .bind(worker.id)
                .bind(status_offline)
                .execute(&self.pool)
                .await
                .ok();

            // Log transition
            sqlx::query(
                "INSERT INTO worker_health_log (worker_id, from_status_id, to_status_id, reason)
                 VALUES ($1, $2, $3, $4)"
            )
            .bind(worker.id)
            .bind(worker.status_id)
            .bind(status_offline)
            .bind("Heartbeat timeout")
            .execute(&self.pool)
            .await
            .ok();

            // Trigger failover for active jobs on this worker
            self.failover_jobs(worker.id).await;
        }
    }

    async fn failover_jobs(&self, worker_id: DbId) {
        let status_pending = 1i64;
        let result = sqlx::query(
            "UPDATE jobs SET worker_id = NULL, status_id = $2, claimed_at = NULL
             WHERE worker_id = $1 AND status_id IN (2, 9)" // running or dispatched
        )
        .bind(worker_id)
        .bind(status_pending)
        .execute(&self.pool)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => {
                tracing::info!("Re-queued {} jobs from failed worker {}", r.rows_affected(), worker_id);
            }
            Err(e) => tracing::error!("Failed to re-queue jobs: {:?}", e),
            _ => {}
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Checks every 15 seconds for workers past heartbeat threshold
- [ ] Workers without heartbeat are marked offline
- [ ] Status transition logged to `worker_health_log`
- [ ] Active jobs on failed workers are re-queued to pending
- [ ] Failover jobs logged with count

---

## Phase 4: Load Balancer

### Task 4.1: Load-Balanced Worker Selection
**File:** `src/workers/load_balancer.rs`

```rust
pub struct WorkerLoadBalancer {
    pool: PgPool,
}

impl WorkerLoadBalancer {
    pub async fn select_worker(
        &self,
        required_tags: &[String],
        preferred_tags: &[String],
        min_vram_mb: Option<i32>,
    ) -> Result<Option<Worker>, sqlx::Error> {
        // 1. Get all available workers matching required tags
        let mut candidates = WorkerRepo::find_by_tags(&self.pool, required_tags).await?;

        // 2. Filter by VRAM requirement
        if let Some(min_vram) = min_vram_mb {
            candidates.retain(|w| w.vram_total_mb.unwrap_or(0) >= min_vram);
        }

        // 3. Filter to idle/available workers
        candidates.retain(|w| w.status_id == 1); // idle

        if candidates.is_empty() {
            return Ok(None);
        }

        // 4. Score by load (prefer least loaded)
        // For now, pick the first idle worker (enhanced with GPU utilization scoring later)
        let mut best = &candidates[0];
        for w in &candidates[1..] {
            // Prefer workers that match more preferred tags
            let best_pref = count_matching_tags(&best.tags, preferred_tags);
            let w_pref = count_matching_tags(&w.tags, preferred_tags);
            if w_pref > best_pref {
                best = w;
            }
        }

        Ok(Some(best.clone()))
    }
}

fn count_matching_tags(worker_tags: &serde_json::Value, preferred: &[String]) -> usize {
    let worker_tags_arr: Vec<String> = serde_json::from_value(worker_tags.clone()).unwrap_or_default();
    preferred.iter().filter(|t| worker_tags_arr.contains(t)).count()
}
```

**Acceptance Criteria:**
- [ ] Filters workers by required tags (must match all)
- [ ] Filters by minimum VRAM requirement
- [ ] Among candidates, prefers workers matching more preferred tags
- [ ] Among equal preference, picks least-loaded worker
- [ ] Returns `None` if no compatible worker is available

### Task 4.2: Integrate Load Balancer with Scheduler
**File:** `src/engine/scheduler.rs` (extend)

```rust
// Replace simple available_workers() with load-balanced selection
impl JobScheduler {
    async fn dispatch_next_job(&self) -> Result<(), Box<dyn std::error::Error>> {
        // 1. Peek at next pending job to get its requirements
        let next_job = self.peek_next_pending().await?;
        let Some(job) = next_job else { return Ok(()) };

        // 2. Extract tag requirements from job parameters
        let required_tags: Vec<String> = job.parameters.get("required_tags")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let preferred_tags: Vec<String> = job.parameters.get("preferred_tags")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let min_vram: Option<i32> = job.parameters.get("min_vram_mb")
            .and_then(|v| v.as_i64().map(|n| n as i32));

        // 3. Select best worker
        let worker = self.load_balancer.select_worker(&required_tags, &preferred_tags, min_vram).await?;

        if let Some(worker) = worker {
            // 4. Claim job for this worker
            self.claim_and_dispatch(job.id, worker.id).await?;
        }

        Ok(())
    }
}
```

**Acceptance Criteria:**
- [ ] Scheduler extracts tag requirements from job parameters
- [ ] Uses load balancer to select best matching worker
- [ ] Falls back to any available worker if no tags required
- [ ] Job stays pending if no compatible worker is available

---

## Phase 5: Admin API

### Task 5.1: Worker Management Endpoints
**File:** `src/api/handlers/workers.rs` (extend)

**Acceptance Criteria:**
- [ ] `GET /api/v1/admin/workers` — list all workers with status, tags, current job
- [ ] `GET /api/v1/admin/workers/:id` — worker details with job history
- [ ] `PUT /api/v1/admin/workers/:id/tags` — update worker tags
- [ ] `POST /api/v1/admin/workers/:id/drain` — drain worker (finish current job, then idle)
- [ ] `POST /api/v1/admin/workers/:id/decommission` — remove from pool
- [ ] `GET /api/v1/admin/workers/stats` — fleet summary (total, online, busy, offline)

### Task 5.2: Fleet Statistics
**File:** `src/repositories/worker_repo.rs` (extend)

```rust
pub struct FleetStats {
    pub total_workers: i64,
    pub online_workers: i64,
    pub busy_workers: i64,
    pub offline_workers: i64,
    pub total_gpus: i64,
    pub active_jobs: i64,
    pub queued_jobs: i64,
}

impl WorkerRepo {
    pub async fn fleet_stats(pool: &PgPool) -> Result<FleetStats, sqlx::Error> {
        // Aggregate queries across workers and jobs tables
        todo!()
    }
}
```

**Acceptance Criteria:**
- [ ] Returns aggregate counts: total, online, busy, offline workers
- [ ] Includes total GPU count across fleet
- [ ] Includes active and queued job counts

---

## Phase 6: Frontend Dashboard

### Task 6.1: Worker Fleet Dashboard
**File:** `frontend/src/pages/admin/WorkerDashboard.tsx`

**Acceptance Criteria:**
- [ ] Grid of worker cards showing name, status, GPU info, current job
- [ ] Color-coded: green=idle, blue=busy, yellow=draining, red=offline
- [ ] Auto-refreshes every 5 seconds
- [ ] Admin actions: approve, tag, drain, decommission

### Task 6.2: Worker Detail Panel
**File:** `frontend/src/pages/admin/WorkerDetail.tsx`

**Acceptance Criteria:**
- [ ] Full worker details: hardware specs, tags, health history
- [ ] Current and recent job list
- [ ] GPU metrics integration (from PRD-006)
- [ ] Health log timeline showing status transitions

---

## Phase 7: Integration Tests

### Task 7.1: Worker Registration and Health Tests
**File:** `tests/worker_tests.rs`

```rust
#[tokio::test]
async fn test_register_and_list() {
    // Register worker, list available, verify it appears
}

#[tokio::test]
async fn test_heartbeat_timeout_marks_offline() {
    // Register worker, skip heartbeats, verify marked offline
}

#[tokio::test]
async fn test_failover_requeues_jobs() {
    // Assign job to worker, mark worker offline, verify job re-queued
}

#[tokio::test]
async fn test_tag_matching() {
    // Register workers with different tags
    // Verify find_by_tags returns correct matches
}
```

**Acceptance Criteria:**
- [ ] Test: worker registration and listing
- [ ] Test: heartbeat timeout triggers offline status
- [ ] Test: auto-failover re-queues active jobs
- [ ] Test: tag matching with required and preferred tags
- [ ] Test: decommission removes from available pool
- [ ] Test: load balancer selects least-loaded compatible worker

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260219200001_create_workers_table.sql` | Workers table DDL |
| `migrations/20260219200002_create_worker_health_log_table.sql` | Health log DDL |
| `migrations/20260219200003_add_worker_fk_to_jobs.sql` | FK constraint on jobs.worker_id |
| `src/workers/mod.rs` | Workers module barrel file |
| `src/workers/heartbeat.rs` | Heartbeat handling |
| `src/workers/health_check.rs` | Health check service with failover |
| `src/workers/load_balancer.rs` | Capability-based load balancer |
| `src/repositories/worker_repo.rs` | Worker CRUD with tag queries |
| `src/api/handlers/workers.rs` | Admin worker management API |
| `src/models/worker.rs` | Worker model struct |
| `frontend/src/pages/admin/WorkerDashboard.tsx` | Fleet dashboard |
| `frontend/src/pages/admin/WorkerDetail.tsx` | Worker detail page |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `worker_statuses` lookup table (idle=1, busy=2, offline=3, draining=4)
- PRD-002: Axum server, WebSocket infrastructure
- PRD-003: `RequireAdmin` for admin endpoints
- PRD-006: Worker agent binary, GPU metrics, WebSocket connection
- PRD-007: `jobs` table with `worker_id`, job lifecycle
- PRD-008: Scheduler (extended with load-balanced dispatch)

### New Infrastructure Needed
- No new Rust crates needed
- GIN index support (built into PostgreSQL) for JSONB tag queries

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.3
2. Phase 2: Worker Registration — Tasks 2.1–2.2
3. Phase 3: Health Checks — Tasks 3.1–3.2
4. Phase 4: Load Balancer — Tasks 4.1–4.2

**MVP Success Criteria:**
- Workers register and appear in the database
- Heartbeat keeps workers marked as online
- Missed heartbeats mark workers offline and re-queue their jobs
- Scheduler uses tag matching and load balancing for dispatch
- Admin can list and manage workers via API

### Post-MVP Enhancements
1. Phase 5: Admin API — Tasks 5.1–5.2
2. Phase 6: Frontend Dashboard — Tasks 6.1–6.2
3. Phase 7: Integration Tests — Task 7.1

---

## Notes

1. **Worker-agent integration:** The `x121-agent` binary from PRD-006 needs to be extended to send heartbeats and self-register. The heartbeat is a JSON message like `{"type": "heartbeat", "worker_id": 1, "status": "idle"}` sent alongside GPU metrics.
2. **GIN index on tags:** PostgreSQL's GIN index on the JSONB `tags` column enables efficient `@>` containment queries. A query like `WHERE tags @> '["high-vram"]'` uses the index.
3. **Draining state:** When a worker is set to "draining", it finishes its current job but doesn't accept new ones. The scheduler checks `status_id != 4 (draining)` when selecting workers.
4. **Self-registration security:** Self-registration is rate-limited and requires admin approval. A shared secret token in the agent's environment prevents random machines from registering.
5. **Network partitions:** A worker may be alive but unreachable due to network issues. The health check uses a conservative timeout (default 45s = 3 missed 15s heartbeats) to avoid false positives.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
