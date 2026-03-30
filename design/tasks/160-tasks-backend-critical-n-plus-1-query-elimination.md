# Task List: Backend Critical N+1 Query Elimination

**PRD Reference:** `design/prds/160-prd-backend-critical-n-plus-1-query-elimination.md`
**Scope:** Eliminate the three most severe N+1 query patterns (auto_select_posters, validate_delivery, cancel_generation) and add a GIN index on `jobs.parameters` for JSONB containment queries.

## Overview

Three handlers dominate backend query counts: `auto_select_posters` fires up to 2,500+ queries via a triple-nested loop, `validate_delivery` fires 200 queries for 100 avatars, and `cancel_generation` fetches all jobs then filters in Rust. Each will be converted to 1-2 batch queries with Rust-side grouping via `HashMap`. A GIN index on `jobs.parameters` enables the JSONB containment operator (`@>`) needed for the `cancel_generation` fix.

### What Already Exists
- `SceneRepo`, `SegmentRepo`, `QualityScoreRepo`, `JobRepo`, `AvatarMetadataVersionRepo` in `apps/backend/crates/db/src/repositories/`
- `PaginationParams` in `crates/db/src/query.rs` for list methods
- `DbId` type alias (`i64`) used throughout
- Existing `ANY($1)` pattern in several repository methods
- `itertools` available in workspace dependencies

### What We're Building
1. `QualityScoreRepo::batch_best_by_avatars` — single JOIN query for poster selection
2. `SceneRepo::list_by_avatars` and `AvatarMetadataVersionRepo::find_approved_for_avatars` — batch delivery validation
3. `JobRepo::list_active_by_scene_id` — JSONB containment query for cancel generation
4. GIN index migration on `jobs.parameters`

### Key Design Decisions
1. **Single JOIN + Rust grouping** for `auto_select_posters` — one round trip, `HashMap<DbId, Vec<...>>` grouping in handler
2. **`ANY($1)` for batch lookups** — sqlx handles Postgres array binding natively, no dynamic SQL needed
3. **JSONB `@>` containment** for `cancel_generation` — leverages GIN index, avoids fetching/parsing all jobs
4. **Repository layer only** — all new SQL lives in `crates/db/src/repositories/`, handlers only call repo methods

---

## Phase 1: GIN Index Migration

### Task 1.1: Add GIN Index on `jobs.parameters`
**File:** `apps/backend/migrations/YYYYMMDDHHMMSS_add_gin_index_jobs_parameters.sql`

Create a migration adding a GIN index on the `jobs.parameters` JSONB column. This is a prerequisite for Task 3.1.

```sql
-- up
CREATE INDEX idx_jobs_parameters_gin ON jobs USING GIN (parameters);

-- down
DROP INDEX IF EXISTS idx_jobs_parameters_gin;
```

**Acceptance Criteria:**
- [ ] Migration file created with timestamp prefix
- [ ] `CREATE INDEX` uses `GIN` operator class
- [ ] Down migration drops the index
- [ ] `sqlx migrate run` succeeds
- [ ] `EXPLAIN ANALYZE SELECT * FROM jobs WHERE parameters @> '{"scene_id": 1}'::jsonb` shows index scan (not seq scan) after migration

---

## Phase 2: Fix `auto_select_posters` (PERF-01)

### Task 2.1: Create `QualityScoreRepo::batch_best_by_avatars` Repository Method
**File:** `apps/backend/crates/db/src/repositories/quality_score_repo.rs`

Add a batch method that fetches quality scores across all avatars in a single JOIN query.

```rust
/// Fetch the best face-confidence quality score per segment for a batch of avatars.
/// Returns a flat vec of (avatar_id, segment_id, score) tuples.
pub async fn batch_best_by_avatars(
    pool: &DbPool,
    avatar_ids: &[DbId],
    check_type: &str,
) -> Result<Vec<BatchPosterCandidate>, sqlx::Error> {
    sqlx::query_as!(
        BatchPosterCandidate,
        r#"
        SELECT s.avatar_id, seg.id AS segment_id, qs.score
        FROM scenes s
        JOIN segments seg ON seg.scene_id = s.id AND seg.deleted_at IS NULL
        JOIN quality_scores qs ON qs.segment_id = seg.id AND qs.check_type = $2
        WHERE s.avatar_id = ANY($1)
          AND s.deleted_at IS NULL
        ORDER BY s.avatar_id, qs.score DESC
        "#,
        avatar_ids,
        check_type,
    )
    .fetch_all(pool)
    .await
}
```

Also add the result struct:

```rust
#[derive(Debug, sqlx::FromRow)]
pub struct BatchPosterCandidate {
    pub avatar_id: DbId,
    pub segment_id: DbId,
    pub score: f64,
}
```

**Acceptance Criteria:**
- [ ] Method accepts `&[DbId]` for avatar IDs
- [ ] Single SQL query with JOIN across `scenes`, `segments`, `quality_scores`
- [ ] Returns flat `Vec<BatchPosterCandidate>` for Rust-side grouping
- [ ] Handles empty `avatar_ids` array (returns empty vec)
- [ ] Uses `deleted_at IS NULL` filters on scenes and segments

### Task 2.2: Refactor `auto_select_posters` Handler to Use Batch Method
**File:** `apps/backend/crates/api/src/handlers/poster_frame.rs`

Replace the triple-nested loop at lines 184-201 with a single call to `batch_best_by_avatars`, then group results in Rust.

**Current code (lines 184-201):**
```rust
for avatar in &avatars {
    let scenes = SceneRepo::list_by_avatar(&state.pool, avatar.id).await?;
    let mut scores: Vec<(DbId, f64)> = Vec::new();
    for scene in &scenes {
        let segments = SegmentRepo::list_by_scene(&state.pool, scene.id).await?;
        for segment in &segments {
            if let Some(qs) = QualityScoreRepo::find_by_segment_and_type(
                &state.pool, segment.id, CHECK_FACE_CONFIDENCE,
            ).await? {
                scores.push((segment.id, qs.score));
            }
        }
    }
    // ... select_best_frame(&scores)
}
```

**New code pattern:**
```rust
let avatar_ids: Vec<DbId> = avatars.iter().map(|a| a.id).collect();
let candidates = QualityScoreRepo::batch_best_by_avatars(
    &state.pool, &avatar_ids, CHECK_FACE_CONFIDENCE,
).await?;

// Group by avatar_id using HashMap.
let mut grouped: HashMap<DbId, Vec<(DbId, f64)>> = HashMap::new();
for c in candidates {
    grouped.entry(c.avatar_id).or_default().push((c.segment_id, c.score));
}

for avatar in &avatars {
    let scores = grouped.get(&avatar.id).cloned().unwrap_or_default();
    if let Some(best_segment_id) = select_best_frame(&scores) {
        // ... upsert poster frame (unchanged)
    }
}
```

**Acceptance Criteria:**
- [ ] Triple-nested `for` loop replaced with single `batch_best_by_avatars` call
- [ ] Results grouped into `HashMap<DbId, Vec<(DbId, f64)>>` in Rust
- [ ] Same posters are selected as before (identical behavior)
- [ ] For 50 avatars x 10 scenes x 5 segments: 1 query instead of 2,500+
- [ ] No `SceneRepo::list_by_avatar` or `SegmentRepo::list_by_scene` calls remain in this handler
- [ ] `cargo check` passes with no errors

---

## Phase 3: Fix `validate_delivery` (PERF-02)

### Task 3.1: Create `SceneRepo::list_by_avatars` Batch Method
**File:** `apps/backend/crates/db/src/repositories/scene_repo.rs`

Add a batch method that fetches scenes for multiple avatars in a single query.

```rust
/// Fetch all scenes for a batch of avatar IDs.
pub async fn list_by_avatars(
    pool: &DbPool,
    avatar_ids: &[DbId],
) -> Result<Vec<Scene>, sqlx::Error> {
    sqlx::query_as!(
        Scene,
        r#"
        SELECT id, avatar_id, scene_type_id, track_id, status_id,
               -- ... all scene columns
        FROM scenes
        WHERE avatar_id = ANY($1)
          AND deleted_at IS NULL
        ORDER BY avatar_id, id
        "#,
        avatar_ids,
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Method accepts `&[DbId]` for avatar IDs
- [ ] Uses `WHERE avatar_id = ANY($1)` — no dynamic SQL
- [ ] Returns all columns needed by `validate_delivery`
- [ ] Handles empty array (returns empty vec)
- [ ] Results ordered by `avatar_id` for efficient grouping

### Task 3.2: Create `AvatarMetadataVersionRepo::find_approved_for_avatars` Batch Method
**File:** `apps/backend/crates/db/src/repositories/avatar_metadata_version_repo.rs`

Add a batch method that fetches the approved metadata version for multiple avatars.

```rust
/// Fetch approved metadata versions for a batch of avatar IDs.
/// Returns one row per avatar that has an approved version.
pub async fn find_approved_for_avatars(
    pool: &DbPool,
    avatar_ids: &[DbId],
) -> Result<Vec<AvatarMetadataVersion>, sqlx::Error> {
    sqlx::query_as!(
        AvatarMetadataVersion,
        r#"
        SELECT id, avatar_id, version_number, status_id, -- ... columns
        FROM avatar_metadata_versions
        WHERE avatar_id = ANY($1)
          AND status_id = $2
        "#,
        avatar_ids,
        MetadataVersionStatus::Approved.id(),
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Method accepts `&[DbId]` for avatar IDs
- [ ] Returns only approved versions
- [ ] Avatars without approved versions simply have no entry in result set
- [ ] Handles empty array gracefully

### Task 3.3: Refactor `validate_delivery` Handler to Use Batch Methods
**File:** `apps/backend/crates/api/src/handlers/delivery.rs`

Replace the two `for` loops at lines 716-746 with batch queries and Rust grouping.

**Current code (lines 716-728):**
```rust
for avatar in &avatars {
    let scenes = SceneRepo::list_by_avatar(&state.pool, avatar.id).await?;
    if scenes.is_empty() {
        issues.push(/* no_scenes warning */);
    }
}
```

**Current code (lines 733-746):**
```rust
for avatar in &avatars {
    let approved = AvatarMetadataVersionRepo::find_approved(&state.pool, avatar.id).await?;
    if approved.is_none() {
        issues.push(/* metadata_not_approved error */);
    }
}
```

**New code pattern:**
```rust
// Batch: scenes per avatar.
let avatar_ids: Vec<DbId> = avatars.iter().map(|a| a.id).collect();
let all_scenes = SceneRepo::list_by_avatars(&state.pool, &avatar_ids).await?;
let scenes_by_avatar: HashMap<DbId, Vec<_>> = all_scenes.into_iter()
    .fold(HashMap::new(), |mut map, s| {
        map.entry(s.avatar_id).or_default().push(s);
        map
    });

for avatar in &avatars {
    if scenes_by_avatar.get(&avatar.id).map_or(true, |s| s.is_empty()) {
        issues.push(/* no_scenes warning */);
    }
}

// Batch: approved metadata per avatar.
if check_metadata {
    let approved_set: HashSet<DbId> =
        AvatarMetadataVersionRepo::find_approved_for_avatars(&state.pool, &avatar_ids)
            .await?
            .into_iter()
            .map(|v| v.avatar_id)
            .collect();

    for avatar in &avatars {
        if !approved_set.contains(&avatar.id) {
            issues.push(/* metadata_not_approved error */);
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Both `for` loops replaced with batch queries
- [ ] Scene check uses `HashMap` grouping, metadata check uses `HashSet` lookup
- [ ] For 100 avatars: 2 queries instead of 200
- [ ] Validation issues and error messages are identical to current behavior
- [ ] `cargo check` passes with no errors

---

## Phase 4: Fix `cancel_generation` (PERF-03)

### Task 4.1: Create `JobRepo::list_active_by_scene_id` Repository Method
**File:** `apps/backend/crates/db/src/repositories/job_repo.rs`

**Depends on:** Task 1.1 (GIN index)

Add a method using JSONB containment to find active jobs for a specific scene.

```rust
/// Fetch all active (non-terminal) jobs whose parameters reference the given scene_id.
/// Requires GIN index on `jobs.parameters` for performance.
pub async fn list_active_by_scene_id(
    pool: &DbPool,
    scene_id: DbId,
) -> Result<Vec<Job>, sqlx::Error> {
    let scene_filter = serde_json::json!({ "scene_id": scene_id });
    sqlx::query_as!(
        Job,
        r#"
        SELECT id, job_type, status_id, parameters, worker_id,
               -- ... all job columns
        FROM jobs
        WHERE parameters @> $1::jsonb
          AND status_id NOT IN ($2, $3, $4)
        "#,
        scene_filter,
        JobStatus::Completed.id(),
        JobStatus::Failed.id(),
        JobStatus::Cancelled.id(),
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Uses `@>` JSONB containment operator, not Rust-side filtering
- [ ] Filters to active (non-terminal) jobs in SQL
- [ ] Returns full `Job` structs for downstream processing
- [ ] With GIN index, `EXPLAIN` shows index scan

### Task 4.2: Refactor `cancel_generation` Handler to Use Targeted Query
**File:** `apps/backend/crates/api/src/handlers/generation.rs`

Replace the fetch-all-then-filter pattern at lines 488-520 with the new targeted query.

**Current code (lines 488-520):**
```rust
let jobs = JobRepo::list_all(&state.pool, &JobListQuery {
    status_id: None, limit: Some(100), offset: None,
}).await?;

let mut cancelled_jobs = 0u32;
for job in jobs {
    if job.status_id == JobStatus::Completed.id() || /* ... terminal check */ { continue; }
    if let Ok(params) = serde_json::from_value::<SegmentJobParams>(job.parameters.clone()) {
        if params.scene_id == scene_id { /* cancel */ }
    }
}
```

**New code:**
```rust
let scene_jobs = JobRepo::list_active_by_scene_id(&state.pool, scene_id).await?;

let mut cancelled_jobs = 0u32;
for job in scene_jobs {
    let _ = JobRepo::cancel(&state.pool, job.id).await;
    if job.worker_id.is_some() {
        let _ = state.comfyui_manager.cancel_job(job.id).await;
    }
    cancelled_jobs += 1;
}
```

**Acceptance Criteria:**
- [ ] No `JobRepo::list_all` call in `cancel_generation`
- [ ] No `serde_json::from_value` JSON parsing for filtering
- [ ] All active jobs for the scene are cancelled (identical behavior)
- [ ] ComfyUI cancel signal still sent for jobs with a worker
- [ ] 1 query instead of 100+ fetch + N parses
- [ ] `cargo check` passes with no errors

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/migrations/YYYYMMDDHHMMSS_add_gin_index_jobs_parameters.sql` | GIN index on `jobs.parameters` |
| `apps/backend/crates/db/src/repositories/quality_score_repo.rs` | New `batch_best_by_avatars` method |
| `apps/backend/crates/db/src/repositories/scene_repo.rs` | New `list_by_avatars` method |
| `apps/backend/crates/db/src/repositories/avatar_metadata_version_repo.rs` | New `find_approved_for_avatars` method |
| `apps/backend/crates/db/src/repositories/job_repo.rs` | New `list_active_by_scene_id` method |
| `apps/backend/crates/api/src/handlers/poster_frame.rs` | Refactored `auto_select_posters` |
| `apps/backend/crates/api/src/handlers/delivery.rs` | Refactored `validate_delivery` |
| `apps/backend/crates/api/src/handlers/generation.rs` | Refactored `cancel_generation` |

---

## Dependencies

### Existing Components to Reuse
- `QualityScoreRepo` from `crates/db/src/repositories/quality_score_repo.rs`
- `SceneRepo` from `crates/db/src/repositories/scene_repo.rs`
- `AvatarMetadataVersionRepo` from `crates/db/src/repositories/avatar_metadata_version_repo.rs`
- `JobRepo` from `crates/db/src/repositories/job_repo.rs`
- `HashMap` and `HashSet` from `std::collections`
- `DbId` type alias from `crates/db/src/types.rs`

### New Infrastructure Needed
- `BatchPosterCandidate` struct in quality score repo

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: GIN Index — Task 1.1
2. Phase 2: auto_select_posters — Tasks 2.1-2.2
3. Phase 3: validate_delivery — Tasks 3.1-3.3
4. Phase 4: cancel_generation — Tasks 4.1-4.2

**MVP Success Criteria:**
- `auto_select_posters` for 50 avatars executes 1-2 queries (not 2,500+)
- `validate_delivery` for 100 avatars executes 2 queries (not 200)
- `cancel_generation` executes 1 targeted query (not 100+ fetch + parse)
- All existing tests pass unchanged

---

## Notes

1. Task 4.1 depends on Task 1.1 — the GIN index must exist before JSONB containment queries are performant.
2. For very large avatar counts (500+), the batch queries in Phase 2 may benefit from chunking into batches of 100 IDs. This is not required for MVP but should be considered if memory or query plan issues arise.
3. The `LEFT JOIN` note in the PRD for quality scores: if some segments have no quality score, they simply won't appear in the batch result — this matches current behavior where `find_by_segment_and_type` returns `None` and the segment is skipped.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-160
