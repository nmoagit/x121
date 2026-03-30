# Task List: Backend N+1 Query Cleanup (Remaining)

**PRD Reference:** `design/prds/161-prd-backend-n-plus-1-query-cleanup.md`
**Scope:** Eliminate twelve remaining N+1 query patterns across handlers identified in PERF-04 through PERF-12 and PERF-22 through PERF-24, converting loop-based queries to batch operations.

## Overview

After PRD-160 addresses the three critical N+1 patterns, twelve more remain. These range from high-severity (production run creation with 300+ queries for 50 scenes) to low-severity (cloud provider dashboard cost summation). Each follows the same anti-pattern: executing queries inside `for` loops instead of using batch `ANY($1)`, `GROUP BY`, or pre-fetch strategies. All fixes are internal optimizations with no API contract changes.

### What Already Exists
- Batch query patterns established by PRD-160 (`ANY($1)`, `HashMap` grouping in Rust)
- `UNNEST` pattern already used in `ProductionRunRepo::create_cells_batch`
- `itertools` crate available (for `into_group_map()` if needed)
- All affected repositories in `apps/backend/crates/db/src/repositories/`

### What We're Building
1. Batch repository methods for 12 handlers using `ANY($1)`, `GROUP BY`, or `UNNEST`
2. Shared helper function for scene status reversion (DRY fix for cancel/remove schedule)
3. Pre-fetch patterns for speech types and avatar slug resolution

### Key Design Decisions
1. **Follow PRD-160 patterns** — all batch methods accept `&[DbId]`, return flat vecs, group in Rust
2. **`ANY($1)` over dynamic IN clauses** — sqlx handles array binding natively
3. **DRY schedule helpers** — extract shared scene reversion logic used by `cancel_schedule` and `remove_scenes_from_schedule`
4. **Pre-fetch for lookup data** — speech types and avatar slugs are fetched once, checked locally

---

## Phase 1: High-Severity Fixes

### Task 1.1: Fix N+1 in `stale_metadata` (PERF-04)
**File:** `apps/backend/crates/db/src/repositories/scene_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/metadata.rs` (refactor lines 354-360)

**Depends on:** PRD-160 (pattern established)

Add a batch method to fetch scene IDs for multiple avatars, then refactor the handler.

**New repository method:**
```rust
/// Fetch scene IDs for a batch of avatar IDs.
pub async fn list_ids_by_avatars(
    pool: &DbPool,
    avatar_ids: &[DbId],
) -> Result<Vec<DbId>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT id FROM scenes WHERE avatar_id = ANY($1) AND deleted_at IS NULL",
        avatar_ids,
    )
    .fetch_all(pool)
    .await
}
```

**Current handler code (lines 354-360):**
```rust
let mut project_scene_ids: Vec<DbId> = Vec::new();
for char_id in &project_avatar_ids {
    if let Ok(scenes) = SceneRepo::list_by_avatar(&state.pool, *char_id).await {
        project_scene_ids.extend(scenes.iter().map(|s| s.id));
    }
}
```

**New handler code:**
```rust
let project_scene_ids = SceneRepo::list_ids_by_avatars(&state.pool, &project_avatar_ids).await
    .unwrap_or_default();
```

**Acceptance Criteria:**
- [ ] New `SceneRepo::list_ids_by_avatars` method in scene repo
- [ ] Handler `for` loop replaced with single method call
- [ ] For 100 avatars: 1 query instead of 100
- [ ] `cargo check` passes

### Task 1.2: Fix N+1 in `assign_avatars` (PERF-05)
**File:** `apps/backend/crates/db/src/repositories/avatar_review_repo.rs` (new batch methods)
**File:** `apps/backend/crates/api/src/handlers/avatar_review.rs` (refactor lines 111-141)

Convert the per-avatar triple-query loop into batch operations.

**New repository methods:**
```rust
/// Batch-create review assignments using UNNEST.
pub async fn create_assignments_batch(
    pool: &DbPool,
    avatar_ids: &[DbId],
    reviewer_user_id: DbId,
    assigned_by_id: DbId,
    review_round: i32,
    deadline: Option<DateTime<Utc>>,
) -> Result<Vec<ReviewAssignment>, sqlx::Error> { /* ... */ }

/// Batch-update review status for multiple avatars.
pub async fn update_review_status_batch(
    pool: &DbPool,
    avatar_ids: &[DbId],
    status_id: i16,
) -> Result<u64, sqlx::Error> {
    // UPDATE avatars SET review_status_id = $1 WHERE id = ANY($2)
}

/// Batch-insert audit log entries.
pub async fn log_actions_batch(
    pool: &DbPool,
    entries: &[AuditLogEntry],
) -> Result<(), sqlx::Error> { /* INSERT INTO ... SELECT * FROM UNNEST(...) */ }
```

**Acceptance Criteria:**
- [ ] Batch INSERT for assignments using `UNNEST`
- [ ] Single UPDATE for review status using `ANY($1)`
- [ ] Batch INSERT for audit log entries
- [ ] For 20 avatars: 3 queries instead of 60
- [ ] Assignment records identical to current behavior
- [ ] `cargo check` passes

### Task 1.3: Fix N+1 in `auto_allocate` (PERF-06)
**File:** `apps/backend/crates/db/src/repositories/avatar_review_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/avatar_review.rs` (refactor lines 196-199)

**New repository method:**
```rust
/// Count active assignments per reviewer in a single query.
pub async fn count_active_by_reviewers(
    pool: &DbPool,
    reviewer_ids: &[DbId],
) -> Result<HashMap<DbId, i64>, sqlx::Error> {
    let rows = sqlx::query_as!(
        (DbId, i64),
        r#"
        SELECT reviewer_user_id, COUNT(*) as "count!"
        FROM review_assignments
        WHERE status = 'active' AND reviewer_user_id = ANY($1)
        GROUP BY reviewer_user_id
        "#,
        reviewer_ids,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}
```

**Current handler code (lines 196-199):**
```rust
for reviewer in &mut reviewers {
    reviewer.active_count =
        AvatarReviewRepo::count_active_by_reviewer(&state.pool, reviewer.user_id).await?;
}
```

**New handler code:**
```rust
let reviewer_ids: Vec<DbId> = reviewers.iter().map(|r| r.user_id).collect();
let counts = AvatarReviewRepo::count_active_by_reviewers(&state.pool, &reviewer_ids).await?;
for reviewer in &mut reviewers {
    reviewer.active_count = counts.get(&reviewer.user_id).copied().unwrap_or(0);
}
```

**Acceptance Criteria:**
- [ ] Single `GROUP BY` query replaces per-reviewer count
- [ ] Returns `HashMap<DbId, i64>` for direct lookup
- [ ] Reviewers with zero active assignments get `0` (not present in map)
- [ ] For 10 reviewers: 1 query instead of 10
- [ ] `cargo check` passes

### Task 1.4: Fix N+1 in `create_run` (PERF-10)
**File:** `apps/backend/crates/db/src/repositories/avatar_scene_override_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/production_run.rs` (refactor lines 88-112)

**New repository method:**
```rust
/// Fetch effective scene/track settings for a batch of avatars.
pub async fn list_effective_for_avatars(
    pool: &DbPool,
    avatar_ids: &[DbId],
    project_id: DbId,
    group_id: Option<DbId>,
) -> Result<Vec<EffectiveSettingWithAvatar>, sqlx::Error> {
    // Multi-avatar variant of list_effective, returning avatar_id with each row
}
```

**Current handler code (lines 88-95):**
```rust
for &cid in &body.avatar_ids {
    let settings = AvatarSceneOverrideRepo::list_effective(
        &state.pool, cid, body.project_id, None,
    ).await?;
    // ... process settings
}
```

**Acceptance Criteria:**
- [ ] New batch method accepts `&[DbId]` for avatar IDs
- [ ] Returns `Vec<EffectiveSettingWithAvatar>` including `avatar_id` column
- [ ] Handler groups by `avatar_id` and processes identically
- [ ] For 50 avatars: 1 query instead of 50
- [ ] Production run cells are identical to current behavior
- [ ] `cargo check` passes

### Task 1.5: Fix N+1 in `batch_generate` (PERF-11)
**File:** `apps/backend/crates/db/src/repositories/scene_generation_log_repo.rs` (new method)
**File:** `apps/backend/crates/db/src/repositories/segment_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/generation.rs` (refactor lines 419-450)

Convert per-scene cleanup to batch operations.

**New repository methods:**
```rust
// In SceneGenerationLogRepo:
pub async fn delete_for_scenes(pool: &DbPool, scene_ids: &[DbId]) -> Result<u64, sqlx::Error> {
    // DELETE FROM scene_generation_logs WHERE scene_id = ANY($1)
}

// In SegmentRepo:
pub async fn delete_for_scenes(pool: &DbPool, scene_ids: &[DbId]) -> Result<u64, sqlx::Error> {
    // DELETE FROM segments WHERE scene_id = ANY($1) AND deleted_at IS NULL
}
```

**Current handler code (lines 419-450):**
```rust
for &scene_id in &input.scene_ids {
    let _ = SceneGenerationLogRepo::delete_for_scene(&state.pool, scene_id).await;
    let _ = SegmentRepo::delete_for_scene(&state.pool, scene_id).await;
    match init_scene_generation(&state, scene_id, None).await {
        // ... per-scene init and logging
    }
}
```

**New code pattern:**
```rust
// Batch cleanup for all scenes at once.
let _ = SceneGenerationLogRepo::delete_for_scenes(&state.pool, &input.scene_ids).await;
let _ = SegmentRepo::delete_for_scenes(&state.pool, &input.scene_ids).await;

// Per-scene init remains sequential (each needs individual error handling).
for &scene_id in &input.scene_ids {
    match init_scene_generation(&state, scene_id, None).await {
        // ... unchanged per-scene logic
    }
}
```

**Acceptance Criteria:**
- [ ] Batch DELETE for logs: `WHERE scene_id = ANY($1)`
- [ ] Batch DELETE for segments: `WHERE scene_id = ANY($1)`
- [ ] Per-scene init remains sequential (acceptable — each has unique error handling)
- [ ] For 50 scenes: 2 batch deletes + 50 inits instead of 300+ queries
- [ ] `cargo check` passes

---

## Phase 2: Medium-Severity Fixes

### Task 2.1: Fix N+1 in `get_health_summary` (PERF-07)
**File:** `apps/backend/crates/db/src/repositories/delivery_log_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/webhook_testing.rs` (refactor lines 337-347)

**New repository method:**
```rust
/// Fetch health stats for all endpoints in a single grouped query.
pub async fn health_stats_batch(
    pool: &DbPool,
    endpoint_ids: &[DbId],
    endpoint_type: &str,
    limit_per_endpoint: i64,
) -> Result<Vec<EndpointHealthRow>, sqlx::Error> {
    // SELECT endpoint_id, COUNT(*), SUM(CASE WHEN success THEN 1 ELSE 0 END), ...
    // FROM delivery_logs WHERE endpoint_id = ANY($1) GROUP BY endpoint_id
}
```

**Current handler code (lines 337-347):**
```rust
for wh in &webhooks {
    let (total, successful, total_duration, recent_failures) =
        DeliveryLogRepo::health_stats(&state.pool, wh.id, ENDPOINT_TYPE_WEBHOOK, 100).await?;
    // ... build summary
}
```

**Acceptance Criteria:**
- [ ] Single `GROUP BY endpoint_id` query replaces per-webhook stats
- [ ] Returns all stats fields per endpoint
- [ ] For 20 webhooks: 1 query instead of 20
- [ ] Health computation logic unchanged
- [ ] `cargo check` passes

### Task 2.2: Fix N+1 in `cascade_preview` (PERF-08)
**File:** `apps/backend/crates/db/src/repositories/scene_type_override_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/scene_type_inheritance.rs` (refactor lines 121-124)

**New repository method:**
```rust
/// Fetch override field names for a batch of scene type IDs.
pub async fn list_field_names_by_scene_types(
    pool: &DbPool,
    scene_type_ids: &[DbId],
) -> Result<Vec<(DbId, String)>, sqlx::Error> {
    // SELECT scene_type_id, field_name FROM scene_type_overrides
    // WHERE scene_type_id = ANY($1)
}
```

**Current handler code (lines 120-124):**
```rust
let mut children_with_overrides = Vec::with_capacity(child_ids.len());
for child_id in child_ids {
    let fields = SceneTypeOverrideRepo::list_field_names(&state.pool, child_id).await?;
    children_with_overrides.push((child_id, fields));
}
```

**New handler code:**
```rust
let rows = SceneTypeOverrideRepo::list_field_names_by_scene_types(&state.pool, &child_ids).await?;
let children_with_overrides: Vec<(DbId, Vec<String>)> = {
    let mut map: HashMap<DbId, Vec<String>> = HashMap::new();
    for (id, field) in rows { map.entry(id).or_default().push(field); }
    child_ids.iter().map(|&id| (id, map.remove(&id).unwrap_or_default())).collect()
};
```

**Acceptance Criteria:**
- [ ] Single query replaces per-child-type loop
- [ ] For 15 child scene types: 1 query instead of 15
- [ ] `find_cascade_affected` receives identical input format
- [ ] `cargo check` passes

### Task 2.3: Fix N+1 in `cancel_schedule` / `remove_scenes_from_schedule` and DRY (PERF-09)
**File:** `apps/backend/crates/api/src/handlers/job_scheduling.rs` (refactor lines 376-391, 493-503)

Extract a shared helper and convert to batch operations.

**New shared helper:**
```rust
/// Batch-revert scheduled scenes to their appropriate prior status.
/// Returns the number of scenes reverted.
async fn batch_revert_scheduled_scenes(
    pool: &DbPool,
    scene_ids: &[DbId],
) -> usize {
    let scenes = SceneRepo::find_by_ids(pool, scene_ids).await.unwrap_or_default();
    let mut reverted = 0;
    for scene in scenes {
        if scene.status_id == SceneStatus::Scheduled.id() {
            let restore = resolve_restore_status(pool, scene.id).await;
            let update = UpdateSceneGeneration::reset_to(restore);
            let _ = SceneRepo::update_generation_state(pool, scene.id, &update).await;
            reverted += 1;
        }
    }
    reverted
}
```

Also add `SceneRepo::find_by_ids` if it doesn't exist:
```rust
pub async fn find_by_ids(pool: &DbPool, ids: &[DbId]) -> Result<Vec<Scene>, sqlx::Error> {
    // SELECT * FROM scenes WHERE id = ANY($1) AND deleted_at IS NULL
}
```

**Acceptance Criteria:**
- [ ] Shared `batch_revert_scheduled_scenes` helper used by both functions
- [ ] `SceneRepo::find_by_ids` fetches all scenes in one query
- [ ] Duplicate loop logic removed from both `cancel_schedule` and `remove_scenes_from_schedule`
- [ ] For 20 scenes: 1 fetch query + N status updates (still per-scene for `resolve_restore_status`)
- [ ] `cargo check` passes

### Task 2.4: Fix N+1 in `scan_and_import` (PERF-22)
**File:** `apps/backend/crates/db/src/repositories/avatar_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs` (refactor lines 147-170)

**New repository method:**
```rust
/// Resolve avatar slugs to (id, name) pairs in a single query.
pub async fn resolve_slugs(
    pool: &DbPool,
    slugs: &[String],
    pipeline_id: DbId,
) -> Result<HashMap<String, (DbId, String)>, sqlx::Error> {
    // SELECT LOWER(REPLACE(name, ' ', '-')) as slug, id, name
    // FROM avatars WHERE LOWER(REPLACE(name, ' ', '-')) = ANY($1) AND pipeline_id = $2
}
```

**Current handler code (lines 147-170):**
```rust
for group in &scan_result.avatars {
    let (avatar_id, avatar_name) =
        resolve_avatar_slug(&state.pool, &group.avatar_slug, input.pipeline_id).await?;
    for f in &group.files {
        let conflict = detect_conflict(&state.pool, f, avatar_id).await?;
        // ...
    }
}
```

**Acceptance Criteria:**
- [ ] All avatar slugs resolved in 1 query using `ANY($1)` on computed slug column
- [ ] Conflict detection batch-queried per file category (e.g., all source images at once)
- [ ] For 50 avatars x 20 files: 3-5 queries instead of 1,050+
- [ ] Unresolved slugs still reported as errors
- [ ] `cargo check` passes

### Task 2.5: Fix N+1 in `speech_import` (PERF-23)
**File:** `apps/backend/crates/api/src/handlers/project_speech_import.rs` (refactor lines 172-173)

**Current handler code (line 172-173):**
```rust
let speech_type =
    SpeechTypeRepo::find_or_create(&state.pool, pipeline_id, type_name).await?;
```

**New code pattern:**
```rust
// Pre-fetch all speech types for this pipeline before the loop.
let existing_types = SpeechTypeRepo::list_by_pipeline(&state.pool, pipeline_id).await?;
let type_map: HashMap<String, SpeechType> = existing_types.into_iter()
    .map(|t| (t.name.to_lowercase(), t))
    .collect();

// Inside the loop:
let speech_type = match type_map.get(&type_name.to_lowercase()) {
    Some(t) => t.clone(),
    None => {
        let new_type = SpeechTypeRepo::create(&state.pool, pipeline_id, type_name).await?;
        // Optionally insert into type_map for subsequent references
        new_type
    }
};
```

**Acceptance Criteria:**
- [ ] Pre-fetch all speech types for the pipeline in 1 query
- [ ] Only create truly missing types (not `find_or_create` per iteration)
- [ ] For 20 speech types: 1 fetch + N inserts (only for missing) instead of 20 `find_or_create`
- [ ] `cargo check` passes

---

## Phase 3: Low-Severity Fixes

### Task 3.1: Fix N+1 in `cloud_providers::dashboard` (PERF-12)
**File:** `apps/backend/crates/db/src/repositories/cloud_cost_event_repo.rs` (new method)
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs` (refactor lines 718-723)

**New repository method:**
```rust
/// Sum costs grouped by provider for a date range.
pub async fn sum_by_providers_in_range(
    pool: &DbPool,
    provider_ids: &[DbId],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<HashMap<DbId, i64>, sqlx::Error> {
    // SELECT provider_id, COALESCE(SUM(cost_cents), 0)
    // FROM cost_events WHERE provider_id = ANY($1) AND created_at BETWEEN $2 AND $3
    // GROUP BY provider_id
}
```

**Current handler code (lines 718-723):**
```rust
for p in &providers {
    let summary =
        CloudCostEventRepo::sum_by_provider_in_range(&state.pool, p.id, month_start, now).await?;
    total_cost += summary.total_cost_cents;
}
```

**Acceptance Criteria:**
- [ ] Single `GROUP BY provider_id` query replaces per-provider summation
- [ ] For 5 providers: 1 query instead of 5
- [ ] Total cost calculation identical
- [ ] `cargo check` passes

### Task 3.2: Fix N+1 in `tags::apply_entity_tags` (PERF-24)
**File:** `apps/backend/crates/db/src/repositories/tag_repo.rs` (new batch methods)
**File:** `apps/backend/crates/api/src/handlers/tags.rs` (refactor lines 146-164)

**New repository methods:**
```rust
/// Batch create-or-get tags by name.
pub async fn create_or_get_many(
    pool: &DbPool,
    tag_names: &[String],
    color: Option<&str>,
    created_by_id: Option<DbId>,
    pipeline_id: DbId,
) -> Result<Vec<Tag>, sqlx::Error> { /* ... */ }

/// Batch apply tags to an entity.
pub async fn apply_many(
    pool: &DbPool,
    entity_type: &str,
    entity_id: DbId,
    tag_ids: &[DbId],
    applied_by_id: Option<DbId>,
) -> Result<(), sqlx::Error> {
    // INSERT INTO entity_tags ... SELECT * FROM UNNEST($1, $2, ...)
    // ON CONFLICT DO NOTHING
}
```

**Current handler code (lines 146-164):**
```rust
for tag_name in &input.tag_names {
    let tag = TagRepo::create_or_get(&state.pool, tag_name, None, Some(auth.user_id), input.pipeline_id).await?;
    TagRepo::apply(&state.pool, &entity_type, entity_id, tag.id, Some(auth.user_id)).await?;
    applied_tags.push(tag);
}
```

**Acceptance Criteria:**
- [ ] Batch `create_or_get_many` resolves all tags in 1-2 queries
- [ ] Batch `apply_many` applies all tags in 1 query using `UNNEST`
- [ ] For 10 tags: 2 queries instead of 20
- [ ] `ON CONFLICT DO NOTHING` for idempotent tag application
- [ ] `cargo check` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/db/src/repositories/scene_repo.rs` | New `list_ids_by_avatars`, `find_by_ids` methods |
| `apps/backend/crates/db/src/repositories/avatar_review_repo.rs` | Batch assignment, status, count methods |
| `apps/backend/crates/db/src/repositories/avatar_scene_override_repo.rs` | New `list_effective_for_avatars` method |
| `apps/backend/crates/db/src/repositories/scene_generation_log_repo.rs` | New `delete_for_scenes` batch method |
| `apps/backend/crates/db/src/repositories/segment_repo.rs` | New `delete_for_scenes` batch method |
| `apps/backend/crates/db/src/repositories/delivery_log_repo.rs` | New `health_stats_batch` method |
| `apps/backend/crates/db/src/repositories/scene_type_override_repo.rs` | New `list_field_names_by_scene_types` |
| `apps/backend/crates/db/src/repositories/avatar_repo.rs` | New `resolve_slugs` batch method |
| `apps/backend/crates/db/src/repositories/cloud_cost_event_repo.rs` | New `sum_by_providers_in_range` |
| `apps/backend/crates/db/src/repositories/tag_repo.rs` | New `create_or_get_many`, `apply_many` |
| `apps/backend/crates/api/src/handlers/metadata.rs` | Refactored `stale_metadata` |
| `apps/backend/crates/api/src/handlers/avatar_review.rs` | Refactored `assign_avatars`, `auto_allocate` |
| `apps/backend/crates/api/src/handlers/production_run.rs` | Refactored `create_run` |
| `apps/backend/crates/api/src/handlers/generation.rs` | Refactored `batch_generate` |
| `apps/backend/crates/api/src/handlers/webhook_testing.rs` | Refactored `get_health_summary` |
| `apps/backend/crates/api/src/handlers/scene_type_inheritance.rs` | Refactored `cascade_preview` |
| `apps/backend/crates/api/src/handlers/job_scheduling.rs` | Refactored + DRY shared helper |
| `apps/backend/crates/api/src/handlers/directory_scan.rs` | Refactored `scan_and_import` |
| `apps/backend/crates/api/src/handlers/project_speech_import.rs` | Refactored `speech_import` |
| `apps/backend/crates/api/src/handlers/cloud_providers.rs` | Refactored `dashboard` |
| `apps/backend/crates/api/src/handlers/tags.rs` | Refactored `apply_entity_tags` |

---

## Dependencies

### Existing Components to Reuse
- PRD-160 batch query patterns (`ANY($1)`, `HashMap` grouping)
- `UNNEST` pattern from `ProductionRunRepo::create_cells_batch`
- `itertools::into_group_map()` for grouping flat results
- `HashMap` / `HashSet` from `std::collections`

### New Infrastructure Needed
- `SceneRepo::find_by_ids` batch fetch (may already exist — check before creating)
- `batch_revert_scheduled_scenes` shared helper in `job_scheduling.rs`

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: High-severity — Tasks 1.1-1.5 (greatest query reduction)
2. Phase 2: Medium-severity — Tasks 2.1-2.5
3. Phase 3: Low-severity — Tasks 3.1-3.2

**MVP Success Criteria:**
- All 12 N+1 patterns from the audit are eliminated
- Every affected handler uses batch queries instead of loops
- `cancel_schedule` / `remove_scenes_from_schedule` share a single helper (DRY)
- All existing tests pass unchanged

---

## Notes

1. Tasks 1.2 and 1.5 overlap with PRD-162 (transaction safety) — the batch operations in these handlers will also need transaction wrapping. Implement batch queries first, then add transactions in PRD-162.
2. Task 2.3 (`cancel_schedule`) has a remaining per-scene query for `resolve_restore_status` — this is acceptable because the restore status depends on per-scene video state. Batching the initial fetch is the key optimization.
3. Task 2.4 (`scan_and_import`) may require multiple batch queries for different conflict categories (source images, videos, speech files). Group by category for efficiency.
4. Before creating `SceneRepo::find_by_ids`, check if PRD-160 already introduced `list_by_avatars` or similar — avoid duplicate methods.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-161
