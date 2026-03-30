# PRD-160: Backend Critical N+1 Query Elimination

## 1. Introduction/Overview

The backend has three critical N+1 query patterns that can produce thousands of sequential database queries in a single handler invocation. The worst offender — `auto_select_posters` — executes a triple-nested loop that, for 50 avatars with 10 scenes and 5 segments each, fires 2,500+ individual queries. Two other critical patterns in `validate_delivery` (200 queries for 100 avatars) and `cancel_generation` (fetches all jobs then filters in Rust) also need immediate attention.

This PRD also includes adding a GIN index on `jobs.parameters` to support efficient JSONB containment queries, which is a prerequisite for the `cancel_generation` fix.

These fixes are sourced from the **Performance Audit — Rust Backend** (2026-03-30), findings PERF-01, PERF-02, PERF-03, and PERF-25.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-02** (Backend Foundation) — Axum handler infrastructure
- **PRD-00** (Database Normalization) — repository pattern, index conventions

### Extends
- **PRD-96** (Poster Frame & Thumbnail Selection) — `auto_select_posters` handler
- **PRD-39** (Scene Assembler & Delivery Packaging) — `validate_delivery` handler
- **PRD-24** (Recursive Video Generation Loop) — `cancel_generation` handler
- **PRD-07** (Parallel Task Execution Engine) — jobs table, `JobRepo`

### Related
- **PRD-161** (Backend N+1 Query Cleanup) — remaining non-critical N+1 patterns
- **PRD-162** (Backend Transaction Safety) — transaction wrapping for multi-step mutations

## 3. Goals

### Primary Goals
1. Reduce `auto_select_posters` from O(N*M*K) queries to a constant number of queries (1-2 JOINs + Rust grouping).
2. Reduce `validate_delivery` from O(2N) queries to 2 batch queries using `ANY($1)`.
3. Replace `cancel_generation`'s fetch-all-and-filter pattern with a targeted JSONB containment query.
4. Add a GIN index on `jobs.parameters` to make JSONB queries performant.

### Secondary Goals
- Establish batch query patterns that subsequent N+1 fixes (PRD-161) can follow.
- Document the "fetch batch, group in Rust" pattern in code comments for team reference.

## 4. User Stories

- **US-1:** As a pipeline operator with 50+ avatars, I want poster auto-selection to complete in under 1 second instead of 10+ seconds, so I don't wait for cascading database queries.
- **US-2:** As a pipeline operator validating a delivery of 100 avatars, I want validation to be near-instant instead of taking 5+ seconds from sequential per-avatar checks.
- **US-3:** As a pipeline operator cancelling generation for a scene, I want the system to find relevant jobs directly via database query instead of fetching 100 jobs and filtering in Rust.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Fix Triple-Nested N+1 in `auto_select_posters` (PERF-01)

**Description:** Replace the triple-nested loop (avatars -> scenes -> segments -> quality scores) with a single JOIN query that returns all data at once, then group results in Rust.

**File:** `crates/api/src/handlers/poster_frame.rs:184-201`

**Current behavior:**
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

**Acceptance Criteria:**
- [ ] A new repository method (e.g., `QualityScoreRepo::batch_best_by_avatars`) executes a single JOIN query across avatars, scenes, segments, and quality scores
- [ ] The query accepts `&[DbId]` (avatar IDs) and returns `Vec<(avatar_id, segment_id, score)>` or equivalent struct
- [ ] Rust code groups the flat result set by avatar using a `HashMap`
- [ ] For 50 avatars x 10 scenes x 5 segments, total queries is 1-2 instead of 2,500+
- [ ] Existing behavior is preserved: same posters are selected as before
- [ ] No new repository methods are added to the handler crate — all SQL lives in `db/repositories`

**Technical Notes:**
- Use a multi-table JOIN: `scenes JOIN segments ON ... JOIN quality_scores ON ... WHERE scenes.avatar_id = ANY($1)`
- Return a flat `Vec<BatchPosterCandidate>` struct, group in handler with `HashMap<DbId, Vec<...>>`

#### Requirement 1.2: Fix N+1 in `validate_delivery` (PERF-02)

**Description:** Replace per-avatar scene and metadata checks with two batch queries using `ANY($1)`.

**File:** `crates/api/src/handlers/delivery.rs:716-746`

**Current behavior:**
```rust
for avatar in &avatars {
    let scenes = SceneRepo::list_by_avatar(&state.pool, avatar.id).await?;
    let approved = AvatarMetadataVersionRepo::find_approved(&state.pool, avatar.id).await?;
}
```

**Acceptance Criteria:**
- [ ] A new `SceneRepo::list_by_avatars(&pool, &[DbId])` method fetches scenes for all avatars in one query using `WHERE avatar_id = ANY($1)`
- [ ] A new `AvatarMetadataVersionRepo::find_approved_for_avatars(&pool, &[DbId])` method fetches approved versions for all avatars in one query
- [ ] Handler groups results by `avatar_id` in Rust using `HashMap`
- [ ] For 100 avatars, total queries is 2 instead of 200
- [ ] Validation logic and error messages remain identical

**Technical Notes:**
- Both queries return `Vec<(avatar_id, ...)>` for easy grouping
- Use `.into_group_map()` from itertools or manual `fold` into `HashMap`

#### Requirement 1.3: Fix `cancel_generation` Fetch-All Pattern (PERF-03)

**Description:** Replace the pattern of fetching all recent jobs and filtering by `scene_id` in Rust with a targeted JSONB containment query.

**File:** `crates/api/src/handlers/generation.rs:488-520`

**Current behavior:**
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

**Acceptance Criteria:**
- [ ] A new `JobRepo::list_active_by_scene_id(&pool, scene_id)` method uses `WHERE parameters @> '{"scene_id": N}'::jsonb AND status_id IN (active_statuses)`
- [ ] The handler calls this single method instead of fetching all jobs
- [ ] Only jobs matching the scene are returned — no Rust-side JSON parsing for filtering
- [ ] The GIN index (Req 1.4) makes the `@>` operator efficient

#### Requirement 1.4: Add GIN Index on `jobs.parameters` (PERF-25)

**Description:** Create a database migration adding a GIN index on the `jobs.parameters` JSONB column to support efficient containment queries.

**Acceptance Criteria:**
- [ ] New migration file adds: `CREATE INDEX idx_jobs_parameters_gin ON jobs USING GIN (parameters);`
- [ ] Migration is reversible (`DROP INDEX`)
- [ ] Index creation uses `CONCURRENTLY` if feasible (or documents that it should be run during maintenance window for large tables)
- [ ] After migration, `EXPLAIN ANALYZE` for `parameters @> '{"scene_id": 1}'` shows index scan, not seq scan

**Technical Notes:**
- GIN indexes support `@>`, `?`, `?|`, `?&` operators on JSONB
- For very large jobs tables, `CREATE INDEX CONCURRENTLY` avoids locking but cannot run inside a transaction

## 6. Non-Functional Requirements

### Performance
- `auto_select_posters` for 50 avatars: < 500ms (down from 10+ seconds)
- `validate_delivery` for 100 avatars: < 200ms (down from 5+ seconds)
- `cancel_generation`: < 50ms (down from 500ms+ with JSON parsing)
- GIN index overhead on `INSERT` to jobs table: < 5% increase in write latency

### Security
- No changes to authorization logic — all existing permission checks remain

## 7. Non-Goals (Out of Scope)

- Fixing non-critical N+1 patterns (covered by PRD-161)
- Adding transaction wrapping (covered by PRD-162)
- Moving inline SQL to repository layer (covered by PRD-164)
- Optimizing the GIN index with `jsonb_path_ops` (can be done later if needed)

## 8. Design Considerations

- The batch query approach (single JOIN, group in Rust) is preferred over multiple `ANY()` queries because it minimizes round trips
- For `auto_select_posters`, the JOIN may return a large result set — ensure the query has appropriate `WHERE` clauses to limit scope (e.g., only active avatars, non-deleted scenes)

## 9. Technical Considerations

### Existing Code to Reuse
- `PaginationParams` from `crate::query` for any new list methods
- Existing `SceneRepo`, `SegmentRepo`, `QualityScoreRepo`, `JobRepo` in `crates/db/src/repositories/`
- `AvatarMetadataVersionRepo` in `crates/db/src/repositories/`
- Existing `DbId` type alias

### Database Changes
- One migration: GIN index on `jobs.parameters`
- No table structure changes — only new repository methods with batch queries

### API Changes
- No API contract changes — all fixes are internal optimization
- Response shapes remain identical

## 10. Edge Cases & Error Handling

- **Empty avatar list:** Batch queries should handle `ANY($1)` with empty array gracefully (returns empty result set)
- **Missing quality scores:** The JOIN should use `LEFT JOIN` for quality scores so segments without scores are still included
- **Large result sets:** For `auto_select_posters` with 500+ avatars, ensure the JOIN query doesn't blow up memory — consider chunking into batches of 100 avatar IDs
- **Jobs with malformed parameters:** The new `list_active_by_scene_id` should still work even if some jobs have unexpected JSON structure (the `@>` operator handles this gracefully)

## 11. Success Metrics

- `auto_select_posters` query count drops from O(N*M*K) to O(1)
- `validate_delivery` query count drops from O(2N) to O(2)
- `cancel_generation` query count drops from O(N+M) to O(1)
- No regression in existing integration tests

## 12. Testing Requirements

- **Unit tests:** Test each new batch repository method with multiple avatars/scenes
- **Integration tests:** Run existing poster, delivery, and generation tests to verify identical behavior
- **Performance test:** Benchmark `auto_select_posters` with 50 avatars before/after (optional but recommended)
- **Edge case tests:** Empty input arrays, single-element arrays, avatars with no scenes

## 13. Open Questions

- Should `auto_select_posters` chunking threshold (e.g., 100 avatars per batch) be configurable or hardcoded?
- For the GIN index, should we use `jsonb_path_ops` operator class (smaller index, supports only `@>`) or default (supports all JSONB operators)?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from PERFORMANCE-AUDIT-BACKEND.md findings PERF-01, PERF-02, PERF-03, PERF-25 |
