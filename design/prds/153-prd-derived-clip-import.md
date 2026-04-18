# PRD-153: Derived Clip Import & Review

## 1. Introduction / Overview

When working with avatar pipelines, externally-processed video files (LoRA training chunks, test renders, reference clips) need to be imported back into the app for structured review. These files are typically **derived from approved scene clips** — e.g. an approved clip is chunked into training segments outside the app, then those chunks need to be imported, labeled, annotated, and approved/rejected using the same tools as generated clips.

This PRD extends the existing clip import system with **parent-child version relationships**, **bulk import** (browser upload + server-side directory scan), and a dedicated **"Derived Clips" tab** on the avatar detail page for managing imported files.

## 2. Related PRDs & Dependencies

| Relationship | PRD | Title |
|---|---|---|
| **Depends on** | PRD-83 | Video Playback (core player) |
| **Depends on** | PRD-109 | Video Player Controls |
| **Depends on** | PRD-70 | On-Frame Annotation & Markup |
| **Depends on** | PRD-149 | Frame Range Annotations & Text Presets |
| **Extends** | PRD-109 | Scene Video Versioning (adds parent_version_id) |
| **Extends** | PRD-109 | Scene Management (import flow) |
| **Extends** | PRD-152 | Annotation Playback Mode (works on derived clips) |

## 3. Goals

1. Allow importing externally-created video files under a specific avatar, linked to their source (approved) clip.
2. Support both browser file upload and server-side directory scanning for bulk import.
3. Provide a dedicated view for browsing and reviewing derived clips per avatar.
4. Reuse all existing review tools — annotations, tags, notes, approve/reject, ClipPlaybackModal.
5. Track provenance: every derived clip knows which approved version it came from.
6. Support user-defined categorization via the existing tag/label system.

## 4. User Stories

- **US-1:** As a pipeline operator, I want to import LoRA training chunks back into the app so I can review them with the same annotation tools I use for generated clips.
- **US-2:** As a pipeline operator, I want imported chunks to be linked to the approved clip they were derived from, so I can trace provenance.
- **US-3:** As a pipeline operator, I want to bulk-import a folder of chunks from the server filesystem, so I don't have to upload them one-by-one through the browser.
- **US-4:** As a pipeline operator, I want to label imported clips by category (e.g. "lora-chunk", "test-render") so I can filter and organize them.
- **US-5:** As a reviewer, I want to annotate, approve, and reject derived clips exactly like I do with generated clips.
- **US-6:** As a pipeline operator, I want to see all derived clips for an avatar in a dedicated tab, grouped by their parent clip.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Parent Version Relationship

**Description:** Add a nullable `parent_version_id` column to `scene_video_versions` that references another version in the same table. Derived clips are created under the **same scene** as their parent, with `source: "imported"` and this FK set.

**Acceptance Criteria:**
- [ ] Migration adds `parent_version_id BIGINT` (nullable) FK to `scene_video_versions(id)` with `ON DELETE SET NULL`
- [ ] Index on `parent_version_id` for efficient lookups
- [ ] Backend model `SceneVideoVersion` includes the new field
- [ ] Frontend type `SceneVideoVersion` includes `parent_version_id: number | null`
- [ ] Existing clips have `parent_version_id = NULL` (backward-compatible)

#### Requirement 1.2: Single-File Import with Parent Link

**Description:** Extend the existing `POST /scenes/{scene_id}/versions/import` endpoint to accept an optional `parent_version_id` in the multipart form. The frontend import dialog gets a parent selector when opened from the derived clips context.

**Acceptance Criteria:**
- [ ] Import endpoint accepts optional `parent_version_id` field
- [ ] When provided, validates that the parent version exists and belongs to the same scene
- [ ] Created version has `source: "imported"` and `parent_version_id` set
- [ ] Existing import flow (without parent) continues to work unchanged

#### Requirement 1.3: Bulk Browser Upload

**Description:** A bulk upload dialog that accepts multiple video files at once. All files are imported under the same parent clip. Files are uploaded sequentially (to avoid overwhelming the server) with a progress indicator.

**Acceptance Criteria:**
- [ ] Dialog accepts multiple files via drag-and-drop or file picker
- [ ] User selects the parent clip (approved version) from a dropdown before uploading
- [ ] Files are uploaded one-by-one with a progress bar showing N/total
- [ ] Each file creates a separate `scene_video_version` under the parent's scene
- [ ] Failed uploads are reported but don't block remaining files
- [ ] Success summary shows imported count, failures, and total size

#### Requirement 1.4: Server-Side Directory Scan Import

**Description:** A "Scan Directory" flow that lets the user specify a server-side path, lists the video files found, and imports selected files. Files are moved/copied into managed storage.

**Acceptance Criteria:**
- [ ] New endpoint `POST /api/v1/scenes/{scene_id}/versions/import-from-path` accepts `{ path: string, parent_version_id?: number }`
- [ ] Backend lists video files (`.mp4`, `.webm`, `.mov`) in the directory
- [ ] New endpoint `POST /api/v1/scenes/{scene_id}/versions/import-batch-from-paths` accepts `{ paths: string[], parent_version_id?: number }`
- [ ] Each file is copied into managed storage (not moved — originals preserved)
- [ ] Same processing pipeline as browser upload: transcode, preview, metadata extraction
- [ ] Returns import results per file (success/failure/path)

#### Requirement 1.5: Derived Clips Tab on Avatar Detail

**Description:** A new "Derived" tab on the avatar detail page that shows all imported clips linked to approved versions for that avatar. Clips are grouped by parent clip, with the parent's scene type and version shown as the group header.

**Acceptance Criteria:**
- [ ] New tab appears in avatar detail when the avatar has derived clips (or always visible if preferred)
- [ ] Clips are grouped by parent version: header shows scene type, track, version number, and thumbnail
- [ ] Each clip row shows: thumbnail, filename, duration, tags, QA status, annotation count
- [ ] Clicking a clip opens `ClipPlaybackModal` with full review tools
- [ ] "Import" button opens the bulk upload dialog scoped to this avatar
- [ ] "Scan" button opens the server-side directory scan dialog
- [ ] Tag filtering available to filter by category labels

#### Requirement 1.6: Browse Derived Clips in Scenes Page

**Description:** The existing scenes browse page (`/pipelines/{id}/scenes`) should support filtering for derived clips via the existing `source` filter.

**Acceptance Criteria:**
- [ ] Source filter options include "All", "Generated", "Imported", "Derived" (imported + has parent)
- [ ] Derived clips show a "derived from" indicator with the parent clip's info
- [ ] Clicking the parent reference navigates to the parent clip
- [ ] All existing pagination, tag filtering, and QA status filters work with derived clips

#### Requirement 1.7: Parent Clip Context in ClipPlaybackModal

**Description:** When viewing a derived clip in ClipPlaybackModal, show the parent clip's context (scene type, version, thumbnail) with a link to open the parent.

**Acceptance Criteria:**
- [ ] Derived clips show a "Derived from: {scene_type} v{version}" badge in the modal header
- [ ] Badge is clickable — opens the parent clip in a new modal instance
- [ ] Non-derived clips show no badge (backward-compatible)

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Auto-Scan Watched Directories

**Description:** Configure watched directories that are automatically scanned on a schedule. New files are imported as derived clips under the appropriate avatar based on filename conventions.

**Acceptance Criteria:**
- [ ] Pipeline setting to configure watched directory paths with filename-to-avatar mapping rules
- [ ] Background job scans directories on configurable interval
- [ ] New files are auto-imported with parent version resolved from filename pattern

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Derived Clip Comparison View

**Description:** Side-by-side comparison of a derived clip with its parent clip, synchronized playback for frame-by-frame comparison.

**Acceptance Criteria:**
- [ ] "Compare with parent" button in ClipPlaybackModal for derived clips
- [ ] Opens existing `RegenerationComparison` component with parent and derived clip

## 6. Non-Goals (Out of Scope)

- **No new table** — derived clips use `scene_video_versions` with a parent FK, not a separate entity.
- **No video processing** beyond what the import pipeline already does (transcode, preview, metadata).
- **No automatic chunking** — the app doesn't split clips into chunks itself; that happens externally.
- **No cross-avatar imports** — a derived clip belongs to the same avatar as its parent scene.
- **No audio-only files** — video files only (mp4, webm, mov).

## 7. Design Considerations

### UI Placement

**Avatar Detail Page:**
```
[Overview] [Metadata] [Scenes] [Derived] [Images] [Speech] [Settings]
```

The "Derived" tab shows a collapsible list grouped by parent clip:

```
▼ Face Close-Up — v3 (approved)                    [Import] [Scan]
  ├─ chunk_001.mp4  00:02.5  [lora-chunk]  ✓ approved   2 annotations
  ├─ chunk_002.mp4  00:02.5  [lora-chunk]  ○ pending    0 annotations
  └─ chunk_003.mp4  00:02.5  [lora-chunk]  ✗ rejected   1 annotation

▼ Body Full — v2 (approved)                         [Import] [Scan]
  └─ test_render_001.mp4  00:04.0  [test-render]  ○ pending
```

### Existing Components to Reuse
- `ClipPlaybackModal` — review modal (annotations, tags, notes, QA)
- `ImportClipDialog` — extend for parent selection + bulk mode
- `ClipCard` — clip gallery items (already supports `source: "imported"`)
- `TagInput` / `TagFilter` — labeling and filtering by category
- `BulkActionBar` — bulk approve/reject

## 8. Technical Considerations

### Existing Code to Reuse

| What | Where | How |
|---|---|---|
| Import handler | `handlers/scene_video_version.rs` | Extend with `parent_version_id` param |
| Import dialog | `features/scenes/ImportClipDialog.tsx` | Add parent selector, multi-file mode |
| ClipPlaybackModal | `features/scenes/ClipPlaybackModal.tsx` | Add parent context badge |
| Clips browse hook | `hooks/useClipManagement.ts` | Add `parent_version_id` filter |
| Entity tags | `components/domain/TagInput.tsx` | Already works on `scene_video_version` |
| Video processing | `crate::pipeline` or inline in handler | Transcode, preview, ffprobe |

### New Infrastructure Needed

| What | Where | Purpose |
|---|---|---|
| `parent_version_id` column | Migration | FK to self on `scene_video_versions` |
| `import-from-path` endpoint | `handlers/scene_video_version.rs` | Server-side file import |
| `import-batch-from-paths` endpoint | `handlers/scene_video_version.rs` | Batch server-side import |
| `DerivedClipsTab` component | `features/avatars/tabs/` | Avatar detail tab |
| `BulkImportDialog` component | `features/scenes/` | Multi-file upload dialog |
| `ScanDirectoryDialog` component | `features/scenes/` | Server path scan + import |

### Database Changes

```sql
-- Add parent version relationship
ALTER TABLE scene_video_versions
  ADD COLUMN parent_version_id BIGINT
    REFERENCES scene_video_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_scene_video_versions_parent ON scene_video_versions(parent_version_id);
```

### API Changes

| Method | Endpoint | Change |
|---|---|---|
| `POST` | `/scenes/{id}/versions/import` | Add optional `parent_version_id` field |
| `POST` | `/scenes/{id}/versions/import-from-path` | **New** — import from server path |
| `POST` | `/scenes/{id}/versions/import-batch-from-paths` | **New** — batch import from server paths |
| `GET` | `/scene-video-versions/browse` | Add `parent_version_id` filter param |
| `GET` | `/avatars/{id}/derived-clips` | **New** — list derived clips grouped by parent |

## 9. Success Metrics

- Pipeline operator can import a batch of LoRA chunks and have them reviewable within minutes.
- All existing review tools (annotations, tags, QA) work on derived clips without modification.
- Provenance chain is traceable: derived clip → parent approved clip → scene → avatar.

## 10. Open Questions

1. Should derived clips count toward the scene's "version count" or be tracked separately?
2. When a parent clip is rejected/deleted after derived clips exist, what happens to the derived clips? (Current: `ON DELETE SET NULL` — they become orphans but remain accessible.)
3. Should the server-side scan preserve original filenames as the clip's `notes` or a dedicated field?
4. Maximum batch size for server-side imports — should there be a limit?

## 11. Version History

- **v1.0** (2026-03-26): Initial PRD creation
