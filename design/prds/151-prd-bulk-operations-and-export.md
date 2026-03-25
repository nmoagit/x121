# PRD-151: Bulk Selection, Operations & Export

**Document ID:** 151-prd-bulk-operations-and-export
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

---

## 1. Introduction/Overview

The Scenes browse page (`ScenesPage`) and Media browse page (`MediaPage`) currently support per-item approve/reject actions but lack any multi-select capability. When working with hundreds of clips or media variants, users must click approve/reject one at a time, which is extremely slow for QA review workflows.

This PRD adds bulk selection (checkbox-based multi-select), bulk operations (approve, reject, add label, remove label), and bulk export (download selected files as split RAR archives with a metadata manifest). These capabilities apply symmetrically to both the Scenes and Media browse pages, sharing a common selection model and action bar component.

The export feature is particularly important for delivery workflows: users need to package approved clips or images for external handoff, with archives split at a configurable size to avoid oversized downloads.

## 2. Related PRDs & Dependencies

### Depends On
- PRD-01: Project, Avatar & Scene Data Model (scene/avatar/project entities)
- PRD-21: Media Variants (media variant entity and browse API)
- PRD-47: Tag System (existing `bulk-apply` and `bulk-remove` endpoints at `/api/v1/tags/bulk-apply` and `/api/v1/tags/bulk-remove`)
- PRD-07: Job System (background job infrastructure for async export)
- PRD-121: Clip QA (approve/reject/unapprove workflows)
- PRD-138: Multi-Pipeline Architecture (pipeline-scoped context)

### Extends
- PRD-121: Extends clip QA with bulk approve/reject
- PRD-47: Reuses existing bulk tag apply/remove endpoints from the frontend

## 3. Goals

### Primary Goals
1. Allow users to select multiple items on both browse pages (page-level and cross-page)
2. Apply bulk approve/reject to all selected clips or media variants in a single action
3. Apply or remove labels to/from all selected items in a single action
4. Export selected files as split RAR archives with a metadata manifest

### Secondary Goals
1. Provide "Select All Matching" to select all items across all pages matching current filters
2. Show clear selection state feedback (count, highlight, action bar)
3. Keep the selection model generic so it can be reused on other browse pages in the future

## 4. User Stories

1. **As a QA reviewer**, I want to select 50 clips and approve them all at once, so I can review a batch efficiently instead of clicking 50 times.
2. **As a QA reviewer**, I want to reject all selected clips with a single reason, so I can process bad batches quickly.
3. **As a content manager**, I want to add a label like "delivery-v2" to all selected media variants, so I can tag a batch for export tracking.
4. **As a content manager**, I want to remove a label from selected items that were tagged incorrectly.
5. **As a delivery coordinator**, I want to export all approved clips as RAR files split into 500MB parts, so I can upload them to a delivery platform with file size limits.
6. **As a delivery coordinator**, I want the export to include a manifest CSV listing each file's avatar, scene type, track, version, labels, and status, so I can cross-reference files with the database.
7. **As a user**, I want to "Select All Matching" so I can operate on the full filtered result set without paginating through every page.

## 5. Functional Requirements

### Phase 1: MVP — Bulk Selection & Operations

#### Requirement 1.1: Selection Checkboxes on Browse Items

**Description:** Add a checkbox to each item in both list and grid views on both ScenesPage and MediaPage. Clicking the checkbox toggles selection for that item. The item card should show a visual highlight (e.g., blue border or background tint) when selected.

**Acceptance Criteria:**
- [ ] Each `BrowseClipItem` and `BrowseClipCard` renders a checkbox in the top-left area
- [ ] Each `BrowseVariantItem` and `BrowseVariantCard` renders a checkbox in the top-left area
- [ ] Clicking the checkbox toggles the item's selected state without triggering navigation or playback
- [ ] Selected items show a distinct visual treatment (border color change or overlay)
- [ ] Selection state persists when switching between list and grid view modes

**Technical Notes:**
- Use a `useBulkSelection` custom hook that manages a `Set<number>` of selected IDs
- The hook should be shared between both pages via a generic interface

#### Requirement 1.2: Select All / Clear Selection Controls

**Description:** Add a "Select All" checkbox in the toolbar that selects/deselects all items on the current page. Add a "Select All Matching (N)" link that selects ALL items across all pages matching the current filters. Add a "Clear Selection" button.

**Acceptance Criteria:**
- [ ] "Select All" checkbox in toolbar selects all items on the current page
- [ ] "Select All" checkbox shows indeterminate state when some (but not all) page items are selected
- [ ] When all page items are selected, a banner appears: "All {pageSize} items on this page are selected. Select all {total} matching items?"
- [ ] Clicking "Select all {total} matching items" sets a `selectAllMatching` flag (no need to fetch all IDs)
- [ ] "Clear Selection" button clears all selected IDs and the `selectAllMatching` flag
- [ ] Selection count badge shows "{N} selected" in the toolbar
- [ ] Changing filters clears the selection

**Technical Notes:**
- When `selectAllMatching` is true, bulk operation requests send the current filter parameters instead of explicit IDs — the backend resolves matching IDs server-side

#### Requirement 1.3: Bulk Action Bar

**Description:** When one or more items are selected, a sticky bulk action bar appears at the bottom of the page (or top, below filters). The bar shows the selection count and action buttons.

**Acceptance Criteria:**
- [ ] Bar appears only when selection count > 0
- [ ] Bar displays: "{N} selected" (or "All {total} matching" when selectAllMatching is active)
- [ ] Bar contains buttons: "Approve All", "Reject All", "Add Label", "Remove Label", "Export Selected"
- [ ] Bar has a "Clear" button to deselect all
- [ ] Bar is sticky (stays visible while scrolling)
- [ ] Bar uses the design system's dark theme treatment (consistent with existing toolbar patterns)

**Technical Notes:**
- Create a shared `BulkActionBar` component in `@/components/domain/` that both pages use

#### Requirement 1.4: Bulk Approve

**Description:** Clicking "Approve All" approves all selected clips (sets `qa_status` to `approved`) or media variants (sets `status_id` to 2). Shows a confirmation dialog with the count.

**Acceptance Criteria:**
- [ ] Confirmation dialog: "Approve {N} items?"
- [ ] Backend endpoint `POST /api/v1/scene-video-versions/bulk-approve` accepts `{ ids: number[] }` or `{ filters: BrowseClipsParams }` when selectAllMatching is true
- [ ] Backend endpoint `POST /api/v1/media-variants/bulk-approve` accepts `{ ids: number[] }` or `{ filters: BrowseVariantsParams }` when selectAllMatching is true
- [ ] Backend updates all matching items in a single SQL statement (not N individual queries)
- [ ] Backend updates parent scene statuses accordingly (same logic as single approve)
- [ ] Returns `{ updated: number }` with the count of affected rows
- [ ] Frontend clears selection and invalidates browse queries on success
- [ ] Shows toast: "Approved {N} items"

**Technical Notes:**
- Use `UPDATE ... WHERE id = ANY($1::bigint[])` for ID-based bulk
- For filter-based bulk, reuse the same WHERE clause from the browse query
- Parent scene status updates need a batch approach: collect distinct `scene_id` values and update each

#### Requirement 1.5: Bulk Reject

**Description:** Clicking "Reject All" opens a dialog requesting a rejection reason (required), then rejects all selected items.

**Acceptance Criteria:**
- [ ] Dialog with required "Reason" text input and count display
- [ ] Backend endpoint `POST /api/v1/scene-video-versions/bulk-reject` accepts `{ ids: number[], reason: string }` or `{ filters: BrowseClipsParams, reason: string }`
- [ ] Backend endpoint `POST /api/v1/media-variants/bulk-reject` accepts `{ ids: number[], reason: string }` or `{ filters: BrowseVariantsParams, reason: string }`
- [ ] Backend updates all matching items with the given reason
- [ ] Backend updates parent scene statuses accordingly
- [ ] Returns `{ updated: number }`
- [ ] Frontend clears selection and invalidates queries on success

#### Requirement 1.6: Bulk Add Label

**Description:** Clicking "Add Label" opens a tag input (reusing the existing `TagInput` pattern) that applies the selected label(s) to all selected items.

**Acceptance Criteria:**
- [ ] Dialog with tag autocomplete input (reuse `TagInput` component patterns)
- [ ] Uses the existing `POST /api/v1/tags/bulk-apply` endpoint with `entity_type` = `"scene_video_version"` or `"media_variant"` and `entity_ids` = selected IDs
- [ ] For `selectAllMatching`, backend must first resolve IDs from filters before calling bulk-apply
- [ ] Frontend clears selection and invalidates queries on success
- [ ] Shows toast: "Added label '{name}' to {N} items"

**Technical Notes:**
- The existing `TagRepo::bulk_apply` already supports this. The frontend just needs to collect IDs and call the endpoint.

#### Requirement 1.7: Bulk Remove Label

**Description:** Clicking "Remove Label" opens a tag selector showing labels common to the selection, allowing removal.

**Acceptance Criteria:**
- [ ] Dialog shows a list of labels to choose from (either all pipeline labels or, if feasible, labels common to the selection)
- [ ] Uses the existing `POST /api/v1/tags/bulk-remove` endpoint with `entity_type` and `entity_ids`
- [ ] Frontend clears selection and invalidates queries on success
- [ ] Shows toast: "Removed label '{name}' from {N} items"

### Phase 2: Bulk Export

#### Requirement 2.1: Export Job Creation

**Description:** Clicking "Export Selected" in the bulk action bar initiates a background export job. The backend collects the selected files, packages them into split RAR archives, and provides download links when ready.

**Acceptance Criteria:**
- [ ] Backend endpoint `POST /api/v1/exports` accepts: `{ entity_type: "scene_video_version" | "media_variant", ids?: number[], filters?: object, split_size_mb?: number }`
- [ ] `split_size_mb` defaults to 500, min 50, max 2000
- [ ] Endpoint returns immediately with `{ job_id: number, status: "queued" }` (HTTP 202 Accepted)
- [ ] Backend creates a row in an `export_jobs` table tracking the job
- [ ] A background task picks up the job and begins archiving

**Technical Notes:**
- Use `tokio::spawn` for the background task (simpler than the full ComfyUI job queue for this use case)
- Store the `AppState` clone (it is `Arc`-based) in the spawned task

#### Requirement 2.2: RAR Archive Generation with Splitting

**Description:** The background task reads files from storage, creates RAR archives, and splits them at the configured size boundary. Each part is a standalone file.

**Acceptance Criteria:**
- [ ] Files are read from the storage provider using `state.resolve_to_path()` or `state.storage_provider().download()`
- [ ] Archives use `zip` format (not RAR — RAR is proprietary; ZIP is universally supported and has native Rust crate support)
- [ ] When accumulated size exceeds `split_size_mb`, the current archive is finalized and a new part begins
- [ ] Part naming: `{pipeline_name}_{YYYYMMDD_HHmmss}_part{N}.zip` (e.g., `x121_20260325_143022_part1.zip`)
- [ ] Each archive part is a valid, standalone ZIP file (not a split/spanned archive that requires all parts)
- [ ] Files inside the archive are organized by: `{avatar_name}/{scene_type_or_variant_type}/{filename}`
- [ ] Empty/purged files are skipped with a warning in the manifest
- [ ] Archives are stored in the storage provider under `exports/{job_id}/`

**Technical Notes:**
- Use the `zip` Rust crate (already available or easy to add) for archive creation
- Splitting strategy: track cumulative bytes written. When adding a file would exceed the limit, finalize the current ZIP, increment the part counter, and start a new ZIP.
- For scenes: the source file is at `version.file_path` (resolved via storage provider)
- For media: the source file is at `variant.file_path` (resolved via storage provider)

#### Requirement 2.3: Manifest File

**Description:** Each export includes a `manifest.csv` file in the first archive part. The manifest lists every file in the export with its metadata.

**Acceptance Criteria:**
- [ ] Manifest is a CSV file with headers
- [ ] For scene exports, columns: `filename`, `archive_part`, `avatar_name`, `project_name`, `scene_type`, `track`, `version_number`, `source`, `qa_status`, `is_final`, `duration_secs`, `file_size_bytes`, `labels`, `created_at`
- [ ] For media exports, columns: `filename`, `archive_part`, `avatar_name`, `project_name`, `variant_type`, `variant_label`, `version`, `provenance`, `status`, `is_hero`, `media_kind`, `file_size_bytes`, `labels`, `created_at`
- [ ] Labels column contains semicolon-separated label names
- [ ] Manifest is always placed in part 1 of the archive

**Technical Notes:**
- Build the CSV in memory using string concatenation (no need for a CSV crate for this simple case) or use the `csv` crate if already available

#### Requirement 2.4: Export Job Status & Download

**Description:** The frontend polls for export job status and shows download links when complete.

**Acceptance Criteria:**
- [ ] `GET /api/v1/exports/{job_id}` returns job status: `queued`, `processing`, `completed`, `failed`
- [ ] When `completed`, response includes `parts: [{ part_number: number, filename: string, size_bytes: number, download_url: string }]`
- [ ] `GET /api/v1/exports/{job_id}/download/{part_number}` streams the archive file
- [ ] Frontend shows a progress indicator while the job is processing
- [ ] Frontend shows download links for each part when complete
- [ ] Failed jobs show an error message
- [ ] Export jobs are automatically cleaned up (files deleted) after 24 hours

**Technical Notes:**
- Frontend can poll with `useQuery` and `refetchInterval: 2000` while status is not terminal
- Download endpoint uses `axum::body::StreamBody` to stream from storage
- Cleanup: either a periodic background task or checked on access

#### Requirement 2.5: Export Database Table

**Description:** A new `export_jobs` table tracks export requests and their output.

**Acceptance Criteria:**
- [ ] Table schema:
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
- [ ] `filter_snapshot` stores the original filter params for audit/replay
- [ ] `parts` JSONB array stores `[{ part_number, filename, storage_key, size_bytes }]`
- [ ] `expires_at` is set to `now() + interval '24 hours'` on creation

## 6. Non-Functional Requirements

### Performance
- Bulk approve/reject must complete in under 5 seconds for up to 1000 items
- Bulk operations use single SQL statements with `ANY()` arrays, not individual queries
- Export archive creation should process at least 50MB/s of source files
- Selection state changes must be instant (local state only, no server calls)

### Security
- All bulk endpoints require authentication (`AuthUser`)
- Export download URLs are authenticated (no public/unsigned URLs)
- Export files are cleaned up after 24 hours to prevent storage bloat
- Bulk operations respect the same authorization rules as individual operations

## 7. Non-Goals (Out of Scope)

- **Bulk delete** — too destructive for a first iteration; can be added later
- **Cross-page type selection** — cannot select both clips and media variants in one operation
- **Real-time progress** — export uses polling, not WebSocket push (simpler for MVP)
- **RAR format** — using ZIP instead (RAR is proprietary, no native Rust support)
- **Resumable exports** — if export fails partway, it must restart from scratch
- **Export scheduling** — exports run immediately on request, no scheduled exports
- **Bulk edit metadata** — only approve/reject/label operations in this PRD

## 8. Design Considerations

### Bulk Action Bar Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  ☑ 42 selected  │  Approve All  │  Reject All  │  + Label  │  - Label  │  Export  │  Clear  │
└─────────────────────────────────────────────────────────────────────┘
```
- Sticky at the bottom of the viewport
- Dark background matching the terminal aesthetic of the browse pages
- Monospace font for consistency with the existing design language
- Buttons use the existing `Button` component with `size="xs"`

### Grid View Checkbox Placement
- Checkbox overlaid in the top-left corner of the card, with a semi-transparent background
- On hover: checkbox becomes more visible
- When selected: checkbox is always fully visible

### List View Checkbox Placement
- Checkbox as the first element in the row, before the thumbnail

## 9. Technical Considerations

### Existing Code to Reuse
- **`TagRepo::bulk_apply` and `TagRepo::bulk_remove`** — already handle bulk label operations. The frontend just needs to collect IDs and call these existing endpoints.
- **`BrowseClipsParams` / `BrowseVariantsParams`** — reuse these structs for the `selectAllMatching` filter passthrough
- **`state.resolve_to_path()` and `state.storage_provider()`** — for reading source files during export
- **`useBrowseApproveClip` / `useBrowseRejectClip`** — patterns to follow for new bulk hooks
- **`TagInput` component** — reuse for the "Add Label" dialog
- **`BulkApplyRequest` / `BulkRemoveRequest`** — existing tag bulk request types in `x121_db::models::tag`
- **`MultiFilterBar`** — existing filter bar pattern (bulk action bar can sit below it or as a separate sticky bar)

### New Frontend Components
- `useBulkSelection(items: { id: number }[])` — generic selection hook in `@/hooks/`
- `BulkActionBar` — shared domain component in `@/components/domain/`
- `BulkRejectDialog` — modal with reason input
- `BulkLabelDialog` — modal with tag input
- `ExportStatusPanel` — inline panel or toast showing export progress and download links
- `useBulkApproveClips` / `useBulkRejectClips` — mutation hooks
- `useBulkApproveVariants` / `useBulkRejectVariants` — mutation hooks
- `useCreateExport` / `useExportStatus` — export hooks

### Database Changes
- New table: `export_jobs` (see Requirement 2.5)
- No changes to existing tables

### API Changes

**New Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/scene-video-versions/bulk-approve` | Approve multiple clips |
| POST | `/api/v1/scene-video-versions/bulk-reject` | Reject multiple clips |
| POST | `/api/v1/media-variants/bulk-approve` | Approve multiple variants |
| POST | `/api/v1/media-variants/bulk-reject` | Reject multiple variants |
| POST | `/api/v1/exports` | Create an export job |
| GET | `/api/v1/exports/{id}` | Get export job status |
| GET | `/api/v1/exports/{id}/download/{part}` | Download an export part |

**Request Bodies:**

```json
// POST /api/v1/scene-video-versions/bulk-approve
{
  "ids": [1, 2, 3],              // explicit IDs (when selectAllMatching is false)
  // OR
  "filters": {                    // pass-through (when selectAllMatching is true)
    "project_id": 5,
    "pipeline_id": 1,
    "qa_status": "pending",
    "scene_type": "closeup",
    "tag_ids": "4,7"
  }
}

// POST /api/v1/scene-video-versions/bulk-reject
{
  "ids": [1, 2, 3],
  "reason": "Low quality batch"
}

// POST /api/v1/exports
{
  "entity_type": "scene_video_version",
  "ids": [1, 2, 3],
  "split_size_mb": 500
}
```

**Response Bodies:**

```json
// POST /api/v1/scene-video-versions/bulk-approve → 200
{ "data": { "updated": 42 } }

// POST /api/v1/exports → 202
{ "data": { "id": 17, "status": "queued", "item_count": 42 } }

// GET /api/v1/exports/17 → 200 (completed)
{
  "data": {
    "id": 17,
    "status": "completed",
    "item_count": 42,
    "parts": [
      { "part_number": 1, "filename": "x121_20260325_143022_part1.zip", "size_bytes": 524288000 },
      { "part_number": 2, "filename": "x121_20260325_143022_part2.zip", "size_bytes": 312000000 }
    ]
  }
}
```

### ZIP Splitting Algorithm (Detail)

The splitting logic works as follows:

```
initialize part_number = 1
initialize current_zip = new ZipWriter for part 1
initialize current_size = 0
initialize manifest_rows = []

for each item in selected_items:
    resolve file_path to absolute path via storage provider
    read file bytes (skip if file missing or purged, log warning)

    file_size = bytes.len()

    // If adding this file would exceed the limit AND the current zip isn't empty,
    // finalize current zip and start a new part.
    // Exception: if the single file alone exceeds the limit, it still goes into its
    // own part (we never split a single file across parts).
    if current_size + file_size > split_size_bytes AND current_size > 0:
        finalize current_zip
        upload current_zip to storage as exports/{job_id}/part{part_number}.zip
        part_number += 1
        current_zip = new ZipWriter for next part
        current_size = 0

    write file to current_zip at path: {avatar_name}/{scene_type}/{original_filename}
    current_size += file_size
    append row to manifest_rows

// Write manifest.csv to the FIRST zip (reopen if needed, or buffer it)
// Actually: write manifest as the first entry of part 1 before any files.
// Implementation: build manifest in memory first (requires a two-pass or deferred write).
// Simpler approach: write manifest to EVERY part, or write manifest to the LAST part.
// Chosen approach: write manifest to part 1. Pre-allocate space by writing a placeholder,
// then seek back and overwrite, OR just accept that manifest goes into the last part.
// Simplest: write manifest into a separate small file in every part.
// DECISION: Write manifest.csv into part 1 only. Build it in memory during processing,
// then add it to part 1 after all files are distributed. This means part 1 is built in
// two passes: first collect which files go into part 1, then rewrite part 1 with
// manifest prepended. OR: buffer part 1 entries in memory while processing all items,
// only finalize part 1 at the end.
//
// SIMPLEST IMPLEMENTATION: Process all items, tracking which part each goes to.
// Then in a second pass, build each zip. This requires holding file paths (not bytes)
// in memory and re-reading files. This is the cleanest approach.

finalize last zip
upload to storage
update export_jobs row with parts array and status = 'completed'
```

**Recommended two-pass approach:**

1. **Planning pass:** Iterate all items, accumulate file sizes, assign each to a part number based on the split threshold. Build the manifest CSV. No file I/O beyond checking file sizes.

2. **Archive pass:** For each part, create a ZIP, add the assigned files (reading from storage), add `manifest.csv` to part 1, upload the completed ZIP to storage.

This avoids holding all file bytes in memory simultaneously and cleanly handles manifest placement.

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| No items selected, export clicked | Button disabled when selection is empty |
| Selected item was deleted/purged between selection and action | Skip silently, include in "skipped" count in response |
| File missing from storage during export | Skip file, log warning, note in manifest as "MISSING" |
| Export with 0 exportable files (all purged/missing) | Job completes with 0 parts, status "completed", no downloads |
| Single file larger than split_size_mb | File goes into its own part (part may exceed the limit) |
| User navigates away during export | Export continues in background; user can return to check status |
| Concurrent bulk operations on same items | Last-write-wins (standard optimistic approach) |
| selectAllMatching with filters that return 0 items | Return `{ updated: 0 }` or `{ item_count: 0 }` |
| Bulk approve on already-approved items | No-op for those items (UPDATE WHERE qa_status != 'approved') |
| Export job cleanup | Background task or on-access check deletes expired exports (>24h) |

## 11. Success Metrics

- Bulk approve/reject reduces time-to-review by 10x for batches of 50+ items
- Export of 100 clips (~5GB) completes in under 2 minutes
- Zero data loss: every selected, non-purged file appears in the export archive

## 12. Testing Requirements

### Backend
- Unit test: bulk approve updates correct rows and returns count
- Unit test: bulk reject sets reason on all matching rows
- Unit test: bulk approve with filters resolves correct IDs
- Unit test: ZIP splitting produces correct number of parts at size boundary
- Unit test: manifest CSV contains correct columns and row count
- Integration test: full export flow (create job, process, download parts)
- Integration test: export cleanup removes files after expiry

### Frontend
- Component test: `useBulkSelection` — select, deselect, selectAll, clearAll, selectAllMatching
- Component test: `BulkActionBar` — shows/hides based on selection, displays correct count
- Component test: checkboxes appear in both list and grid views
- Component test: switching view mode preserves selection
- Component test: changing filters clears selection

## 13. Open Questions

1. **Export file format preference:** ZIP is proposed (native Rust support, universal). The user requested RAR, but RAR requires a proprietary binary. Should we use ZIP or investigate calling an external `rar` binary?
2. **Export notification:** Should we add a toast/notification when the export completes if the user is still on the page, or is polling sufficient?
3. **Maximum export size:** Should there be a cap on total export size (e.g., 50GB) or total item count (e.g., 5000 items) to prevent abuse?
4. **Export history:** Should we show a list of recent exports (last 24h) somewhere, or is a single in-progress indicator enough?

## 14. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-25 | Initial draft |
