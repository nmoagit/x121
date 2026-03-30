# PRD-161: Backend N+1 Query Cleanup (Remaining)

## 1. Introduction/Overview

After addressing the three critical N+1 patterns (PRD-160), twelve additional N+1 query patterns remain across the backend. These range from high-severity patterns in production run creation (300+ queries for 50 scenes) to low-severity patterns in cloud provider dashboards. Each pattern follows the same anti-pattern: executing database queries inside `for` loops instead of using batch queries.

This PRD addresses all remaining N+1 findings from the Performance Audit (PERF-04 through PERF-12, PERF-22 through PERF-24), converting loop-based queries to batch operations using `ANY($1)`, `GROUP BY`, or pre-fetch strategies.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-160** (Critical N+1 Elimination) — establishes batch query patterns to follow
- **PRD-00** (Database Normalization) — repository pattern, query conventions

### Extends
- **PRD-13** (Dual-Metadata System) — `stale_metadata` handler (PERF-04)
- **PRD-129** (Character Review Allocation) — `assign_avatars`, `auto_allocate` handlers (PERF-05, PERF-06)
- **PRD-99** (Webhook Testing Console) — `get_health_summary` handler (PERF-07)
- **PRD-100** (Scene Type Inheritance) — `cascade_preview` handler (PERF-08)
- **PRD-119** (Time-Based Job Scheduling) — `cancel_schedule` handler (PERF-09)
- **PRD-57** (Batch Production Orchestrator) — `create_run` handler (PERF-10)
- **PRD-24** (Recursive Video Generation Loop) — `batch_generate` handler (PERF-11)
- **PRD-114** (Cloud GPU Provider Integration) — `cloud_providers::dashboard` (PERF-12)
- **PRD-155** (Server-Side Directory Scan) — `scan_and_import` handler (PERF-22)
- **PRD-136** (Multilingual Speech) — `speech_import` handler (PERF-23)
- **PRD-47** (Tagging & Custom Labels) — `apply_entity_tags` handler (PERF-24)

### Related
- **PRD-162** (Backend Transaction Safety) — some of these handlers also need transaction wrapping

## 3. Goals

### Primary Goals
1. Eliminate all remaining N+1 query patterns identified in the performance audit.
2. Convert loop-based database calls to batch operations (single query per data type).
3. Maintain identical functional behavior — all fixes are internal optimizations.

### Secondary Goals
- DRY the duplicated loop logic in `cancel_schedule` and `remove_scenes_from_schedule` (PERF-09).
- Establish a pattern library of batch query methods in the repository layer.

## 4. User Stories

- **US-1:** As a pipeline operator creating production runs with 50+ avatars, I want `create_run` to complete in under 1 second instead of stalling from hundreds of sequential queries.
- **US-2:** As a pipeline operator batch-generating 50 scenes, I want `batch_generate` to handle cleanup efficiently instead of firing 300+ individual DELETE queries.
- **US-3:** As an admin viewing the webhook health dashboard, I want stats to load quickly regardless of how many webhooks are configured.
- **US-4:** As a pipeline operator scanning a directory with 50 avatars x 20 files, I want conflict detection to complete in seconds, not minutes.

## 5. Functional Requirements

### Phase 1: High-Severity Fixes

#### Requirement 1.1: Fix N+1 in `stale_metadata` (PERF-04)

**File:** `crates/api/src/handlers/metadata.rs:354-360`

**Current behavior:**
```rust
for char_id in &project_avatar_ids {
    if let Ok(scenes) = SceneRepo::list_by_avatar(&state.pool, *char_id).await {
        project_scene_ids.extend(scenes.iter().map(|s| s.id));
    }
}
```

**Acceptance Criteria:**
- [ ] New `SceneRepo::list_ids_by_avatars(&pool, &[DbId])` method: `SELECT id FROM scenes WHERE avatar_id = ANY($1) AND deleted_at IS NULL`
- [ ] Handler calls this single method instead of looping
- [ ] For 100 avatars, queries drop from 100 to 1

#### Requirement 1.2: Fix N+1 in `assign_avatars` (PERF-05)

**File:** `crates/api/src/handlers/avatar_review.rs:111-141`

Per avatar: `create_assignment` + `update_review_status` + `log_action` = 3 sequential queries.

**Acceptance Criteria:**
- [ ] Batch INSERT for assignments using `INSERT INTO ... SELECT * FROM UNNEST($1, $2, ...)`
- [ ] Single UPDATE for review status: `UPDATE ... SET status_id = $1 WHERE avatar_id = ANY($2)`
- [ ] Batch INSERT for audit log entries
- [ ] For 20 avatars, queries drop from 60 to 3

#### Requirement 1.3: Fix N+1 in `auto_allocate` (PERF-06)

**File:** `crates/api/src/handlers/avatar_review.rs:196-199`

**Current behavior:**
```rust
for reviewer in &mut reviewers {
    reviewer.active_count =
        AvatarReviewRepo::count_active_by_reviewer(&state.pool, reviewer.user_id).await?;
}
```

**Acceptance Criteria:**
- [ ] New `AvatarReviewRepo::count_active_by_reviewers(&pool, &[DbId])` method: `SELECT reviewer_user_id, COUNT(*) FROM review_assignments WHERE status = 'active' GROUP BY reviewer_user_id`
- [ ] Returns `HashMap<DbId, i64>` for direct lookup
- [ ] For 10 reviewers, queries drop from 10 to 1

#### Requirement 1.4: Fix N+1 in `create_run` (PERF-10)

**File:** `crates/api/src/handlers/production_run.rs:88-112`

**Current behavior:**
```rust
for &cid in &body.avatar_ids {
    let settings = AvatarSceneOverrideRepo::list_effective(
        &state.pool, cid, body.project_id, None,
    ).await?;
}
```

**Acceptance Criteria:**
- [ ] New `AvatarSceneOverrideRepo::list_effective_for_avatars(&pool, &[DbId], project_id, pipeline_id)` method
- [ ] Returns `Vec<(avatar_id, EffectiveSetting)>` for grouping in Rust
- [ ] For 50 avatars, queries drop from 50 to 1

#### Requirement 1.5: Fix N+1 in `batch_generate` (PERF-11)

**File:** `crates/api/src/handlers/generation.rs:419-450`

Per scene: `delete_for_scene` (2x) + `init_scene_generation` + `gen_log::log` (2x) = 4-6 queries.

**Acceptance Criteria:**
- [ ] Batch cleanup: `DELETE FROM scene_generation_logs WHERE scene_id = ANY($1)`
- [ ] Batch cleanup: `DELETE FROM segments WHERE scene_id = ANY($1) AND ...`
- [ ] Batch init: single INSERT with `UNNEST` for scene generation states
- [ ] For 50 scenes, queries drop from 300+ to 3-5

### Phase 2: Medium-Severity Fixes

#### Requirement 2.1: Fix N+1 in `get_health_summary` (PERF-07)

**File:** `crates/api/src/handlers/webhook_testing.rs:337-347`

**Acceptance Criteria:**
- [ ] New `DeliveryLogRepo::health_stats_batch(&pool, &[DbId], since)` method with `GROUP BY endpoint_id`
- [ ] Returns `Vec<(endpoint_id, total, successful, total_duration, recent_failures)>`
- [ ] For 20 webhooks, queries drop from 20 to 1

#### Requirement 2.2: Fix N+1 in `cascade_preview` (PERF-08)

**File:** `crates/api/src/handlers/scene_type_inheritance.rs:121-124`

**Acceptance Criteria:**
- [ ] New `SceneTypeOverrideRepo::list_by_scene_types(&pool, &[DbId])` method: `SELECT scene_type_id, field_name FROM scene_type_overrides WHERE scene_type_id = ANY($1)`
- [ ] For 15 child scene types, queries drop from 15 to 1

#### Requirement 2.3: Fix N+1 in `cancel_schedule` and DRY duplicate (PERF-09)

**File:** `crates/api/src/handlers/job_scheduling.rs:376-391, 493-503`

Per scene: `find_by_id` + `resolve_restore_status` + `update_generation_state` = 3+ queries. Pattern duplicated across two functions.

**Acceptance Criteria:**
- [ ] Batch fetch scenes: `SELECT * FROM scenes WHERE id = ANY($1)`
- [ ] Batch status resolution and update
- [ ] Extract shared helper function used by both `cancel_schedule` and `remove_scenes_from_schedule`
- [ ] For 20 scenes, queries drop from 60+ to 2-3

#### Requirement 2.4: Fix N+1 in `scan_and_import` (PERF-22)

**File:** `crates/api/src/handlers/directory_scan.rs:147-170`

**Acceptance Criteria:**
- [ ] Batch resolve all avatar slugs: `SELECT slug, id FROM avatars WHERE slug = ANY($1) AND pipeline_id = $2`
- [ ] Batch conflict detection: single query per file type checking existing records
- [ ] For 50 avatars x 20 files, queries drop from 1,050+ to 3-5

#### Requirement 2.5: Fix N+1 in `speech_import` (PERF-23)

**File:** `crates/api/src/handlers/project_speech_import.rs:172-173`

**Acceptance Criteria:**
- [ ] Pre-fetch all speech types for the pipeline: `SELECT * FROM speech_types WHERE pipeline_id = $1`
- [ ] Check locally against pre-fetched set, only create truly missing types
- [ ] For 20 speech types, queries drop from 20 `find_or_create` calls to 1 fetch + N inserts (only for missing)

### Phase 3: Low-Severity Fixes

#### Requirement 3.1: Fix N+1 in `cloud_providers::dashboard` (PERF-12)

**File:** `crates/api/src/handlers/cloud_providers.rs:718-723`

**Acceptance Criteria:**
- [ ] New cost aggregation query: `SELECT provider_id, SUM(cost) FROM cost_events WHERE ... GROUP BY provider_id`
- [ ] For 5 providers, queries drop from 5 to 1

#### Requirement 3.2: Fix N+1 in `tags::apply_entity_tags` (PERF-24)

**File:** `crates/api/src/handlers/tags.rs:146-164`

**Acceptance Criteria:**
- [ ] New `TagRepo::create_or_get_many(&pool, &[String])` batch method
- [ ] New `TagRepo::apply_many(&pool, entity_type, entity_id, &[DbId])` batch method
- [ ] For 10 tags, queries drop from 20 (10 create + 10 apply) to 2

## 6. Non-Functional Requirements

### Performance
- All high-severity handlers: < 500ms for typical workloads (50-100 entities)
- All medium-severity handlers: < 200ms for typical workloads
- No increase in memory usage beyond HashMap overhead for grouping

### Security
- No changes to authorization logic

## 7. Non-Goals (Out of Scope)

- Critical N+1 patterns (covered by PRD-160)
- Transaction wrapping (covered by PRD-162)
- Async runtime optimization (covered by PRD-163)
- Repository layer migration (covered by PRD-164)

## 8. Design Considerations

- All batch methods should accept `&[DbId]` and return results keyed by the input ID for easy `HashMap` grouping
- Prefer `ANY($1)` over building dynamic `IN (...)` clauses — sqlx handles array binding natively
- For methods returning grouped data, consider returning `HashMap<DbId, Vec<T>>` directly from the repository if the grouping logic is reusable

## 9. Technical Considerations

### Existing Code to Reuse
- `UNNEST` pattern already used in `production_run_repo` for batch cell inserts
- `ANY($1)` pattern used in several existing repository methods
- `itertools::into_group_map()` available in dependencies

### Database Changes
- No schema changes — only new repository methods with batch queries

### API Changes
- No API contract changes — all fixes are internal optimization

## 10. Edge Cases & Error Handling

- **Empty input arrays:** All `ANY($1)` queries handle empty arrays (return empty result set)
- **Partial failures in batch operations:** If one avatar in `assign_avatars` fails validation, the entire batch should fail (this is better handled with transactions — see PRD-162)
- **Large batches:** For `batch_generate` with 500+ scenes, consider chunking to avoid query parameter limits (PostgreSQL supports up to 65535 parameters)

## 11. Success Metrics

- Zero N+1 patterns remaining in handlers identified by the performance audit
- All affected handlers measurably faster under load (50+ entities)
- No regression in existing tests

## 12. Testing Requirements

- **Unit tests:** Each new batch repository method tested with 0, 1, and N inputs
- **Integration tests:** Existing handler tests verify identical functional behavior
- **DRY check:** Shared `cancel_schedule` / `remove_scenes_from_schedule` helper has a single implementation

## 13. Open Questions

- For `list_effective_for_avatars` (PERF-10), should the three-tier inheritance resolution happen in SQL or Rust? SQL is more efficient but harder to maintain.
- Should batch methods have a configurable chunk size for very large input arrays, or is PostgreSQL's parameter limit sufficient?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from PERFORMANCE-AUDIT-BACKEND.md findings PERF-04 to PERF-12, PERF-22 to PERF-24 |
