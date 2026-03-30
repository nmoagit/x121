# PRD-163: Backend Async Runtime Optimization

## 1. Introduction/Overview

The Rust backend runs on Tokio's async runtime, but several handlers misuse it by performing blocking I/O on the async executor or executing independent async operations sequentially instead of concurrently. The worst offender is `directory_scanner.rs` — a 673-line module that uses `std::fs` exclusively, blocking the Tokio runtime for every file system operation. Video handlers also hold entire video files in memory during upload and transcode instead of streaming.

This PRD addresses four categories of async runtime misuse: blocking `std::fs` calls, missing `tokio::try_join!` for independent queries, sequential video processing, and in-memory video buffering.

These fixes are sourced from the **Performance Audit — Rust Backend** (2026-03-30), findings PERF-13, PERF-14, PERF-15, PERF-19, and PERF-21.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-02** (Backend Foundation) — Axum handler infrastructure, Tokio runtime
- **PRD-155** (Server-Side Directory Scan) — `directory_scanner.rs` module

### Extends
- **PRD-109** (Scene Video Versioning) — `ensure_h264` handler, video upload
- **PRD-114** (Cloud GPU Provider Integration) — `cloud_providers.rs` independent queries
- **PRD-39** (Delivery Packaging) — `delivery.rs` independent queries
- **PRD-80** (System Health Page) — `system_health.rs` independent queries

### Related
- **PRD-160** (Critical N+1 Elimination) — query optimization is complementary
- **PRD-164** (Repository Layer Migration) — inline SQL in video handler

## 3. Goals

### Primary Goals
1. Prevent blocking the Tokio runtime by wrapping `std::fs` calls in `spawn_blocking` or replacing with `tokio::fs`.
2. Use `tokio::try_join!` for independent queries in at least 10 handler functions.
3. Parallelize video backfill endpoints using `buffer_unordered` for concurrent ffmpeg processing.
4. Stream video uploads to disk instead of buffering entire files in memory.

### Secondary Goals
- Reduce p99 latency for handlers that currently block the runtime.
- Reduce memory usage for video upload endpoints.
- Establish patterns for async-correct file I/O that future code can follow.

## 4. User Stories

- **US-1:** As a pipeline operator scanning a large directory (1000+ files), I want the scan to not block other users' API requests on the same server.
- **US-2:** As a pipeline operator viewing the cloud providers dashboard, I want the page to load faster because independent data sources are fetched concurrently.
- **US-3:** As a pipeline operator running video backfill (200 videos), I want the operation to process 4 videos at a time instead of one-by-one, cutting wall-clock time by 75%.
- **US-4:** As a pipeline operator uploading a 500MB video, I want the server to stream it to disk instead of holding the entire file in memory, preventing OOM risks.

## 5. Functional Requirements

### Phase 1: Blocking I/O Fixes

#### Requirement 1.1: Fix Blocking `std::fs` in Directory Scanner (PERF-13)

**File:** `crates/core/src/directory_scanner.rs` (entire 673-line module uses `std::fs`)
**Called from:** `crates/api/src/handlers/directory_scan.rs`

**Current behavior:** The directory scanner module uses synchronous `std::fs` operations throughout: `read_dir`, `metadata`, `is_file`, `is_dir`, etc. When called from an async handler, this blocks the Tokio runtime thread.

**Acceptance Criteria:**
- [ ] The call site in `directory_scan.rs` wraps the scanner invocation in `tokio::task::spawn_blocking(move || scan_directory(&path)).await?`
- [ ] The `directory_scanner.rs` module itself remains synchronous (it runs inside the blocking thread)
- [ ] No other async handler calls `directory_scanner` directly without `spawn_blocking`
- [ ] For a directory with 1000 files, the async runtime is never blocked — other requests continue to be served

**Technical Notes:**
- Do NOT rewrite `directory_scanner.rs` to use `tokio::fs` — the module is pure CPU+I/O work best suited for a blocking thread
- The `spawn_blocking` wrapper is a one-line change at the call site
- Ensure `path` and all captures are `Send + 'static` for the move closure

#### Requirement 1.2: Fix `std::fs::create_dir_all` in `ensure_h264` (PERF-14)

**File:** `crates/api/src/handlers/scene_video_version.rs:62`

**Acceptance Criteria:**
- [ ] Replace `std::fs::create_dir_all(...)` with `tokio::fs::create_dir_all(...).await`
- [ ] Any other `std::fs` calls in the same function are also replaced with `tokio::fs` equivalents
- [ ] Handler remains fully async with no blocking calls

### Phase 2: Concurrent Query Execution

#### Requirement 2.1: Add `tokio::try_join!` for Independent Queries (PERF-15)

**Description:** Identify and parallelize independent sequential queries in handler functions. Target at least 10 handler functions.

**Priority targets:**

1. **`cloud_providers.rs:707-708`** — `list()` and `list_all_active()` are independent
2. **`delivery.rs:572-663`** — `find_by_id` + `find_by_key` + `list_by_project` are independent
3. **`system_health.rs:102-117`** — all uptime queries are independent
4. **Additional targets** to be identified during implementation (any handler with 2+ sequential `.await?` calls on independent data)

**Acceptance Criteria:**
- [ ] At least 10 handler functions converted from sequential awaits to `tokio::try_join!`
- [ ] Each converted function verified that the queries are truly independent (no data dependency between them)
- [ ] Error handling preserved: if any query fails, the combined result returns the first error
- [ ] No functional behavior changes — same data returned in same response format
- [ ] Code comment on each `try_join!` block listing which queries are parallelized

**Technical Notes:**
- Use `tokio::try_join!(a, b, c)` — returns `Result<(A, B, C), E>` where E is the first error
- For more than 5 concurrent queries, consider whether connection pool contention might negate benefits
- Do NOT parallelize queries that have data dependencies (e.g., "fetch project, then fetch project's avatars")

### Phase 3: Video Processing Optimization

#### Requirement 3.1: Parallelize Video Backfill Endpoints (PERF-19)

**File:** `crates/api/src/handlers/video.rs:451-553`

**Current behavior:** `generate_previews`, `generate_web_playback`, and `backfill_video_metadata` each process up to 200 videos sequentially with ffmpeg.

**Acceptance Criteria:**
- [ ] Each backfill endpoint uses `futures::stream::iter(versions).map(|v| process(v)).buffer_unordered(concurrency).collect()` pattern
- [ ] Default concurrency is 4 (configurable via constant)
- [ ] Errors from individual videos are collected and returned in the response (not fail-fast)
- [ ] For 200 videos, wall-clock time is approximately 4x faster than sequential
- [ ] CPU usage is bounded by the concurrency limit

**Technical Notes:**
- `buffer_unordered(4)` processes up to 4 futures concurrently
- Each ffmpeg invocation is CPU-bound — concurrency > CPU cores provides diminishing returns
- Errors should be collected into a `Vec<(version_id, Error)>` rather than failing the entire batch

#### Requirement 3.2: Stream Video Uploads Instead of Memory Buffering (PERF-21)

**File:** `crates/api/src/handlers/scene_video_version.rs:59-103`

**Current behavior:** `ensure_h264` accepts `Vec<u8>` (entire video in memory), writes to temp file, transcodes with ffmpeg, reads result back into memory.

**Acceptance Criteria:**
- [ ] Upload handler streams the multipart body directly to a temp file using `tokio::io::copy`
- [ ] `ensure_h264` accepts a file path instead of `Vec<u8>`
- [ ] Transcoding operates file-to-file (input path -> output path)
- [ ] The handler returns/stores the output file path instead of reading bytes back into memory
- [ ] Peak memory usage for a 500MB upload is < 10MB (stream buffer size)
- [ ] Existing callers of `ensure_h264` are updated to pass file paths

**Technical Notes:**
- Axum's multipart extractor supports streaming via `field.chunk()` in a loop
- Write chunks to a `tokio::fs::File` as they arrive
- After transcoding, pass the output path to the storage layer (which already accepts paths)

## 6. Non-Functional Requirements

### Performance
- Directory scan: zero Tokio runtime blocking (measured by no increase in p99 of concurrent requests during scan)
- `try_join!` targets: 30-50% reduction in wall-clock time for affected handlers
- Video backfill: 3-4x throughput improvement (bounded by CPU cores)
- Video upload: peak memory < 10MB regardless of file size (currently file_size + overhead)

### Security
- No changes to authorization logic
- Temp files for video upload must be created in a secure directory with appropriate permissions
- Temp files must be cleaned up after processing (success or failure)

## 7. Non-Goals (Out of Scope)

- Rewriting `directory_scanner.rs` to be fully async (wrapping in `spawn_blocking` is sufficient)
- Adding a background job queue for video processing (backfill is already admin-triggered)
- HTTP/2 streaming responses
- WebSocket-based upload progress

## 8. Design Considerations

- **`spawn_blocking` vs `tokio::fs`:** For the directory scanner, `spawn_blocking` is better because the module does sustained I/O (hundreds of syscalls). For single `create_dir_all` calls, `tokio::fs` is cleaner.
- **`try_join!` vs `join!`:** Always use `try_join!` for fallible operations — it short-circuits on first error.
- **`buffer_unordered` vs `buffer`:** Use `buffer_unordered` for video processing — order doesn't matter for backfill.

## 9. Technical Considerations

### Existing Code to Reuse
- `tokio::task::spawn_blocking` — standard Tokio API
- `tokio::try_join!` — standard Tokio API
- `futures::stream::StreamExt::buffer_unordered` — already in `futures` dependency
- `tokio::fs` — standard Tokio API
- `tokio::io::copy` — standard Tokio API for async streaming

### Database Changes
- No schema changes

### API Changes
- No API contract changes
- Video backfill response may include per-video error details (additive change)

## 10. Edge Cases & Error Handling

- **`spawn_blocking` panic:** If the directory scanner panics inside `spawn_blocking`, the `JoinError` is propagated as an internal server error — add explicit error mapping
- **`try_join!` partial failure:** If one of three parallel queries fails, the other two are cancelled — this is the correct behavior (fail fast)
- **Video backfill partial failure:** Individual video failures should NOT cancel the entire batch — collect errors and report
- **Temp file cleanup:** Use `scopeguard` or `Drop` impl to ensure temp files are deleted even on error paths
- **Large directory scans:** `spawn_blocking` thread pool has a default limit of 512 threads — a single scan won't exhaust this, but concurrent scans could. Consider a semaphore if needed.

## 11. Success Metrics

- Zero `std::fs` calls in async handler code paths (verified by grep)
- At least 10 handler functions using `tokio::try_join!`
- Video backfill processing rate: 4x improvement over sequential
- Video upload memory usage: < 10MB peak for any file size
- No Tokio runtime thread starvation during directory scans

## 12. Testing Requirements

- **Unit tests:** `spawn_blocking` wrapper returns correct results for various directory structures
- **Integration tests:** Existing directory scan, video upload, and backfill tests pass unchanged
- **Concurrency tests:** Multiple simultaneous directory scans don't block each other
- **Memory tests:** Video upload of a large file (100MB+) stays within memory budget (optional but recommended)

## 13. Open Questions

- Should video backfill concurrency (default: 4) be configurable via env var or admin setting?
- For `try_join!`, should we audit ALL handlers for parallelization opportunities or limit to the 10 most impactful?
- Should temp file cleanup use `scopeguard::defer!` or a custom `TempFile` wrapper type?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from PERFORMANCE-AUDIT-BACKEND.md findings PERF-13, PERF-14, PERF-15, PERF-19, PERF-21 |
