# PRD-165: Server-Side Directory & S3 Import with Unified Confirmation Flow

## 1. Introduction/Overview

The current project import flow only supports browser-based file drops — users drag folders from their local machine, and the frontend orchestrates a 5-phase upload. This works for small imports but is impractical when files already exist on the server filesystem or in an S3 bucket.

This PRD extends the existing directory scan infrastructure (PRD-155) to:
1. Support **S3 bucket scanning** in addition to local filesystem paths
2. Map scan results into `AvatarDropPayload[]` so they feed into the existing **ImportConfirmModal** confirmation flow
3. Complete the **server-side import pipeline** for all file types (images, videos, metadata) — not just images
4. Report **real-time progress via SSE** during the import phase
5. Deploy the "Scan Directory" button to **all relevant pages** (Project Avatars, Scenes, Media, Derived Clips)

The goal: pointing at a directory (local or S3) should feel identical to dropping a folder in the browser — same confirmation modal, same options, same result.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-155** (Server-Side Directory Scan Import): Provides the existing `POST /directory-scan` endpoint, `directory_scanner.rs` core module, `ScanDirectoryDialog` component, and `useDirectoryScan` hook. This PRD extends all of these.
- **PRD-122** (Storage Configuration): Provides the `StorageProvider` trait, `LocalStorageProvider`, `S3StorageProvider`, and S3 configuration in admin settings.
- **PRD-016** (Folder-to-Entity Bulk Importer): Original drop zone import flow that established the `ImportConfirmModal` and `useAvatarImport` patterns.

### Extends
- **PRD-021** (Source Image Management): Media variant upload infrastructure used during image import.
- **PRD-153** (Derived Clip Import): Clip naming convention and derived clip import endpoints.
- **PRD-151** (Bulk Selection & Operations): Bulk tag application patterns.

### Conflicts With
- **PRD-155** `POST /directory-scan/import` endpoint: Currently only handles images and writes directly to filesystem bypassing `StorageProvider`. This PRD replaces that implementation with a full multi-type import that uses the storage abstraction properly.

## 3. Goals

1. Users can import assets from a **server-local directory** or **S3 bucket** using the same confirmation flow as the browser drop zone
2. All file types are imported: **images, videos (including derived clips), and metadata JSON**
3. The import uses the **StorageProvider abstraction** so files are stored correctly regardless of the active storage backend
4. Users see **real-time progress** during server-side imports via SSE
5. The scan + import flow is available on **all pages** that deal with assets (Project Avatars, Scenes, Media, Derived Clips)

## 4. User Stories

- **As a content operator**, I want to point at a directory on the server and import all assets using the same confirmation modal as the drop zone, so I don't have to download and re-upload files through my browser.
- **As a content operator**, I want to scan an S3 bucket prefix and import assets, so I can onboard content that was delivered to cloud storage.
- **As a content operator**, I want to see real-time progress when importing from a server directory, so I know the import is working and how long it will take.
- **As a content operator**, I want the same deduplication, name normalization, and tag options available for server-side imports as for browser drops, so the workflow is consistent.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: S3 Directory Scanning
**Description:** Extend the existing `POST /directory-scan` endpoint to accept S3 URIs (`s3://bucket/prefix/`) in addition to local filesystem paths. The backend detects the source type from the path prefix and uses the appropriate provider to list and classify files.

**Acceptance Criteria:**
- [ ] `POST /directory-scan` accepts paths starting with `s3://` and scans the S3 bucket
- [ ] S3 scanning uses configured credentials from the storage backend settings (PRD-122)
- [ ] The same file classification logic (images, videos, metadata, speech) applies to S3 objects
- [ ] S3 scan returns the same `ScanResponse` structure as local filesystem scans
- [ ] Invalid S3 URIs or missing credentials return clear error messages
- [ ] User can also type `s3://` URIs in the path input field of the scan dialog

#### Requirement 1.2: Scan-to-Payload Mapping Layer
**Description:** Create a frontend mapping layer that converts `ScanResponse` (from the backend scan endpoint) into `AvatarDropPayload[]` (the format consumed by `ImportConfirmModal`). This allows scan results to flow through the existing confirmation UI.

**Acceptance Criteria:**
- [ ] `ScanResponse` avatars are mapped to `AvatarDropPayload[]` with correct `rawName`, `groupName`, and `assets`
- [ ] Image files become `DroppedAsset` entries with `kind: "image"` and `category` from the resolved `variant_type`
- [ ] Video files become `DroppedAsset` entries with `kind: "video"` and `clipMeta` populated from the resolved context (scene type, track, version, labels, clip index)
- [ ] Metadata files (bio.json, tov.json, metadata.json) are mapped to the payload's `bioJson`, `tovJson`, `metadataJson` fields
- [ ] Assets carry a `serverPath` field (local path or S3 key) instead of a browser `File` object, so the backend knows to copy from source rather than expect a multipart upload
- [ ] Hash-based deduplication uses the hashes computed during the scan phase (no re-hashing needed)
- [ ] Unresolved files from the scan are surfaced for manual avatar assignment (same as unmatched files in the drop flow)

#### Requirement 1.3: ImportConfirmModal Integration
**Description:** The `ImportConfirmModal` receives the mapped payloads and displays them with all existing options: name normalization, duplicate detection, group assignment, overwrite/skip/new-content-only toggles, and apply-filename-tags.

**Acceptance Criteria:**
- [ ] ImportConfirmModal renders scan results identically to browser-dropped folders
- [ ] All existing toggles work: normalize names, import missing, overwrite existing, new content only, apply filename tags
- [ ] Group assignment and creation works for server-side scan results
- [ ] Duplicate detection (name-based against existing avatars) works correctly
- [ ] Hash-based dedup summary shows correctly using hashes from the scan phase
- [ ] Asset counts (images, videos, metadata) display per avatar

#### Requirement 1.4: Server-Side Multi-Type Import Endpoint
**Description:** Replace the existing `POST /directory-scan/import` endpoint with a new `POST /directory-scan/import-assets` endpoint that handles all file types (images, videos, metadata) and runs the same 5-phase logic as the browser import, but entirely server-side.

**Acceptance Criteria:**
- [ ] Endpoint accepts the confirmed payloads (avatar names, group assignments, assets with server paths, and all toggle options)
- [ ] **Phase 0 — Groups:** Creates missing groups, returns group ID map
- [ ] **Phase 1 — Avatars:** Creates new avatars (bulk or per-group), returns name-to-ID map
- [ ] **Phase 2 — ID Resolution:** Resolves existing avatar IDs for update payloads
- [ ] **Phase 3 — Images:** Copies files from source (local path or S3) into managed storage via `StorageProvider`, creates `MediaVariant` records with hash, dimensions, and provenance
- [ ] **Phase 3.5 — Metadata:** Reads and parses bio.json/tov.json/metadata.json from source, merges and writes to avatar metadata
- [ ] **Phase 4 — Videos:** Copies video files into managed storage, creates scenes if missing, creates versions (or derived clips with parent linking), applies filename tags if enabled
- [ ] All file copies go through the `StorageProvider` abstraction (not direct filesystem writes)
- [ ] For S3 sources: files are downloaded from S3 source and uploaded to managed storage (which may be a different S3 location or local)
- [ ] For local sources: files are copied (not moved) into managed storage
- [ ] Returns SSE stream (see Requirement 1.5)

#### Requirement 1.5: SSE Progress Reporting
**Description:** The import endpoint streams real-time progress to the frontend via Server-Sent Events. The frontend maps these events onto the existing import progress UI.

**Acceptance Criteria:**
- [ ] Endpoint returns `Content-Type: text/event-stream`
- [ ] Events follow the format: `event: progress\ndata: {"phase":"...","current":N,"total":N}\n\n`
- [ ] Phases reported: `groups`, `avatars`, `images`, `metadata`, `videos`, `done`
- [ ] `done` event includes summary: `{"imported":N,"skipped":N,"failed":N,"errors":[...]}`
- [ ] Frontend consumes SSE via `EventSource` or `fetch` with `ReadableStream`
- [ ] Progress maps onto `useAvatarImport`'s existing progress state for consistent UI
- [ ] Connection drops are handled gracefully with retry or error display
- [ ] Import can be cancelled by closing the SSE connection (backend detects disconnect and stops)

#### Requirement 1.6: Scan Dialog Source Selector
**Description:** Update the scan dialog's input UI to support both local paths and S3 URIs, with the option to select from configured S3 backends.

**Acceptance Criteria:**
- [ ] Input field accepts both local paths (`/mnt/data/...`) and S3 URIs (`s3://bucket/prefix/`)
- [ ] A dropdown/button allows selecting from configured S3 storage backends (fetched from admin settings)
- [ ] Selecting an S3 backend pre-fills `s3://bucket-name/` in the path input
- [ ] User can also type S3 URIs manually without selecting from the dropdown
- [ ] Path validation provides feedback before scanning (basic format check)

#### Requirement 1.7: Deploy to All Relevant Pages
**Description:** Add the "Scan Directory" button and import flow to all pages that handle assets.

**Acceptance Criteria:**
- [ ] **Project Avatars tab**: Scan button in header, confirmation uses ImportConfirmModal, imports create avatars + all asset types
- [ ] **Scenes page**: Existing scan button upgraded to use ImportConfirmModal flow for video imports
- [ ] **Derived Clips page**: Scan button for importing derived clips with parent version linking
- [ ] **Media page**: Scan button for importing image variants to existing avatars
- [ ] Each page scopes the scan appropriately (pipeline, project, avatar context)
- [ ] All pages refresh their query caches after successful import

#### Requirement 1.8: Fix StorageProvider Bypass in Existing Import
**Description:** The existing `import_image()` function in `directory_scan.rs` writes directly to the filesystem via `tokio::fs::write()`, bypassing the `StorageProvider` abstraction. This must be fixed so imports work correctly regardless of the active storage backend.

**Acceptance Criteria:**
- [ ] All file writes during import go through `state.storage_provider().upload(key, data)`
- [ ] Storage key format follows existing conventions: `{pipeline_code}/variants/variant_{avatar_id}_{variant_type}_{timestamp}.{ext}`
- [ ] Video storage keys follow: `{pipeline_code}/scenes/scene_{scene_id}_v{version}_{timestamp}.{ext}`
- [ ] Works correctly when the active storage backend is Local or S3
- [ ] Existing imports (from the old PRD-155 flow) continue to work

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Background Import Jobs
**Description:** For very large imports (10,000+ files), allow the import to run as a background job that continues even if the user navigates away.

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** S3 Bucket Browser
**Description:** Instead of typing S3 URIs, provide a visual browser that lists S3 buckets and prefixes with folder-like navigation.

#### Requirement 2.3: **[OPTIONAL — Post-MVP]** Import Presets
**Description:** Save commonly used scan paths and toggle configurations as presets for quick re-import.

#### Requirement 2.4: **[OPTIONAL — Post-MVP]** Incremental/Watch Mode
**Description:** Monitor a directory for new files and auto-trigger the scan + import flow when changes are detected.

## 6. Non-Goals (Out of Scope)

- **Moving files**: Files are always copied, never moved or deleted from the source
- **FTP/SFTP/NFS sources**: Only local filesystem and S3 are supported
- **Transcoding or format conversion**: Files are imported as-is
- **Recursive S3 prefix depth limits**: The scan reads all objects under the prefix
- **Multi-server distributed imports**: Assumes a single backend instance performs the import
- **Import rollback**: Partial imports are committed (same as existing browser flow)

## 7. Design Considerations

### UI Components to Reuse
- **`ImportConfirmModal`** — The primary confirmation UI, used as-is with server-sourced payloads
- **`ScanDirectoryDialog`** — Extended with S3 source selector; its preview state may be simplified since ImportConfirmModal handles the detailed confirmation
- **`FileDropZone`** — No changes; continues to handle browser drops separately

### UX Flow
1. User clicks "Scan Directory" button on any supported page
2. Dialog opens with path input + optional S3 backend selector
3. User enters path or S3 URI, clicks Scan
4. Backend scans and returns classified results
5. Frontend maps `ScanResponse` → `AvatarDropPayload[]`
6. `ImportConfirmModal` opens with all standard options
7. User confirms → frontend sends confirmed payloads to `POST /directory-scan/import-assets`
8. SSE stream drives progress UI (same progress bar as browser imports)
9. Done event triggers cache invalidation and summary toast

### Dialog Simplification
The existing `ScanDirectoryDialog` has three states: Input → Preview → Results. With the new flow:
- **Input state** remains (path input + S3 selector + scan button)
- **Preview state** is replaced by `ImportConfirmModal` (richer confirmation with all toggles)
- **Results state** is replaced by the SSE progress UI within ImportConfirmModal

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Location | How Reused |
|-----------|----------|------------|
| `directory_scanner.rs` | `core` crate | Extended for S3 object listing |
| `StorageProvider` trait | `core` crate | Used for all file copies during import |
| `S3StorageProvider` | `cloud` crate | Used for reading from S3 source + writing to S3 target |
| `ImportConfirmModal` | frontend | Receives mapped payloads from scan |
| `useAvatarImport` progress state | frontend | SSE events mapped onto existing state |
| `clip-filename-parser.ts` | frontend | Already exists on frontend; backend equivalent in `directory_scanner.rs` |
| `ScanDirectoryDialog` | frontend | Extended with S3 selector |
| `useDirectoryScan` hook | frontend | Extended with new import mutation |

### New Infrastructure Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| Scan-to-payload mapper | frontend | Converts `ScanResponse` → `AvatarDropPayload[]` |
| SSE import endpoint | `api` crate | `POST /directory-scan/import-assets` returning `text/event-stream` |
| S3 source scanner | `core` crate | Extends `scan_directory()` to list S3 objects |
| Server-side video import | `api` crate | Scene creation, version creation, derived clip linking |
| Server-side metadata import | `api` crate | JSON parsing and avatar metadata update |
| SSE consumer hook | frontend | `useServerImport()` hook consuming SSE stream |

### Database Changes
No new tables or migrations required. All imports create records in existing tables (`media_variants`, `scenes`, `scene_video_versions`, `avatars`, `groups`, `tags`, `tag_assignments`).

### API Changes

| Method | Endpoint | Change |
|--------|----------|--------|
| `POST` | `/api/v1/directory-scan` | Extended: accept `s3://` paths, return content hashes |
| `POST` | `/api/v1/directory-scan/import-assets` | **New**: Full multi-type import with SSE progress |
| `GET` | `/api/v1/admin/storage/backends` | Existing: used to populate S3 backend selector |

The existing `POST /directory-scan/import` endpoint is preserved for backward compatibility but deprecated.

### Key Implementation Details

**S3 Source Scanning:**
- Use `S3StorageProvider::list()` to enumerate objects under the prefix
- Download object metadata (size, key) without downloading file content during scan
- File classification uses the key (path) just like local filesystem paths
- Content hashes can be computed lazily or use S3 ETags where available

**File Copy During Import:**
- Local → Local: read file, upload via `StorageProvider`
- Local → S3: read file, upload via `StorageProvider`
- S3 → Local: download from source S3, upload via `StorageProvider`
- S3 → S3 (same bucket): use S3 copy_object for efficiency
- S3 → S3 (different bucket): download then upload

**SSE in Axum:**
- Use `axum::response::Sse` with `tokio::sync::mpsc` channel
- Import logic sends progress events to channel
- SSE response streams from channel
- Detect client disconnect via channel close

## 9. Success Metrics

- Server-side import produces identical database state as an equivalent browser drop import
- Import of 1,000 files completes without timeout or memory issues
- SSE progress updates render smoothly in the UI (no perceptible lag)
- S3 scanning works with AWS S3, MinIO, and DigitalOcean Spaces

## 10. Open Questions

1. **S3 scan performance**: For very large buckets (100k+ objects), should we paginate the scan results or set a practical limit?
2. **Cross-region S3 copies**: Should we warn users about potential data transfer costs when scanning S3 buckets in different regions?
3. **File size limits**: Should there be a maximum file size for server-side imports, or trust the storage backend?

## 11. Version History

- **v1.0** (2026-04-16): Initial PRD creation
