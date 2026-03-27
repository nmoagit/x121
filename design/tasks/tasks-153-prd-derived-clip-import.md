# Task List: Derived Clip Import & Review

**PRD Reference:** `design/prds/153-prd-derived-clip-import.md`
**Scope:** Parent-child clip relationships, bulk import (browser + server-side directory scan), derived clips tab on avatar detail, provenance tracking, filename parsing for auto-labeling.

## Overview

This feature extends `scene_video_versions` with a self-referencing `parent_version_id` FK and a `clip_index` for ordering, so externally-processed files (LoRA training chunks, test renders) can be imported as children of approved clips. The server-side directory scan parses the naming convention `{pipeline}_{avatar}_{scene_type}_{track}_v{version}_[{labels}]_clip{NNNN}.mp4` to auto-resolve avatar, scene, parent clip, ordering, and labels. All existing review infrastructure (annotations, tags, notes, QA workflow, ClipPlaybackModal) works automatically on derived clips.

### What Already Exists
- `scene_video_versions` table with `source: "imported"` support — `handlers/scene_video_version.rs`
- `ImportClipDialog` — single-file drag-and-drop import dialog (`features/scenes/ImportClipDialog.tsx`)
- `ClipPlaybackModal` — full review modal with annotations, tags, notes, QA (`features/scenes/ClipPlaybackModal.tsx`)
- `useClipsBrowse` hook with pagination and filtering — `hooks/useClipManagement.ts`
- Video processing pipeline (H.264 transcode, preview gen, ffprobe) — inline in import handler
- Entity tags system — already works on `scene_video_version` entity type
- `CHARACTER_TABS` array — `features/projects/types.ts`

### What We're Building
1. `parent_version_id` + `clip_index` columns on `scene_video_versions`
2. Extended import endpoint with parent link + clip index
3. Server-side single-file and batch-directory import endpoints with filename parsing
4. `GET /avatars/{id}/derived-clips` grouped listing endpoint
5. `BulkImportDialog` — multi-file upload with parent selector
6. `ScanDirectoryDialog` — server path scan + auto-parse + import
7. `AvatarDerivedClipsTab` — grouped display of derived clips per avatar
8. Parent context badge in `ClipPlaybackModal`
9. "Derived" source filter in scenes browse page

### Key Design Decisions
1. **No new table** — derived clips live in `scene_video_versions` with a parent FK, reusing all existing review tools
2. **Filename convention parsing** — server-side scan auto-resolves avatar, scene, track, version, labels, and clip index from folder/file names like `sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4`
3. **Labels applied per-clip** — labels from folder name brackets AND file name brackets are applied to each imported clip as entity tags
4. **Clip ordering preserved** — `clip_index` column stores the sequential chunk number from `_clipNNNN` in the filename
5. **Files copied, not moved** — server-side import preserves originals

---

## Phase 1: Database — Parent Version Relationship + Clip Index

### Task 1.1: Add parent_version_id and clip_index to scene_video_versions
**File:** `apps/db/migrations/20260328000001_add_parent_version_and_clip_index.sql`

Add self-referencing FK for parent-child clip relationships and an integer for preserving chunk ordering.

```sql
ALTER TABLE scene_video_versions
    ADD COLUMN parent_version_id BIGINT REFERENCES scene_video_versions(id) ON DELETE SET NULL,
    ADD COLUMN clip_index INTEGER;

CREATE INDEX idx_svv_parent_version_id ON scene_video_versions (parent_version_id)
    WHERE parent_version_id IS NOT NULL;

COMMENT ON COLUMN scene_video_versions.parent_version_id IS 'Self-referencing FK to the approved clip this was derived from (e.g., LoRA training chunk). NULL for non-derived clips.';
COMMENT ON COLUMN scene_video_versions.clip_index IS 'Sequential ordering for derived clips (e.g., chunk 0, 1, 2...). NULL for non-derived clips.';
```

**Acceptance Criteria:**
- [ ] Migration adds `parent_version_id BIGINT` (nullable) FK with `ON DELETE SET NULL`
- [ ] Migration adds `clip_index INTEGER` (nullable)
- [ ] Partial index on `parent_version_id` for efficient lookups
- [ ] Existing clips unaffected (both columns default to NULL)

### Task 1.2: Update backend SceneVideoVersion model
**File:** `apps/backend/crates/db/src/models/scene_video_version.rs`

Add the new fields to the model struct and the create DTO.

**Acceptance Criteria:**
- [ ] `SceneVideoVersion` struct includes `parent_version_id: Option<DbId>` and `clip_index: Option<i32>`
- [ ] `CreateSceneVideoVersion` includes `parent_version_id: Option<DbId>` and `clip_index: Option<i32>`
- [ ] Column list constants updated in the repository

### Task 1.3: Update frontend SceneVideoVersion type
**File:** `apps/frontend/src/features/scenes/types.ts`

**Acceptance Criteria:**
- [ ] `SceneVideoVersion` interface includes `parent_version_id: number | null` and `clip_index: number | null`
- [ ] `ClipBrowseItem` interface includes `parent_version_id: number | null` and `clip_index: number | null`

---

## Phase 2: Backend — Extended Import & Server-Side Scan Endpoints

### Task 2.1: Extend import handler with parent_version_id and clip_index
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Extend the existing `import_video` handler to accept optional `parent_version_id` and `clip_index` fields in the multipart form.

**Acceptance Criteria:**
- [ ] Import endpoint accepts optional `parent_version_id` text field in multipart
- [ ] Import endpoint accepts optional `clip_index` text field in multipart
- [ ] When `parent_version_id` is provided, validates the parent exists and belongs to the same scene
- [ ] Created version has `source: "imported"`, `parent_version_id`, and `clip_index` set
- [ ] Existing import flow (without parent) continues to work unchanged

### Task 2.2: Create filename parser utility
**File:** `apps/backend/crates/core/src/clip_filename_parser.rs`

Parse the naming convention used in the `phase_2_chunked` directory structure:
- Folder: `{pipeline}_{avatar}_{scene_type}_{track}_v{version}_[{labels}]`
- File: `{same_prefix}_clip{NNNN}.mp4` (or just the folder labels apply to all files inside)

```rust
pub struct ParsedClipFilename {
    pub pipeline_code: Option<String>,
    pub avatar_slug: String,
    pub scene_type_slug: String,
    pub track_slug: String,
    pub version: i32,
    pub labels: Vec<String>,
    pub clip_index: Option<i32>,
    pub extension: String,
}

pub fn parse_clip_path(path: &str) -> Result<ParsedClipFilename, ParseError>;
```

**Acceptance Criteria:**
- [ ] Parses `sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4` correctly
- [ ] Extracts avatar slug, scene type slug, track slug, version number
- [ ] Extracts labels from `[...]` brackets (comma-separated)
- [ ] Extracts clip index from `_clipNNNN` suffix
- [ ] Handles folder paths (parse the folder name component)
- [ ] Returns structured error on unparseable names
- [ ] Unit tests for various naming patterns

### Task 2.3: Create server-side single-file import endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New endpoint `POST /api/v1/scenes/{scene_id}/versions/import-from-path` that imports a video file from a server-side filesystem path.

**Acceptance Criteria:**
- [ ] Accepts JSON body: `{ path: string, parent_version_id?: number, clip_index?: number, notes?: string }`
- [ ] Validates the file exists and is a supported video type
- [ ] Copies file into managed storage (does NOT move/delete original)
- [ ] Runs same processing pipeline as browser upload: H.264 transcode, preview, metadata extraction
- [ ] Creates `scene_video_version` with `source: "imported"`
- [ ] Returns the created version

### Task 2.4: Create batch directory scan import endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New endpoint `POST /api/v1/derived-clips/import-directory` that scans a directory, parses filenames, resolves avatars/scenes/parents, and imports all clips.

**Acceptance Criteria:**
- [ ] Accepts JSON body: `{ directory_path: string, pipeline_id: number, dry_run?: boolean }`
- [ ] Scans directory recursively for video files (.mp4, .webm, .mov)
- [ ] For each folder, parses the folder name to extract avatar, scene_type, track, version, labels
- [ ] Resolves avatar by slug match, scene by (avatar_id, scene_type, track), parent by version number
- [ ] In dry_run mode: returns preview of what would be imported (matches, unresolved, errors)
- [ ] In import mode: copies files, creates versions, applies labels as entity tags
- [ ] Returns per-file results: success/failure/skipped with reasons
- [ ] Preserves clip_index from `_clipNNNN` filename suffix
- [ ] Creates tags that don't exist yet (via `TagRepo::create_or_get`)

### Task 2.5: Wire new routes
**File:** `apps/backend/crates/api/src/routes/scene.rs`

**Acceptance Criteria:**
- [ ] `POST /scenes/{id}/versions/import-from-path` wired to single-file import handler
- [ ] `POST /derived-clips/import-directory` wired to batch directory scan handler
- [ ] Both require auth

---

## Phase 3: Backend — Derived Clips Listing API

### Task 3.1: Create derived clips listing endpoint
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

New endpoint `GET /api/v1/avatars/{avatar_id}/derived-clips` that returns all derived clips for an avatar, grouped by parent version.

**Acceptance Criteria:**
- [ ] Returns derived clips (where `parent_version_id IS NOT NULL`) for all scenes belonging to the avatar
- [ ] Each clip includes: id, version_number, file_path, duration_secs, qa_status, clip_index, annotation_count, parent_version_id, scene context (scene_type_name, track_name)
- [ ] Results ordered by parent_version_id, then clip_index
- [ ] Supports pagination (limit, offset)
- [ ] Supports tag filtering (tag_ids, exclude_tag_ids)
- [ ] Supports qa_status filter

### Task 3.2: Extend browse endpoint with parent_version_id filter
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

**Acceptance Criteria:**
- [ ] Browse endpoint accepts optional `has_parent` boolean param (filter to only derived clips)
- [ ] Browse endpoint accepts optional `parent_version_id` param (filter to children of specific parent)
- [ ] Existing browse queries continue to return all clips when no parent filter is set

---

## Phase 4: Frontend — Bulk Import & Directory Scan Dialogs

### Task 4.1: Create BulkImportDialog component
**File:** `apps/frontend/src/features/scenes/BulkImportDialog.tsx`

Multi-file browser upload dialog with parent clip selector. Mirror the existing `ImportClipDialog` pattern but support multiple files.

**Acceptance Criteria:**
- [ ] Dialog accepts multiple files via file picker or drag-and-drop
- [ ] Parent clip selector dropdown (approved versions for the selected scene)
- [ ] Files uploaded sequentially with progress indicator (N/total)
- [ ] Each file creates a separate `scene_video_version` under the parent
- [ ] Failed uploads reported but don't block remaining files
- [ ] Success summary: imported count, failures, total size
- [ ] `clip_index` auto-assigned from file order (or parsed from filename if `_clipNNNN` present)

### Task 4.2: Create ScanDirectoryDialog component
**File:** `apps/frontend/src/features/scenes/ScanDirectoryDialog.tsx`

Server-side directory scan dialog. User enters a path, sees a preview of what will be imported, then confirms.

**Acceptance Criteria:**
- [ ] Input field for server-side directory path
- [ ] "Scan" button triggers dry_run call to batch import endpoint
- [ ] Preview shows: matched avatars, scenes, parent clips, file counts, labels to apply
- [ ] Unresolved items shown with warnings (avatar not found, scene not found, etc.)
- [ ] "Import" button triggers the actual import
- [ ] Progress/results display showing per-folder import status
- [ ] Pipeline context passed from current workspace

### Task 4.3: Create hooks for server-side import
**File:** `apps/frontend/src/features/scenes/hooks/useClipManagement.ts`

**Acceptance Criteria:**
- [ ] `useImportFromPath(sceneId)` mutation — single file from server path
- [ ] `useImportDirectory()` mutation — batch directory scan + import
- [ ] `useDerivedClips(avatarId, params)` query — derived clips listing
- [ ] Query key factory entries for derived clips

---

## Phase 5: Frontend — Derived Clips Tab on Avatar Detail

### Task 5.1: Create AvatarDerivedClipsTab component
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx`

New tab showing all derived clips for the avatar, grouped by parent version in collapsible sections.

**Acceptance Criteria:**
- [ ] Clips grouped by parent version with collapsible section headers
- [ ] Section header shows: scene type name, track name, parent version number, parent thumbnail
- [ ] Each clip row shows: thumbnail, filename (or clip index), duration, tags, QA status, annotation count
- [ ] Clicking a clip opens `ClipPlaybackModal` with prev/next navigation within the group
- [ ] "Import" button opens `BulkImportDialog`
- [ ] "Scan Directory" button opens `ScanDirectoryDialog`
- [ ] Tag filter panel for filtering by category labels
- [ ] QA status filter (pending/approved/rejected)
- [ ] Empty state when no derived clips exist

### Task 5.2: Register Derived tab in avatar detail page
**Files:**
- `apps/frontend/src/features/projects/types.ts` — add `"derived"` to `CHARACTER_TABS`
- `apps/frontend/src/features/avatars/AvatarDetailPage.tsx` — render `AvatarDerivedClipsTab` for the new tab

**Acceptance Criteria:**
- [ ] "Derived" tab appears in avatar detail navigation between "Scenes" and "Images" (or after "Scenes")
- [ ] Tab renders `AvatarDerivedClipsTab` with correct `avatarId` and `projectId` props
- [ ] Tab lazy-loaded to avoid fetching data when not active

---

## Phase 6: Frontend — Integration (Browse Page Filters + Modal Context)

### Task 6.1: Add "Derived" source filter to scenes browse page
**File:** `apps/frontend/src/app/pages/ScenesPage.tsx`

**Acceptance Criteria:**
- [ ] Source filter options include "Derived" (imported clips with a parent)
- [ ] When "Derived" is selected, passes `has_parent=true` to the browse API
- [ ] Derived clips in the browse list show a "derived from" indicator with parent info
- [ ] All existing pagination, tag filtering, and QA status filters work with derived clips

### Task 6.2: Add parent context badge to ClipPlaybackModal
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

**Acceptance Criteria:**
- [ ] When clip has `parent_version_id`, show "Derived from: {scene_type} v{version}" badge in modal header
- [ ] Badge styled with monospace, muted color, and a link icon
- [ ] Non-derived clips show no badge (backward-compatible)
- [ ] Clip index shown if present (e.g., "Chunk 3 of 9")

### Task 6.3: Show clip_index in clip cards and browse items
**Files:**
- `apps/frontend/src/features/scenes/ClipCard.tsx`
- `apps/frontend/src/app/pages/ScenesPage.tsx`

**Acceptance Criteria:**
- [ ] Derived clips show clip index badge (e.g., "#3") in the card
- [ ] Browse list items show clip index for derived clips
- [ ] Non-derived clips show no index (backward-compatible)

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260328000001_add_parent_version_and_clip_index.sql` | Migration for parent FK + clip index |
| `apps/backend/crates/db/src/models/scene_video_version.rs` | Model updates (parent_version_id, clip_index) |
| `apps/backend/crates/core/src/clip_filename_parser.rs` | Filename parsing utility |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | Import + derived clips handlers |
| `apps/backend/crates/api/src/routes/scene.rs` | New route wiring |
| `apps/frontend/src/features/scenes/types.ts` | Type updates |
| `apps/frontend/src/features/scenes/hooks/useClipManagement.ts` | New hooks |
| `apps/frontend/src/features/scenes/BulkImportDialog.tsx` | Multi-file upload dialog |
| `apps/frontend/src/features/scenes/ScanDirectoryDialog.tsx` | Server-side scan dialog |
| `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx` | Derived clips tab |
| `apps/frontend/src/features/avatars/AvatarDetailPage.tsx` | Tab registration |
| `apps/frontend/src/features/projects/types.ts` | CHARACTER_TABS update |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Parent context badge |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | Source filter extension |

---

## Dependencies

### Existing Components to Reuse
- `ImportClipDialog` pattern from `features/scenes/ImportClipDialog.tsx`
- `ClipPlaybackModal` from `features/scenes/ClipPlaybackModal.tsx` — review modal
- `useClipsBrowse` from `hooks/useClipManagement.ts` — paginated browse
- `TagInput` / `TagFilter` from `components/domain/` — labeling
- `TagRepo::create_or_get` — auto-create tags during import
- `ensure_h264` / video processing from import handler
- `CollapsibleSection` from `components/composite/` — grouped display
- `BulkActionBar` from `components/domain/` — bulk approve/reject

### New Infrastructure Needed
- `clip_filename_parser.rs` in `crates/core/src/` — filename convention parsing
- `BulkImportDialog.tsx` — multi-file upload component
- `ScanDirectoryDialog.tsx` — server-side path scan component
- `AvatarDerivedClipsTab.tsx` — avatar detail tab
- Batch directory import endpoint with dry_run support

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database — Task 1.1–1.3
2. Phase 2: Backend import + scan — Tasks 2.1–2.5
3. Phase 3: Backend listing — Tasks 3.1–3.2
4. Phase 4: Frontend dialogs — Tasks 4.1–4.3
5. Phase 5: Derived clips tab — Tasks 5.1–5.2
6. Phase 6: Integration — Tasks 6.1–6.3

**MVP Success Criteria:**
- Server-side directory scan imports all clips from `phase_2_chunked` with correct avatar/scene/track/parent resolution
- Labels from folder names auto-applied as tags to imported clips
- Clip ordering preserved via `clip_index`
- Derived clips tab shows all imported chunks grouped by parent clip
- ClipPlaybackModal works for reviewing/annotating derived clips
- Scenes browse page can filter to show only derived clips

### Post-MVP Enhancements
- Auto-scan watched directories on schedule (PRD Req 2.1)
- Side-by-side comparison view: derived clip vs parent clip (PRD Req 2.2)

---

## Notes

1. **Filename parsing must handle edge cases**: avatar slugs with hyphens (e.g., `la-sirena-69`), labels containing special characters (`#phase_2`), missing clip index (folder-level import), version numbers > 9.
2. **Server-side import copies files** — originals are preserved. Storage path follows existing pattern: `imports/scene_{scene_id}_{timestamp}.mp4`.
3. **Tag auto-creation**: The batch import creates tags that don't exist yet via `TagRepo::create_or_get`, scoped to the pipeline. This avoids requiring pre-created tags.
4. **H.264 transcoding**: Every imported file goes through `ensure_h264` for browser compatibility, same as browser uploads. This may be slow for large batches — consider adding a skip option for files already in H.264.
5. **The `phase_2_chunked` directory has 41 folders × ~10 clips each = ~400 files**. The batch import should handle this in one operation with progress reporting.

---

## Version History

- **v1.0** (2026-03-27): Initial task list creation from PRD-153
