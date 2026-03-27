# PRD-155: Server-Side Directory Scan Import

## 1. Introduction/Overview

The platform has multiple import flows (avatar images, metadata, speech, derived clips) that currently rely on browser-based drag-and-drop or manual file pickers. For large-scale operations — importing hundreds of seed images, metadata files, or speech entries — browser uploads are slow and error-prone.

This PRD introduces a **unified server-side directory scan** system that reads files directly from the server filesystem, auto-classifies them by type (images, metadata, speech, video clips), resolves context (avatar, scene type, track, labels) from naming conventions, and presents a preview for the user to review before committing the import. The user can select which types to import and how to handle conflicts.

PRD-153 already built this for derived clips. This PRD generalizes that pattern across all import types with a shared backend infrastructure and consistent frontend UI.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-153** (Derived Clip Import) — existing directory scan for clips; generalize this pattern
- **PRD-21** (Source Image Management) — media variant upload infrastructure
- **PRD-136** (Multilingual Speech Deliverable) — speech import format
- **PRD-138** (Multi-Pipeline Architecture) — pipeline scoping

### Extends
- **PRD-111** (Scene Catalog & Track Management) — tracks used for image classification
- **PRD-141** (Import Rules & Dynamic Classification) — filename-based classification rules
- **PRD-148** (Avatar Card Indicators) — indicators update after import

### Related
- **PRD-47** (Tagging & Custom Labels) — labels from filenames applied as tags
- **PRD-154** (Image Catalogue) — image types inform what images to expect

## 3. Goals

1. Provide a single backend endpoint that scans a server-side directory, classifies all files by type, and resolves context from naming conventions.
2. Support both existing directory structures: flat avatar folders (`avatar_name/files`) and underscore-delimited naming (`pipeline_avatar_scene_track_v1_[labels]_clip0000.mp4`).
3. Return a structured preview so the frontend can show what will be imported with per-file conflict detection.
4. Let the user select which file types to import and choose conflict resolution per-file (skip/replace/version).
5. Make "Scan Directory" accessible from every page that has imports (Projects, Avatars, Media, Scenes, Derived Clips).
6. Reuse existing import infrastructure — media variant upload, metadata update, speech import, clip import — as the actual import backends.

## 4. User Stories

- **US-1:** As a pipeline operator, I want to point the app at a directory of seed images and have them automatically matched to the correct avatars and tracks, so I don't have to upload them one by one.
- **US-2:** As a pipeline operator, I want to scan a directory containing mixed file types (images, JSONs, CSVs, videos) and choose which types to import, so I can handle everything in one operation.
- **US-3:** As a pipeline operator, I want to see a preview of what will be imported before committing, with clear indicators for new files vs conflicts with existing data.
- **US-4:** As a pipeline operator, I want to resolve conflicts on a per-file basis (skip, replace, or version alongside), so I maintain control over what gets overwritten.
- **US-5:** As an admin, I want to trigger a directory scan from the Avatars page scoped to a project, so imported images go to the right project's avatars.
- **US-6:** As a reviewer, I want to scan a directory of LoRA training chunks that auto-applies labels from the folder name, so I can filter and review them by category.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Unified Directory Scan Endpoint

**Description:** A single backend endpoint that scans a directory, classifies every file by type, and resolves context from naming conventions and directory structure.

**Acceptance Criteria:**
- [ ] `POST /api/v1/directory-scan` accepts `{ path: string, pipeline_id: number }`
- [ ] Recursively scans the directory for supported file types
- [ ] Classifies files into categories: `image`, `metadata`, `speech_json`, `speech_csv`, `video_clip`, `voice_csv`, `unknown`
- [ ] For avatar folder structures (`avatar_name/files`), resolves avatar by folder name match
- [ ] For underscore-delimited names, uses existing `clip_filename_parser` to extract all context
- [ ] For images, resolves `variant_type` from filename stem (e.g., `topless.jpg` → `topless`)
- [ ] For metadata, detects `bio.json`, `tov.json`, `metadata.json` by name
- [ ] For speech CSVs, detects column structure (3-col or 4-col)
- [ ] Returns structured preview grouped by avatar with per-file classification, resolved context, and conflict status

#### Requirement 1.2: Conflict Detection

**Description:** For each file in the scan, detect whether it conflicts with existing data and report the conflict type.

**Acceptance Criteria:**
- [ ] Images: check if a media variant with the same `variant_type` already exists for the avatar
- [ ] Metadata: check if `_source_bio` or `_source_tov` already exists in avatar metadata
- [ ] Speech: check if matching speech entries exist (avatar + speech_type + language)
- [ ] Video clips: check content hash for duplicate detection
- [ ] Each file in the preview has a `conflict` field: `null` (no conflict), `"exists"` (same type exists), `"duplicate"` (same content hash)

#### Requirement 1.3: Selective Import Endpoint

**Description:** Execute the import for user-selected files with per-file conflict resolution.

**Acceptance Criteria:**
- [ ] `POST /api/v1/directory-scan/import` accepts the scan results with user selections
- [ ] Input includes: `{ scan_id: string, selections: [{ file_path: string, action: "import" | "skip" | "replace" }] }`
- [ ] For `"import"`: creates new asset (image, metadata, speech, clip)
- [ ] For `"skip"`: does nothing
- [ ] For `"replace"`: deletes existing asset, then imports new one
- [ ] Each file type delegates to existing import logic: media variant upload, metadata update, speech import, clip import
- [ ] Labels from bracket notation `[...]` auto-applied as tags via `TagRepo::create_or_get`
- [ ] Returns per-file results: success/failure/skipped with reasons

#### Requirement 1.4: Scan Preview Response Structure

**Description:** The scan endpoint returns a rich preview structure that the frontend can render.

**Acceptance Criteria:**
- [ ] Response grouped by avatar: `{ avatars: [{ name, slug, id?, matched, files: [...] }] }`
- [ ] Each file entry includes: `path`, `filename`, `category`, `size_bytes`, `resolved_context` (avatar, track, variant_type, etc.), `conflict`, `labels`
- [ ] Summary totals: total files, per-category counts, conflicts count, unresolved count
- [ ] Unmatched files (avatar not found, etc.) grouped separately with error messages

#### Requirement 1.5: Shared ScanDirectoryDialog Component

**Description:** A reusable frontend dialog for directory scanning that works from any page context.

**Acceptance Criteria:**
- [ ] `ScanDirectoryDialog` accepts: `open`, `onClose`, `pipelineId`, `projectId?`, `avatarId?`, `onSuccess`
- [ ] Path input field with "Scan" button
- [ ] Preview shows files grouped by avatar, with category icons (image/video/json/csv)
- [ ] Category filter toggles: Images, Metadata, Speech, Clips (user can deselect types)
- [ ] Conflict indicator per file: green (new), yellow (exists — ask), red (duplicate)
- [ ] Per-file action selector for conflicts: Import / Skip / Replace
- [ ] "Import Selected" button with progress
- [ ] Results summary

#### Requirement 1.6: Scan Directory on Avatars Page

**Description:** Add "Scan Directory" button to the Avatars content page for bulk importing seed images, metadata, and speech from a structured directory.

**Acceptance Criteria:**
- [ ] "Scan Directory" button in the Avatars page toolbar
- [ ] Opens `ScanDirectoryDialog` scoped to the current pipeline and project
- [ ] After import, refreshes avatar queries (images, metadata, speech indicators)

#### Requirement 1.7: Scan Directory on Media Page

**Description:** Add "Scan Directory" button to the Media browse page for bulk importing images.

**Acceptance Criteria:**
- [ ] "Scan Directory" button in the Media page toolbar
- [ ] Opens `ScanDirectoryDialog` scoped to the current pipeline
- [ ] After import, refreshes media variant queries

#### Requirement 1.8: Scan Directory on Scenes/Derived Clips Pages

**Description:** The existing Scan Directory on Derived Clips and Scenes pages should use the unified dialog.

**Acceptance Criteria:**
- [ ] Replace PRD-153's `ScanDirectoryDialog` with the unified version
- [ ] Scenes page gets a "Scan Directory" button for importing clips
- [ ] Derived Clips page uses the same unified dialog
- [ ] Video clip imports continue to work with parent version resolution

#### Requirement 1.9: Browser Drop Zone Video Support

**Description:** Extend existing `FileDropZone` to detect video files and route them to the bulk import dialog.

**Acceptance Criteria:**
- [ ] `FileDropZone` detects video files (.mp4, .webm, .mov) in dropped content
- [ ] When video files are detected, calls a new `onVideoFilesDropped` callback
- [ ] Avatars page handles video drops by opening `BulkImportDialog` (needs scene selector)
- [ ] Projects page handles video drops similarly
- [ ] Non-video drops continue to work as before (images, JSONs, CSVs)

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Watched Directories
**[OPTIONAL — Post-MVP]** Configure directories that are automatically scanned on a schedule. New files trigger import with pre-configured conflict resolution.

#### Requirement 2.2: Import History & Undo
**[OPTIONAL — Post-MVP]** Track all directory scan imports with timestamps and allow bulk undo (delete everything from a specific import batch).

#### Requirement 2.3: Remote Directory Support
**[OPTIONAL — Post-MVP]** Support scanning directories on network shares or cloud storage (S3 paths, NFS mounts).

## 6. Non-Goals (Out of Scope)

- **No new naming convention** — uses existing conventions for each file type
- **No automatic directory monitoring** (Post-MVP) — scans are user-triggered
- **No cross-pipeline imports** — scans are scoped to a pipeline
- **No file upload to server** — this is for files already on the server filesystem
- **No archive extraction** — doesn't handle .zip/.rar files (files must be extracted first)

## 7. Design Considerations

### UI Pattern

The `ScanDirectoryDialog` is a modal with three states:

**State 1: Path Input**
```
[Server Directory Path                    ] [Scan]
```

**State 2: Preview**
```
Summary: 45 images, 12 metadata, 8 speech, 41 video clips | 3 conflicts

[x] Images (45)  [x] Metadata (12)  [x] Speech (8)  [x] Clips (41)

▼ Allie Nicole (12 files)
  ✓ topless.jpg          image     seed image    NEW
  ✓ clothed.jpg          image     seed image    NEW
  ✓ bio.json             metadata  bio source    EXISTS → [Import] [Skip] [Replace]
  ✓ tov.json             metadata  tov source    NEW
  ✓ idle_topless_clip0001.mp4  clip  derived    NEW
  ...

▼ Amouranth (8 files)
  ...

▶ Unresolved (2 files)
  ✗ unknown_file.dat     unknown   —             SKIP

                                          [Cancel] [Import Selected (96)]
```

**State 3: Results**
```
Import complete: 93 imported, 2 skipped, 1 replaced, 0 failed
```

### Existing Components to Reuse
- `ScanDirectoryDialog` from PRD-153 — extend, don't replace
- `clip_filename_parser` from `crates/core` — extend for image/metadata naming
- `FileDropZone` — add video callback
- `BulkImportDialog` — for browser video drops
- `CollapsibleSection` — for grouped preview
- `TagRepo::create_or_get` — for label auto-creation
- All existing import endpoints as backends

## 8. Technical Considerations

### Existing Code to Reuse
- **`clip_filename_parser.rs`** — extend to classify file types, not just clips
- **`import_directory` handler** (PRD-153) — generalize from clips-only to all types
- **`postMediaVariantUpload`** — image import backend
- **`parse_json_import` / `parse_csv_import`** — speech import backends
- **Avatar metadata update handler** — metadata import backend
- **`FileDropZone.tsx`** — add video file detection callback
- **`ScanDirectoryDialog.tsx`** — extend with multi-type support

### New Infrastructure Needed
- **Unified file classifier** in `crates/core` — determines file type + resolves context
- **`POST /directory-scan`** — scan endpoint returning rich preview
- **`POST /directory-scan/import`** — selective import execution
- **Extended `ScanDirectoryDialog`** — multi-type preview with conflict resolution UI

### Database Changes
None — uses existing tables (media_variants, avatar_metadata_versions, avatar_speeches, scene_video_versions, entity_tags).

### API Changes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/directory-scan` | Scan directory and return classified preview |
| `POST` | `/api/v1/directory-scan/import` | Execute selective import |

## 9. Success Metrics

- A structured directory with 100+ files across multiple avatars can be scanned, previewed, and imported in under 5 minutes.
- All file types (images, metadata, speech, clips) correctly classified and routed to the right import backend.
- Conflicts detected and presented clearly — no silent overwrites.
- Scan Directory accessible from Avatars, Media, Scenes, and Derived Clips pages.

## 10. Resolved Design Decisions

1. **Both directory structures supported** — flat avatar folders (`avatar_name/files`) AND underscore-delimited naming convention. The classifier detects which pattern applies.
2. **User selects types to import** — scan preview has category toggles (Images, Metadata, Speech, Clips) so the user can choose what to import from mixed-content directories.
3. **Conflicts shown with per-file choice** — existing assets flagged in preview; user picks Import/Skip/Replace for each conflict.
4. **Accessible from every import page** — contextual "Scan Directory" buttons scoped to the page's context (pipeline, project, avatar).

## 11. Version History

- **v1.0** (2026-03-27): Initial PRD creation
