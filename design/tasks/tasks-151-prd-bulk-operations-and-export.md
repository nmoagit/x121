# Task List: Bulk Selection, Operations & Export

**PRD Reference:** `design/prds/151-prd-bulk-operations-and-export.md`
**Scope:** Multi-select on scenes/media pages, bulk approve/reject/label, split ZIP export with manifest.

## Overview

Add checkbox-based multi-select to both browse pages, bulk operations (approve, reject, add/remove labels), and a background export system that packages selected files into split ZIP archives with a metadata manifest.

### What Already Exists
- Per-item approve/reject/unapprove hooks — **pattern to follow for bulk**
- `TagRepo::bulk_apply` and `TagRepo::bulk_remove` — **reuse directly for label operations**
- `BrowseClipsParams` / `BrowseVariantsParams` — **reuse for filter-based bulk**
- `TagInput` component — **reuse in Add Label dialog**
- `state.resolve_to_path()` — **for reading source files during export**

### What We're Building
1. `useBulkSelection` generic hook
2. Checkboxes on all browse item components (list + grid, scenes + media)
3. `BulkActionBar` sticky component
4. 4 backend bulk approve/reject endpoints
5. Frontend bulk operation dialogs + mutations
6. `export_jobs` table + model + repo
7. Export create/status/download endpoints
8. ZIP archive generation with splitting + manifest
9. Frontend export UI with polling

### Key Design Decisions
1. ZIP format (not RAR — no native Rust support for RAR creation)
2. Two-pass splitting: plan file→part assignments, then build archives
3. `selectAllMatching` sends filters to backend (not thousands of IDs)
4. Single SQL `UPDATE ... WHERE id = ANY($1)` for bulk operations
5. Background export via `tokio::spawn`, polled from frontend

---

## Phase 1: Bulk Selection

### Task 1.1: useBulkSelection hook
**File:** `apps/frontend/src/hooks/useBulkSelection.ts` (NEW)

Generic selection hook managing a `Set<number>` of selected IDs.

```typescript
interface UseBulkSelectionReturn {
  selectedIds: Set<number>;
  selectedCount: number;
  selectAllMatching: boolean;
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
  selectPage: (ids: number[]) => void;
  deselectPage: (ids: number[]) => void;
  selectAll: (totalCount: number) => void;
  clearAll: () => void;
  isAllPageSelected: (pageIds: number[]) => boolean;
  isIndeterminate: (pageIds: number[]) => boolean;
}
```

**Acceptance Criteria:**
- [ ] `toggle(id)` adds/removes from the set
- [ ] `selectPage(ids)` adds all page IDs
- [ ] `selectAll()` sets `selectAllMatching` flag
- [ ] `clearAll()` resets everything
- [ ] `isAllPageSelected` / `isIndeterminate` for checkbox state
- [ ] Changing filters (via a `resetKey` dep) clears selection

### Task 1.2: Add checkboxes to browse items
**Files:** `apps/frontend/src/app/pages/ScenesPage.tsx`, `apps/frontend/src/app/pages/MediaPage.tsx`

Add checkbox to `BrowseClipItem`, `BrowseClipCard`, `BrowseVariantItem`, `BrowseVariantCard`.

**Acceptance Criteria:**
- [ ] Checkbox on each item (top-left for grid, first element for list)
- [ ] Clicking checkbox toggles selection without triggering navigation/playback
- [ ] Selected items show blue border or tint
- [ ] Selection persists when switching list/grid view
- [ ] `useBulkSelection` hook integrated in both pages

### Task 1.3: Select All controls + BulkActionBar
**File:** `apps/frontend/src/components/domain/BulkActionBar.tsx` (NEW)

Sticky bar at the bottom of the page, shown when selection > 0.

**Acceptance Criteria:**
- [ ] "Select All" checkbox in toolbar (with indeterminate state)
- [ ] Banner: "All {pageSize} on this page selected. Select all {total} matching?"
- [ ] `BulkActionBar` shows: count, Approve, Reject, +Label, -Label, Export, Clear
- [ ] Bar is sticky at bottom, dark bg, monospace font
- [ ] Changing filters clears selection

---

## Phase 2: Backend Bulk Operations

### Task 2.1: Bulk approve/reject endpoints for clips
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

```rust
/// POST /api/v1/scene-video-versions/bulk-approve
/// POST /api/v1/scene-video-versions/bulk-reject
```

Accept `{ ids: Vec<DbId> }` or `{ filters: BrowseClipsParams }`. Use `UPDATE ... WHERE id = ANY($1)`.

**Acceptance Criteria:**
- [ ] `bulk_approve` updates `qa_status = 'approved'` for all IDs
- [ ] `bulk_reject` updates `qa_status = 'rejected'` + sets `qa_rejection_reason`
- [ ] Filter-based mode resolves IDs using the same WHERE clause as browse
- [ ] Returns `{ updated: i64 }`
- [ ] Routes registered
- [ ] `cargo check` passes

### Task 2.2: Bulk approve/reject endpoints for media
**File:** `apps/backend/crates/api/src/handlers/media_variant.rs`

Same pattern for media variants (`status_id = 2` for approve, `status_id = 3` for reject).

**Acceptance Criteria:**
- [ ] `bulk_approve` updates `status_id = 2` for all IDs
- [ ] `bulk_reject` updates `status_id = 3`
- [ ] Filter-based mode supported
- [ ] Returns `{ updated: i64 }`
- [ ] Routes registered

---

## Phase 3: Frontend Bulk Operations

### Task 3.1: Bulk operation hooks
**File:** `apps/frontend/src/features/scenes/hooks/useClipManagement.ts` + `apps/frontend/src/features/media/hooks/use-media-variants.ts`

Add mutation hooks:
- `useBulkApproveClips()` / `useBulkRejectClips()`
- `useBulkApproveVariants()` / `useBulkRejectVariants()`

**Acceptance Criteria:**
- [ ] Each accepts `{ ids: number[] }` or `{ filters: object }`
- [ ] Invalidates browse queries on success
- [ ] Returns `{ updated: number }`

### Task 3.2: Bulk operation dialogs
**Files:** `apps/frontend/src/components/domain/BulkRejectDialog.tsx` (NEW), `apps/frontend/src/components/domain/BulkLabelDialog.tsx` (NEW)

- BulkRejectDialog: reason input (required) + count display
- BulkLabelDialog: tag input for add, tag picker for remove

**Acceptance Criteria:**
- [ ] Reject dialog requires reason before confirming
- [ ] Label dialog reuses `TagInput` patterns
- [ ] Both show selection count
- [ ] Success toast with count

### Task 3.3: Wire bulk operations into pages
**Files:** `ScenesPage.tsx`, `MediaPage.tsx`

Connect `BulkActionBar` buttons to the hooks/dialogs.

**Acceptance Criteria:**
- [ ] Approve All → confirmation → bulk approve → clear selection
- [ ] Reject All → dialog with reason → bulk reject → clear selection
- [ ] Add Label → dialog → bulk apply tags → clear selection
- [ ] Remove Label → dialog → bulk remove tags → clear selection
- [ ] All operations show toast with count

---

## Phase 4: Export Database & Backend

### Task 4.1: Create export_jobs table
**File:** `apps/db/migrations/YYYYMMDD_create_export_jobs.sql`

```sql
CREATE TABLE export_jobs (
    id              BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    requested_by    BIGINT NOT NULL REFERENCES users(id),
    pipeline_id     BIGINT REFERENCES pipelines(id),
    item_count      INTEGER NOT NULL,
    split_size_mb   INTEGER NOT NULL DEFAULT 500,
    filter_snapshot JSONB,
    status          TEXT NOT NULL DEFAULT 'queued',
    parts           JSONB DEFAULT '[]'::jsonb,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Acceptance Criteria:**
- [ ] Table created with all columns
- [ ] Status CHECK constraint (`queued`, `processing`, `completed`, `failed`)
- [ ] `expires_at` defaults to `now() + interval '24 hours'`
- [ ] Updated_at trigger

### Task 4.2: Export model + repo
**Files:** `apps/backend/crates/db/src/models/export_job.rs` (NEW), `apps/backend/crates/db/src/repositories/export_job_repo.rs` (NEW)

**Acceptance Criteria:**
- [ ] `ExportJob` model with all columns
- [ ] `create(pool, input) -> ExportJob`
- [ ] `find_by_id(pool, id) -> Option<ExportJob>`
- [ ] `update_status(pool, id, status, parts?, error?) -> Option<ExportJob>`
- [ ] `list_expired(pool) -> Vec<ExportJob>` for cleanup
- [ ] Registered in mod.rs

### Task 4.3: Export API endpoints
**File:** `apps/backend/crates/api/src/handlers/export.rs` (NEW)

- `POST /api/v1/exports` — create job, spawn background task
- `GET /api/v1/exports/{id}` — get status + parts
- `GET /api/v1/exports/{id}/download/{part}` — stream archive file

**Acceptance Criteria:**
- [ ] Create endpoint returns 202 with job_id
- [ ] Status endpoint returns current status + parts when completed
- [ ] Download endpoint streams the ZIP file
- [ ] Routes registered

### Task 4.4: ZIP archive generation with splitting
**File:** `apps/backend/crates/api/src/background/export_archive.rs` (NEW)

Background task that builds split ZIP archives with manifest.

**Acceptance Criteria:**
- [ ] Two-pass algorithm: plan assignments, then build archives
- [ ] Files organized as `{avatar_name}/{scene_type_or_variant_type}/{filename}`
- [ ] Split at `split_size_mb` boundary (default 500MB)
- [ ] Part naming: `{pipeline}_{timestamp}_part{N}.zip`
- [ ] Manifest CSV in part 1 with all metadata columns
- [ ] Missing/purged files skipped with warning in manifest
- [ ] Archives stored in `exports/{job_id}/`
- [ ] Job status updated to `completed` or `failed`
- [ ] Add `zip` crate to Cargo.toml

---

## Phase 5: Frontend Export UI

### Task 5.1: Export hooks
**File:** `apps/frontend/src/features/exports/hooks/use-exports.ts` (NEW)

- `useCreateExport()` — POST mutation
- `useExportStatus(jobId)` — GET query with `refetchInterval: 2000` while processing

**Acceptance Criteria:**
- [ ] Create returns job_id
- [ ] Status polling stops when status is terminal
- [ ] Types for ExportJob, ExportPart

### Task 5.2: Export button + status panel
**Files:** `apps/frontend/src/components/domain/BulkActionBar.tsx`, page files

Wire Export button → create export → show inline status/download panel.

**Acceptance Criteria:**
- [ ] "Export" button in BulkActionBar creates job
- [ ] Progress indicator while processing
- [ ] Download links for each part when completed
- [ ] Error display on failure
- [ ] Part info: filename + size

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/hooks/useBulkSelection.ts` | NEW: selection hook |
| `apps/frontend/src/components/domain/BulkActionBar.tsx` | NEW: sticky action bar |
| `apps/frontend/src/components/domain/BulkRejectDialog.tsx` | NEW: rejection reason dialog |
| `apps/frontend/src/components/domain/BulkLabelDialog.tsx` | NEW: label add/remove dialog |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | Add checkboxes + bulk integration |
| `apps/frontend/src/app/pages/MediaPage.tsx` | Same |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | Bulk approve/reject endpoints |
| `apps/backend/crates/api/src/handlers/media_variant.rs` | Bulk approve/reject endpoints |
| `apps/db/migrations/..._create_export_jobs.sql` | Export jobs table |
| `apps/backend/crates/db/src/models/export_job.rs` | NEW: export job model |
| `apps/backend/crates/db/src/repositories/export_job_repo.rs` | NEW: export job repo |
| `apps/backend/crates/api/src/handlers/export.rs` | NEW: export endpoints |
| `apps/backend/crates/api/src/background/export_archive.rs` | NEW: ZIP generation |
| `apps/frontend/src/features/exports/hooks/use-exports.ts` | NEW: export hooks |

---

## Dependencies

### Existing Components to Reuse
- `TagRepo::bulk_apply` / `TagRepo::bulk_remove` for label ops
- `BrowseClipsParams` / `BrowseVariantsParams` for filter-based bulk
- `TagInput` component for Add Label dialog
- `state.resolve_to_path()` for file reading during export
- `Chip` component for selected count display

### New Infrastructure Needed
- `zip` Rust crate for archive creation
- `export_jobs` table
- `useBulkSelection` hook
- `BulkActionBar` component
- Export background task system

---

## Implementation Order

### MVP Phase 1: Selection + Operations
1. Task 1.1: useBulkSelection hook
2. Task 1.2: Checkboxes on items
3. Task 1.3: Select All + BulkActionBar
4. Task 2.1: Backend bulk approve/reject (clips)
5. Task 2.2: Backend bulk approve/reject (media)
6. Task 3.1: Frontend bulk hooks
7. Task 3.2: Bulk dialogs
8. Task 3.3: Wire into pages

### MVP Phase 2: Export
9. Task 4.1: Export DB table
10. Task 4.2: Export model + repo
11. Task 4.3: Export API endpoints
12. Task 4.4: ZIP generation with splitting
13. Task 5.1: Export hooks
14. Task 5.2: Export button + status panel

**MVP Success Criteria:**
- Multi-select works on both pages in list and grid views
- Bulk approve/reject processes 100+ items in single action
- Export creates split ZIPs with manifest, downloadable from the UI
- ZIP parts stay under 500MB each

---

## Notes

1. **ZIP not RAR** — RAR has no native Rust creation support. ZIP is universal.
2. **Two-pass export** — plan phase assigns files to parts by size, archive phase builds ZIPs. Avoids holding all bytes in memory.
3. **selectAllMatching** — sends filter params to backend, not IDs. Backend resolves matching IDs server-side.
4. **24h cleanup** — export files auto-expire. Background task or on-access check deletes old exports.
5. **Commit at phase boundaries** — Phase 1 (selection + operations) and Phase 2 (export) are independently useful.

---

## Version History

- **v1.0** (2026-03-25): Initial task list from PRD-151
