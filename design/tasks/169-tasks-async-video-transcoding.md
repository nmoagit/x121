# Task List: Asynchronous Post-Import Video Transcoding Pipeline

**PRD Reference:** `design/prds/169-prd-async-video-transcoding.md` (v1.2)
**Scope:** Replace inline `ensure_h264` calls at every video-entry point with an async transcode pipeline backed by a polymorphic `transcode_jobs` table, a background worker (FIFO, concurrency 2), and frontend "Processing" affordances. Non-H.264 HTTP uploads must return in < 10s; every `<video>` callsite must gate on `transcode_state`.

## Overview

This task list closes the "transcode deferred" follow-up from PRD-165 and unifies all four video entry points (PRD-165 server-scan, HTTP multipart, JSON server-path, legacy batch directory) onto a single async pipeline. The backend adds a new `transcode_jobs` polymorphic queue + a narrow `transcode_state` surface column on `scene_video_versions`, a shared `enqueue_if_needed` helper, and a background worker modeled on `background/delivery_assembly.rs`. The frontend adds a shared `TranscodeStatusBadge`, a player overlay for non-completed states, and real-time refresh via the existing `ActivityLogBroadcaster` with a 5s polling fallback.

### What Already Exists

- `ffmpeg::transcode_web_playback` (`apps/backend/crates/core/src/ffmpeg.rs:313`) — produces browser-compatible H.264 main-profile MP4 at original resolution.
- `ffmpeg::is_browser_compatible` (`core/src/ffmpeg.rs:373`) — tells us whether a file needs transcoding.
- `ffmpeg::probe_video` (`core/src/ffmpeg.rs:103`) — used to populate `source_codec` at enqueue.
- `background/delivery_assembly.rs` — the worker blueprint: `tokio::interval` + `CancellationToken` + `process_next` pattern. Module is registered in `background/mod.rs` and spawned from `main.rs`.
- `state.activity_broadcaster` — generic `ActivityLogBroadcaster` (see `background/delivery_assembly.rs:710` for the publish pattern).
- `state.storage_provider().await` — PRD-122 pluggable storage (Local or S3) used for upload/download/delete.
- `SceneVideoVersionRepo` — repository for the target entity.
- `useActivityLogStream` (`apps/frontend/src/features/activity-console/hooks/useActivityLogStream.ts`) — existing WebSocket client for `ActivityLogEntry`.
- `StatusBadge` (`apps/frontend/src/components/domain/StatusBadge.tsx`) — shared badge chrome + tokens.
- `ClipPlaybackModal` (`apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`) — one of the surfaces that needs the overlay.
- `VideoPlayer` (`apps/frontend/src/features/video-player/VideoPlayer.tsx`) — shared player.

### What We're Building

1. `transcode_jobs` polymorphic queue table + `transcode_job_statuses` lookup, both following platform ID strategy (`id BIGSERIAL` + `uuid UUID`, `deleted_at`).
2. `transcode_state` surface column on `scene_video_versions` (default `'completed'` for backfill).
3. Shared `background::video_transcode::enqueue_if_needed` helper called from all four entry points.
4. Removal of inline `ensure_h264` from `scene_video_version.rs` (three callsites at lines 519, 1207, 1576).
5. New `background/video_transcode.rs` worker — polls, claims, transcodes, retries, recovers stalled jobs on startup.
6. Activity broadcaster integration — worker publishes `fields.kind = "transcode.updated"` events.
7. API additions: state fields on video responses, admin listing endpoints, editor-role retry endpoint.
8. Frontend: shared `TranscodeStatusBadge`, player overlay for pending/in_progress/failed, real-time refresh hook + 5s polling fallback, copy changes on upload success toasts.
9. Audit of every callsite that currently plays a `scene_video_versions` file — every one must gate on `transcode_state`.

### Key Design Decisions

1. **Polymorphic queue table (Option B from the PRD).** `entity_type` CHECK starts with only `'scene_video_version'`; future types extend the CHECK without schema restructuring.
2. **Denormalized `transcode_state` on the entity** for cheap "is this playable?" reads — avoids joining `transcode_jobs` on every card render.
3. **All four entry points migrated in v1.** A grep for `ensure_h264` in `apps/backend` must return zero after this PRD.
4. **Single global FIFO queue, concurrency default 2.** Per-project fairness and multi-worker coordination are deferred to v2 (see PRD §7).
5. **Worker-startup cleanup pass** on every boot: stalled `in_progress` > 10 min → reset to `pending` + increment `attempts` (or mark `failed` if that exhausts retries).
6. **Delete original on success, keep on failure** (PRD §10 decision 2). Deletion runs *after* DB commit to avoid orphaning transcoded files.
7. **Activity broadcaster is a refresh ping, not a source of truth.** Frontend gets a 5s polling fallback for WebSocket disconnects.

---

## Phase 1: Backend — Schema & Core Types

### Task 1.1: Create `transcode_job_statuses` Lookup + `transcode_jobs` Table
**File:** `apps/db/migrations/20260417000001_create_transcode_jobs.sql` (new)

Follows the PRD-00 lookup-table convention and the platform ID strategy (`id BIGSERIAL` + `uuid UUID`).

```sql
-- Lookup table (PRD-00 convention: id + code + label).
CREATE TABLE transcode_job_statuses (
    id         SERIAL PRIMARY KEY,
    code       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO transcode_job_statuses (id, code, label) VALUES
    (1, 'pending',     'Pending'),
    (2, 'in_progress', 'In Progress'),
    (3, 'completed',   'Completed'),
    (4, 'failed',      'Failed'),
    (5, 'cancelled',   'Cancelled');

-- Polymorphic queue table.
CREATE TABLE transcode_jobs (
    id                  BIGSERIAL PRIMARY KEY,
    uuid                UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    entity_type         TEXT NOT NULL
        CHECK (entity_type IN ('scene_video_version')),  -- v1 only
    entity_id           BIGINT NOT NULL,
    status_id           INT NOT NULL REFERENCES transcode_job_statuses(id),
    attempts            INT NOT NULL DEFAULT 0,
    max_attempts        INT NOT NULL DEFAULT 3,
    next_attempt_at     TIMESTAMPTZ,
    source_codec        TEXT,
    source_storage_key  TEXT NOT NULL,
    target_storage_key  TEXT,
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TRIGGER set_updated_at_transcode_jobs
    BEFORE UPDATE ON transcode_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One active (pending or in_progress) job per entity at a time.
CREATE UNIQUE INDEX uq_transcode_jobs_active_entity
    ON transcode_jobs (entity_type, entity_id)
    WHERE deleted_at IS NULL AND status_id IN (1, 2);

-- Worker claim-query index.
CREATE INDEX idx_transcode_jobs_claim
    ON transcode_jobs (status_id, next_attempt_at)
    WHERE deleted_at IS NULL;

-- Frontend lookup-by-entity.
CREATE INDEX idx_transcode_jobs_entity
    ON transcode_jobs (entity_type, entity_id)
    WHERE deleted_at IS NULL;
```

**Acceptance Criteria:**
- [ ] Migration creates `transcode_job_statuses` and seeds all five codes.
- [ ] Migration creates `transcode_jobs` with every column listed in PRD Requirement 1.1.
- [ ] `uuid UUID` column follows platform ID strategy.
- [ ] Unique partial index prevents double-active-job per entity.
- [ ] `(status_id, next_attempt_at)` index supports the O(1) worker claim query.
- [ ] `set_updated_at` trigger wired up.
- [ ] `deleted_at` used for soft-delete (not `revoked_at`).
- [ ] `sqlx migrate run` succeeds against a fresh DB.

### Task 1.2: Add `transcode_state` Column to `scene_video_versions`
**File:** `apps/db/migrations/20260417000002_add_transcode_state_to_svv.sql` (new)

Narrow denormalized status for cheap reads; default `'completed'` for existing rows (see §14 open Q1).

```sql
ALTER TABLE scene_video_versions
    ADD COLUMN transcode_state TEXT NOT NULL DEFAULT 'completed'
        CHECK (transcode_state IN ('pending', 'in_progress', 'completed', 'failed'));

-- Partial index: cheap "what's not ready?" queries for frontend badges.
CREATE INDEX idx_scene_video_versions_transcode_state_pending
    ON scene_video_versions (transcode_state)
    WHERE transcode_state <> 'completed';
```

**Acceptance Criteria:**
- [ ] Column added with `NOT NULL DEFAULT 'completed'` + CHECK constraint matching the four values.
- [ ] Existing rows get `'completed'` via DEFAULT (backfill grandfathered — see PRD §14 Q1).
- [ ] Partial index on `transcode_state <> 'completed'` created.
- [ ] No change to `media_variants` (PRD §7 non-goal).
- [ ] Migration reversible if sqlx supports it (or documented as one-way).

### Task 1.3: Rust Model — `TranscodeJob` + `TranscodeState` Enums
**Files:**
- `apps/backend/crates/db/src/models/transcode_job.rs` (new)
- `apps/backend/crates/db/src/models/scene_video_version.rs` (add `transcode_state` field)

Define the model row, a CreateTranscodeJob struct, and a `TranscodeState` string-backed enum matching the four values in the CHECK constraint. Add `transcode_state: String` (or the enum type) to the existing `SceneVideoVersion` struct.

```rust
// transcode_job.rs
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TranscodeJob {
    pub id: DbId,
    pub uuid: Uuid,
    pub entity_type: String,
    pub entity_id: DbId,
    pub status_id: i32,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_attempt_at: Option<DateTime<Utc>>,
    pub source_codec: Option<String>,
    pub source_storage_key: String,
    pub target_storage_key: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

pub struct CreateTranscodeJob {
    pub entity_type: String,
    pub entity_id: DbId,
    pub source_codec: Option<String>,
    pub source_storage_key: String,
}

// Seeded status IDs (match migration 20260417000001).
pub const TRANSCODE_STATUS_PENDING: i32 = 1;
pub const TRANSCODE_STATUS_IN_PROGRESS: i32 = 2;
pub const TRANSCODE_STATUS_COMPLETED: i32 = 3;
pub const TRANSCODE_STATUS_FAILED: i32 = 4;
pub const TRANSCODE_STATUS_CANCELLED: i32 = 5;
```

**Acceptance Criteria:**
- [ ] New `TranscodeJob` model row maps 1:1 to the `transcode_jobs` columns.
- [ ] Status IDs exposed as `pub const` so the worker/handlers don't hardcode literals.
- [ ] `SceneVideoVersion` gets a `pub transcode_state: String` field.
- [ ] `cargo check -p x121-db` passes.

### Task 1.4: `TranscodeJobRepo` Repository
**File:** `apps/backend/crates/db/src/repositories/transcode_job_repo.rs` (new)

Repository with methods used by both the enqueue helper and the worker.

```rust
pub struct TranscodeJobRepo;

impl TranscodeJobRepo {
    pub async fn create(pool: &PgPool, job: &CreateTranscodeJob) -> sqlx::Result<TranscodeJob> { ... }

    /// Claim up to `limit` pending jobs whose `next_attempt_at` is <= NOW().
    /// Single atomic UPDATE ... RETURNING to prevent double-claim (see PRD §9 Assumptions).
    pub async fn claim_pending(pool: &PgPool, limit: i32) -> sqlx::Result<Vec<TranscodeJob>> {
        sqlx::query_as::<_, TranscodeJob>(
            "UPDATE transcode_jobs
             SET status_id = $1, started_at = NOW(), attempts = attempts + 1, updated_at = NOW()
             WHERE id IN (
                 SELECT id FROM transcode_jobs
                 WHERE status_id = $2
                   AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
                   AND deleted_at IS NULL
                 ORDER BY created_at ASC
                 LIMIT $3
             )
             RETURNING *"
        )
        .bind(TRANSCODE_STATUS_IN_PROGRESS)
        .bind(TRANSCODE_STATUS_PENDING)
        .bind(limit)
        .fetch_all(pool).await
    }

    pub async fn mark_completed(tx: &mut Transaction<'_, Postgres>, job_id: DbId, target_key: &str) -> sqlx::Result<()> { ... }
    pub async fn mark_failed_retry(pool: &PgPool, job_id: DbId, error: &str, backoff: Duration) -> sqlx::Result<()> { ... }
    pub async fn mark_failed_terminal(tx: &mut Transaction<'_, Postgres>, job_id: DbId, error: &str) -> sqlx::Result<()> { ... }
    pub async fn recover_stalled(pool: &PgPool, threshold: Duration) -> sqlx::Result<RecoverResult> { ... }
    pub async fn find_by_entity(pool: &PgPool, entity_type: &str, entity_id: DbId) -> sqlx::Result<Option<TranscodeJob>> { ... }
    pub async fn list_admin(pool: &PgPool, filter: AdminListFilter) -> sqlx::Result<Vec<TranscodeJob>> { ... }
    pub async fn retry(pool: &PgPool, job_id: DbId) -> sqlx::Result<TranscodeJob> { ... }
}
```

**Acceptance Criteria:**
- [ ] `claim_pending` is a single atomic `UPDATE ... RETURNING` ordered by `created_at ASC` (global FIFO per PRD §9).
- [ ] `mark_completed` accepts a transaction (worker wants to update `scene_video_versions.transcode_state` + `scene_video_versions.file_path` + job row in one commit — PRD Requirement 1.5).
- [ ] `mark_failed_retry` sets `status='pending'`, `next_attempt_at = NOW() + backoff`, appends error.
- [ ] `mark_failed_terminal` sets `status='failed'`, sets `completed_at`, accepts a transaction.
- [ ] `recover_stalled(Duration::from_secs(600))` returns `{reset_count, failed_count}` so the worker can log both.
- [ ] Repository has unit tests for each method against a test DB.

### Task 1.5: Extend `SceneVideoVersionRepo` with State Update Methods
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`

Add helpers the enqueue path + worker need for atomic updates.

```rust
impl SceneVideoVersionRepo {
    pub async fn set_transcode_state(
        tx: &mut Transaction<'_, Postgres>,
        id: DbId,
        state: &str,
    ) -> sqlx::Result<()> { ... }

    /// Atomic: update file_path AND transcode_state in the same row update.
    /// Used by the worker on successful transcode.
    pub async fn set_transcoded(
        tx: &mut Transaction<'_, Postgres>,
        id: DbId,
        new_file_path: &str,
    ) -> sqlx::Result<()> { ... }
}
```

**Acceptance Criteria:**
- [ ] `set_transcode_state` accepts a transaction so the worker can couple it to the job-row update.
- [ ] `set_transcoded` flips `transcode_state → 'completed'` *and* points `file_path` at the new key in one statement.
- [ ] Existing list/find queries include `transcode_state` so API responses carry it (Task 4.1 consumes this).

---

## Phase 2: Backend — Shared Enqueue Helper + Entry-Point Migration

### Task 2.1: `background::video_transcode::enqueue_if_needed` Shared Helper
**File:** `apps/backend/crates/api/src/background/video_transcode.rs` (new — this is where the worker will live too; start the module here)

Single helper that every entry point calls after uploading a video. Branches on `is_browser_compatible`:
- H.264 / VP9 / VP8 / AV1 → set `transcode_state = 'completed'`, no job row, return `TranscodeState::Completed`.
- Anything else → set `transcode_state = 'pending'`, insert `transcode_jobs` row with `source_codec` (from the probe) and `source_storage_key`, return `TranscodeState::Pending`.

```rust
pub enum TranscodeState {
    Completed,
    Pending,
}

/// Ffprobe the video at `storage_key`, decide if it needs transcoding,
/// and set state / enqueue job accordingly. All four video-entry points
/// in v1 call this.
pub async fn enqueue_if_needed(
    state: &AppState,
    svv_id: DbId,
    storage_key: &str,
) -> Result<TranscodeState, AppError> {
    // 1. Resolve storage_key -> local path (download to a temp file if S3).
    // 2. ffmpeg::probe_video(path) -> FfprobeOutput
    // 3. ffmpeg::is_browser_compatible(path) -> bool
    // 4. Open a tx:
    //    - if compatible: SVVRepo::set_transcode_state(tx, svv_id, "completed") and commit.
    //    - else: SVVRepo::set_transcode_state(tx, svv_id, "pending")
    //            + TranscodeJobRepo::create({entity_type: "scene_video_version", entity_id: svv_id,
    //                                        source_codec: probe.codec, source_storage_key: storage_key})
    //            + commit.
    // 5. Clean up any temp file.
}
```

Notes for the implementer: `is_browser_compatible` takes a `&Path`; for S3 backends the helper must download the object to a temp path first (the existing PRD-165 `read_source_file` + a temp-file sink is the pattern to reuse). Creation of the SVV row itself still happens in the calling handler; this helper only decides and enqueues.

**Acceptance Criteria:**
- [ ] Helper function signature matches the one the handlers will call (`enqueue_if_needed(state, svv_id, storage_key)`).
- [ ] Both branches (completed / pending) are covered by unit tests with mocked probe results.
- [ ] On the `pending` branch, the resulting `transcode_jobs` row has `status_id = pending`, `source_codec` populated, `source_storage_key` matches the caller's key.
- [ ] Uniqueness: if an active job already exists for this entity the helper returns the existing state instead of raising the unique-index violation (defensive — PRD §11 edge case: "Two concurrent transcode runs for the same entity").
- [ ] Works for both Local and S3 storage backends — downloads to temp for probe when remote.
- [ ] Temp files cleaned up in both success and failure paths.

### Task 2.2: Migrate `directory_scan_import.rs::import_video_from_source` (Entry Point #1)
**File:** `apps/backend/crates/api/src/handlers/directory_scan_import.rs` (around line 806)

After the SVV row is created and the file is uploaded, call `enqueue_if_needed`. The PRD-165 handler does not currently call `ensure_h264` (it skipped transcode deliberately — that's the bug this PRD fixes).

```rust
// After SceneVideoVersionRepo::create_version(...)
let state = background::video_transcode::enqueue_if_needed(state, svv.id, &storage_key).await?;
// `state` is Completed for H.264 sources, Pending otherwise — either way the SSE stream completes now.
```

**Acceptance Criteria:**
- [ ] `import_video_from_source` calls `enqueue_if_needed` after creating the SVV row and uploading the file.
- [ ] SSE stream does not block on transcode — completion event fires as before.
- [ ] Integration test (from PRD §13): import an HEVC fixture via PRD-165 → job enqueued → eventually completed after worker runs.

### Task 2.3: Migrate `scene_video_version.rs::import_video` (Entry Point #2 — HTTP Multipart)
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (around line 434, inline `ensure_h264` at line 519)

Remove the inline `ensure_h264(...).await` call; call `enqueue_if_needed` after the SVV row is created. This is the hot path for the PRD's < 10s HTTP latency target.

```rust
// DELETE lines around 517-521:
//   let data = ensure_h264(data, &ext)
//       .await
//       .map_err(|e| AppError::InternalError(format!("Video transcode failed: {e}")))?;

// Upload as-is (already have `data` and `storage_key`):
provider.upload(&storage_key, &data).await?;

// ... create SVV row ...

// Enqueue (non-blocking):
background::video_transcode::enqueue_if_needed(&state, svv.id, &storage_key).await?;

// Return 201 Created with the SVV row. `transcode_state` is already on the row.
```

**Acceptance Criteria:**
- [ ] `ensure_h264` call at line 519 (pre-migration) is deleted.
- [ ] Handler returns `201 Created` with the `DataResponse<SceneVideoVersion>` shape (unchanged).
- [ ] Returned SVV row includes `transcode_state` populated by the helper (`pending` or `completed`).
- [ ] P50 HTTP latency for a 100 MB non-H.264 multipart on reference 4-core hardware is < 10s (PRD §6 Performance, §12 Success Metrics).
- [ ] Already-H.264 uploads save ~200-400 ms vs. pre-PRD (ffprobe still runs; no ffmpeg spawn).

### Task 2.4: Migrate `scene_video_version.rs::import_from_path` (Entry Point #3 — JSON server-path)
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (around line 1146, inline `ensure_h264` at line 1207)

Same migration pattern as Task 2.3.

**Acceptance Criteria:**
- [ ] `ensure_h264` call at line 1207 deleted.
- [ ] Handler calls `enqueue_if_needed` after creating the SVV row.
- [ ] HTTP response returns without blocking on transcode.
- [ ] Response body shape unchanged; `transcode_state` is on the returned row.

### Task 2.5: Migrate `scene_video_version.rs::import_directory` (Entry Point #4 — Legacy Batch)
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (around line 1311, per-file loop at line 1576)

Same pattern, applied inside the per-file loop. Summary rows returned from this endpoint may contain a mix of `pending` and `completed` states (PRD Requirement 1.12).

**Acceptance Criteria:**
- [ ] `ensure_h264` call at line 1576 deleted.
- [ ] Per-file loop calls `enqueue_if_needed` after each SVV insert.
- [ ] Returned summary rows reflect accurate `transcode_state` values.
- [ ] Batch of 20 non-H.264 clips returns within a reasonable time (bounded by upload + probe only).

### Task 2.6: Delete `ensure_h264` Helper and Verify Zero Grep Matches
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (function at line 59)

Once all four callsites are migrated (Tasks 2.2-2.5), delete the `ensure_h264` fn definition at line 59. Then:

```sh
rg 'ensure_h264' apps/backend/
# Expected output: (nothing)
```

**Acceptance Criteria:**
- [ ] `ensure_h264` function definition removed from `scene_video_version.rs`.
- [ ] `rg 'ensure_h264' apps/backend/` returns zero matches (PRD §12 Success Metrics).
- [ ] `cargo check -p x121-api` passes with no dead-code warnings for the removal.

---

## Phase 3: Backend — Worker

### Task 3.1: Worker Skeleton (`background::video_transcode::run`)
**File:** `apps/backend/crates/api/src/background/video_transcode.rs`

Mirror `background/delivery_assembly.rs` — `tokio::interval` + `CancellationToken` + `process_next`. Poll interval 5 seconds (faster than the 10s delivery-assembly interval, per PRD Requirement 1.4).

```rust
const POLL_INTERVAL: Duration = Duration::from_secs(5);
const STALLED_JOB_THRESHOLD: Duration = Duration::from_secs(600);  // 10 min, PRD 1.4a

pub async fn run(state: AppState, cancel: CancellationToken) {
    tracing::info!(interval_secs = POLL_INTERVAL.as_secs(), "Video transcode worker started");

    // Requirement 1.4a: one-time stalled-job recovery pass at startup.
    match TranscodeJobRepo::recover_stalled(&state.pool, STALLED_JOB_THRESHOLD).await {
        Ok(result) => tracing::info!(
            target: "transcode",
            reset = result.reset_count,
            failed = result.failed_count,
            "Recovered stalled jobs on boot"
        ),
        Err(e) => tracing::error!(target: "transcode", error = %e, "Stalled-job recovery failed"),
    }

    let mut interval = tokio::time::interval(POLL_INTERVAL);
    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Video transcode worker stopping");
                break;
            }
            _ = interval.tick() => {
                if let Err(e) = process_next(&state, &cancel).await {
                    tracing::error!(target: "transcode", error = %e, "Transcode tick failed");
                }
            }
        }
    }
}
```

Register in `background/mod.rs` as `pub mod video_transcode;` and spawn from `main.rs` alongside `delivery_assembly::run`, etc.

**Acceptance Criteria:**
- [ ] `run` signature matches `delivery_assembly::run(state: AppState, cancel: CancellationToken)`.
- [ ] Module registered in `background/mod.rs`.
- [ ] Spawned from the main entry point alongside other background tasks (no new infrastructure).
- [ ] Poll interval 5 seconds.
- [ ] Startup recovery pass runs *before* entering the polling loop (Requirement 1.4a).
- [ ] Recovery pass logs reset + failed counts at `info` level with target `transcode`.

### Task 3.2: Concurrency Limiter — Platform Setting `transcode.concurrency`
**Files:**
- `apps/backend/crates/api/src/background/video_transcode.rs`
- platform settings integration (PRD-110 existing settings table)

Read `transcode.concurrency` at each tick (cheap — cached). Default 2, range 1-8. Use a `tokio::sync::Semaphore` to bound the number of concurrent `tokio::spawn`s.

**Acceptance Criteria:**
- [ ] Setting `transcode.concurrency` is read via the existing platform-settings service.
- [ ] Default value is 2 when the setting is absent.
- [ ] Values outside 1-8 are clamped with a warning log.
- [ ] Changes to the setting take effect within one tick (no restart required).
- [ ] A `Semaphore::new(N)` bounds concurrent job execution inside `process_next`.

### Task 3.3: `process_next` — Claim and Dispatch
**File:** `apps/backend/crates/api/src/background/video_transcode.rs`

Claim up to N jobs via `TranscodeJobRepo::claim_pending(N)` where N = available semaphore permits. For each, spawn a `tokio::task` that runs `run_job(state, job)` holding the semaphore permit for the job's lifetime.

```rust
async fn process_next(state: &AppState, cancel: &CancellationToken) -> Result<(), TranscodeError> {
    let permits_available = SEMAPHORE.available_permits();
    if permits_available == 0 { return Ok(()); }

    let jobs = TranscodeJobRepo::claim_pending(&state.pool, permits_available as i32).await?;
    for job in jobs {
        let permit = SEMAPHORE.clone().acquire_owned().await.unwrap();
        let state = state.clone();
        let cancel = cancel.clone();
        tokio::spawn(async move {
            let _permit = permit;  // held for job lifetime
            run_job(&state, &cancel, job).await;
        });
    }
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Each tick claims at most `N = available_permits` jobs (never starves concurrency budget).
- [ ] Claim is the atomic `UPDATE ... RETURNING` from Task 1.4 — no TOCTOU.
- [ ] Spawned job tasks hold a semaphore permit until completion.
- [ ] Cancellation: in-flight jobs finish naturally; no new claims once `cancel.cancelled()` fires.
- [ ] Publish `pending → in_progress` broadcaster event at the start of each job (see Task 4.1).

### Task 3.4: `run_job` — Transcode, Upload, Post-Commit Delete
**File:** `apps/backend/crates/api/src/background/video_transcode.rs`

The end-to-end happy path:
1. Download source from `StorageProvider` to a temp file.
2. Call `ffmpeg::transcode_web_playback(src, dst)` (existing helper).
3. Upload transcoded output to target storage key (`<original-basename>-h264.mp4` in the same dir).
4. Open a DB transaction:
   - `TranscodeJobRepo::mark_completed(tx, job_id, target_key)`
   - `SceneVideoVersionRepo::set_transcoded(tx, entity_id, target_key)` (flips state + `file_path`)
   - Commit.
5. **Post-commit:** `StorageProvider::delete(original_key)`. Log errors but do not fail the job.
6. Publish `in_progress → completed` broadcaster event.

Target key strategy (PRD Requirement 1.5):

```rust
fn target_key_for(original: &str) -> String {
    // "x121/scenes/scene_42_v1_20260417.mov" -> "x121/scenes/scene_42_v1_20260417-h264.mp4"
    let (stem, _ext) = split_key(original);
    format!("{stem}-h264.mp4")
}
```

**Acceptance Criteria:**
- [ ] Transcoded file goes to `<basename>-h264.mp4` in the same directory as the source.
- [ ] Upload uses `state.storage_provider()` (works for Local + S3 backends).
- [ ] DB updates happen in a single transaction — `file_path`, `transcode_state`, job row, all or nothing.
- [ ] Original file is deleted *after* commit (PRD Requirement 1.7 — avoids orphaning on DB rollback).
- [ ] Deletion errors are logged at `warn` but the job is still marked completed.
- [ ] Temp files cleaned up on all exit paths (via `scopeguard` or explicit drop).
- [ ] `target_storage_key` populated on the job row.
- [ ] Broadcaster event published *inside* the transaction's commit callback (see Task 4.1 / PRD Requirement 1.11 test).

### Task 3.5: Retry Policy — Exponential Backoff 30/60/120s
**File:** `apps/backend/crates/api/src/background/video_transcode.rs`

On ffmpeg failure:
- If `attempts < max_attempts`: call `mark_failed_retry` with backoff `Duration::from_secs(30 * 2u64.pow((attempts - 1).into()))` so it becomes 30s, 60s, 120s across the three retries.
- If `attempts >= max_attempts`: call `mark_failed_terminal` in a transaction that also sets `scene_video_versions.transcode_state = 'failed'`. Publish `in_progress → failed` broadcaster event.

```rust
fn backoff_for(attempts: i32) -> Duration {
    let secs = 30u64.saturating_mul(2u64.pow((attempts.max(1) - 1) as u32));
    Duration::from_secs(secs.min(300))  // cap sanity
}
```

**Acceptance Criteria:**
- [ ] Backoff sequence for attempts 1/2/3 is 30s / 60s / 120s.
- [ ] Retry path preserves the job row with `status='pending'`, `next_attempt_at = NOW() + backoff`, `error_message` updated.
- [ ] Terminal failure sets `transcode_jobs.status='failed'`, `transcode_jobs.completed_at=NOW()`, and `scene_video_versions.transcode_state='failed'` in one transaction.
- [ ] Unit test: retry math — `backoff_for(1)=30`, `backoff_for(2)=60`, `backoff_for(3)=120`.
- [ ] Unit test: forced ffmpeg failure on a corrupt fixture → 3 retries → final `failed` (PRD §13).

### Task 3.6: Stalled-Job Recovery Implementation (Requirement 1.4a)
**File:** `apps/backend/crates/db/src/repositories/transcode_job_repo.rs` — `recover_stalled`

The SQL from PRD Requirement 1.4a:

```rust
pub async fn recover_stalled(pool: &PgPool, threshold: Duration) -> sqlx::Result<RecoverResult> {
    let mut tx = pool.begin().await?;

    // 1. For rows that would exceed max_attempts once incremented: mark failed.
    let failed_count = sqlx::query_scalar::<_, i64>(
        "UPDATE transcode_jobs
         SET status_id = $1, completed_at = NOW(), updated_at = NOW(),
             error_message = COALESCE(error_message, '') || E'\n[recovery] attempts exhausted after stall'
         WHERE status_id = $2
           AND started_at < NOW() - ($3 || ' seconds')::INTERVAL
           AND deleted_at IS NULL
           AND attempts + 1 >= max_attempts
         RETURNING id"
    ).bind(TRANSCODE_STATUS_FAILED).bind(TRANSCODE_STATUS_IN_PROGRESS)
     .bind(threshold.as_secs().to_string())
     .fetch_all(&mut *tx).await?.len() as i64;

    // 2. Remaining stalled rows: reset to pending, increment attempts.
    let reset_count = sqlx::query_scalar::<_, i64>(
        "UPDATE transcode_jobs
         SET status_id = $1, attempts = attempts + 1, started_at = NULL, updated_at = NOW()
         WHERE status_id = $2
           AND started_at < NOW() - ($3 || ' seconds')::INTERVAL
           AND deleted_at IS NULL
         RETURNING id"
    ).bind(TRANSCODE_STATUS_PENDING).bind(TRANSCODE_STATUS_IN_PROGRESS)
     .bind(threshold.as_secs().to_string())
     .fetch_all(&mut *tx).await?.len() as i64;

    // 3. For matching entities on the reset path, also reset their transcode_state.
    sqlx::query(
        "UPDATE scene_video_versions svv SET transcode_state = 'pending', updated_at = NOW()
         FROM transcode_jobs tj
         WHERE tj.entity_type = 'scene_video_version' AND tj.entity_id = svv.id
           AND tj.status_id = $1 AND svv.transcode_state = 'in_progress'"
    ).bind(TRANSCODE_STATUS_PENDING).execute(&mut *tx).await?;

    // 4. For matching entities on the failed path, set transcode_state = 'failed'.
    sqlx::query(
        "UPDATE scene_video_versions svv SET transcode_state = 'failed', updated_at = NOW()
         FROM transcode_jobs tj
         WHERE tj.entity_type = 'scene_video_version' AND tj.entity_id = svv.id
           AND tj.status_id = $1 AND svv.transcode_state = 'in_progress'"
    ).bind(TRANSCODE_STATUS_FAILED).execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(RecoverResult { reset_count, failed_count })
}
```

**Acceptance Criteria:**
- [ ] Fresh `in_progress` rows within the threshold are untouched (unit test case a).
- [ ] Stale `in_progress` rows older than threshold with `attempts+1 < max` are reset to `pending` and `attempts` incremented (unit test case b).
- [ ] Stale rows whose incremented `attempts` would hit `max_attempts` are marked `failed` (unit test case c).
- [ ] `scene_video_versions.transcode_state` is kept in sync in the same transaction (`in_progress → pending` or `in_progress → failed`).
- [ ] Returns a count struct the worker can log at boot.

---

## Phase 4: Backend — Activity Broadcaster, API Additions, OpenAPI

### Task 4.1: Worker Publishes `transcode.updated` Events to Activity Broadcaster
**File:** `apps/backend/crates/api/src/background/video_transcode.rs`

Three publish points: `pending → in_progress` (at claim), `in_progress → completed` (inside commit callback), `in_progress → failed` (on terminal failure). Event shape exactly as PRD Requirement 1.11.

```rust
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};

fn publish_transcode_event(
    state: &AppState,
    job: &TranscodeJob,
    svv_id: DbId,
    project_id: Option<DbId>,
    state_label: &str,   // "pending" | "in_progress" | "completed" | "failed"
    error: Option<&str>,
    level: ActivityLogLevel,
) {
    let fields = serde_json::json!({
        "kind": "transcode.updated",
        "state": state_label,
        "job_uuid": job.uuid,
        "progress": serde_json::Value::Null,  // v1 broadcasts transitions only — Phase 2.1 adds progress
        "error": error,
    });
    let mut entry = ActivityLogEntry::curated(
        level,
        ActivityLogSource::Api,
        &format!("Transcode {state_label}"),
    )
    .with_entity("scene_video_version", svv_id)
    .with_fields(fields);
    if let Some(pid) = project_id { entry = entry.with_project(pid); }
    state.activity_broadcaster.publish(entry);
}
```

For the `completed` event, the publish call must happen *after* the DB transaction commits — either via a `Drop`-based commit guard or by calling `publish_transcode_event` immediately after `tx.commit().await?;` returns Ok. Requirement 1.11 includes a unit test for this ordering.

**Acceptance Criteria:**
- [ ] Events use `fields.kind = "transcode.updated"` (exact string — frontend subscription filter).
- [ ] `entity_type = "scene_video_version"`, `entity_id = svv.id`, `job_uuid` = the job's UUID.
- [ ] `project_id` populated when derivable from `scenes.project_id` via `scene_id`.
- [ ] `level = Info` for progress events, `Error` for failure.
- [ ] `completed` event publishes *after* `tx.commit()` succeeds (test: simulate commit failure → no phantom event published).
- [ ] `failed` event carries the `error_message` in `fields.error`.

### Task 4.2: Extend Video-Entity API Responses with Transcode Fields
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` + response DTOs

Add to the SVV response shape:
- `transcode_state: "pending" | "in_progress" | "completed" | "failed"`
- `transcode_error: Option<String>` (populated when `failed`)
- `transcode_started_at: Option<DateTime<Utc>>` (populated when processing — lets UI show "processing for 2 min")
- `transcode_attempts: Option<i32>`
- `transcode_job_id: Option<DbId>` (for the retry endpoint's URL)

The join to `transcode_jobs` uses the active-or-most-recent row for `(entity_type='scene_video_version', entity_id=svv.id)`. A single LEFT JOIN (`ORDER BY created_at DESC LIMIT 1` via subquery) keeps this cheap.

**Acceptance Criteria:**
- [ ] `GET /scene-video-versions/{id}` returns all five fields.
- [ ] All list endpoints that return SVV rows include the five fields.
- [ ] When `transcode_state='completed'`, the four optional fields may be null.
- [ ] SQL query adds one LEFT JOIN LATERAL (or subquery) — no N+1.
- [ ] `GET /media-variants/*` is **unchanged** (PRD §7 non-goal — media variants are images in v1).

### Task 4.3: Admin List + Detail Endpoints
**Files:**
- `apps/backend/crates/api/src/handlers/transcode_job_admin.rs` (new)
- `apps/backend/crates/api/src/routes/mod.rs` (register routes)

- `GET /api/v1/admin/transcode-jobs?status=&entity_type=&created_since=` — paginated. Admin role.
- `GET /api/v1/admin/transcode-jobs/{id}` — single-job detail including full `error_message`. Admin role.

**Acceptance Criteria:**
- [ ] Both routes gated by admin role middleware.
- [ ] List supports the three filters from PRD Requirement 1.8.
- [ ] Response carries status code (e.g. `"pending"`) resolved from `status_id` so the frontend does not need the lookup table.
- [ ] Pagination via existing `LimitOffset` pattern.

### Task 4.4: Retry Endpoint (Editor Role)
**Files:**
- `apps/backend/crates/api/src/handlers/transcode_job_admin.rs`
- `apps/backend/crates/api/src/routes/mod.rs`

`POST /api/v1/transcode-jobs/{id}/retry` — resets `attempts=0`, `status='pending'`, `next_attempt_at=NULL`, `error_message=NULL`. Also resets `scene_video_versions.transcode_state='pending'`. Gated on editor role on the owning project (same auth as re-upload).

**Acceptance Criteria:**
- [ ] Auth: user must have editor role on the project that owns the SVV's scene.
- [ ] Admin-role users can retry any job (authorization passes through).
- [ ] Resetting a job that is currently `in_progress` is rejected with `409 Conflict`.
- [ ] Resetting a `completed` job is rejected with `422 Unprocessable Entity` (nothing to retry).
- [ ] Transaction-updates both job + SVV rows.

### Task 4.5: OpenAPI Schema Update
**File:** the shared OpenAPI schema location (same file the project uses today; confirm in implementation)

Document the new fields + endpoints:
- `SceneVideoVersion` schema: add `transcode_state` (enum of the four values), `transcode_error`, `transcode_started_at`, `transcode_attempts`, `transcode_job_id`.
- New paths: admin list, admin detail, retry.

**Acceptance Criteria:**
- [ ] `transcode_state` documented as an enum with all four values.
- [ ] Admin endpoints documented with auth requirements.
- [ ] Retry endpoint documented with its 409 / 422 error responses.
- [ ] Frontend TS types regenerated from the schema pick up the new fields automatically.

---

## Phase 5: Frontend — Shared Components & Real-Time Refresh

### Task 5.1: Shared `TranscodeStatusBadge` Component
**File:** `apps/frontend/src/components/domain/TranscodeStatusBadge.tsx` (new)

Reuse `StatusBadge` chrome + existing design-system tokens — no new colors. Three visual states:
- `pending` / `in_progress`: neutral badge, label "Processing", spinner icon. (Extends the readiness indicator pattern from PRD-107/128.)
- `failed`: red badge, label "Transcode failed", tooltip with `transcode_error`.
- `completed`: renders nothing (or returns null so callsites don't have to gate).

```tsx
export interface TranscodeStatusBadgeProps {
  state: "pending" | "in_progress" | "completed" | "failed";
  error?: string | null;
  startedAt?: string | null;
  className?: string;
}
export function TranscodeStatusBadge({ state, error, startedAt, className }: TranscodeStatusBadgeProps) {
  if (state === "completed") return null;
  if (state === "failed") return <StatusBadge variant="error" label="Transcode failed" tooltip={error ?? undefined} className={className} />;
  return <StatusBadge variant="neutral" icon={<SpinnerIcon />} label="Processing" className={className} />;
}
```

Add a Storybook story to match the existing `StatusBadge.stories.tsx` pattern.

**Acceptance Criteria:**
- [ ] Single component used by clip cards, scene cards, and media cards (no per-card-type copies — PRD Requirement 1.9).
- [ ] Uses `StatusBadge` chrome — no new design tokens.
- [ ] `state === 'completed'` returns null.
- [ ] Tooltip on failed state shows the error.
- [ ] Storybook story covers all four states.

### Task 5.2: Player Overlay — `TranscodeOverlay`
**File:** `apps/frontend/src/features/video-player/TranscodeOverlay.tsx` (new)

Overlay mounts in the player container when `transcode_state !== 'completed'`; **the `<video>` element is not mounted at all** in those states (PRD Requirement 1.12).

```tsx
export function TranscodeOverlay({ state, error, startedAt, jobId, canRetry }: {
  state: TranscodeState;
  error?: string | null;
  startedAt?: string | null;
  jobId?: number | null;
  canRetry: boolean;
}) {
  if (state === "pending" || state === "in_progress") {
    return (
      <div className="…overlay">
        <Spinner />
        <p>This video is being processed for browser playback.</p>
        {startedAt && <p className="text-muted">Started {formatRelative(startedAt)} ago</p>}
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="…overlay error">
        <p>Transcoding failed.</p>
        {error && <pre className="text-sm">{error}</pre>}
        {canRetry && jobId && <RetryButton jobId={jobId} />}
      </div>
    );
  }
  return null;
}
```

**Acceptance Criteria:**
- [ ] Pending / in_progress: spinner + "being processed" copy + "Started X ago" when `startedAt` is set.
- [ ] Failed: error message + Retry button (visible only when `canRetry=true`).
- [ ] Retry calls `POST /transcode-jobs/{jobId}/retry`, invalidates the relevant TanStack Query keys on success.
- [ ] Callsite never mounts `<video>` when this overlay is rendered (no double mount).
- [ ] Overlay reuses the same slot `ClipPlaybackModal` uses today for "empty version" warnings.

### Task 5.3: `useTranscodeRefresh` Hook — Broadcaster + Polling Fallback
**File:** `apps/frontend/src/hooks/useTranscodeRefresh.ts` (new)

Subscribes to the existing activity WebSocket, filters on `fields.kind === "transcode.updated"`, and invalidates the relevant TanStack Query keys by `(entity_type, entity_id)`. Includes the 5s polling fallback (PRD Requirement 1.11 "Fallback").

```ts
export function useTranscodeRefresh() {
  const qc = useQueryClient();
  const wsConnected = useActivityWebSocketStatus();

  // 1. Subscribe to broadcaster.
  useActivityLogStream((entry) => {
    if (entry.fields?.kind !== "transcode.updated") return;
    if (entry.entity_type !== "scene_video_version") return;
    // Debounce per entity to 1 update/sec.
    debouncedInvalidate(qc, entry.entity_id);
  });

  // 2. Polling fallback: if WebSocket is NOT connected AND there's at least one
  //    mounted card/component with transcode_state !== 'completed' AND the tab is visible,
  //    poll every 5 seconds.
  usePollingFallback({
    enabled: !wsConnected && hasPendingTranscodes() && useVisibility(),
    intervalMs: 5_000,
    onTick: () => qc.invalidateQueries({ queryKey: ["scene-video-versions"] }),
  });
}
```

**Acceptance Criteria:**
- [ ] Subscribes through existing `useActivityLogStream` — no new WebSocket transport.
- [ ] Filter: only events with `fields.kind === "transcode.updated"` trigger invalidation.
- [ ] Invalidates queries by `(entity_type, entity_id)` pair — affects clip-detail, version-list, scene-detail.
- [ ] Debounced to max 1 update per entity per second.
- [ ] Polling fallback runs only when WebSocket is disconnected AND tab is visible (follows PRD-159 visibility pattern) AND at least one visible card has `transcode_state !== 'completed'`.
- [ ] Polling interval 5 seconds.

---

## Phase 6: Frontend — Callsite Audit & Upload UI Copy Changes

### Task 6.1: Audit — Enumerate Every `<video>` Callsite for SVV Rows
**Files:** Repo-wide frontend search

PRD Requirement 1.12 requires that **no `<video>`** element is mounted against an SVV `file_path` unless `transcode_state === 'completed'`. Produce an audit list first:

```sh
rg -g '*.tsx' -g '*.ts' -nS '<video' apps/frontend/src/
```

Also look for direct uses of `VideoPlayer` and `ClipPlaybackModal`. The PRD calls out these specific surfaces:
- `ClipPlaybackModal` (`features/scenes/ClipPlaybackModal.tsx`)
- scene-version pickers
- derived-clip browser
- clip comparison view (`features/segment-comparison/`)
- thumbnail autoplay hover
- `features/cinema/`, `features/directors-view/` (may also play clips)

**Acceptance Criteria:**
- [ ] Audit document lists every file and line where a `<video>` is mounted (or `VideoPlayer` is rendered) against an SVV file_path.
- [ ] Each entry is either "already guarded" (show how) or "needs update" (Tasks 6.2-6.N fix each).
- [ ] Final grep for `<video src={version.file_path}>` patterns without a state guard returns zero results.

### Task 6.2: Update `ClipPlaybackModal` — Gate on `transcode_state`
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Replace unconditional `<VideoPlayer src=... />` with:

```tsx
{version.transcode_state === "completed" ? (
  <VideoPlayer src={url} />
) : (
  <TranscodeOverlay
    state={version.transcode_state}
    error={version.transcode_error}
    startedAt={version.transcode_started_at}
    jobId={version.transcode_job_id}
    canRetry={canRetry}
  />
)}
```

**Acceptance Criteria:**
- [ ] Modal shows the overlay (not a broken `<video>`) for pending / in_progress / failed.
- [ ] Completed videos play normally — no regression.

### Task 6.3: Update Remaining Player Surfaces
**Files:** Everything flagged in Task 6.1's audit — notably scene-version pickers, derived-clip browser, segment-comparison, thumbnail hover, cinema / directors-view.

Same gate pattern as Task 6.2. Where a thumbnail autoplay hover cannot reasonably show an overlay (too small), render a spinner or simply skip the hover-play and show the `TranscodeStatusBadge` instead.

**Acceptance Criteria:**
- [ ] Each audited file has the state gate applied.
- [ ] Comparison view gracefully handles one side being `completed` and the other `pending`.
- [ ] Thumbnail hover does not autoplay for non-completed videos.
- [ ] Final audit grep returns zero unguarded `<video src={version.file_path}>`.

### Task 6.4: Add `TranscodeStatusBadge` to Card Surfaces
**Files:**
- `apps/frontend/src/components/domain/ThumbnailCard.tsx` (or its call-through)
- Clip card, scene card, and media card components (whichever render SVV rows).

Drop `<TranscodeStatusBadge state={svv.transcode_state} error={svv.transcode_error} />` into the thumbnail overlay slot.

**Acceptance Criteria:**
- [ ] Clip cards show a Processing / Failed badge when appropriate.
- [ ] Scene cards show the badge aggregating over child clip state (PRD leaves this implicit — recommend: show "Processing" if *any* SVV row for the scene is non-completed).
- [ ] Media cards (scene-video-version representations) show the badge.

### Task 6.5: Update Upload UI Copy — "Processing for Playback"
**Files:**
- `apps/frontend/src/features/.../ImportClipDialog.tsx` (whichever file hosts the multipart upload dialog)
- The batch-import UI (wherever the pre-PRD-165 `import_directory` results are shown)
- A new shared constants file for the copy string (PRD Requirement 1.12 — "centralized in a single shared string")

Change the success toast / dialog copy from "Video uploaded and ready" to "Video uploaded — processing for playback" when the returned `transcode_state === 'pending'`. Keep "Video uploaded and ready" for `completed` responses.

```ts
// apps/frontend/src/features/.../copy.ts
export const UPLOAD_SUCCESS = {
  ready: "Video uploaded and ready",
  processing: "Video uploaded — processing for playback",
};
```

**Acceptance Criteria:**
- [ ] ImportClipDialog success toast uses the new copy based on `transcode_state`.
- [ ] Batch import UI likewise.
- [ ] Copy is in a single shared constant — one anchor for future translations (PRD requirement).
- [ ] Existing ready-state copy is unchanged.

### Task 6.6: Wire `useTranscodeRefresh` Into App Shell
**File:** `apps/frontend/src/app/AppShell.tsx` (or the root provider that already mounts other cross-app hooks)

Call `useTranscodeRefresh()` once at the app-shell level so invalidations happen regardless of which page the user is on.

**Acceptance Criteria:**
- [ ] Hook mounted at the app-shell level (not per-page).
- [ ] Running two browser tabs shows consistent updates in both.

---

## Phase 7: Tests & Documentation

### Task 7.1: Unit Tests — Enqueue Helper
**File:** `apps/backend/crates/api/src/background/video_transcode.rs` (inline `#[cfg(test)]`)

- `enqueue_if_needed` with H.264 fixture → returns `Completed`, no job row inserted, SVV state = `'completed'`.
- `enqueue_if_needed` with HEVC fixture → returns `Pending`, one job row inserted with `source_codec='hevc'`, SVV state = `'pending'`.
- Calling `enqueue_if_needed` twice for the same entity → second call returns the existing state (no unique-violation leak).

**Acceptance Criteria:**
- [ ] All three cases covered with real fixtures from the PRD-109 test corpus.
- [ ] Tests run via `cargo test -p x121-api`.

### Task 7.2: Unit Tests — Claim Logic + Recovery + Retry Math
**File:** `apps/backend/crates/db/src/repositories/transcode_job_repo.rs` (inline `#[cfg(test)]`)

- `claim_pending(2)` picks the two oldest pending rows (FIFO) and marks them `in_progress`.
- `claim_pending` skips rows whose `next_attempt_at > NOW()`.
- `recover_stalled` cases (a/b/c) from Task 3.6 Acceptance Criteria.
- `backoff_for(n)` values from Task 3.5.

**Acceptance Criteria:**
- [ ] Tests run against a test DB via the existing sqlx test harness.
- [ ] All cases from PRD Requirement 1.4a acceptance criteria covered.

### Task 7.3: Integration Test — Import HEVC, Worker Completes
**File:** `apps/backend/crates/api/tests/transcode_pipeline.rs` (new)

End-to-end happy path:
1. POST a non-H.264 multipart clip to `/scenes/{id}/versions`.
2. Assert `201` returns within 10s (PRD §6 Performance).
3. Assert response `transcode_state === 'pending'`.
4. Spawn the worker; wait for completion (poll until `completed` or timeout 60s).
5. Assert final `transcode_state === 'completed'`, `file_path` ends with `-h264.mp4`, and the original key no longer exists in storage.

**Acceptance Criteria:**
- [ ] Test passes against the PRD-109 HEVC fixture.
- [ ] Response latency assertion enforces the < 10s P50 budget (PRD §12).
- [ ] Original file deletion verified post-completion.

### Task 7.4: Integration Test — Bulk Import (PRD-165 Path)
**File:** `apps/backend/crates/api/tests/transcode_pipeline.rs`

- Kick off a PRD-165 server-scan import with 5 HEVC fixtures.
- Assert SSE stream closes in under a minute (vs. 20+ min with inline transcode).
- Wait for worker to drain queue; assert all 5 SVV rows reach `completed`.

**Acceptance Criteria:**
- [ ] SSE stream close time is logged and asserted.
- [ ] All 5 clips reach `completed` within the test's timeout.

### Task 7.5: Integration Test — Forced Failure Path
**File:** `apps/backend/crates/api/tests/transcode_pipeline.rs`

- Enqueue a corrupt video fixture.
- Run worker ticks 3 times (triggering retries).
- Assert final state: `transcode_jobs.status='failed'`, `svv.transcode_state='failed'`, `error_message` non-empty.

**Acceptance Criteria:**
- [ ] Retry sequence respects 30s/60s/120s backoff (test can fast-forward time via a test clock or use `next_attempt_at` directly).
- [ ] `error_message` contains the ffmpeg stderr.

### Task 7.6: Frontend Tests — Badge, Overlay, Retry
**Files:** `apps/frontend/src/components/domain/TranscodeStatusBadge.test.tsx`, `apps/frontend/src/features/video-player/TranscodeOverlay.test.tsx`

- Badge renders nothing when `state='completed'`.
- Badge shows Processing with spinner for `pending` / `in_progress`.
- Badge shows error tooltip for `failed`.
- Overlay mounts for non-completed states (and no `<video>` in the DOM).
- Retry button calls the right endpoint and invalidates the right queries.

**Acceptance Criteria:**
- [ ] All four badge states covered.
- [ ] Overlay test asserts no `<video>` element is in the render tree for pending/in_progress/failed.
- [ ] Retry test uses MSW or equivalent to mock the endpoint and assert invalidation.

### Task 7.7: Documentation — API + Worker
**Files:**
- `design/progress/DRY-TRACKER.md` — add `enqueue_if_needed`, `TranscodeStatusBadge`, `useTranscodeRefresh`.
- `design/progress/WIRING-STATUS.md` — mark PRD-169 surfaces as wired once Phase 6 lands.
- The OpenAPI schema update from Task 4.5.

**Acceptance Criteria:**
- [ ] DRY tracker lists the three new shared utilities under "Resolved" or "Utilities".
- [ ] Wiring status updated when the frontend phases are complete.
- [ ] `cargo doc -p x121-api` produces docs for `background::video_transcode` module + `TranscodeJobRepo`.

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260417000001_create_transcode_jobs.sql` | New migration — `transcode_job_statuses` + `transcode_jobs` |
| `apps/db/migrations/20260417000002_add_transcode_state_to_svv.sql` | New migration — `transcode_state` column + partial index |
| `apps/backend/crates/db/src/models/transcode_job.rs` | **New** — `TranscodeJob`, `CreateTranscodeJob`, status consts |
| `apps/backend/crates/db/src/models/scene_video_version.rs` | Add `transcode_state: String` field |
| `apps/backend/crates/db/src/repositories/transcode_job_repo.rs` | **New** — repo for enqueue, claim, retry, recovery |
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | Add `set_transcode_state`, `set_transcoded` |
| `apps/backend/crates/api/src/background/video_transcode.rs` | **New** — worker + `enqueue_if_needed` helper |
| `apps/backend/crates/api/src/background/mod.rs` | Register `pub mod video_transcode;` |
| `apps/backend/crates/api/src/main.rs` | Spawn worker alongside other background tasks |
| `apps/backend/crates/api/src/handlers/directory_scan_import.rs` | Call `enqueue_if_needed` in `import_video_from_source` |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | Remove `ensure_h264` fn + 3 callsites; call `enqueue_if_needed` in all 3 handlers |
| `apps/backend/crates/api/src/handlers/transcode_job_admin.rs` | **New** — admin list/detail + editor-role retry endpoint |
| `apps/backend/crates/api/src/routes/mod.rs` | Register admin + retry routes |
| `apps/backend/crates/api/tests/transcode_pipeline.rs` | **New** — integration tests |
| `apps/frontend/src/components/domain/TranscodeStatusBadge.tsx` | **New** — shared badge |
| `apps/frontend/src/components/domain/TranscodeStatusBadge.stories.tsx` | **New** — Storybook |
| `apps/frontend/src/features/video-player/TranscodeOverlay.tsx` | **New** — player overlay |
| `apps/frontend/src/hooks/useTranscodeRefresh.ts` | **New** — broadcaster subscription + polling fallback |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Gate player on `transcode_state` |
| `apps/frontend/src/features/segment-comparison/*` | Gate comparison players |
| `apps/frontend/src/features/cinema/*` | Gate cinema-mode players |
| `apps/frontend/src/features/directors-view/*` | Gate directors-view players |
| `apps/frontend/src/app/AppShell.tsx` | Mount `useTranscodeRefresh` at shell level |
| `apps/frontend/src/features/.../ImportClipDialog.tsx` | Update success toast copy |
| `apps/frontend/src/features/.../copy.ts` | **New** — centralized upload-success strings |

---

## Dependencies

### Existing Components to Reuse

- `ffmpeg::transcode_web_playback`, `ffmpeg::is_browser_compatible`, `ffmpeg::probe_video` — from `core/src/ffmpeg.rs`.
- `background::delivery_assembly` — blueprint for the worker shape.
- `state.activity_broadcaster` — generic publish, used the same way `delivery_assembly.rs:710` does.
- `state.storage_provider()` — read / upload / delete (Local + S3).
- `ActivityLogEntry::curated(...)` builder pattern from `x121_core::activity`.
- `StatusBadge` + design-system tokens — no new colors.
- `useActivityLogStream` — existing WebSocket client; add a filter, not a new connection.
- `SceneVideoVersionRepo::find_final_for_scene` etc. — existing queries extended to return the new state field.
- `SceneRepo` join to `project_id` — to populate broadcaster events' `project_id`.

### New Infrastructure Needed

- `transcode_jobs` polymorphic queue + `transcode_job_statuses` lookup.
- `transcode_state` column on `scene_video_versions`.
- `TranscodeJobRepo` + model.
- `background::video_transcode` module (worker + enqueue helper).
- Admin + retry endpoints under `/api/v1/admin/transcode-jobs` and `/api/v1/transcode-jobs/{id}/retry`.
- Frontend: `TranscodeStatusBadge`, `TranscodeOverlay`, `useTranscodeRefresh`.

---

## Implementation Order

### MVP (Minimum for Feature)

1. **Phase 1** — Schema + models + repos (Tasks 1.1-1.5).
2. **Phase 2** — `enqueue_if_needed` + all four handlers migrated + `ensure_h264` deleted (Tasks 2.1-2.6).
3. **Phase 3** — Worker with retries + stalled-job recovery (Tasks 3.1-3.6).
4. **Phase 4** — Activity events + API fields + admin/retry endpoints + OpenAPI (Tasks 4.1-4.5).
5. **Phase 5** — Shared badge + overlay + refresh hook (Tasks 5.1-5.3).
6. **Phase 6** — Callsite audit + updates + copy changes (Tasks 6.1-6.6).

**MVP Success Criteria:**

- `rg 'ensure_h264' apps/backend/` returns zero.
- P50 HTTP latency for a 100 MB non-H.264 multipart upload is < 10s on the reference 4-core dev box.
- A bulk server-scan of 5 HEVC fixtures completes its SSE stream in under a minute and all 5 reach `completed` after worker processing.
- Every frontend `<video>` callsite for an SVV row is gated on `transcode_state === 'completed'`.
- A force-killed backend mid-transcode recovers the stalled job on next boot within 10 minutes.

### Post-MVP

7. **Phase 7** — Tests + docs (Tasks 7.1-7.7). Can begin in parallel with Phases 5-6 once the backend stabilizes.

Phase 2 items from the PRD (progress-percent broadcasting, scheduled windows, admin Transcode Queue page, resolution-aware transcode, parallel segment transcoding) are explicitly out of scope for this task list.

---

## Notes

1. **Order matters in Phase 2.** Migrate all four handlers (Tasks 2.2-2.5) *before* deleting `ensure_h264` (Task 2.6) — otherwise the compile will fail with dangling references.
2. **Worker startup cleanup runs once per boot.** Tests that spin up the worker in-process need to account for this — either seed-then-reset or use a fresh DB per test.
3. **Broadcaster is best-effort.** The frontend polling fallback (Task 5.3) is what makes the UX resilient to WebSocket disconnects; do not skip it.
4. **Post-commit delete ordering matters.** If the `StorageProvider::delete(original_key)` call comes *before* the transaction commits and the commit fails, the user is left with no video and a confusing failure. Always commit first, then delete.
5. **The `enqueue_if_needed` helper lives in `background/video_transcode.rs` deliberately** — it's the only code that cares about the polymorphic table's details, so it coexists with the worker. Other handlers import it from there.
6. **Storage-key target convention** (`<basename>-h264.mp4`) is the PRD's recommended choice — alternatives were considered and rejected in PRD §10 decision 3. Do not invent a `/transcoded/` prefix.
7. **Media variants are not touched in v1.** Do not add `transcode_state` to `media_variants`, do not register `'media_variant'` in the CHECK constraint, do not extend media-variant API responses.
8. **DRY-TRACKER update.** After this PRD ships, add `enqueue_if_needed`, `TranscodeStatusBadge`, and `useTranscodeRefresh` to `design/progress/DRY-TRACKER.md` as resolved shared utilities.

---

## Version History

- **v1.0** (2026-04-17): Initial task list creation from PRD-169 v1.2.
