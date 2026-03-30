# Performance Audit — Rust Backend

**Date**: 2026-03-30

## Executive Summary

The backend has solid foundational patterns (explicit column lists, soft-delete filtering, repository pattern separation). However, there are significant performance concerns:

1. **Pervasive N+1 query patterns** — at least 15 handlers execute database queries inside `for` loops, some with triple nesting (avatar -> scenes -> segments -> quality scores = 2,500+ queries)
2. **Zero `tokio::join!` usage** — sequential awaits dominate, even when queries are independent
3. **Synchronous `std::fs` in async context** — directory scanner and parts of video handler use blocking I/O on the Tokio runtime
4. **Large inline SQL in API handlers** — 24 handler files contain raw `sqlx::query` calls instead of using the repository layer
5. **Unbounded `list_all()` queries** — 30+ repository functions fetch entire tables without LIMIT
6. **Missing transactions** — multi-step mutations (N inserts + status updates) lack transactional wrapping

---

## Findings

### PERF-01: Triple-nested N+1 in `auto_select_posters` (CRITICAL)

**File**: `crates/api/src/handlers/poster_frame.rs:184-201`
**Impact**: For 50 avatars x 10 scenes x 5 segments = **2,500+ queries** per call

```rust
for avatar in &avatars {                                    // N avatars
    let scenes = SceneRepo::list_by_avatar(...).await?;     // N queries
    for scene in &scenes {                                  // M scenes
        let segments = SegmentRepo::list_by_scene(...).await?;  // N*M queries
        for segment in &segments {                          // K segments
            QualityScoreRepo::find_by_segment_and_type(...).await?;  // N*M*K queries
        }
    }
}
```

**Fix**: Single JOIN query returning `Vec<(avatar_id, segment_id, score)>`, group in Rust.

---

### PERF-02: N+1 in `validate_delivery` (CRITICAL)

**File**: `crates/api/src/handlers/delivery.rs:716-746`
**Impact**: 100 avatars = 200 sequential queries (scene check + metadata check per avatar)

```rust
for avatar in &avatars {
    let scenes = SceneRepo::list_by_avatar(&state.pool, avatar.id).await?;
    // ...
    let approved = AvatarMetadataVersionRepo::find_approved(&state.pool, avatar.id).await?;
}
```

**Fix**: Two batch queries using `avatar_id = ANY($1)`, compare results in Rust.

---

### PERF-03: `cancel_generation` fetches ALL jobs then filters in Rust (CRITICAL)

**File**: `crates/api/src/handlers/generation.rs:488-520`
**Impact**: Fetches up to 100 recent jobs, deserializes JSON params for each, filters by scene_id

```rust
let jobs = JobRepo::list_all(&state.pool, &JobListQuery {
    status_id: None, limit: Some(100), offset: None,
}).await?;
for job in jobs {
    if let Ok(params) = serde_json::from_value::<SegmentJobParams>(job.parameters.clone()) {
        if params.scene_id == scene_id { /* cancel */ }
    }
}
```

**Fix**: `JobRepo::list_active_by_scene_id` using `WHERE parameters @> '{"scene_id": N}'::jsonb`. Add GIN index on `jobs(parameters)`.

---

### PERF-04: N+1 in `stale_metadata`

**File**: `crates/api/src/handlers/metadata.rs:354-360`
**Severity**: High

```rust
for char_id in &project_avatar_ids {
    if let Ok(scenes) = SceneRepo::list_by_avatar(&state.pool, *char_id).await {
        project_scene_ids.extend(scenes.iter().map(|s| s.id));
    }
}
```

**Fix**: `SELECT id FROM scenes WHERE avatar_id = ANY($1) AND deleted_at IS NULL`

---

### PERF-05: N+1 in `assign_avatars` — triple DB call per avatar

**File**: `crates/api/src/handlers/avatar_review.rs:111-141`
**Severity**: High

Per avatar: `create_assignment` + `update_review_status` + `log_action` = 3 sequential queries.

**Fix**: Wrap in transaction, batch INSERT for assignments + single UPDATE for status.

---

### PERF-06: N+1 in `auto_allocate` — count per reviewer

**File**: `crates/api/src/handlers/avatar_review.rs:196-199`
**Severity**: Medium

```rust
for reviewer in &mut reviewers {
    reviewer.active_count =
        AvatarReviewRepo::count_active_by_reviewer(&state.pool, reviewer.user_id).await?;
}
```

**Fix**: `SELECT reviewer_user_id, COUNT(*) FROM review_assignments WHERE status = 'active' GROUP BY reviewer_user_id`

---

### PERF-07: N+1 in `get_health_summary` — stats per webhook

**File**: `crates/api/src/handlers/webhook_testing.rs:337-347`
**Severity**: Medium

```rust
for wh in &webhooks {
    let (total, successful, total_duration, recent_failures) =
        DeliveryLogRepo::health_stats(&state.pool, wh.id, ...).await?;
}
```

**Fix**: Single aggregation query with `GROUP BY endpoint_id`.

---

### PERF-08: N+1 in `cascade_preview` — field names per child

**File**: `crates/api/src/handlers/scene_type_inheritance.rs:121-124`
**Severity**: Medium

**Fix**: `SELECT scene_type_id, field_name FROM scene_type_overrides WHERE scene_type_id = ANY($1)`

---

### PERF-09: N+1 in `cancel_schedule` and `remove_scenes_from_schedule`

**File**: `crates/api/src/handlers/job_scheduling.rs:376-391, 493-503`
**Severity**: Medium

Per scene: `find_by_id` + `resolve_restore_status` + `update_generation_state` = 3+ queries. Pattern duplicated across two functions.

**Fix**: Batch status check and update. DRY the duplicated loop logic.

---

### PERF-10: N+1 in `create_run` — `list_effective` per avatar

**File**: `crates/api/src/handlers/production_run.rs:88-112`
**Severity**: High

```rust
for &cid in &body.avatar_ids {
    let settings = AvatarSceneOverrideRepo::list_effective(
        &state.pool, cid, body.project_id, None,
    ).await?;
}
```

**Fix**: Batch variant `list_effective_for_avatars` accepting `&[DbId]`.

---

### PERF-11: N+1 in `batch_generate` — 4+ queries per scene

**File**: `crates/api/src/handlers/generation.rs:419-450`
**Severity**: High
**Impact**: 50 scenes = 300+ queries

Per scene: `delete_for_scene` (2x) + `init_scene_generation` + `gen_log::log` (2x).

**Fix**: Batch cleanup: `DELETE FROM scene_generation_logs WHERE scene_id = ANY($1)`.

---

### PERF-12: N+1 in `cloud_providers::dashboard` — cost sum per provider

**File**: `crates/api/src/handlers/cloud_providers.rs:718-723`
**Severity**: Low

**Fix**: Single `GROUP BY provider_id` query.

---

### PERF-13: Synchronous `std::fs` in async context (HIGH)

**File**: `crates/core/src/directory_scanner.rs` (entire 673-line module uses `std::fs`)
**Called from**: `crates/api/src/handlers/directory_scan.rs`

**Fix**: Wrap call site with `tokio::task::spawn_blocking(move || scan_directory(&path)).await?`

---

### PERF-14: `std::fs::create_dir_all` in async handler

**File**: `crates/api/src/handlers/scene_video_version.rs:62`
**Severity**: Medium

**Fix**: Replace with `tokio::fs::create_dir_all(...).await`

---

### PERF-15: Zero `tokio::join!` usage across entire codebase (HIGH)

Many handlers execute 2-5 independent queries sequentially.

**Examples**:
- `cloud_providers.rs:707-708`: `list()` and `list_all_active()` are independent
- `delivery.rs:572-663`: `find_by_id` + `find_by_key` + `list_by_project` are independent
- `system_health.rs:102-117`: All uptime queries are independent

**Fix**: `tokio::try_join!` for independent queries. Target at least 10 handler functions.

---

### PERF-16: Inline SQL in API handler crate — 24 files (HIGH)

**File**: `crates/api/src/handlers/scene_video_version.rs` — **10 inline `sqlx::query` calls**

The browse query alone is ~80 lines of raw SQL with 15 bind parameters, duplicated between count and items queries.

Other files with inline SQL: `delivery.rs`, `directors_view.rs`, `qa_rulesets.rs`, `comparison.rs`, `media_management.rs`, `compliance.rs`, `dashboard.rs`, `avatar_review.rs`, `avatar.rs`, `project.rs`, `avatar_dashboard.rs`, `pipelines.rs`, `media_variant.rs`, `export.rs`, `annotation.rs`.

**Fix**: Move all queries to `db/repositories` layer. Priority: browse clips query (80 lines).

---

### PERF-17: 30+ `list_all()` functions without pagination

**Severity**: Medium

Lookup tables (languages, resolution tiers) are acceptable. Flag these unbounded-growth tables for pagination:
- `BulkOperationRepo::list_all`
- `TriggerWorkflowRepo::list_all`
- `SessionManagementRepo::list_all`
- `ModelChecksumRepo::list_all`
- `BudgetQuotaRepo::list_all`
- `WebhookTestingRepo::list_all`

**Fix**: Add `PaginationParams` (already exists in `crate::query`) with default LIMIT of 1000.

---

### PERF-18: Missing transactions for multi-step mutations (HIGH)

Five handlers perform multi-step writes without transactions:

1. **`assign_avatars`** (`avatar_review.rs:111-141`) — assignment + status + audit per avatar
2. **`create_run`** (`production_run.rs:69-148`) — run + cells + retrospective marking
3. **`batch_generate`** (`generation.rs:419-450`) — delete logs + segments + init per scene
4. **`purge_clips`** (`reclamation.rs:208-275`) — file deletion + DB update (data loss risk!)
5. **`import_derived_clips`** (`scene_video_version.rs:1348-1653`) — multi-file import

**Fix**: Wrap in `pool.begin()` / `tx.commit()`. Pattern already established in 15+ places in the `db` crate.

---

### PERF-19: Video backfill endpoints process sequentially

**File**: `crates/api/src/handlers/video.rs:451-553`
**Severity**: Medium

`generate_previews`, `generate_web_playback`, `backfill_video_metadata` each process up to 200 videos sequentially with ffmpeg.

**Fix**: `futures::stream::iter(versions).buffer_unordered(4)` for concurrent processing.

---

### PERF-20: Connection pool defaults may be too conservative

**File**: `crates/db/src/lib.rs:18-27`
**Severity**: Medium

Hardcoded: `max_connections: 10`, no `max_lifetime`. With N+1 patterns, 10 connections may cause contention.

**Fix**: Make configurable via env vars, add `max_lifetime(Duration::from_secs(1800))`.

---

### PERF-21: `ensure_h264` holds entire video in memory

**File**: `crates/api/src/handlers/scene_video_version.rs:59-103`
**Severity**: Medium

Accepts `Vec<u8>` (entire video), writes to disk, transcodes, reads back to memory.

**Fix**: Stream upload to disk, transcode file-to-file, return path instead of bytes.

---

### PERF-22: `scan_and_import` per-file conflict detection

**File**: `crates/api/src/handlers/directory_scan.rs:147-170`
**Severity**: Medium
**Impact**: 50 avatars x 20 files = 1,050+ queries

**Fix**: Batch resolve all avatar slugs in one query, batch-check conflicts.

---

### PERF-23: `speech_import` N+1 — `find_or_create` per speech type

**File**: `crates/api/src/handlers/project_speech_import.rs:172-173`
**Severity**: Medium

**Fix**: Pre-fetch all speech types for pipeline, check locally, create only missing ones.

---

### PERF-24: `tags::apply_entity_tags` — per-tag create+apply loop

**File**: `crates/api/src/handlers/tags.rs:146-164`
**Severity**: Low

**Fix**: Batch `create_or_get_many` and `apply_many` in tag repository.

---

### PERF-25: Missing GIN index on `jobs.parameters`

**Severity**: Medium

Needed for JSON containment queries (see PERF-03).

**Fix**: `CREATE INDEX idx_jobs_parameters_gin ON jobs USING GIN (parameters);`

---

## Prioritized Task List

| # | Task | Priority | Effort | Findings |
|---|------|----------|--------|----------|
| 1 | Fix critical N+1 patterns | P0 | Medium | PERF-01, PERF-02, PERF-03 |
| 2 | Wrap multi-step mutations in transactions | P0 | Medium | PERF-18 |
| 3 | Fix remaining N+1 patterns | P1 | Medium | PERF-04 to PERF-12, PERF-22 to PERF-24 |
| 4 | Move inline SQL to repository layer | P1 | Large | PERF-16 |
| 5 | Fix blocking `std::fs` in async context | P1 | Small | PERF-13, PERF-14 |
| 6 | Add `tokio::try_join!` for independent queries | P2 | Medium | PERF-15 |
| 7 | Parallelize video backfill endpoints | P2 | Small | PERF-19 |
| 8 | Stream video uploads instead of buffering | P3 | Large | PERF-21 |
| 9 | Add pagination to unbounded `list_all` | P3 | Small | PERF-17 |
| 10 | Make connection pool configurable + add max_lifetime | P3 | Small | PERF-20 |
| 11 | Add GIN index on `jobs.parameters` | P3 | Small | PERF-25 |

## Quick Wins (< 1 hour each)

1. `tokio::task::spawn_blocking` for directory scanner call site (PERF-13)
2. `tokio::fs::create_dir_all` replacing `std::fs` in `ensure_h264` (PERF-14)
3. GIN index migration on `jobs.parameters` (PERF-25)
4. Make pool config env-var driven + add `max_lifetime` (PERF-20)
5. Batch `count_active_by_reviewer` into single GROUP BY query (PERF-06)
