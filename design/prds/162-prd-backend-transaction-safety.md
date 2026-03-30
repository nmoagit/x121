# PRD-162: Backend Transaction Safety

## 1. Introduction/Overview

Five backend handlers perform multi-step write operations (N inserts + status updates + audit logging) without transactional wrapping. If any step fails mid-way, the database is left in an inconsistent state. The most dangerous case is `purge_clips` in `reclamation.rs`, which deletes files from disk and then updates database records — if the DB update fails after files are deleted, data is permanently lost with no recovery path.

This PRD wraps all five handlers in database transactions using the `pool.begin()` / `tx.commit()` pattern already established in 15+ places across the `db` crate.

These fixes are sourced from the **Performance Audit — Rust Backend** (2026-03-30), finding PERF-18.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-02** (Backend Foundation) — Axum handler infrastructure, connection pool
- **PRD-00** (Database Normalization) — transaction patterns in db crate

### Extends
- **PRD-129** (Character Review Allocation) — `assign_avatars` handler
- **PRD-57** (Batch Production Orchestrator) — `create_run` handler
- **PRD-24** (Recursive Video Generation Loop) — `batch_generate` handler
- **PRD-15** (Disk Reclamation) — `purge_clips` handler
- **PRD-153** (Derived Clip Import) — `import_derived_clips` handler

### Related
- **PRD-160** (Critical N+1 Elimination) — some of these handlers are also N+1 targets
- **PRD-161** (N+1 Cleanup) — batch operations in PRD-161 benefit from transaction wrapping

## 3. Goals

### Primary Goals
1. Wrap all five identified multi-step mutation handlers in database transactions.
2. Ensure atomicity: either all steps succeed or none do.
3. Prevent data loss in `purge_clips` by making file deletion conditional on successful DB commit.

### Secondary Goals
- Establish a clear pattern for "file deletion + DB update" that future handlers can follow.
- Document the transaction boundary pattern in handler code comments.

## 4. User Stories

- **US-1:** As an admin purging clips, I want the operation to either fully succeed or fully roll back, so I never end up with deleted files but stale database records (or vice versa).
- **US-2:** As a pipeline operator assigning avatars for review, I want all assignments to be created atomically, so I don't end up with partial assignment states if the server crashes mid-operation.
- **US-3:** As a pipeline operator creating a production run, I want the run, its cells, and retrospective marking to happen atomically, so a failure in cell creation doesn't leave an orphan run record.
- **US-4:** As a pipeline operator importing derived clips, I want the multi-file import to be atomic, so a failure on file 15 of 20 doesn't leave 14 orphan records.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Wrap `purge_clips` in Transaction (CRITICAL — Data Loss Risk)

**File:** `crates/api/src/handlers/reclamation.rs:208-275`

**Current behavior:** Iterates over clips, deletes files from disk, then updates DB records. If DB update fails after file deletion, files are gone with no DB record of the deletion.

**Acceptance Criteria:**
- [ ] Handler begins a transaction with `pool.begin()`
- [ ] All DB operations (marking records as purged, updating statuses) happen within the transaction
- [ ] File deletion happens AFTER `tx.commit()` succeeds — not before
- [ ] If any DB operation fails, transaction rolls back and no files are deleted
- [ ] If file deletion fails after DB commit, the failure is logged but does not cause a rollback (DB is already consistent — files can be cleaned up later)
- [ ] A comment in the code documents the ordering: "DB commit first, file delete second — files can be re-deleted but DB state cannot be recovered"

**Technical Notes:**
- Pattern: `begin tx` -> `update DB records` -> `commit tx` -> `delete files` -> `log any file deletion failures`
- This is the "outbox pattern" — DB is the source of truth, file system is eventually consistent

#### Requirement 1.2: Wrap `assign_avatars` in Transaction

**File:** `crates/api/src/handlers/avatar_review.rs:111-141`

**Current behavior:** Per avatar: `create_assignment` + `update_review_status` + `log_action` = 3 sequential queries with no transaction.

**Acceptance Criteria:**
- [ ] Handler begins a transaction with `pool.begin()`
- [ ] All assignment creations, status updates, and audit log entries happen within the transaction
- [ ] On any failure, all changes roll back — no partial assignments
- [ ] Transaction commits only after all avatars are processed
- [ ] Repository methods accept `&mut Transaction` or `&PgPool` via a trait/generic (follow existing db crate pattern)

#### Requirement 1.3: Wrap `create_run` in Transaction

**File:** `crates/api/src/handlers/production_run.rs:69-148`

**Current behavior:** Creates run record, then inserts cells, then marks retrospective — each as separate queries with no transaction.

**Acceptance Criteria:**
- [ ] Handler begins a transaction with `pool.begin()`
- [ ] Run creation, cell insertion (batch via UNNEST), and retrospective marking all happen within the transaction
- [ ] If cell insertion fails, the run record is rolled back
- [ ] Transaction commits only after all steps succeed

#### Requirement 1.4: Wrap `batch_generate` in Transaction

**File:** `crates/api/src/handlers/generation.rs:419-450`

**Current behavior:** Per scene: deletes old logs/segments, initializes new generation state — no transaction.

**Acceptance Criteria:**
- [ ] Handler begins a transaction with `pool.begin()`
- [ ] All cleanup (DELETE logs, DELETE segments) and initialization (INSERT generation state) happen within the transaction
- [ ] If any scene's initialization fails, all cleanup is rolled back
- [ ] Transaction commits only after all scenes are processed

#### Requirement 1.5: Wrap `import_derived_clips` in Transaction

**File:** `crates/api/src/handlers/scene_video_version.rs:1348-1653`

**Current behavior:** Multi-file import creates version records, copies files, updates metadata — each file independently.

**Acceptance Criteria:**
- [ ] Handler begins a transaction with `pool.begin()`
- [ ] All DB operations (version creation, metadata updates, tag applications) happen within the transaction
- [ ] File copies happen AFTER `tx.commit()` succeeds (same pattern as `purge_clips` but in reverse — copy instead of delete)
- [ ] If any DB operation fails, all changes roll back and no files are copied
- [ ] If file copy fails after DB commit, the failure is logged and the version record is marked as `file_missing`

## 6. Non-Functional Requirements

### Performance
- Transaction overhead is negligible (< 1ms per transaction begin/commit)
- Batch operations within transactions are faster than individual commits (fewer fsync calls)
- No change in handler response time for successful operations

### Security
- No changes to authorization logic
- Transaction isolation level: default (READ COMMITTED) is sufficient

## 7. Non-Goals (Out of Scope)

- Fixing N+1 patterns within these handlers (covered by PRD-160, PRD-161)
- Adding retry logic for failed transactions
- Distributed transactions across multiple services
- Two-phase commit for file + DB operations (the outbox pattern is sufficient)

## 8. Design Considerations

- **Outbox pattern for file operations:** DB is always the source of truth. File operations happen after DB commit. This means:
  - For `purge_clips`: commit DB update, then delete files
  - For `import_derived_clips`: commit DB records, then copy files
  - File operation failures are logged but don't invalidate DB state
- **Transaction scope:** Keep transactions as short as possible — no network calls or file I/O inside the transaction

## 9. Technical Considerations

### Existing Code to Reuse
- `pool.begin()` / `tx.commit()` pattern used in 15+ places in `crates/db/`
- Repository methods already accept `PgPool` — many can accept `&mut PgConnection` (which `Transaction` derefs to) via the sqlx `Executor` trait
- Existing `Executor` trait usage pattern in the db crate

### Database Changes
- No schema changes
- No new migrations

### API Changes
- No API contract changes
- Error responses may change slightly: partial success responses become full rollback errors

## 10. Edge Cases & Error Handling

- **Transaction timeout:** PostgreSQL default `idle_in_transaction_session_timeout` may need adjustment for large batch operations — document recommended setting
- **Deadlocks:** Multiple concurrent `batch_generate` calls on overlapping scenes could deadlock — ensure consistent row ordering within transactions (`ORDER BY scene_id`)
- **File system errors after commit:** Log at ERROR level, include version IDs for manual recovery
- **Connection pool exhaustion:** Transactions hold connections longer — ensure pool size is adequate (see PRD-164 PERF-20)

## 11. Success Metrics

- All five handlers wrapped in transactions
- Zero partial-state scenarios possible (verified by code review)
- `purge_clips` cannot delete files without successful DB commit
- Existing integration tests continue to pass

## 12. Testing Requirements

- **Unit tests:** Test transaction rollback by simulating failures mid-batch (e.g., unique constraint violation on the Nth insert)
- **Integration tests:** Verify that partial failures result in clean rollback (no orphan records)
- **Data integrity tests:** For `purge_clips`, verify that file deletion only happens after DB commit
- **Concurrency tests:** Two concurrent `batch_generate` calls on overlapping scenes should not deadlock (or should fail gracefully)

## 13. Open Questions

- Should repository methods be refactored to accept `impl Executor<'_, Database = Postgres>` generically (supports both `PgPool` and `Transaction`), or should we create transaction-specific variants?
- For `import_derived_clips`, if file copy fails after DB commit, should we auto-mark the version as `file_missing` or leave it for manual resolution?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from PERFORMANCE-AUDIT-BACKEND.md finding PERF-18 |
