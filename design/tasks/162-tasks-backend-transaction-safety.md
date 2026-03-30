# Task List: Backend Transaction Safety

**PRD Reference:** `design/prds/162-prd-backend-transaction-safety.md`
**Scope:** Wrap five multi-step mutation handlers in database transactions using `pool.begin()` / `tx.commit()` to ensure atomicity. Apply the outbox pattern (DB commit first, file operations second) for handlers that touch the filesystem.

## Overview

Five handlers perform multi-step write operations without transactional wrapping. The most dangerous is `purge_clips`, which deletes files from disk then updates the database — if the DB update fails after file deletion, data is permanently lost. All five handlers will be wrapped in transactions using the `pool.begin()` / `tx.commit()` pattern already established in 15+ places across the `db` crate. Handlers that also touch the filesystem (`purge_clips`, `import_derived_clips`) will use the outbox pattern: DB commit first, file operations second.

### What Already Exists
- `pool.begin()` / `tx.commit()` pattern used in 15+ places in `crates/db/`
- Repository methods accept `PgPool` — many can accept `&mut PgConnection` via sqlx `Executor` trait
- sqlx `Transaction` derefs to `PgConnection`, making it compatible with existing repo signatures
- `is_storage_not_found` helper in `reclamation.rs` for safe file-not-found handling

### What We're Building
1. Transaction wrapping for 5 handlers
2. Outbox pattern for file-touching handlers (DB commit -> file ops)
3. Repository method signatures updated to accept `impl Executor` where needed

### Key Design Decisions
1. **Outbox pattern** — DB is source of truth; file operations happen after commit. File failures are logged but don't invalidate DB state.
2. **`impl Executor` for repo methods** — Allows methods to accept both `&PgPool` and `&mut Transaction` without separate variants.
3. **Consistent row ordering** — Within transactions, ORDER BY primary key to avoid deadlocks on concurrent access.
4. **Minimal transaction scope** — No network calls or file I/O inside transactions.

---

## Phase 1: Critical Transaction (Data Loss Prevention)

### Task 1.1: Wrap `purge_clips` in Transaction with Outbox Pattern
**File:** `apps/backend/crates/api/src/handlers/reclamation.rs` (lines 208-275)

This is the highest-priority fix — currently deletes files before DB commit, risking permanent data loss.

**Current flow (DANGEROUS):**
1. For each version: fetch from DB
2. Delete files from disk
3. Mark as purged in DB
4. If step 3 fails: files are gone, DB still shows them as existing

**New flow (SAFE — outbox pattern):**
1. Begin transaction
2. For each version: fetch from DB, collect file paths
3. Mark all versions as purged in DB (within transaction)
4. Commit transaction
5. Delete files from disk (after successful commit)
6. Log any file deletion failures (non-fatal)

```rust
pub async fn purge_clips(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(body): Json<PurgeClipsRequest>,
) -> AppResult<Json<DataResponse<PurgeClipsResponse>>> {
    let provider = state.storage_provider().await;

    // Phase 1: DB transaction — collect file paths and mark as purged.
    let mut tx = state.pool.begin().await?;
    let mut files_to_delete: Vec<String> = Vec::new();
    let mut purged_count: i32 = 0;
    let mut bytes_reclaimed: i64 = 0;
    let mut errors: Vec<String> = Vec::new();

    for &version_id in &body.version_ids {
        let version = match SceneVideoVersionRepo::find_by_id(&mut *tx, version_id).await {
            Ok(Some(v)) if !v.file_purged => v,
            Ok(Some(_)) => continue, // already purged
            Ok(None) => { errors.push(format!("Version {version_id} not found")); continue; }
            Err(e) => { errors.push(format!("DB error: {e}")); continue; }
        };

        // Collect file paths for later deletion.
        files_to_delete.push(version.file_path.clone());
        bytes_reclaimed += version.file_size_bytes.unwrap_or(0);
        if let Some(ref preview) = version.preview_path {
            files_to_delete.push(preview.clone());
        }

        let artifacts = SceneVideoVersionArtifactRepo::list_by_version(&mut *tx, version_id)
            .await.unwrap_or_default();
        for artifact in &artifacts {
            if !artifact.file_purged {
                files_to_delete.push(artifact.file_path.clone());
                bytes_reclaimed += artifact.file_size_bytes.unwrap_or(0);
            }
        }

        // Mark as purged in DB (within transaction).
        SceneVideoVersionRepo::mark_files_purged(&mut *tx, &[version_id]).await?;
        SceneVideoVersionArtifactRepo::mark_files_purged_by_version(&mut *tx, version_id).await?;
        purged_count += 1;
    }

    // DB commit first — files can be re-deleted but DB state cannot be recovered.
    tx.commit().await?;

    // Phase 2: File deletion (after successful commit).
    for path in &files_to_delete {
        if let Err(e) = provider.delete(path).await {
            if !is_storage_not_found(&e) {
                tracing::error!(path, %e, "Failed to delete file after DB purge commit");
            }
        }
    }

    Ok(Json(DataResponse { data: PurgeClipsResponse { purged_count, bytes_reclaimed, errors } }))
}
```

**Acceptance Criteria:**
- [ ] Transaction wraps all DB reads and writes
- [ ] File deletion happens ONLY after `tx.commit()` succeeds
- [ ] If any DB operation fails: transaction rolls back, zero files deleted
- [ ] File deletion failures are logged at ERROR level but don't cause handler failure
- [ ] Code comment documents ordering: "DB commit first, file delete second"
- [ ] `cargo check` passes
- [ ] Existing `purge_clips` tests pass

### Task 1.2: Update Repository Methods to Accept `impl Executor`
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_artifact_repo.rs`

Update `find_by_id`, `mark_files_purged`, and `list_by_version` to accept `impl Executor` instead of `&PgPool`, so they work with both pool and transaction references.

```rust
pub async fn find_by_id(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    id: DbId,
) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
    // ... existing query unchanged, just uses `executor` instead of `pool`
}
```

**Acceptance Criteria:**
- [ ] Methods accept `impl Executor<'_, Database = Postgres>` instead of `&PgPool`
- [ ] All existing callers still compile (pool implements Executor)
- [ ] Transaction callers can pass `&mut *tx`
- [ ] `cargo check` passes with no signature mismatches

---

## Phase 2: Multi-Step Mutation Transactions

### Task 2.1: Wrap `assign_avatars` in Transaction
**File:** `apps/backend/crates/api/src/handlers/avatar_review.rs` (lines 111-141)

**Current flow (no transaction):**
Per avatar: `create_assignment` -> `update_review_status` -> `log_action` (3 queries, no atomicity)

**New flow:**
```rust
let mut tx = state.pool.begin().await?;

for avatar_id in &request.avatar_ids {
    let assignment = AvatarReviewRepo::create_assignment(&mut *tx, /* ... */).await?;
    AvatarReviewRepo::update_review_status(&mut *tx, *avatar_id, 2).await?;
    AvatarReviewRepo::log_action(&mut *tx, /* ... */).await?;
    assignments.push(assignment);
}

tx.commit().await?;
```

**Acceptance Criteria:**
- [ ] `pool.begin()` before the loop, `tx.commit()` after all avatars processed
- [ ] All `create_assignment`, `update_review_status`, `log_action` calls use `&mut *tx`
- [ ] If any avatar fails: entire batch rolls back (no partial assignments)
- [ ] Repository methods updated to accept `impl Executor` if needed
- [ ] `cargo check` passes

### Task 2.2: Wrap `create_run` in Transaction
**File:** `apps/backend/crates/api/src/handlers/production_run.rs` (lines 69-148)

**Current flow (no transaction):**
1. Create run record
2. Insert cells batch
3. Mark retrospective

**New flow:**
```rust
let mut tx = state.pool.begin().await?;

let run = ProductionRunRepo::create(&mut *tx, &input).await?;
for cell in &mut cells { cell.run_id = run.id; }
ProductionRunRepo::create_cells_batch(&mut *tx, &cells).await?;

// Mark retrospective if applicable.
if let Some(retro_id) = body.retrospective_id {
    ProductionRunRepo::mark_retrospective(&mut *tx, run.id, retro_id).await?;
}

tx.commit().await?;
```

**Acceptance Criteria:**
- [ ] Run creation, cell insertion, and retrospective marking all within one transaction
- [ ] If cell insertion fails: run record rolls back (no orphan run)
- [ ] Repository methods accept `impl Executor` for transaction compatibility
- [ ] `cargo check` passes

### Task 2.3: Wrap `batch_generate` in Transaction
**File:** `apps/backend/crates/api/src/handlers/generation.rs` (lines 419-450)

**Current flow (no transaction):**
Per scene: DELETE logs -> DELETE segments -> init generation (each independent)

**New flow:**
```rust
let mut tx = state.pool.begin().await?;

for &scene_id in &input.scene_ids {
    let _ = SceneGenerationLogRepo::delete_for_scene(&mut *tx, scene_id).await;
    let _ = SegmentRepo::delete_for_scene(&mut *tx, scene_id).await;
    // init_scene_generation needs to use tx too
}

tx.commit().await?;

// Submit first segments AFTER commit (these trigger external work).
for &scene_id in &started {
    submit_first_segment(&state, scene_id);
}
```

**Acceptance Criteria:**
- [ ] All cleanup (DELETE logs, DELETE segments) and init within one transaction
- [ ] `submit_first_segment` calls happen AFTER commit (external side effects)
- [ ] If any scene's init fails: all cleanup for all scenes rolls back
- [ ] Consistent ordering: process scene_ids in sorted order to avoid deadlocks
- [ ] `cargo check` passes

### Task 2.4: Wrap `import_derived_clips` in Transaction with Outbox Pattern
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (lines 1348-1653)

**New flow (outbox pattern — DB first, files second):**
```rust
let mut tx = state.pool.begin().await?;
let mut files_to_copy: Vec<(PathBuf, PathBuf)> = Vec::new();

for folder_path in &folders {
    // Resolve avatar, scene, parent version (DB reads within tx)
    // Create version record (DB write within tx)
    // Collect file copy operations for later
    files_to_copy.push((source_path, dest_path));
}

// Commit all DB records first.
tx.commit().await?;

// Copy files after successful commit.
for (src, dst) in &files_to_copy {
    if let Err(e) = tokio::fs::copy(src, dst).await {
        tracing::error!(?src, ?dst, %e, "File copy failed after DB commit — version marked as file_missing");
        // Optionally mark the version as file_missing
    }
}
```

**Acceptance Criteria:**
- [ ] All DB operations (version creation, metadata updates, tag applications) within transaction
- [ ] File copies happen AFTER `tx.commit()` succeeds
- [ ] If any DB operation fails: all changes roll back, no files copied
- [ ] File copy failures logged at ERROR level, don't cause handler failure
- [ ] `cargo check` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/api/src/handlers/reclamation.rs` | `purge_clips` — outbox pattern transaction |
| `apps/backend/crates/api/src/handlers/avatar_review.rs` | `assign_avatars` — batch transaction |
| `apps/backend/crates/api/src/handlers/production_run.rs` | `create_run` — multi-step transaction |
| `apps/backend/crates/api/src/handlers/generation.rs` | `batch_generate` — cleanup transaction |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | `import_derived_clips` — outbox pattern |
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | Updated to accept `impl Executor` |
| `apps/backend/crates/db/src/repositories/scene_video_version_artifact_repo.rs` | Updated to accept `impl Executor` |
| `apps/backend/crates/db/src/repositories/avatar_review_repo.rs` | Updated to accept `impl Executor` |
| `apps/backend/crates/db/src/repositories/production_run_repo.rs` | Updated to accept `impl Executor` |

---

## Dependencies

### Existing Components to Reuse
- `pool.begin()` / `tx.commit()` pattern — already in 15+ places
- `is_storage_not_found` helper in `reclamation.rs`
- sqlx `Executor` trait for generic pool/transaction compatibility
- `SceneVideoVersionRepo`, `AvatarReviewRepo`, etc. — existing repo methods

### New Infrastructure Needed
- `impl Executor` signatures on repo methods called within transactions
- No new crates or dependencies

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: `purge_clips` + `impl Executor` updates — Tasks 1.1-1.2 (data loss prevention)
2. Phase 2: Remaining 4 handlers — Tasks 2.1-2.4

**MVP Success Criteria:**
- All 5 handlers wrapped in transactions
- `purge_clips` cannot delete files without successful DB commit
- Partial failures result in clean rollback (no orphan records)
- All existing tests pass

---

## Notes

1. Task 1.1 is the highest priority — it prevents data loss. All other tasks prevent data inconsistency, which is bad but recoverable.
2. Task 1.2 (updating repo methods to `impl Executor`) is a prerequisite for all other tasks. Start here, then the transaction wrapping is straightforward.
3. For Task 2.3 (`batch_generate`), `init_scene_generation` may itself do DB writes — it must also use the transaction. Trace the call chain to ensure all writes go through `&mut *tx`.
4. Deadlock prevention: within transactions, always process IDs in sorted ascending order (e.g., `body.version_ids.sort()`).
5. The `impl Executor` approach is the same pattern used by the sqlx documentation and is forward-compatible with any future repository refactoring.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-162
