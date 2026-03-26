# Task List: Derived Clip Import & Review

**PRD Reference:** `design/prds/153-prd-derived-clip-import.md`
**Scope:** Parent-child clip relationships, bulk import (browser + server-side), derived clips tab on avatar detail, provenance tracking in review modal.

## Overview

This feature extends `scene_video_versions` with a self-referencing `parent_version_id` FK so that externally-processed files (LoRA chunks, test renders) can be imported as children of approved clips. All existing review infrastructure (annotations, tags, notes, QA workflow, ClipPlaybackModal) works automatically on derived clips. The bulk of the work is the new import flows (multi-file browser upload, server-side directory scan) and the derived clips tab UI.

### What Already Exists
- `scene_video_versions` table with `source: "imported"` support — `handlers/scene_video_version.rs`
- `ImportClipDialog` — single-file drag-and-drop import dialog
- `ClipPlaybackModal` — full review modal (annotations, tags, notes, QA)
- `useClipsBrowse` hook with pagination and filtering — `hooks/useClipManagement.ts`
- Video processing pipeline (transcode, preview, ffprobe) — inline in import handler
- Entity tags system — works on `scene_video_version` entity type
- `CHARACTER_TABS` array — `features/projects/types.ts`

### What We're Building
1. `parent_version_id` column + migration
2. Extended import endpoint with parent link
3. Server-side path import endpoints (single + batch)
4. `GET /avatars/{id}/derived-clips` grouped listing endpoint
5. `BulkImportDialog` — multi-file upload with parent selector
6. `ScanDirectoryDialog` — server path scan + import
7. `AvatarDerivedClipsTab` — grouped display of derived clips per avatar
8. Parent context badge in `ClipPlaybackModal`

### Key Design Decisions
1. **No new table** — derived clips live in `scene_video_versions` with a parent FK, reusing all existing review tools
2. **Same scene as parent** — a derived clip's `scene_id` matches its parent, maintaining the avatar/scene_type hierarchy
3. **ON DELETE SET NULL** — if a parent is deleted, derived clips become orphans but remain accessible
4. **Source stays "imported"** — derived clips use `source: "imported"` with a non-null `parent_version_id` to distinguish them (no new source constant needed — the presence of a parent IS the distinction)
5. **Original files preserved** — server-side scan copies files into managed storage, never moves

---

## Phase 1: Database Schema

### Task 1.1: Add `parent_version_id` column migration
**File:** `apps/db/migrations/20260326000002_add_parent_version_id.sql`

Add the self-referencing FK to `scene_video_versions`.

```sql
ALTER TABLE scene_video_versions
  ADD COLUMN parent_version_id BIGINT
    REFERENCES scene_video_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_scene_video_versions_parent
  ON scene_video_versions(parent_version_id)
  WHERE parent_version_id IS NOT NULL;
```

**Acceptance Criteria:**
- [ ] Migration adds nullable `parent_version_id BIGINT` column
- [ ] FK references `scene_video_versions(id)` with `ON DELETE SET NULL`
- [ ] Partial index on non-null `parent_version_id` for efficient lookups
- [ ] Migration runs cleanly on existing data (all existing rows get NULL)
- [ ] `sqlx migrate run` succeeds

---

## Phase 2: Backend Models & Repo

### Task 2.1: Add `parent_version_id` to backend model
**File:** `apps/backend/crates/db/src/models/scene_video_version.rs`

Add the field to both the read model and the create struct.

**Changes:**
1. Add `pub parent_version_id: Option<DbId>` to `SceneVideoVersion` struct (after `content_hash`)
2. Add `pub parent_version_id: Option<DbId>` to `CreateSceneVideoVersion` struct

**Acceptance Criteria:**
- [ ] `SceneVideoVersion` struct has `parent_version_id: Option<DbId>`
- [ ] `CreateSceneVideoVersion` struct has `parent_version_id: Option<DbId>`
- [ ] Field is placed consistently with other optional FK fields

### Task 2.2: Update repo COLUMNS constant and create query
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`

**Changes:**
1. Add `parent_version_id` to `COLUMNS` constant
2. Update `create()` method to bind `parent_version_id` in the INSERT
3. Add `list_derived_for_avatar()` method that returns derived clips grouped by parent

```rust
/// List all derived clips (has parent_version_id) for scenes belonging to an avatar.
pub async fn list_derived_for_avatar(
    pool: &PgPool,
    avatar_id: DbId,
) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
    let query = format!(
        "SELECT v.{COLUMNS} FROM scene_video_versions v \
         JOIN scenes s ON s.id = v.scene_id \
         WHERE s.avatar_id = $1 \
           AND v.parent_version_id IS NOT NULL \
           AND v.deleted_at IS NULL \
         ORDER BY v.parent_version_id, v.version_number"
    );
    sqlx::query_as::<_, SceneVideoVersion>(&query)
        .bind(avatar_id)
        .fetch_all(pool)
        .await
}
```

**Acceptance Criteria:**
- [ ] `COLUMNS` includes `parent_version_id`
- [ ] `create()` binds `parent_version_id` from input
- [ ] `list_derived_for_avatar()` returns derived clips ordered by parent then version
- [ ] Existing queries still work (new column is nullable, no breaking change)
- [ ] `cargo check` passes

### Task 2.3: Add `parent_version_id` to browse query
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (or wherever the browse handler lives)

Add optional `parent_version_id` filter param to the browse endpoint's query parameters and SQL.

**Acceptance Criteria:**
- [ ] Browse query accepts optional `parent_version_id` filter
- [ ] When set, only versions with matching `parent_version_id` are returned
- [ ] Special value `"any"` filters for any non-null parent (all derived clips)
- [ ] Existing browse calls without the param are unaffected

---

## Phase 3: Backend Import Endpoints

### Task 3.1: Extend existing import handler with `parent_version_id`
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Modify `import_video()` to read an optional `parent_version_id` multipart field and pass it to the create struct.

**Changes:**
1. In the multipart loop, add handling for `"parent_version_id"` field (parse as `DbId`)
2. When provided, validate the parent exists, belongs to the same scene, and has `qa_status: "approved"`
3. Set `parent_version_id` on the `CreateSceneVideoVersion`

**Acceptance Criteria:**
- [ ] Multipart form accepts optional `parent_version_id` text field
- [ ] Validation: parent must exist, same scene_id, not deleted
- [ ] Validation: parent must be approved (`qa_status = "approved"`)
- [ ] Returns 400 if parent doesn't exist or belongs to different scene
- [ ] Returns 400 if parent is not approved
- [ ] Created version has `source: "imported"` and `parent_version_id` set
- [ ] Existing imports without `parent_version_id` continue to work (backward-compatible)

### Task 3.2: Create server-side single-file import endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New handler `import_from_path()` that imports a video from a server-side filesystem path.

```rust
#[derive(Debug, Deserialize)]
pub struct ImportFromPathRequest {
    pub path: String,
    pub parent_version_id: Option<DbId>,
    pub notes: Option<String>,
}
```

**Process:**
1. Validate the path exists and is a video file (mp4/webm/mov)
2. Copy file into managed storage (do NOT move — preserve original)
3. Run same processing as browser import: content hash, ffprobe metadata, transcode if needed, generate preview
4. Create `SceneVideoVersion` with `source: "imported"` and optional parent link
5. Return the created version

**Acceptance Criteria:**
- [ ] Endpoint `POST /scenes/{scene_id}/versions/import-from-path`
- [ ] Validates path exists and is a supported video extension
- [ ] Copies file to managed storage (original preserved)
- [ ] Runs ffprobe for metadata extraction
- [ ] Transcodes to H.264 if needed
- [ ] Generates preview thumbnail
- [ ] Content hash computed for dedup
- [ ] Parent validation (same rules as Task 3.1)
- [ ] Returns 400 for invalid path, unsupported format, or missing file
- [ ] Returns 201 with created version

### Task 3.3: Create server-side batch import endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New handler `import_batch_from_paths()` that imports multiple files in one call.

```rust
#[derive(Debug, Deserialize)]
pub struct ImportBatchFromPathsRequest {
    pub paths: Vec<String>,
    pub parent_version_id: Option<DbId>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BatchImportResult {
    pub imported: Vec<SceneVideoVersion>,
    pub failed: Vec<BatchImportError>,
}

#[derive(Debug, Serialize)]
pub struct BatchImportError {
    pub path: String,
    pub error: String,
}
```

**Process:** Iterate paths, call the same import logic as Task 3.2 for each. Collect successes and failures. Return combined result.

**Acceptance Criteria:**
- [ ] Endpoint `POST /scenes/{scene_id}/versions/import-batch-from-paths`
- [ ] Accepts array of paths with shared `parent_version_id` and `notes`
- [ ] Processes each file independently — one failure doesn't block others
- [ ] Returns `{ imported: [...], failed: [{ path, error }] }`
- [ ] Validates parent once (not per-file)
- [ ] Reasonable limit on batch size (e.g. 200 files max)

### Task 3.4: Create directory scan endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New handler `scan_directory()` that lists video files in a server-side directory without importing them.

```rust
#[derive(Debug, Deserialize)]
pub struct ScanDirectoryRequest {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct ScanDirectoryResult {
    pub files: Vec<ScannedFile>,
}

#[derive(Debug, Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
}
```

**Acceptance Criteria:**
- [ ] Endpoint `POST /api/v1/scan-directory` (not scene-scoped — reusable)
- [ ] Lists `.mp4`, `.webm`, `.mov` files in the given directory (non-recursive)
- [ ] Returns filename, full path, and file size for each
- [ ] Returns 400 if path doesn't exist or isn't a directory
- [ ] Does NOT import anything — just lists files for selection

### Task 3.5: Register new routes
**File:** `apps/backend/crates/api/src/routes/scene.rs`

Add the new endpoints to the scene version router.

**Acceptance Criteria:**
- [ ] `POST /{scene_id}/versions/import-from-path` → `import_from_path`
- [ ] `POST /{scene_id}/versions/import-batch-from-paths` → `import_batch_from_paths`
- [ ] `POST /scan-directory` registered at the top-level API router (not scene-scoped)
- [ ] Body size limits appropriate (import-from-path: no body limit needed; scan: small JSON)

---

## Phase 4: Backend Derived Clips Listing

### Task 4.1: Create derived clips listing endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New handler `list_derived_clips()` that returns derived clips for an avatar, grouped by parent.

**Response structure:**
```rust
#[derive(Debug, Serialize)]
pub struct DerivedClipGroup {
    pub parent: SceneVideoVersion,
    pub parent_scene_type: String,
    pub parent_track: Option<String>,
    pub clips: Vec<SceneVideoVersion>,
}
```

**Acceptance Criteria:**
- [ ] Endpoint `GET /avatars/{avatar_id}/derived-clips`
- [ ] Returns derived clips grouped by parent version
- [ ] Each group includes parent metadata (scene type name, track name)
- [ ] Clips within each group ordered by version_number
- [ ] Empty groups (parent with no derived clips) are excluded
- [ ] Orphaned derived clips (parent deleted → parent_version_id IS NULL but was derived) handled gracefully

### Task 4.2: Register derived clips route
**File:** `apps/backend/crates/api/src/routes/mod.rs` (or avatar routes file)

Mount the new endpoint under the avatar routes.

**Acceptance Criteria:**
- [ ] `GET /avatars/{avatar_id}/derived-clips` → `list_derived_clips`
- [ ] Route is accessible and returns correct data

---

## Phase 5: Frontend Types & Hooks

### Task 5.1: Update `SceneVideoVersion` TypeScript type
**File:** `apps/frontend/src/features/scenes/types.ts`

Add `parent_version_id: number | null` to the interface.

**Acceptance Criteria:**
- [ ] `SceneVideoVersion` has `parent_version_id: number | null`
- [ ] `AnnotationsPage` `toClipShim()` includes `parent_version_id: null`
- [ ] TypeScript compiles cleanly

### Task 5.2: Extend import hook with parent support
**File:** `apps/frontend/src/features/scenes/hooks/useClipManagement.ts`

Update `postClipImport()` to accept optional `parentVersionId` and append it to FormData.

**Changes:**
```typescript
export function postClipImport(
  sceneId: number,
  file: File,
  notes?: string,
  parentVersionId?: number,
) {
  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", notes);
  if (parentVersionId) formData.append("parent_version_id", String(parentVersionId));
  return api.raw(`/scenes/${sceneId}/versions/import`, { method: "POST", body: formData });
}
```

**Acceptance Criteria:**
- [ ] `postClipImport` accepts optional `parentVersionId` parameter
- [ ] `useImportClip` mutation type updated to include `parentVersionId`
- [ ] Existing callers without `parentVersionId` are unaffected

### Task 5.3: Create derived clips hooks
**File:** `apps/frontend/src/features/avatars/hooks/use-derived-clips.ts`

New hooks for the derived clips tab.

```typescript
// Query: fetch derived clips grouped by parent
export function useDerivedClips(avatarId: number)

// Mutation: import from server path
export function useImportFromPath(sceneId: number)

// Mutation: batch import from server paths
export function useBatchImportFromPaths(sceneId: number)

// Mutation: scan directory
export function useScanDirectory()
```

**Acceptance Criteria:**
- [ ] `useDerivedClips` fetches from `GET /avatars/{avatarId}/derived-clips`
- [ ] `useImportFromPath` posts to `POST /scenes/{sceneId}/versions/import-from-path`
- [ ] `useBatchImportFromPaths` posts to `POST /scenes/{sceneId}/versions/import-batch-from-paths`
- [ ] `useScanDirectory` posts to `POST /scan-directory`
- [ ] All mutations invalidate derived clips query on success
- [ ] TypeScript types for response shapes defined

---

## Phase 6: Frontend Import Dialogs

### Task 6.1: Create `BulkImportDialog` component
**File:** `apps/frontend/src/features/scenes/BulkImportDialog.tsx`

Multi-file upload dialog with parent clip selector and sequential upload progress.

**Props:**
```typescript
interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  sceneId: number;
  /** Pre-selected parent version (when opened from derived clips tab). */
  parentVersionId?: number;
  /** Available approved versions to select as parent. */
  approvedVersions: { id: number; label: string }[];
}
```

**UI:**
1. Parent clip dropdown (pre-selected if provided, required)
2. Multi-file drop zone (drag multiple files or click to pick)
3. File list with individual status indicators (pending/uploading/done/failed)
4. Progress bar: "Importing 3/12..."
5. Notes field (shared across all files)
6. Cancel / Start Import buttons
7. Summary on completion: "10 imported, 2 failed"

**Acceptance Criteria:**
- [ ] Accepts multiple video files via drag-and-drop or file picker
- [ ] Parent selector dropdown populated with approved versions
- [ ] Files upload sequentially with per-file status indicator
- [ ] Overall progress bar shows N/total
- [ ] Failed files show error message but don't block remaining
- [ ] Completion summary with counts
- [ ] "Done" button closes dialog and invalidates queries
- [ ] Each file calls `postClipImport()` with the selected parent

### Task 6.2: Create `ScanDirectoryDialog` component
**File:** `apps/frontend/src/features/scenes/ScanDirectoryDialog.tsx`

Server-side directory scan dialog: enter path → see files → select → import.

**Props:**
```typescript
interface ScanDirectoryDialogProps {
  open: boolean;
  onClose: () => void;
  sceneId: number;
  parentVersionId?: number;
  approvedVersions: { id: number; label: string }[];
}
```

**UI flow:**
1. **Step 1 — Scan:** Text input for server path + "Scan" button. Shows scanned file list with checkboxes, filename, and size.
2. **Step 2 — Configure:** Parent selector, optional notes, "Select All" / "Deselect All" toggles.
3. **Step 3 — Import:** Progress indicator, results summary.

**Acceptance Criteria:**
- [ ] Path input with "Scan" button calls `useScanDirectory`
- [ ] Scanned files shown in a scrollable list with checkboxes
- [ ] Select all / deselect all toggles
- [ ] Parent selector required before import
- [ ] "Import Selected" calls `useBatchImportFromPaths` with checked paths
- [ ] Progress indicator during import
- [ ] Results summary showing imported/failed counts
- [ ] Error handling for invalid paths, no files found

---

## Phase 7: Frontend Derived Clips Tab

### Task 7.1: Add "Derived" tab to CHARACTER_TABS
**File:** `apps/frontend/src/features/projects/types.ts`

Add the new tab entry to the tabs array.

```typescript
{ id: "derived", label: "Derived" },
```

Place it after "scenes" since it's closely related.

**Acceptance Criteria:**
- [ ] `CHARACTER_TABS` includes `{ id: "derived", label: "Derived" }`
- [ ] Tab appears in avatar detail page between Scenes and Metadata (or similar logical position)

### Task 7.2: Create `AvatarDerivedClipsTab` component
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx`

Main tab component showing derived clips grouped by parent.

**Props:**
```typescript
interface AvatarDerivedClipsTabProps {
  avatarId: number;
  projectId: number;
  pipelineId?: number;
}
```

**UI structure:**
- Toolbar: [Import] [Scan] buttons + tag filter
- Collapsible groups, each headed by the parent clip:
  - Header: scene type, track, version number, QA badge, thumbnail
  - Child rows: derived clip thumbnail, filename (from notes or file_path basename), duration, tags, QA status, annotation count
  - Click row → open `ClipPlaybackModal`
- Empty state when no derived clips exist

**Acceptance Criteria:**
- [ ] Fetches derived clips via `useDerivedClips(avatarId)`
- [ ] Groups displayed as collapsible sections per parent clip
- [ ] Parent header shows scene type, track, version, approval status
- [ ] Each derived clip row shows thumbnail, name, duration, tags, QA status, annotation count
- [ ] Clicking a clip opens `ClipPlaybackModal` with full review tools
- [ ] "Import" button opens `BulkImportDialog`
- [ ] "Scan" button opens `ScanDirectoryDialog`
- [ ] Empty state with descriptive message when no derived clips
- [ ] Loading state uses `LoadingPane`

### Task 7.3: Wire `AvatarDerivedClipsTab` into `AvatarDetailPage`
**File:** `apps/frontend/src/features/avatars/AvatarDetailPage.tsx`

Add the conditional render block for the derived tab.

```typescript
{activeTab === "derived" && (
  <AvatarDerivedClipsTab
    key={avatarId}
    avatarId={avatarId}
    projectId={projectId}
    pipelineId={pipelineCtx?.pipelineId}
  />
)}
```

**Acceptance Criteria:**
- [ ] Derived tab renders `AvatarDerivedClipsTab` when active
- [ ] Tab receives `avatarId`, `projectId`, and `pipelineId`
- [ ] Tab is lazy — only fetches data when selected
- [ ] TypeScript compiles cleanly

---

## Phase 8: Frontend Integration

### Task 8.1: Add parent context badge to `ClipPlaybackModal`
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

When viewing a derived clip (clip has `parent_version_id`), show a provenance badge in the modal.

**Changes:**
1. Check `clip.parent_version_id !== null`
2. If present, render a small badge below the video: "Derived from: {scene_type} v{parent_version}"
3. Badge is clickable — fetches parent clip data and opens it (or navigates to it)

**Acceptance Criteria:**
- [ ] Badge appears only when `clip.parent_version_id` is not null
- [ ] Badge text shows parent scene type and version number
- [ ] Badge styled consistently (monospace, muted text, amber accent for "derived")
- [ ] Non-derived clips show no badge (backward-compatible)
- [ ] TypeScript compiles cleanly

### Task 8.2: Add "Derived" source filter to scenes browse page
**File:** `apps/frontend/src/app/pages/ScenesPage.tsx`

Extend the source filter to include a "Derived" option that filters for clips with a non-null `parent_version_id`.

**Acceptance Criteria:**
- [ ] Source filter dropdown includes "Derived" option
- [ ] "Derived" passes `parent_version_id: "any"` (or equivalent) to the browse query
- [ ] Derived clips in list/grid view show a "derived from" indicator
- [ ] Existing "All", "Generated", "Imported" filters continue to work

---

## Relevant Files

| File | Action | Description |
|------|--------|-------------|
| `apps/db/migrations/20260326000002_add_parent_version_id.sql` | **Create** | Migration for parent FK column |
| `apps/backend/crates/db/src/models/scene_video_version.rs` | **Modify** | Add field to model + create struct |
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | **Modify** | Update COLUMNS, create query, add derived listing |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | **Modify** | Extend import, add path import + batch + scan handlers |
| `apps/backend/crates/api/src/routes/scene.rs` | **Modify** | Register new routes |
| `apps/frontend/src/features/scenes/types.ts` | **Modify** | Add `parent_version_id` to TS type |
| `apps/frontend/src/features/scenes/hooks/useClipManagement.ts` | **Modify** | Extend import hook with parent param |
| `apps/frontend/src/features/avatars/hooks/use-derived-clips.ts` | **Create** | Hooks for derived clips, path import, scan |
| `apps/frontend/src/features/scenes/BulkImportDialog.tsx` | **Create** | Multi-file upload dialog |
| `apps/frontend/src/features/scenes/ScanDirectoryDialog.tsx` | **Create** | Server-side scan + import dialog |
| `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx` | **Create** | Derived clips tab component |
| `apps/frontend/src/features/projects/types.ts` | **Modify** | Add "derived" to CHARACTER_TABS |
| `apps/frontend/src/features/avatars/AvatarDetailPage.tsx` | **Modify** | Wire derived tab |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | **Modify** | Add parent context badge |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | **Modify** | Add "Derived" source filter |
| `apps/frontend/src/app/pages/AnnotationsPage.tsx` | **Modify** | Add `parent_version_id` to `toClipShim` |

---

## Dependencies

### Existing Components to Reuse
- `ImportClipDialog` pattern from `features/scenes/ImportClipDialog.tsx` — reference for file upload UX
- `ClipPlaybackModal` from `features/scenes/ClipPlaybackModal.tsx` — review modal (zero changes for basic support)
- `useClipsBrowse` from `hooks/useClipManagement.ts` — browse query infrastructure
- `postClipImport` from `hooks/useClipManagement.ts` — existing upload function
- `TagInput` / `TagFilter` from `components/domain/` — labeling system
- `CollapsibleSection` or manual `useState` expand/collapse — for grouping
- `ClipCard` pattern from `features/scenes/ClipCard.tsx` — row rendering reference
- Video processing utilities in the import handler — transcode, preview, ffprobe

### New Infrastructure Needed
- `parent_version_id` column (Task 1.1)
- Server-side file operations: copy, directory listing (Tasks 3.2-3.4)
- `BulkImportDialog` component (Task 6.1)
- `ScanDirectoryDialog` component (Task 6.2)
- `AvatarDerivedClipsTab` component (Task 7.2)
- `use-derived-clips.ts` hooks (Task 5.3)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Task 1.1
2. Phase 2: Backend Models & Repo — Tasks 2.1-2.3
3. Phase 3: Backend Import Endpoints — Tasks 3.1-3.5
4. Phase 4: Backend Derived Clips Listing — Tasks 4.1-4.2
5. Phase 5: Frontend Types & Hooks — Tasks 5.1-5.3
6. Phase 6: Frontend Import Dialogs — Tasks 6.1-6.2
7. Phase 7: Frontend Derived Clips Tab — Tasks 7.1-7.3
8. Phase 8: Frontend Integration — Tasks 8.1-8.2

**MVP Success Criteria:**
- Can import a single file with parent link via the existing import flow
- Can bulk-upload multiple files linked to an approved parent clip
- Can scan a server directory and import selected files
- Derived clips appear in a dedicated tab on avatar detail, grouped by parent
- All review tools (annotations, tags, notes, QA) work on derived clips
- ClipPlaybackModal shows provenance badge for derived clips
- Scenes browse page can filter for derived clips
- `npx tsc --noEmit` passes with zero errors

### Post-MVP Enhancements
- Auto-scan watched directories (PRD Req 2.1)
- Derived clip comparison view with parent (PRD Req 2.2)

---

## Notes

1. **No new source constant needed** — Derived clips use `source: "imported"` + non-null `parent_version_id`. The browse filter distinguishes them by the FK, not a new source value. This avoids changing the `source` union type everywhere.
2. **Server-side file operations** — The scan and path-import endpoints read from the server filesystem. Ensure the backend process has read access to the directories users will scan. Consider a configurable allowlist of scannable root paths for security.
3. **Content hash dedup** — The existing import handler computes SHA256 hashes. If the same file is imported twice (even under different parents), the content_hash unique constraint will reject the duplicate. This is desirable behavior.
4. **Processing time** — Each imported file goes through transcode + preview generation. For large batches (50+ files), the batch endpoint should process files sequentially to avoid resource exhaustion. Consider a background job for very large batches (post-MVP).
5. **File size** — The existing 500MB per-file limit applies. Server-side imports share this limit for consistency.

---

## Version History

- **v1.0** (2026-03-26): Initial task list creation from PRD-153
