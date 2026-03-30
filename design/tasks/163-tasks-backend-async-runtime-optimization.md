# Task List: Backend Async Runtime Optimization

**PRD Reference:** `design/prds/163-prd-backend-async-runtime-optimization.md`
**Scope:** Fix four categories of async runtime misuse: blocking `std::fs` calls on the Tokio executor, missing `tokio::try_join!` for independent queries, sequential video processing, and in-memory video buffering.

## Overview

The Rust backend runs on Tokio but several handlers misuse the async runtime. The directory scanner module (673 lines of `std::fs`) blocks the Tokio runtime thread for every file operation. Multiple handlers execute independent database queries sequentially instead of concurrently. Video backfill endpoints process up to 200 videos one-by-one. The `ensure_h264` function holds entire video files in memory. Each issue is addressed with the appropriate async pattern: `spawn_blocking` for sustained I/O, `try_join!` for independent queries, `buffer_unordered` for concurrent processing, and streaming for uploads.

### What Already Exists
- `tokio::task::spawn_blocking` — standard Tokio API, no new deps needed
- `tokio::try_join!` — standard Tokio macro
- `futures::stream::StreamExt::buffer_unordered` — `futures` crate already in workspace deps
- `tokio::fs` — standard Tokio async filesystem API
- `directory_scanner.rs` in `crates/core/src/` — pure synchronous module (673 lines)
- Video backfill handlers in `crates/api/src/handlers/video.rs`

### What We're Building
1. `spawn_blocking` wrapper for directory scanner call site
2. `tokio::fs::create_dir_all` replacement in `ensure_h264`
3. `tokio::try_join!` in 10+ handler functions
4. `buffer_unordered(4)` for video backfill endpoints
5. Streaming video upload replacing in-memory buffering

### Key Design Decisions
1. **`spawn_blocking` over rewriting** for directory scanner — the module does sustained I/O, best suited for a blocking thread. No need to rewrite 673 lines.
2. **`try_join!` over `join!`** — always use fallible variant for DB queries to short-circuit on first error.
3. **`buffer_unordered` over `buffer`** — order doesn't matter for backfill operations.
4. **Streaming to disk** for uploads — use `field.chunk()` loop to write directly, avoiding OOM.

---

## Phase 1: Blocking I/O Fixes

### Task 1.1: Wrap Directory Scanner in `spawn_blocking`
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

The call site invokes `directory_scanner::scan_directory()` (a synchronous function) directly from an async handler, blocking the Tokio runtime. Wrap it in `spawn_blocking`.

**Current code (around line 130-143):**
```rust
let scan_result = directory_scanner::scan_directory(&path, &scan_config).map_err(|e| match e {
    directory_scanner::ScanError::NotADirectory(p) => {
        AppError::BadRequest(format!("Not a directory: {}", p.display()))
    }
    directory_scanner::ScanError::Io(e) => {
        AppError::InternalError(format!("I/O error scanning directory: {e}"))
    }
})?;
```

**New code:**
```rust
let scan_result = tokio::task::spawn_blocking(move || {
    directory_scanner::scan_directory(&path, &scan_config)
})
.await
.map_err(|e| AppError::InternalError(format!("Scanner task panicked: {e}")))?
.map_err(|e| match e {
    directory_scanner::ScanError::NotADirectory(p) => {
        AppError::BadRequest(format!("Not a directory: {}", p.display()))
    }
    directory_scanner::ScanError::Io(e) => {
        AppError::InternalError(format!("I/O error scanning directory: {e}"))
    }
})?;
```

**Acceptance Criteria:**
- [ ] `scan_directory` executes inside `spawn_blocking`
- [ ] `path` and `scan_config` are moved into the closure (must be `Send + 'static`)
- [ ] `JoinError` (panic) mapped to `AppError::InternalError`
- [ ] Original `ScanError` mapping preserved
- [ ] Tokio runtime thread is never blocked during directory scan
- [ ] Existing directory scan functionality unchanged
- [ ] `cargo check` passes

### Task 1.2: Replace `std::fs::create_dir_all` with `tokio::fs` in `ensure_h264`
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (line 62)

**Current code (line 62):**
```rust
std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
```

**New code:**
```rust
tokio::fs::create_dir_all(&tmp_dir).await.map_err(|e| e.to_string())?;
```

**Acceptance Criteria:**
- [ ] `std::fs::create_dir_all` replaced with `tokio::fs::create_dir_all(...).await`
- [ ] No other `std::fs` calls remain in `ensure_h264` (verify entire function)
- [ ] Handler remains fully async
- [ ] `cargo check` passes

---

## Phase 2: Concurrent Query Execution

### Task 2.1: Add `tokio::try_join!` to `cloud_providers::dashboard`
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs` (lines 707-708)

**Current code (sequential):**
```rust
let providers = CloudProviderRepo::list(&state.pool).await?;
let all_instances = CloudInstanceRepo::list_all_active(&state.pool).await?;
```

**New code (concurrent):**
```rust
// Parallel: provider list and active instances are independent.
let (providers, all_instances) = tokio::try_join!(
    CloudProviderRepo::list(&state.pool),
    CloudInstanceRepo::list_all_active(&state.pool),
)?;
```

**Acceptance Criteria:**
- [ ] Both queries execute concurrently via `try_join!`
- [ ] Code comment confirms queries are independent
- [ ] Same data returned, same response format
- [ ] `cargo check` passes

### Task 2.2: Add `tokio::try_join!` to `delivery.rs` Independent Queries
**File:** `apps/backend/crates/api/src/handlers/delivery.rs` (lines 572-663)

Identify independent sequential queries in the `validate_delivery` handler and parallelize them.

**Acceptance Criteria:**
- [ ] Independent queries identified and wrapped in `try_join!`
- [ ] Data-dependent queries remain sequential
- [ ] Code comments document which queries are parallelized
- [ ] `cargo check` passes

### Task 2.3: Add `tokio::try_join!` to `system_health.rs` Uptime Queries
**File:** `apps/backend/crates/api/src/handlers/system_health.rs` (lines 102-117)

**Current code (sequential loop):**
```rust
for &service in system_health::ALL_SERVICES {
    let (healthy_s, degraded_s, total_s) =
        UptimeRecordRepo::compute_uptime_seconds(&state.pool, service, since).await?;
    // ...
}
```

Convert to concurrent execution using `futures::future::try_join_all` since there are a variable number of services.

**New code:**
```rust
use futures::future::try_join_all;

let uptime_futures = system_health::ALL_SERVICES.iter().map(|&service| {
    let pool = &state.pool;
    async move {
        let (healthy_s, degraded_s, total_s) =
            UptimeRecordRepo::compute_uptime_seconds(pool, service, since).await?;
        let down_s = total_s - healthy_s - degraded_s;
        Ok::<_, sqlx::Error>(UptimeResponse {
            service_name: service.to_string(),
            uptime_percent_24h: system_health::compute_uptime_percent(healthy_s, degraded_s, total_s),
            healthy_seconds: healthy_s,
            degraded_seconds: degraded_s,
            down_seconds: down_s.max(0),
            total_seconds: total_s,
        })
    }
});
let results: Vec<UptimeResponse> = try_join_all(uptime_futures).await?;
```

**Acceptance Criteria:**
- [ ] All uptime queries execute concurrently via `try_join_all`
- [ ] Results collected in same order as `ALL_SERVICES`
- [ ] For 6 services: all queries issued in parallel
- [ ] `cargo check` passes

### Task 2.4: Audit and Apply `try_join!` to 7+ Additional Handlers
**File:** Multiple handler files

Search the codebase for handlers with 2+ sequential `.await?` calls on independent data. Target at least 7 more conversions (for a total of 10+ across Tasks 2.1-2.4).

**Search strategy:**
```
# Find handlers with multiple sequential await calls
grep -n "\.await?" apps/backend/crates/api/src/handlers/*.rs | sort
```

**Candidate patterns to look for:**
- Two `find_by_id` calls on different entities
- A `list` call followed by a `count` call on different tables
- Multiple `Repo::list` calls for dashboard/summary endpoints

**Acceptance Criteria:**
- [ ] At least 7 additional handler functions converted (10+ total including Tasks 2.1-2.3)
- [ ] Each conversion verified: queries are truly independent (no data dependency)
- [ ] Code comment on each `try_join!` block listing which queries are parallelized
- [ ] No functional behavior changes
- [ ] `cargo check` passes

---

## Phase 3: Video Processing Optimization

### Task 3.1: Parallelize `generate_previews` Backfill
**File:** `apps/backend/crates/api/src/handlers/video.rs` (lines 451-456)

**Current code (sequential):**
```rust
for version in &versions {
    match generate_preview_for_version(&state, version).await {
        Some(_) => succeeded += 1,
        None => failed += 1,
    }
}
```

**New code (concurrent with `buffer_unordered`):**
```rust
use futures::stream::{self, StreamExt};

const VIDEO_BACKFILL_CONCURRENCY: usize = 4;

let results: Vec<bool> = stream::iter(versions.iter())
    .map(|version| {
        let state = &state;
        async move {
            generate_preview_for_version(state, version).await.is_some()
        }
    })
    .buffer_unordered(VIDEO_BACKFILL_CONCURRENCY)
    .collect()
    .await;

let succeeded = results.iter().filter(|&&r| r).count();
let failed = results.iter().filter(|&&r| !r).count();
```

**Acceptance Criteria:**
- [ ] Uses `buffer_unordered(4)` for concurrent processing
- [ ] Concurrency constant defined as `VIDEO_BACKFILL_CONCURRENCY = 4`
- [ ] Individual video errors don't cancel the batch
- [ ] For 200 videos: ~4x faster wall-clock time
- [ ] `cargo check` passes

### Task 3.2: Parallelize `generate_web_playback` Backfill
**File:** `apps/backend/crates/api/src/handlers/video.rs` (lines 494-499)

Apply the same `buffer_unordered` pattern as Task 3.1.

**Current code (lines 494-499):**
```rust
for version in &versions {
    match generate_web_playback_for_version(&state, version).await {
        Some(_) => succeeded += 1,
        None => failed += 1,
    }
}
```

**Acceptance Criteria:**
- [ ] Uses same `buffer_unordered(VIDEO_BACKFILL_CONCURRENCY)` pattern
- [ ] Shares the concurrency constant with Task 3.1
- [ ] `cargo check` passes

### Task 3.3: Parallelize `backfill_video_metadata` Backfill
**File:** `apps/backend/crates/api/src/handlers/video.rs` (lines 539-544)

Apply the same `buffer_unordered` pattern as Task 3.1.

**Current code (lines 539-544):**
```rust
for version in &versions {
    if extract_and_set_video_metadata(&state, version).await {
        succeeded += 1;
    } else {
        failed += 1;
    }
}
```

**Acceptance Criteria:**
- [ ] Uses same `buffer_unordered(VIDEO_BACKFILL_CONCURRENCY)` pattern
- [ ] Shares the concurrency constant with Tasks 3.1, 3.2
- [ ] `cargo check` passes

### Task 3.4: Stream Video Uploads Instead of Memory Buffering
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (lines 59-103)

**Current function signature:**
```rust
async fn ensure_h264(data: Vec<u8>, _ext: &str) -> Result<Vec<u8>, String> {
```

**New function signature:**
```rust
async fn ensure_h264(input_path: &Path) -> Result<PathBuf, String> {
```

**Implementation changes:**
1. Caller streams multipart upload directly to a temp file (using `field.chunk()` loop)
2. `ensure_h264` accepts the temp file path, not bytes
3. If transcoding needed, operates file-to-file (input path -> output path)
4. Returns output file path instead of bytes
5. Caller passes output path to storage layer

**New upload streaming pattern (at the call site):**
```rust
// Stream upload to temp file instead of collecting all bytes.
let tmp_dir = std::env::temp_dir().join("x121_import");
tokio::fs::create_dir_all(&tmp_dir).await.map_err(|e| e.to_string())?;
let input_path = tmp_dir.join(format!("upload_{}.tmp", chrono::Utc::now().timestamp_millis()));

{
    let mut file = tokio::fs::File::create(&input_path).await?;
    while let Some(chunk) = field.chunk().await? {
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
    }
}

let output_path = ensure_h264(&input_path).await?;
// Pass output_path to storage layer...

// Cleanup temp files.
let _ = tokio::fs::remove_file(&input_path).await;
if output_path != input_path {
    let _ = tokio::fs::remove_file(&output_path).await;
}
```

**Acceptance Criteria:**
- [ ] Upload handler streams multipart body to temp file using `field.chunk()` loop
- [ ] `ensure_h264` accepts a file path, not `Vec<u8>`
- [ ] Transcoding operates file-to-file (no full file in memory)
- [ ] Returns `PathBuf` instead of `Vec<u8>`
- [ ] Peak memory for 500MB upload: < 10MB (stream buffer size)
- [ ] All callers of `ensure_h264` updated
- [ ] Temp files cleaned up on both success and error paths
- [ ] `cargo check` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/api/src/handlers/directory_scan.rs` | `spawn_blocking` wrapper for scanner |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | `tokio::fs` fix + streaming upload |
| `apps/backend/crates/api/src/handlers/cloud_providers.rs` | `try_join!` for dashboard queries |
| `apps/backend/crates/api/src/handlers/delivery.rs` | `try_join!` for validation queries |
| `apps/backend/crates/api/src/handlers/system_health.rs` | `try_join_all` for uptime queries |
| `apps/backend/crates/api/src/handlers/video.rs` | `buffer_unordered` for backfill endpoints |
| `apps/backend/crates/core/src/directory_scanner.rs` | Unchanged — remains synchronous (runs in blocking thread) |

---

## Dependencies

### Existing Components to Reuse
- `tokio::task::spawn_blocking` — standard Tokio API
- `tokio::try_join!` — standard Tokio macro
- `futures::stream::StreamExt::buffer_unordered` — already in workspace
- `tokio::fs` — standard Tokio async filesystem
- `tokio::io::AsyncWriteExt` — for streaming writes

### New Infrastructure Needed
- `VIDEO_BACKFILL_CONCURRENCY` constant (could be in `video.rs` or a shared config)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Blocking I/O — Tasks 1.1-1.2 (quick wins, high impact)
2. Phase 2: `try_join!` — Tasks 2.1-2.4 (moderate effort, 30-50% latency reduction)
3. Phase 3: Video optimization — Tasks 3.1-3.4 (larger effort, high throughput impact)

**MVP Success Criteria:**
- Zero `std::fs` calls in async handler code paths
- At least 10 handler functions using `tokio::try_join!` or `try_join_all`
- Video backfill ~4x faster than sequential
- Video upload peak memory < 10MB regardless of file size

### Post-MVP Enhancements
- Make `VIDEO_BACKFILL_CONCURRENCY` configurable via env var
- Add `scopeguard::defer!` for temp file cleanup

---

## Notes

1. Task 1.1 is a one-line change at the call site — do NOT rewrite `directory_scanner.rs` to use `tokio::fs`. The module is pure CPU+I/O work best suited for a blocking thread.
2. For Task 2.4, audit at least the following files for `try_join!` opportunities: `dashboard.rs`, `project.rs`, `avatar.rs`, `pipelines.rs`, `production_run.rs`, `avatar_dashboard.rs`, `performance.rs`.
3. Task 3.4 (streaming upload) is the largest task and changes the `ensure_h264` function signature. Trace all callers before starting.
4. For `try_join!` with more than 5 concurrent queries, consider connection pool contention — with a pool of 10 connections, 5 concurrent queries per request is a reasonable upper bound.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-163
