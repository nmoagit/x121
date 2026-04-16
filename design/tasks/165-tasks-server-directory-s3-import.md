# Task List: Server-Side Directory & S3 Import with Unified Confirmation Flow

**PRD Reference:** `design/prds/165-prd-server-directory-s3-import.md`
**Scope:** Extend directory scan to support S3, map scan results into ImportConfirmModal, complete server-side multi-type import with SSE progress, deploy to all pages.

## Overview

This task list builds on the existing PRD-155 directory scan infrastructure. The core idea is a bridge: the backend scans and classifies files (local or S3), the frontend maps those results into `AvatarDropPayload[]`, and everything flows through the existing `ImportConfirmModal` and a new SSE-backed server-side import engine. No new database tables are needed — all imports create records in existing tables.

### What Already Exists
- `directory_scanner.rs` (core crate) — filesystem scanner with file classification
- `directory_scan.rs` (api crate) — scan + image-only import handlers
- `ScanDirectoryDialog.tsx` — three-state dialog (input → preview → results)
- `useDirectoryScan.ts` — TanStack Query hooks for scan/import endpoints
- `ImportConfirmModal.tsx` — rich confirmation UI with all toggles
- `useAvatarImport.ts` — 5-phase browser import orchestrator with `ImportProgress` state
- `StorageProvider` trait + `LocalStorageProvider` + `S3StorageProvider` — pluggable storage
- Scan buttons already exist on Scenes, Derived Clips, and Media pages

### What We're Building
1. S3 source scanning in the backend directory scanner
2. Scan-to-payload mapping layer (`ScanResponse` → `AvatarDropPayload[]`)
3. Full server-side import engine (images + videos + metadata) using `StorageProvider`
4. SSE endpoint wrapping the import engine with progress reporting
5. Frontend SSE consumer hook
6. S3 backend selector in the scan dialog
7. Unified scan → confirm → SSE import wiring on all pages

### Key Design Decisions
1. **Scan results map to `AvatarDropPayload[]`** — this avoids duplicating the ImportConfirmModal UI and keeps one confirmation flow for both browser drops and server scans
2. **`DroppedAsset` gets an optional `serverPath` field** — when present, the backend copies from that source instead of expecting a multipart upload
3. **SSE via Axum's `Sse` response** — import logic sends progress to a `tokio::sync::mpsc` channel, the endpoint streams it to the client
4. **All file writes go through `StorageProvider`** — fixes the current bypass where `import_image()` uses `tokio::fs::write()` directly

---

## Phase 1: Backend Foundation — Fix Storage & Extend Scanner

### Task 1.1: Fix StorageProvider Bypass in Existing Image Import
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

The existing `import_image()` function (around line 489-501) writes directly to the filesystem via `tokio::fs::write()` and `state.resolve_to_path()`. Replace this with `state.storage_provider().upload(key, &data)` so imports work regardless of whether the active backend is Local or S3.

```rust
// BEFORE (current code):
let abs_dir = state.resolve_to_path(&prefix).await?;
tokio::fs::create_dir_all(&abs_dir).await?;
let abs_path = abs_dir.join(&filename);
tokio::fs::write(&abs_path, &data).await?;

// AFTER:
let storage = state.storage_provider().await;
let storage_key = format!("{}/{}", prefix, filename);
storage.upload(&storage_key, &data).await
    .map_err(|e| AppError::internal(format!("Storage upload failed: {e}")))?;
```

Also update the `file_path` stored in the `CreateMediaVariant` record to use the storage key (not an absolute filesystem path).

**Acceptance Criteria:**
- [ ] `import_image()` uses `storage_provider().upload()` instead of `tokio::fs::write()`
- [ ] `file_path` in `CreateMediaVariant` stores the storage key, not an absolute path
- [ ] Storage key follows format: `{pipeline_code}/variants/variant_{avatar_id}_{variant_type}_{timestamp}.{ext}`
- [ ] Existing image imports via `POST /directory-scan/import` still work correctly
- [ ] Compile and pass existing tests

### Task 1.2: Add S3 Source Listing to Core Directory Scanner
**File:** `apps/backend/crates/core/src/directory_scanner.rs`

Extend `scan_directory()` to detect `s3://` paths. When the path starts with `s3://`, parse the bucket and prefix, then use the `StorageProvider::list()` method to enumerate objects instead of `std::fs::read_dir()`. The file classification logic (image/video/metadata by extension, avatar slug from path segments) stays the same — it just operates on S3 object keys instead of filesystem paths.

Since the core crate doesn't have access to `S3StorageProvider` directly, change `scan_directory()` to accept a trait object or a list of `ScannedEntry` structs that abstract over the source:

```rust
/// A file entry from any source (local filesystem or S3).
pub struct ScannedEntry {
    /// Full path or S3 key (e.g. "/mnt/data/alice/seed.png" or "prefix/alice/seed.png")
    pub path: String,
    /// Filename component only
    pub filename: String,
    /// File size in bytes
    pub size_bytes: u64,
    /// Relative path segments from the scan root (for structure detection)
    pub segments: Vec<String>,
}

/// Scan and classify pre-enumerated file entries.
pub fn classify_entries(entries: Vec<ScannedEntry>) -> Result<ScanResult, ScanError> { ... }
```

The existing `scan_directory()` function becomes a convenience wrapper that reads the local filesystem and calls `classify_entries()`.

**Acceptance Criteria:**
- [ ] New `ScannedEntry` struct and `classify_entries()` function in `directory_scanner.rs`
- [ ] Existing `scan_directory()` refactored to build `ScannedEntry` list and delegate to `classify_entries()`
- [ ] `classify_entries()` produces identical results to old `scan_directory()` for local paths
- [ ] All existing unit tests pass without modification
- [ ] New unit test for `classify_entries()` with manually constructed S3-style entries

### Task 1.3: Add S3 Enumeration in API Handler
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Update the `scan()` handler to detect `s3://` in the input path. When detected:
1. Parse bucket name and prefix from the URI
2. Build an `S3StorageProvider` from configured credentials (query `storage_backends` table for S3 backend, or use environment-based config)
3. Call `provider.list(prefix)` to get `StorageObject` entries
4. Map `StorageObject` → `ScannedEntry` (from Task 1.2)
5. Call `classify_entries()` and proceed as normal

```rust
let scan_result = if input.path.starts_with("s3://") {
    let (bucket, prefix) = parse_s3_uri(&input.path)?;
    let s3_provider = build_s3_provider(&state, &bucket).await?;
    let objects = s3_provider.list(&prefix).await?;
    let entries = objects.into_iter().map(|obj| ScannedEntry {
        path: format!("s3://{}/{}", bucket, obj.key),
        filename: obj.key.rsplit('/').next().unwrap_or(&obj.key).to_string(),
        size_bytes: obj.size as u64,
        segments: obj.key.strip_prefix(&prefix).unwrap_or(&obj.key)
            .trim_start_matches('/').split('/').map(String::from).collect(),
    }).collect();
    directory_scanner::classify_entries(entries)?
} else {
    directory_scanner::scan_directory(&input.path)?
};
```

**Acceptance Criteria:**
- [ ] `scan()` handler detects `s3://` prefix and routes to S3 enumeration
- [ ] `parse_s3_uri()` helper extracts bucket and prefix from `s3://bucket/prefix/path`
- [ ] S3 provider is built from stored backend config or environment variables
- [ ] S3 scan returns the same `ScanResponse` structure as local scans
- [ ] Invalid S3 URIs return `400 Bad Request` with descriptive message
- [ ] Missing S3 credentials return `422 Unprocessable Entity` with guidance

### Task 1.4: Add Content Hash Computation to Scan Response
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Extend `ScannedFileResponse` to include an optional `content_hash: Option<String>` field. During the scan phase, compute SHA-256 hashes for image and video files so the frontend can use them for deduplication without re-hashing.

For local files: read and hash. For S3 files: use S3 ETag if available (single-part uploads produce MD5 ETags — not SHA-256, so for S3 we may need to download and hash, or defer hashing to import time). For MVP, compute hashes for local files only and leave S3 hashes as `None`.

**Acceptance Criteria:**
- [ ] `ScannedFileResponse` has `content_hash: Option<String>` field
- [ ] Local file scans compute SHA-256 hashes for image and video files
- [ ] S3 scans set `content_hash` to `None` (deferred to import time)
- [ ] Frontend `useDirectoryScan` types updated to include `content_hash`
- [ ] Hash computation doesn't block the scan response for large directories (consider async/parallel hashing with a concurrency limit)

---

## Phase 2: Backend — Server-Side Multi-Type Import Engine

### Task 2.1: Define Import Request/Response Types
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Define the request and response types for the new `POST /directory-scan/import-assets` endpoint. This mirrors the data that `ImportConfirmModal.onConfirmWithAssets` sends.

```rust
#[derive(Debug, Deserialize)]
pub struct ImportAssetsInput {
    pub pipeline_id: DbId,
    pub project_id: DbId,
    /// Avatars to create (new names).
    pub new_payloads: Vec<ServerAvatarPayload>,
    /// Existing avatars to update with new assets.
    pub existing_payloads: Vec<ServerAvatarPayload>,
    /// Target group for new avatars (None = default "Intake" group).
    pub group_id: Option<DbId>,
    /// If true, overwrite existing variant types / scene versions.
    pub overwrite: bool,
    /// If true, skip files whose content hash matches existing records.
    pub skip_existing: bool,
    /// If true, apply parsed labels from filenames as tags.
    pub apply_filename_tags: bool,
}

#[derive(Debug, Deserialize)]
pub struct ServerAvatarPayload {
    pub raw_name: String,
    pub group_name: Option<String>,
    pub avatar_id: Option<DbId>,
    pub assets: Vec<ServerAsset>,
    pub bio_json_path: Option<String>,
    pub tov_json_path: Option<String>,
    pub metadata_json_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ServerAsset {
    /// Source path — local filesystem path or s3://bucket/key.
    pub server_path: String,
    pub category: String,
    pub kind: String, // "image" | "video"
    pub content_hash: Option<String>,
    pub clip_meta: Option<ServerClipMeta>,
}

#[derive(Debug, Deserialize)]
pub struct ServerClipMeta {
    pub scene_type_slug: String,
    pub track_slug: String,
    pub version: i32,
    pub labels: Vec<String>,
    pub clip_index: Option<i32>,
}
```

Also define the SSE progress event types:

```rust
#[derive(Debug, Serialize)]
pub struct ImportProgressEvent {
    pub phase: String,
    pub current: usize,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct ImportDoneEvent {
    pub imported: usize,
    pub skipped: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}
```

**Acceptance Criteria:**
- [ ] All request/response types defined and derive `Deserialize`/`Serialize`
- [ ] Types map cleanly to what `ImportConfirmModal.onConfirmWithAssets` produces
- [ ] SSE event types cover all phases: groups, avatars, images, metadata, videos, done
- [ ] Types compile with no warnings

### Task 2.2: Implement Source File Reader Abstraction
**File:** `apps/backend/crates/core/src/source_reader.rs` (new file)

Create a helper that reads file bytes from either a local path or S3 URI. This is used by all import phases to fetch file content before writing to managed storage.

```rust
use crate::storage::StorageProvider;
use crate::error::CoreError;

/// Read file bytes from a source path (local or S3).
pub async fn read_source_file(
    path: &str,
    s3_provider: Option<&dyn StorageProvider>,
) -> Result<Vec<u8>, CoreError> {
    if path.starts_with("s3://") {
        let key = path.strip_prefix("s3://")
            .and_then(|s| s.find('/').map(|i| &s[i+1..]))
            .ok_or_else(|| CoreError::validation("Invalid S3 path"))?;
        let provider = s3_provider
            .ok_or_else(|| CoreError::validation("S3 provider not configured"))?;
        provider.download(key).await
    } else {
        tokio::fs::read(path).await
            .map_err(|e| CoreError::internal(format!("Failed to read {path}: {e}")))
    }
}
```

**Acceptance Criteria:**
- [ ] `read_source_file()` reads from local filesystem when path is absolute
- [ ] `read_source_file()` downloads from S3 when path starts with `s3://`
- [ ] Returns clear error when S3 provider is `None` but path is `s3://`
- [ ] Returns clear error when local file doesn't exist
- [ ] Unit test for local file reading

### Task 2.3: Implement Server-Side Image Import Phase
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Extract and generalize the existing `import_image()` logic into a reusable `import_image_from_source()` function that:
1. Reads bytes from source via `read_source_file()`
2. Validates image format
3. Computes SHA-256 hash (or uses pre-computed hash from scan)
4. Uploads to managed storage via `StorageProvider`
5. Extracts dimensions
6. Creates `MediaVariant` record
7. Handles overwrite (soft-delete existing) and skip-existing (hash match) logic

```rust
async fn import_image_from_source(
    state: &AppState,
    asset: &ServerAsset,
    avatar_id: DbId,
    pipeline_code: &str,
    overwrite: bool,
    skip_existing: bool,
    s3_source: Option<&dyn StorageProvider>,
    progress_tx: &tokio::sync::mpsc::Sender<SseEvent>,
) -> Result<ImportFileResult, AppError> { ... }
```

**Acceptance Criteria:**
- [ ] Reads file bytes from local or S3 source
- [ ] Validates image format (png, jpg, webp, etc.)
- [ ] Computes or reuses SHA-256 content hash
- [ ] Uploads via `StorageProvider` (not direct filesystem write)
- [ ] Creates `MediaVariant` record with correct provenance
- [ ] Handles `overwrite=true` (soft-delete existing variants of same type)
- [ ] Handles `skip_existing=true` (skip if content hash matches existing)
- [ ] Auto-heroes first variant if no hero exists
- [ ] Sends progress event after each file

### Task 2.4: Implement Server-Side Video Import Phase
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Implement `import_video_from_source()` that mirrors the browser import's Phase 4 logic:
1. Reads video bytes from source
2. Validates video format (mp4, webm, mov)
3. Computes SHA-256 hash
4. Looks up scene_type and track by slug
5. Finds or creates scene for the avatar
6. Uploads to managed storage
7. Creates `SceneVideoVersion` record (with parent linking for derived clips)
8. Optionally applies filename tags via `TagRepo::bulk_apply()`

Reference the existing `import_video()` handler in `scene_video_version.rs` for the version creation and H.264 transcode logic.

```rust
async fn import_video_from_source(
    state: &AppState,
    asset: &ServerAsset,
    avatar_id: DbId,
    pipeline_id: DbId,
    pipeline_code: &str,
    apply_tags: bool,
    overwrite: bool,
    skip_existing: bool,
    s3_source: Option<&dyn StorageProvider>,
    progress_tx: &tokio::sync::mpsc::Sender<SseEvent>,
) -> Result<ImportFileResult, AppError> { ... }
```

**Acceptance Criteria:**
- [ ] Reads video bytes from local or S3 source
- [ ] Validates video format
- [ ] Looks up `scene_type_id` and `track_id` from clip metadata slugs
- [ ] Creates scene if one doesn't exist for this avatar + scene_type + track combination
- [ ] Creates `SceneVideoVersion` record via existing repo methods
- [ ] Handles derived clips: links `parent_version_id` to the original (no-parent) version
- [ ] Applies filename tags when `apply_tags=true` and `clipMeta.labels` is non-empty
- [ ] Handles overwrite/skip logic for existing scenes with videos
- [ ] Sends progress event after each file

### Task 2.5: Implement Server-Side Metadata Import Phase
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Implement `import_metadata_from_source()` that mirrors the browser import's Phase 3.5:
1. Reads JSON file bytes from source
2. Parses as JSON
3. For bio.json/tov.json: stores in metadata under `_source_bio`/`_source_tov` keys
4. For metadata.json: merges all keys into avatar metadata
5. Calls the avatar metadata update logic (reuse patterns from `update_avatar_metadata()` handler)

```rust
async fn import_metadata_from_source(
    state: &AppState,
    payload: &ServerAvatarPayload,
    avatar_id: DbId,
    skip_existing: bool,
    s3_source: Option<&dyn StorageProvider>,
    progress_tx: &tokio::sync::mpsc::Sender<SseEvent>,
) -> Result<ImportFileResult, AppError> { ... }
```

**Acceptance Criteria:**
- [ ] Reads bio.json, tov.json, metadata.json from source paths
- [ ] Parses JSON and validates structure
- [ ] Stores `_source_bio` and `_source_tov` correctly
- [ ] Merges metadata.json keys into avatar metadata
- [ ] Respects `skip_existing` — skips if avatar already has metadata
- [ ] Invalid JSON produces a warning (not a fatal error)
- [ ] Sends progress event after each avatar's metadata

### Task 2.6: Implement Import Orchestrator Function
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Create the main orchestrator that runs all 5 phases in order, sending SSE progress events through a channel:

```rust
async fn run_import(
    state: AppState,
    input: ImportAssetsInput,
    tx: tokio::sync::mpsc::Sender<SseEvent>,
) {
    // Phase 0: Create groups
    // Phase 1: Create avatars (bulk)
    // Phase 2: Resolve existing avatar IDs
    // Phase 3: Import images
    // Phase 3.5: Import metadata
    // Phase 4: Import videos
    // Phase 5: Send done event with summary
}
```

This function runs in a `tokio::spawn` task so the SSE endpoint can return the stream immediately.

**Acceptance Criteria:**
- [ ] Phases execute in order: groups → avatars → ID resolution → images → metadata → videos → done
- [ ] Each phase sends progress events with `{phase, current, total}`
- [ ] Group creation reuses `AvatarGroupRepo::ensure_default()` and `create()` patterns
- [ ] Avatar creation reuses `AvatarRepo::create_many()` for bulk creation
- [ ] Errors in one file don't stop the import — they're collected and reported in the done event
- [ ] If the SSE channel closes (client disconnect), the import stops gracefully
- [ ] Audit log entry created at completion

---

## Phase 3: Backend — SSE Import Endpoint

### Task 3.1: Register SSE Endpoint Route
**File:** `apps/backend/crates/api/src/routes/directory_scan.rs`

Add the new route for `POST /directory-scan/import-assets`:

```rust
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(handlers::directory_scan::scan))
        .route("/import", post(handlers::directory_scan::import))
        .route("/import-assets", post(handlers::directory_scan::import_assets))
}
```

**Acceptance Criteria:**
- [ ] Route registered at `POST /api/v1/directory-scan/import-assets`
- [ ] Route requires authentication (same as existing scan/import routes)
- [ ] Compiles without errors

### Task 3.2: Implement SSE Handler
**File:** `apps/backend/crates/api/src/handlers/directory_scan.rs`

Create the `import_assets()` handler that:
1. Parses the `ImportAssetsInput` request body
2. Creates an `mpsc` channel for progress events
3. Spawns the import orchestrator (Task 2.6) in a background task
4. Returns an `Sse` response that streams events from the channel

```rust
use axum::response::sse::{Event, KeepAlive, Sse};
use tokio_stream::wrappers::ReceiverStream;
use futures_util::stream::StreamExt;

pub async fn import_assets(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<ImportAssetsInput>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::channel::<SseEvent>(64);

    tokio::spawn(async move {
        run_import(state, input, tx).await;
    });

    let stream = ReceiverStream::new(rx).map(|evt| {
        Ok(Event::default()
            .event(evt.event_type)
            .data(serde_json::to_string(&evt.data).unwrap_or_default()))
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}
```

**Acceptance Criteria:**
- [ ] Handler returns `Content-Type: text/event-stream`
- [ ] Progress events stream in real-time as phases execute
- [ ] Done event includes final summary (imported, skipped, failed, errors)
- [ ] Keep-alive prevents connection timeouts during long imports
- [ ] Client disconnect detected via channel close (sender returns error)
- [ ] Handler compiles and cargo check passes

### Task 3.3: Add Required Dependencies
**File:** `apps/backend/crates/api/Cargo.toml`

Ensure the API crate has the necessary dependencies for SSE:

```toml
[dependencies]
tokio-stream = "0.1"
futures-util = "0.3"
# axum already includes SSE support
```

Check if these are already present and add only what's missing.

**Acceptance Criteria:**
- [ ] `tokio-stream` available for `ReceiverStream`
- [ ] `futures-util` available for `StreamExt`
- [ ] No duplicate or conflicting dependency versions
- [ ] `cargo check` passes

---

## Phase 4: Frontend — Scan-to-Payload Mapper & Modal Integration

### Task 4.1: Extend DroppedAsset Type with Server Path
**File:** `apps/frontend/src/features/projects/types.ts`

Add an optional `serverPath` field to `DroppedAsset` so server-scanned files can carry their source location instead of a browser `File` object:

```typescript
export interface DroppedAsset {
  file: File;
  /** Source path on server (local path or s3:// URI). When set, import uses server-side copy. */
  serverPath?: string;
  category: string;
  kind: "image" | "video";
  contentHash?: string;
  isDuplicate?: boolean;
  clipMeta?: { ... };
}
```

The `file` field remains required for type compatibility, but for server-sourced assets it can be a dummy `File` object (empty blob with the correct name).

**Acceptance Criteria:**
- [ ] `serverPath` field added to `DroppedAsset` interface
- [ ] Existing drop-zone code unaffected (serverPath is optional)
- [ ] TypeScript compiles without errors

### Task 4.2: Create Scan-to-Payload Mapping Function
**File:** `apps/frontend/src/features/projects/lib/scan-to-payload.ts` (new file)

Create a function that maps `ScanResponse` → `AvatarDropPayload[]`:

```typescript
import type { ScanResponse, AvatarScanGroup, ScannedFileResponse } from "@/hooks/useDirectoryScan";
import type { AvatarDropPayload, DroppedAsset, ImportHashSummary } from "../types";

/**
 * Convert backend scan results into AvatarDropPayload[] for ImportConfirmModal.
 */
export function mapScanToPayloads(scan: ScanResponse): {
  payloads: AvatarDropPayload[];
  hashSummary: ImportHashSummary;
} {
  const payloads: AvatarDropPayload[] = scan.avatars.map((group) => ({
    rawName: group.avatar_slug,
    assets: group.files
      .filter((f) => f.category === "image" || f.category === "video_clip")
      .map((f) => mapFileToAsset(f)),
    bioJson: findMetadataFile(group.files, "_source_bio"),
    tovJson: findMetadataFile(group.files, "_source_tov"),
    metadataJson: findMetadataFile(group.files, "metadata"),
  }));

  // Build hash summary from pre-computed hashes
  // ...

  return { payloads, hashSummary };
}

function mapFileToAsset(file: ScannedFileResponse): DroppedAsset {
  const isVideo = file.category === "video_clip";
  return {
    file: new File([], file.filename), // Dummy File object for type compat
    serverPath: file.path,
    category: file.resolved.variant_type ?? file.filename.replace(/\.[^.]+$/, ""),
    kind: isVideo ? "video" : "image",
    contentHash: file.content_hash ?? undefined,
    isDuplicate: file.conflict === "duplicate",
    clipMeta: isVideo && file.resolved.scene_type_slug ? {
      sceneTypeSlug: file.resolved.scene_type_slug,
      trackSlug: file.resolved.track_slug ?? "",
      version: file.resolved.version ?? 1,
      labels: file.resolved.labels ?? [],
      clipIndex: file.resolved.clip_index ?? null,
    } : undefined,
  };
}
```

**Acceptance Criteria:**
- [ ] Maps each `AvatarScanGroup` to an `AvatarDropPayload`
- [ ] Image files mapped with `kind: "image"`, `category` from resolved `variant_type`
- [ ] Video files mapped with `kind: "video"`, `clipMeta` from resolved context
- [ ] Metadata files (bio.json, tov.json, metadata.json) mapped to payload fields
- [ ] `serverPath` set on all assets (source path from scan)
- [ ] `contentHash` carried forward from scan response
- [ ] Unresolved files from scan mapped to a payload with empty `rawName` for manual assignment
- [ ] Hash summary computed from scan data (no re-hashing needed)

### Task 4.3: Update useDirectoryScan Types for Content Hash
**File:** `apps/frontend/src/hooks/useDirectoryScan.ts`

Add `content_hash` to `ScannedFileResponse`:

```typescript
export interface ScannedFileResponse {
  path: string;
  filename: string;
  size_bytes: number;
  category: FileCategory;
  resolved: ResolvedContext;
  conflict: ConflictStatus;
  content_hash?: string | null; // NEW
}
```

**Acceptance Criteria:**
- [ ] `content_hash` field added to `ScannedFileResponse`
- [ ] TypeScript compiles without errors
- [ ] Existing ScanDirectoryDialog and ScanPreview components unaffected

### Task 4.4: Adapt ImportConfirmModal for Server-Source Payloads
**File:** `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx`

The modal should work with server-sourced payloads without modification, since it operates on `AvatarDropPayload[]`. However, verify:
1. The hash summary display works when hashes come pre-computed (not async)
2. Asset counts display correctly for server-sourced assets
3. The `onConfirmWithAssets` callback passes through the payloads as-is

If the modal's hash checking (`computeAndCheckHashes`) runs automatically, it needs a guard to skip re-hashing when `hashSummary.isHashing === false` and hashes are already populated.

**Acceptance Criteria:**
- [ ] Modal renders correctly with server-sourced payloads (serverPath set, dummy File objects)
- [ ] Hash summary displays correctly without triggering re-hash
- [ ] All toggles (normalize, overwrite, skip existing, apply tags) work
- [ ] `onConfirmWithAssets` passes server-sourced payloads through unchanged
- [ ] No visual difference between browser-drop and server-scan confirmation

---

## Phase 5: Frontend — SSE Consumer & Progress UI

### Task 5.1: Create useServerImport SSE Hook
**File:** `apps/frontend/src/hooks/useServerImport.ts` (new file)

Create a hook that sends the confirmed import to the SSE endpoint and maps progress events onto `ImportProgress`:

```typescript
import { useCallback, useRef, useState } from "react";
import type { ImportProgress } from "@/features/projects/hooks/use-avatar-import";
import type { AvatarDropPayload } from "@/features/projects/types";

interface ServerImportOptions {
  pipelineId: number;
  projectId: number;
  onComplete?: (summary: ImportDoneSummary) => void;
}

export function useServerImport({ pipelineId, projectId, onComplete }: ServerImportOptions) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startImport = useCallback(async (
    newPayloads: AvatarDropPayload[],
    existingPayloads: AvatarDropPayload[],
    groupId?: number,
    overwrite?: boolean,
    skipExisting?: boolean,
    applyFilenameTags?: boolean,
  ) => {
    abortRef.current = new AbortController();

    const body = buildImportRequest(
      pipelineId, projectId, newPayloads, existingPayloads,
      groupId, overwrite, skipExisting, applyFilenameTags,
    );

    const response = await fetch("/api/v1/directory-scan/import-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abortRef.current.signal,
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    // Parse SSE events and update progress state...
  }, [pipelineId, projectId, onComplete]);

  const cancelImport = useCallback(() => {
    abortRef.current?.abort();
    setProgress(null);
  }, []);

  return { progress, startImport, cancelImport };
}
```

**Acceptance Criteria:**
- [ ] Hook connects to SSE endpoint via `fetch` with `ReadableStream`
- [ ] Parses SSE `event:` and `data:` lines correctly
- [ ] Maps phase names to `ImportProgress.phase` values (creating, uploading-images, uploading-metadata, importing-videos, done)
- [ ] Updates `progress.current` and `progress.total` from each event
- [ ] `done` event triggers `onComplete` callback with summary
- [ ] `cancelImport()` aborts the fetch and resets progress
- [ ] Handles connection errors gracefully (sets error state)

### Task 5.2: Create Import Request Builder
**File:** `apps/frontend/src/hooks/useServerImport.ts` (same file)

Add the helper that converts `AvatarDropPayload[]` (with serverPath assets) into the `ImportAssetsInput` request body expected by the backend:

```typescript
function buildImportRequest(
  pipelineId: number,
  projectId: number,
  newPayloads: AvatarDropPayload[],
  existingPayloads: AvatarDropPayload[],
  groupId?: number,
  overwrite?: boolean,
  skipExisting?: boolean,
  applyFilenameTags?: boolean,
): ImportAssetsInput {
  const mapPayload = (p: AvatarDropPayload) => ({
    raw_name: p.rawName,
    group_name: p.groupName,
    avatar_id: null, // Resolved server-side for existing payloads
    assets: p.assets
      .filter((a) => a.serverPath)
      .map((a) => ({
        server_path: a.serverPath!,
        category: a.category,
        kind: a.kind,
        content_hash: a.contentHash ?? null,
        clip_meta: a.clipMeta ? {
          scene_type_slug: a.clipMeta.sceneTypeSlug,
          track_slug: a.clipMeta.trackSlug,
          version: a.clipMeta.version,
          labels: a.clipMeta.labels,
          clip_index: a.clipMeta.clipIndex ?? null,
        } : null,
      })),
    bio_json_path: p.bioJson ? (p.bioJson as any).serverPath ?? null : null,
    tov_json_path: p.tovJson ? (p.tovJson as any).serverPath ?? null : null,
    metadata_json_path: p.metadataJson ? (p.metadataJson as any).serverPath ?? null : null,
  });

  return {
    pipeline_id: pipelineId,
    project_id: projectId,
    new_payloads: newPayloads.map(mapPayload),
    existing_payloads: existingPayloads.map(mapPayload),
    group_id: groupId ?? null,
    overwrite: overwrite ?? false,
    skip_existing: skipExisting ?? false,
    apply_filename_tags: applyFilenameTags ?? false,
  };
}
```

**Acceptance Criteria:**
- [ ] Correctly maps `AvatarDropPayload[]` → `ServerAvatarPayload[]`
- [ ] `serverPath` extracted from each asset
- [ ] `clipMeta` converted from camelCase to snake_case
- [ ] Metadata file paths extracted (bio, tov, metadata JSON)
- [ ] All toggle options passed through

---

## Phase 6: Frontend — Scan Dialog S3 Source Selector

### Task 6.1: Add S3 Backend Selector to ScanDirectoryDialog
**File:** `apps/frontend/src/components/domain/ScanDirectoryDialog.tsx`

Add a dropdown next to the path input that lists configured S3 storage backends. Selecting one pre-fills `s3://bucket-name/` in the path input. The user can also type S3 URIs manually.

```typescript
// Fetch S3 backends from admin settings
const { data: backends } = useStorageBackends(); // Existing hook or new query

// In the UI, add a dropdown before the input:
<Select size="xs" placeholder="Source..." onChange={handleBackendSelect}>
  <option value="">Local path</option>
  {backends?.filter(b => b.backend_type_id === 2).map(b => (
    <option key={b.id} value={`s3://${b.config.bucket}/`}>
      S3: {b.config.bucket}
    </option>
  ))}
</Select>
```

**Acceptance Criteria:**
- [ ] Dropdown shows "Local path" as default + configured S3 backends
- [ ] Selecting an S3 backend pre-fills `s3://bucket-name/` in the input
- [ ] User can still type `s3://` URIs manually without the dropdown
- [ ] Input placeholder updates based on selection (local path placeholder vs. S3 prefix placeholder)
- [ ] Works correctly when no S3 backends are configured (dropdown only shows "Local path")

### Task 6.2: Add Path Validation Feedback
**File:** `apps/frontend/src/components/domain/ScanDirectoryDialog.tsx`

Add basic validation feedback before scanning:
- Local paths: must start with `/`
- S3 URIs: must match `s3://[bucket]/[optional-prefix]`
- Show inline validation message below the input

**Acceptance Criteria:**
- [ ] Invalid paths show red validation text
- [ ] Valid paths show no error (or subtle green check)
- [ ] Scan button disabled when path is invalid
- [ ] Validation runs on input change (debounced)

---

## Phase 7: Frontend — Deploy to All Pages

### Task 7.1: Wire Up Project Avatars Tab
**File:** `apps/frontend/src/features/projects/tabs/ProjectAvatarsTab.tsx`

Add "Scan Directory" button to the Project Avatars tab header. On scan completion:
1. Map `ScanResponse` → `AvatarDropPayload[]` via `mapScanToPayloads()`
2. Open `ImportConfirmModal` with the mapped payloads
3. On confirm, use `useServerImport()` to stream the import via SSE
4. On completion, invalidate avatar/scene/media queries

```typescript
const [scanOpen, setScanOpen] = useState(false);
const [scanPayloads, setScanPayloads] = useState<AvatarDropPayload[] | null>(null);

// In the scan dialog's onSuccess:
const handleScanSuccess = (scanResult: ScanResponse) => {
  const { payloads, hashSummary } = mapScanToPayloads(scanResult);
  setScanPayloads(payloads);
  setScanOpen(false);
  // Open ImportConfirmModal with scanPayloads
};
```

**Acceptance Criteria:**
- [ ] "Scan Directory" button appears in the Project Avatars tab header
- [ ] Scan dialog opens with S3 selector
- [ ] Scan results flow through `mapScanToPayloads()` → `ImportConfirmModal`
- [ ] Confirm triggers `useServerImport()` SSE import
- [ ] Progress displays in the same progress bar as browser imports
- [ ] Cache invalidated on completion
- [ ] Browser drop zone continues to work independently

### Task 7.2: Upgrade Scenes Page Scan Flow
**File:** `apps/frontend/src/app/pages/ScenesPage.tsx`

Replace the existing `ScanDirectoryDialog` flow (which uses the old per-file preview) with the new unified flow:
1. Scan dialog opens (with S3 selector)
2. Results map to payloads
3. `ImportConfirmModal` opens for video confirmation
4. SSE import handles video imports server-side

**Acceptance Criteria:**
- [ ] Existing scan button triggers the new flow
- [ ] Video files from scan go through ImportConfirmModal confirmation
- [ ] SSE import handles video creation (scenes, versions, derived clips)
- [ ] Tags applied from filenames when enabled
- [ ] Scene queries invalidated on completion

### Task 7.3: Upgrade Derived Clips Page Scan Flow
**File:** `apps/frontend/src/app/pages/DerivedClipsPage.tsx`

Same upgrade pattern as Scenes page — replace old `ScanDirectoryDialog` flow with unified scan → confirm → SSE import.

**Acceptance Criteria:**
- [ ] Existing scan button triggers the new flow
- [ ] Derived clip files go through ImportConfirmModal confirmation
- [ ] SSE import handles derived clip creation with parent version linking
- [ ] Derived clip queries invalidated on completion

### Task 7.4: Upgrade Media Page Scan Flow
**File:** `apps/frontend/src/app/pages/MediaPage.tsx`

Same upgrade pattern — replace old `ScanDirectoryDialog` flow with unified scan → confirm → SSE import for image variants.

**Acceptance Criteria:**
- [ ] Existing scan button triggers the new flow
- [ ] Image files from scan go through ImportConfirmModal confirmation
- [ ] SSE import handles image variant creation
- [ ] Media variant queries invalidated on completion

### Task 7.5: Create Shared Scan-to-Import Orchestration Hook
**File:** `apps/frontend/src/hooks/useScanImportFlow.ts` (new file)

Since Tasks 7.1-7.4 all follow the same pattern (scan → map → confirm → SSE import), create a shared hook that encapsulates this flow:

```typescript
export function useScanImportFlow(options: {
  pipelineId: number;
  projectId: number;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmPayloads, setConfirmPayloads] = useState<AvatarDropPayload[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hashSummary, setHashSummary] = useState<ImportHashSummary | null>(null);
  const serverImport = useServerImport(options);

  const handleScanComplete = (scanResult: ScanResponse) => {
    const { payloads, hashSummary } = mapScanToPayloads(scanResult);
    setConfirmPayloads(payloads);
    setHashSummary(hashSummary);
    setScanOpen(false);
    setConfirmOpen(true);
  };

  const handleConfirm = (newPayloads, existingPayloads, groupId, overwrite, skipExisting, applyTags) => {
    setConfirmOpen(false);
    serverImport.startImport(newPayloads, existingPayloads, groupId, overwrite, skipExisting, applyTags);
  };

  return {
    scanOpen, setScanOpen,
    confirmOpen, confirmPayloads, hashSummary,
    handleScanComplete, handleConfirm,
    importProgress: serverImport.progress,
    cancelImport: serverImport.cancelImport,
  };
}
```

Build this **before** Tasks 7.1-7.4, then each page just uses this hook.

**Acceptance Criteria:**
- [ ] Hook manages the full scan → confirm → import state machine
- [ ] Exposes `scanOpen`/`confirmOpen` state for dialog rendering
- [ ] `handleScanComplete` maps scan results and opens confirm modal
- [ ] `handleConfirm` triggers SSE import
- [ ] Progress state exposed for progress UI
- [ ] Cancel support
- [ ] Used by all four pages (Project Avatars, Scenes, Derived Clips, Media)

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/core/src/directory_scanner.rs` | Core scanner — add `ScannedEntry` + `classify_entries()` |
| `apps/backend/crates/core/src/source_reader.rs` | **New** — read files from local or S3 source |
| `apps/backend/crates/core/src/storage/mod.rs` | StorageProvider trait (reference only) |
| `apps/backend/crates/api/src/handlers/directory_scan.rs` | Fix storage bypass, add import engine + SSE handler |
| `apps/backend/crates/api/src/routes/directory_scan.rs` | Add `/import-assets` route |
| `apps/backend/crates/api/Cargo.toml` | Add SSE dependencies if missing |
| `apps/frontend/src/features/projects/types.ts` | Add `serverPath` to `DroppedAsset` |
| `apps/frontend/src/features/projects/lib/scan-to-payload.ts` | **New** — `ScanResponse` → `AvatarDropPayload[]` mapper |
| `apps/frontend/src/hooks/useDirectoryScan.ts` | Add `content_hash` to types |
| `apps/frontend/src/hooks/useServerImport.ts` | **New** — SSE consumer hook |
| `apps/frontend/src/hooks/useScanImportFlow.ts` | **New** — shared scan→confirm→import orchestration |
| `apps/frontend/src/components/domain/ScanDirectoryDialog.tsx` | Add S3 selector + validation |
| `apps/frontend/src/features/projects/components/ImportConfirmModal.tsx` | Verify server-source compat |
| `apps/frontend/src/features/projects/tabs/ProjectAvatarsTab.tsx` | Wire up scan button + flow |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | Upgrade to unified flow |
| `apps/frontend/src/app/pages/DerivedClipsPage.tsx` | Upgrade to unified flow |
| `apps/frontend/src/app/pages/MediaPage.tsx` | Upgrade to unified flow |

---

## Dependencies

### Existing Components to Reuse
- `StorageProvider` trait + `LocalStorageProvider` + `S3StorageProvider` from core/cloud crates
- `ImportConfirmModal` from `features/projects/components/`
- `useAvatarImport` `ImportProgress` type from `features/projects/hooks/`
- `directory_scanner::scan_directory()` from core crate
- `MediaVariantRepo`, `SceneRepo`, `SceneVideoVersionRepo`, `AvatarRepo`, `TagRepo` from db crate
- `ScanDirectoryDialog` from `components/domain/`
- `useDirectoryScan` hook from `hooks/`

### New Infrastructure Needed
- `ScannedEntry` + `classify_entries()` in core scanner
- `source_reader.rs` in core crate
- `import_assets` SSE handler in api crate
- `scan-to-payload.ts` mapper in frontend
- `useServerImport` SSE consumer hook in frontend
- `useScanImportFlow` orchestration hook in frontend

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Backend Foundation — Tasks 1.1-1.4
2. Phase 2: Import Engine — Tasks 2.1-2.6
3. Phase 3: SSE Endpoint — Tasks 3.1-3.3
4. Phase 4: Frontend Mapper — Tasks 4.1-4.4
5. Phase 5: SSE Consumer — Tasks 5.1-5.2
6. Phase 7: Deploy — Task 7.5 first (shared hook), then 7.1 (Project Avatars tab)

**MVP Success Criteria:**
- Scan a local directory from the Project Avatars tab
- See results in ImportConfirmModal with all standard options
- Confirm and see SSE progress through all phases
- Avatars, images, videos, and metadata all imported correctly

### Full Implementation
7. Phase 6: S3 Selector — Tasks 6.1-6.2
8. Phase 7: Remaining pages — Tasks 7.2-7.4

---

## Notes

1. **StorageProvider fix (Task 1.1) should be done first** — it's a bug fix independent of the new feature and prevents data loss when S3 is the active backend
2. **The `file` field on `DroppedAsset` uses a dummy `File` object** for server-sourced assets — this is a pragmatic choice to avoid a large refactor of ImportConfirmModal's type expectations
3. **SSE vs WebSocket**: SSE chosen because this is a unidirectional stream. If bidirectional control is needed later (pause/resume), this can be upgraded to WebSocket
4. **S3 hash computation deferred**: Computing SHA-256 for S3 objects requires downloading them during scan, which is expensive. For MVP, hashes are only computed for local files; S3 dedup happens at import time
5. **The existing `POST /directory-scan/import` endpoint is preserved** for backward compatibility but deprecated — the old ScanDirectoryPreview flow still works if needed

---

## Version History

- **v1.0** (2026-04-16): Initial task list creation from PRD-165
