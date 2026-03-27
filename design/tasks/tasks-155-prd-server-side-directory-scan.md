# Task List: Server-Side Directory Scan Import

**PRD Reference:** `design/prds/155-prd-server-side-directory-scan.md`
**Scope:** Unified server-side directory scanning for all import types (images, metadata, speech, clips) with file classification, conflict detection, selective import, and Scan Directory buttons on all relevant pages.

## Overview

This generalizes PRD-153's clip-specific directory scan into a unified system that handles ALL file types. A single backend scan endpoint classifies files, resolves avatar/track/label context from naming conventions, detects conflicts, and returns a rich preview. The frontend `ScanDirectoryDialog` gets rewritten to support multi-type imports with category toggles and per-file conflict resolution. Every page that has imports gets a Scan Directory button.

### What Already Exists
- `clip_filename_parser.rs` in `crates/core` — parses underscore-delimited clip naming convention
- `ScanDirectoryDialog.tsx` (PRD-153) — clip-specific scan dialog
- `import_directory` handler (PRD-153) — clip-specific batch import
- `FileDropZone.tsx` — handles images, JSONs, CSVs; needs video support
- `postMediaVariantUpload` — image upload to managed storage
- `parse_json_import` / `parse_csv_import` — speech import backends
- Avatar metadata update handler — metadata import backend
- `TagRepo::create_or_get` — auto-create tags from labels

### What We're Building
1. `directory_scanner.rs` — unified file classifier with multi-convention support
2. `POST /directory-scan` — scan endpoint returning typed, conflict-aware preview
3. `POST /directory-scan/import` — selective import with per-file actions
4. Unified `ScanDirectoryDialog` — multi-type preview with conflict resolution UI
5. Scan Directory buttons on Avatars, Media, Scenes pages
6. Video drop support on `FileDropZone`

### Key Design Decisions
1. Both directory structures supported: flat avatar folders AND underscore-delimited naming
2. User selects which file types to import via category toggles in preview
3. Conflicts shown per-file with Import/Skip/Replace choice
4. Delegates to existing import backends (no duplicate import logic)
5. Extends `clip_filename_parser` rather than replacing it

---

## Phase 1: Backend — Unified File Classifier

### Task 1.1: Create directory_scanner module
**File:** `apps/backend/crates/core/src/directory_scanner.rs`

Unified file classifier that scans a directory and classifies every file by type and resolved context.

```rust
pub enum FileCategory {
    Image,          // jpg, png, webp, gif
    Metadata,       // bio.json, tov.json, metadata.json
    SpeechJson,     // other .json files with speech structure
    SpeechCsv,      // .csv with speech columns
    VoiceCsv,       // .csv with voice_id columns
    VideoClip,      // mp4, webm, mov
    Unknown,
}

pub struct ScannedFile {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub category: FileCategory,
    pub resolved: ResolvedContext,
}

pub struct ResolvedContext {
    pub avatar_slug: Option<String>,
    pub variant_type: Option<String>,      // for images
    pub scene_type_slug: Option<String>,   // for clips
    pub track_slug: Option<String>,        // for clips
    pub version: Option<i32>,              // for clips
    pub clip_index: Option<i32>,           // for clips
    pub labels: Vec<String>,              // from [bracket] notation
    pub metadata_key: Option<String>,      // "_source_bio", "_source_tov"
}

pub struct ScanResult {
    pub avatars: Vec<AvatarScanGroup>,
    pub unresolved: Vec<ScannedFile>,
    pub summary: ScanSummary,
}

pub fn scan_directory(path: &str) -> Result<ScanResult, ScanError>;
```

**Logic:**
1. List all entries in directory (files and subdirectories)
2. For subdirectories: detect structure pattern
   - If folder name matches underscore-delimited clip convention → use `clip_filename_parser`
   - Otherwise → treat as avatar folder (folder name = avatar slug)
3. Classify each file by extension + filename pattern
4. Group by resolved avatar slug

**Acceptance Criteria:**
- [ ] Classifies images by extension: jpg, jpeg, png, webp, gif → `Image`
- [ ] Classifies metadata by exact name: `bio.json` → `Metadata` (key=`_source_bio`), `tov.json` → `Metadata` (key=`_source_tov`), `metadata.json` → `Metadata`
- [ ] Classifies video by extension: mp4, webm, mov → `VideoClip`
- [ ] Classifies CSV files: detects speech vs voice columns
- [ ] Classifies JSON files: detects speech structure vs metadata
- [ ] Handles flat avatar folder structure: `avatar_name/files`
- [ ] Handles underscore-delimited clip convention via existing `clip_filename_parser`
- [ ] Groups results by avatar slug
- [ ] Returns unresolved files separately
- [ ] Summary includes per-category file counts
- [ ] Module registered in `lib.rs`
- [ ] Unit tests for both directory structure patterns

### Task 1.2: Add conflict detection
**File:** `apps/backend/crates/core/src/directory_scanner.rs`

Extend `ScannedFile` with conflict detection against existing database state.

```rust
pub enum ConflictStatus {
    New,                    // no existing asset
    Exists { id: DbId },   // same type exists
    Duplicate,              // same content hash
}
```

This is computed at scan time by the handler (which has DB access), not by the core scanner. Add the field to the scan types:

```rust
pub struct ScannedFileWithConflict {
    pub file: ScannedFile,
    pub conflict: ConflictStatus,
}
```

**Acceptance Criteria:**
- [ ] `ConflictStatus` enum with `New`, `Exists`, `Duplicate` variants
- [ ] `ScannedFileWithConflict` wraps a file with its conflict status
- [ ] Types are serializable for API response

---

## Phase 2: Backend — Scan & Import Endpoints

### Task 2.1: Create directory scan handler
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

New handler for `POST /api/v1/directory-scan` that uses the scanner, resolves avatars from DB, and detects conflicts.

```rust
struct ScanInput {
    path: String,
    pipeline_id: DbId,
    project_id: Option<DbId>,  // scoping
}
```

**Logic:**
1. Call `scan_directory(path)` from core
2. For each avatar slug, query DB for matching avatar (by slug or name)
3. For each image file, check if `media_variants` with that `variant_type` exists for the avatar
4. For each metadata file, check if `_source_bio`/`_source_tov` exists in avatar metadata
5. For each clip, compute content hash if feasible (or skip for preview)
6. Return enriched preview with `avatar_id` (if matched), conflict status per file

**Acceptance Criteria:**
- [ ] Accepts JSON body with path and pipeline_id
- [ ] Calls directory scanner and enriches with DB lookups
- [ ] Resolves avatar slugs to avatar IDs (fuzzy: hyphens→spaces, case-insensitive)
- [ ] Detects image conflicts (variant_type exists for avatar)
- [ ] Detects metadata conflicts (source keys exist)
- [ ] Returns response grouped by avatar with per-file conflict status
- [ ] Unmatched avatars returned in separate `unresolved` array
- [ ] Summary totals in response

### Task 2.2: Create selective import handler
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

New handler for `POST /api/v1/directory-scan/import` that executes imports for selected files.

```rust
struct ImportSelection {
    file_path: String,
    action: String,  // "import", "skip", "replace"
}

struct ImportInput {
    pipeline_id: DbId,
    selections: Vec<ImportSelection>,
}
```

**Logic per file (based on category):**
- **Image**: Copy to managed storage, create `media_variant` via existing upload logic
- **Metadata**: Read JSON, call avatar metadata update
- **Speech JSON/CSV**: Parse and call speech import
- **Video clip**: Copy, transcode, create `scene_video_version` (reuse PRD-153 logic)
- **Replace**: Delete existing asset first, then import
- **Labels**: Auto-create tags and apply to entity

**Acceptance Criteria:**
- [ ] Accepts selections array with per-file action
- [ ] `"skip"` files are ignored
- [ ] `"import"` creates new asset via appropriate backend
- [ ] `"replace"` deletes existing then imports
- [ ] Images: copied to storage, variant created with correct avatar_id and variant_type
- [ ] Metadata: bio.json/tov.json parsed and stored in avatar metadata
- [ ] Speech: delegated to existing speech import logic
- [ ] Clips: delegated to existing clip import logic (with parent resolution)
- [ ] Labels from `[bracket]` notation applied as tags
- [ ] Returns per-file results: success/failure/skipped

### Task 2.3: Wire routes
**File:** `apps/backend/crates/api/src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] `POST /api/v1/directory-scan` wired to scan handler
- [ ] `POST /api/v1/directory-scan/import` wired to import handler
- [ ] Both require auth
- [ ] Handler module declared in `handlers/mod.rs`

---

## Phase 3: Frontend — Unified ScanDirectoryDialog

### Task 3.1: Create scan/import hooks
**File:** `apps/frontend/src/hooks/useDirectoryScan.ts`

New shared hooks for the unified directory scan.

**Acceptance Criteria:**
- [ ] `useDirectoryScan()` mutation — calls `POST /directory-scan`
- [ ] `useDirectoryImport()` mutation — calls `POST /directory-scan/import`
- [ ] Return types match backend response structure
- [ ] Types exported: `ScannedFile`, `AvatarScanGroup`, `ScanResult`, `ConflictStatus`, `ImportSelection`

### Task 3.2: Rewrite ScanDirectoryDialog as unified multi-type dialog
**File:** `apps/frontend/src/components/domain/ScanDirectoryDialog.tsx`

Move from `features/scenes/` to `components/domain/` since it's now shared across features. Rewrite to support all file types.

**Props:**
```typescript
interface ScanDirectoryDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineId: number;
  projectId?: number;
  avatarId?: number;
  onSuccess?: () => void;
}
```

**Three states:**
1. **Path input** — text field + Scan button
2. **Preview** — grouped by avatar, category toggles, per-file conflict UI
3. **Results** — summary of what was imported

**Acceptance Criteria:**
- [ ] Path input with Scan button
- [ ] Category filter toggles: Images, Metadata, Speech, Clips (each toggleable)
- [ ] Preview grouped by avatar in collapsible sections
- [ ] Each file row shows: icon (by category), filename, size, resolved context, conflict badge
- [ ] Conflict badge: green "new", yellow "exists", red "duplicate"
- [ ] For "exists" conflicts: dropdown with Import/Skip/Replace options
- [ ] File count per avatar and total
- [ ] "Import Selected" button with count
- [ ] Progress indicator during import
- [ ] Results summary: imported/skipped/replaced/failed counts
- [ ] Terminal styling (monospace, dark theme)

### Task 3.3: Update existing consumers to use unified dialog
**Files:**
- `apps/frontend/src/features/scenes/ScanDirectoryDialog.tsx` — delete or redirect to shared
- `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx` — use shared dialog
- `apps/frontend/src/app/pages/DerivedClipsPage.tsx` — use shared dialog
- `apps/frontend/src/app/pages/DerivedClipDialogs.tsx` — use shared dialog

**Acceptance Criteria:**
- [ ] Old `features/scenes/ScanDirectoryDialog.tsx` removed or re-exports from shared
- [ ] All existing Scan Directory usages work with the new unified dialog
- [ ] Derived clips tab passes `avatarId` to scope the scan
- [ ] Derived clips page works without regressions

---

## Phase 4: Frontend — Scan Directory Buttons on All Pages

### Task 4.1: Add Scan Directory to Avatars page
**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx`

**Acceptance Criteria:**
- [ ] "Scan Directory" button in the page toolbar (next to Import Folder button)
- [ ] Opens `ScanDirectoryDialog` scoped to current pipeline and selected project
- [ ] After import, invalidates avatar, media variant, and speech queries

### Task 4.2: Add Scan Directory to Media page
**File:** `apps/frontend/src/app/pages/MediaPage.tsx`

**Acceptance Criteria:**
- [ ] "Scan Directory" button in the page toolbar
- [ ] Opens `ScanDirectoryDialog` scoped to current pipeline
- [ ] After import, invalidates media variant browse queries

### Task 4.3: Add Scan Directory to Scenes page
**File:** `apps/frontend/src/app/pages/ScenesPage.tsx`

**Acceptance Criteria:**
- [ ] "Scan Directory" button in the page toolbar
- [ ] Opens `ScanDirectoryDialog` scoped to current pipeline
- [ ] After import, invalidates clip browse queries

---

## Phase 5: Frontend — Video Drop Zone Support

### Task 5.1: Extend FileDropZone with video file detection
**File:** `apps/frontend/src/components/domain/FileDropZone.tsx`

**Acceptance Criteria:**
- [ ] New optional prop: `onVideoFilesDropped?: (files: File[]) => void`
- [ ] During drop processing, video files (.mp4, .webm, .mov) are separated from other file types
- [ ] If video files detected and `onVideoFilesDropped` is provided, calls it with the video files
- [ ] Non-video files continue through existing classification (images, JSONs, CSVs)
- [ ] If `onVideoFilesDropped` is NOT provided, video files are ignored (backward-compatible)

### Task 5.2: Wire video drops on Avatars page
**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx`

**Acceptance Criteria:**
- [ ] `FileDropZone` receives `onVideoFilesDropped` callback
- [ ] When video files dropped, opens `BulkImportDialog` with the files pre-loaded
- [ ] User needs to select a scene before upload can proceed (scene selector in dialog)
- [ ] Non-video drops continue to work as before (seed images, metadata, speech)

### Task 5.3: Wire video drops on avatar Derived tab
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx`

The derived tab already has a custom drag-and-drop zone. Ensure it works correctly with the `BulkImportDialog`'s `initialFiles` prop.

**Acceptance Criteria:**
- [ ] Video drop zone on Derived tab continues to work
- [ ] Dropped files passed to `BulkImportDialog` via `initialFiles`
- [ ] Dialog opens pre-populated with dropped files
- [ ] Upload works end-to-end

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/core/src/directory_scanner.rs` | Unified file classifier |
| `apps/backend/crates/core/src/clip_filename_parser.rs` | Existing clip parser (reused) |
| `apps/backend/crates/api/src/handlers/directory_scan.rs` | Scan + import endpoints |
| `apps/backend/crates/api/src/routes/mod.rs` | Route wiring |
| `apps/frontend/src/hooks/useDirectoryScan.ts` | Scan/import hooks |
| `apps/frontend/src/components/domain/ScanDirectoryDialog.tsx` | Unified scan dialog |
| `apps/frontend/src/components/domain/FileDropZone.tsx` | Video drop extension |
| `apps/frontend/src/app/pages/AvatarsPage.tsx` | Scan button + video drops |
| `apps/frontend/src/app/pages/MediaPage.tsx` | Scan button |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | Scan button |
| `apps/frontend/src/app/pages/DerivedClipsPage.tsx` | Updated to unified dialog |
| `apps/frontend/src/features/avatars/tabs/AvatarDerivedClipsTab.tsx` | Updated to unified dialog |

---

## Dependencies

### Existing Components to Reuse
- `clip_filename_parser` from `crates/core` — clip naming convention
- `postMediaVariantUpload` from `features/media/hooks` — image upload
- `parse_json_import` / `parse_csv_import` from `handlers/avatar_speech.rs` — speech import
- `TagRepo::create_or_get` from `repositories/tag_repo.rs` — label auto-creation
- `CollapsibleSection` from `components/composite` — grouped preview
- `BulkImportDialog` from `features/scenes` — browser video upload
- `FileDropZone` from `components/domain` — extend with video support

### New Infrastructure Needed
- `directory_scanner.rs` in `crates/core` — file classification engine
- `directory_scan.rs` handler — scan + import endpoints
- `useDirectoryScan.ts` hook — frontend API layer
- Unified `ScanDirectoryDialog` in `components/domain` — multi-type scan UI

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Backend classifier — Tasks 1.1–1.2
2. Phase 2: Backend endpoints — Tasks 2.1–2.3
3. Phase 3: Frontend dialog — Tasks 3.1–3.3
4. Phase 4: Scan buttons everywhere — Tasks 4.1–4.3
5. Phase 5: Video drop zones — Tasks 5.1–5.3

**MVP Success Criteria:**
- Scan a directory containing mixed images, metadata, speech, and clip files
- Preview shows all files classified correctly, grouped by avatar
- Conflicts detected and user can choose Import/Skip/Replace per file
- Import delegates to correct backend for each file type
- Scan Directory accessible from Avatars, Media, Scenes, and Derived Clips pages
- Video files can be dropped on Avatars page and avatar Derived tab

### Post-MVP Enhancements
- Watched directories with scheduled scanning
- Import history and undo
- Remote directory support (S3, NFS)

---

## Notes

1. **The `directory_scanner` is a pure classifier** — it reads the filesystem and classifies files but does NOT access the database. Conflict detection happens in the handler which has DB access.
2. **Import delegates to existing backends** — no duplicate import logic. Each file type calls its established import function.
3. **The unified `ScanDirectoryDialog` replaces** the PRD-153 clip-specific version. Existing consumers are updated to use the shared component.
4. **Avatar slug resolution** uses fuzzy matching: `allie-nicole` matches avatar named "Allie Nicole" (hyphens→spaces, case-insensitive).
5. **Large directories**: The scan endpoint should handle 500+ files efficiently. Consider streaming results or pagination for very large directories.

---

## Version History

- **v1.0** (2026-03-27): Initial task list creation from PRD-155
