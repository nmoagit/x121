# Task List: ComfyUI Output Handling & Artifact Storage

**PRD Reference:** `design/prds/127-prd-comfyui-output-handling-artifact-storage.md`
**Scope:** Unified pipeline output handling for all ComfyUI workflow patterns, artifact storage, generation snapshot population, and frontend artifact timeline display.

## Overview

Extend the pipeline's completion handler to download ALL outputs from a ComfyUI execution (not just the first), classify them by role using node title conventions (`[final]`/`[intermediate]`), store intermediates as artifacts linked to scene video versions, populate generation snapshots, and display artifacts in a timeline on the scene detail page.

### What Already Exists
- `ComfyUIApi::extract_output_info()` — extracts first output; needs extension for all outputs
- `ComfyUIApi::download_output()` — downloads single file by `OutputFileInfo`; reuse as-is
- `completion_handler::handle_completion()` — processes single segment output; extend for multi-output
- `SceneVideoVersionRepo::create()` — creates version records; add `generation_snapshot` to DTO
- `ClipCard` — already renders `generation_snapshot` collapsible; extend for artifact display
- `ClipPlaybackModal` — reuse for artifact video playback
- `StorageProvider` trait — use for all artifact storage
- `probe_stored_duration()` — reuse for artifact duration extraction

### What We're Building
1. `scene_video_version_artifacts` table and repo
2. `output_classifier` module in pipeline crate
3. Extended completion handler with multi-output download
4. Generation snapshot builder
5. Artifacts API endpoint
6. Frontend artifact timeline component

### Key Design Decisions
1. Node titles use bracket-prefix convention (`[final]`, `[intermediate]`); fallback: last output node = final
2. Artifacts are reference-only (no QA status, no delivery participation)
3. Generation snapshot is a denormalized version-level summary, distinct from PRD-069 segment receipts
4. All three workflow patterns (multi-segment, single-output, single+intermediates) share the same output download logic

---

## Phase 1: Database & Models

### Task 1.1: Create `scene_video_version_artifacts` migration [COMPLETE]
**File:** `apps/db/migrations/20260306000005_scene_video_version_artifacts.sql`

Create the artifacts table for storing intermediate ComfyUI outputs linked to scene video versions.

```sql
CREATE TABLE scene_video_version_artifacts (
    id              BIGSERIAL PRIMARY KEY,
    version_id      BIGINT NOT NULL REFERENCES scene_video_versions(id),
    role            TEXT NOT NULL CHECK (role IN ('final', 'intermediate')),
    label           TEXT NOT NULL,
    node_id         TEXT,
    file_path       TEXT NOT NULL,
    file_size_bytes BIGINT,
    duration_secs   DOUBLE PRECISION,
    width           INTEGER,
    height          INTEGER,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_svv_artifacts_version_id ON scene_video_version_artifacts(version_id)
    WHERE deleted_at IS NULL;
```

**Acceptance Criteria:**
- [x] Migration creates table with all columns and constraints
- [x] Foreign key to `scene_video_versions(id)` enforced
- [x] Partial index on `version_id` excludes soft-deleted rows
- [x] `role` CHECK constraint limits to `final` or `intermediate`

### Task 1.2: Create artifact model and DTO [COMPLETE]
**File:** `apps/backend/crates/db/src/models/scene_video_version_artifact.rs`

Create the Rust model and DTOs following existing patterns in `models/scene_video_version.rs`.

```rust
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneVideoVersionArtifact {
    pub id: DbId,
    pub version_id: DbId,
    pub role: String,
    pub label: String,
    pub node_id: Option<String>,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sort_order: i32,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateArtifact {
    pub version_id: DbId,
    pub role: String,
    pub label: String,
    pub node_id: Option<String>,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sort_order: i32,
}
```

**Acceptance Criteria:**
- [x] Model derives `FromRow`, `Serialize`, `Debug`, `Clone`
- [x] DTO derives `Deserialize`, `Debug`, `Clone`
- [x] Model exported from `models/mod.rs`

### Task 1.3: Create artifact repository [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_artifact_repo.rs`

CRUD repository following `SceneVideoVersionRepo` patterns.

Methods needed:
- `create(pool, input) -> Result<Artifact>`
- `list_by_version(pool, version_id) -> Result<Vec<Artifact>>` (ordered by `sort_order ASC`)
- `soft_delete(pool, id) -> Result<bool>`
- `soft_delete_by_version(pool, version_id) -> Result<u64>` (cascade soft-delete when parent is deleted)

**Acceptance Criteria:**
- [x] All four methods implemented with proper SQL
- [x] `list_by_version` excludes soft-deleted rows, orders by `sort_order ASC`
- [x] `soft_delete_by_version` marks all artifacts for a version as deleted
- [x] Repo exported from `repositories/mod.rs`

### Task 1.4: Add `generation_snapshot` to `CreateSceneVideoVersion` [COMPLETE]
**File:** `apps/backend/crates/db/src/models/scene_video_version.rs`, `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`

Add `generation_snapshot: Option<serde_json::Value>` to the create DTO and include it in the `create()` and `create_as_final()` INSERT queries.

**Acceptance Criteria:**
- [x] `CreateSceneVideoVersion` has `generation_snapshot: Option<serde_json::Value>` field
- [x] `SceneVideoVersionRepo::create()` includes `generation_snapshot` in INSERT (`$8`)
- [x] `SceneVideoVersionRepo::create_as_final()` includes `generation_snapshot` in INSERT
- [x] COLUMNS const already includes `generation_snapshot` (verify)
- [x] Existing callers compile without changes (field is `Option`, defaults to `None`)

---

## Phase 2: Output Classifier

### Task 2.1: Create output classifier module [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/output_classifier.rs`

New module that parses ComfyUI history to enumerate all outputs, reads node titles to classify by role.

```rust
/// A classified output from a ComfyUI execution.
#[derive(Debug, Clone)]
pub struct ClassifiedOutput {
    pub node_id: String,
    pub role: OutputRole,
    pub label: String,
    pub file_info: OutputFileInfo,
    pub sort_order: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OutputRole {
    Final,
    Intermediate,
}

/// Extract and classify all outputs from a ComfyUI history response.
pub fn classify_outputs(
    history: &serde_json::Value,
    prompt_id: &str,
    workflow: &serde_json::Value,
) -> Result<Vec<ClassifiedOutput>, PipelineError>
```

Logic:
1. Get `history[prompt_id].outputs` as object
2. For each `(node_id, node_output)`, iterate `gifs`/`videos`/`images` arrays
3. Look up node title from `workflow[node_id]._meta.title` (ComfyUI stores titles there)
4. Parse bracket-prefix: `[final]`, `[intermediate]` (case-insensitive)
5. If no tags on any node: last output node = `Final`, others = `Intermediate`
6. If multiple `[final]` tags: warn, use last one
7. Assign `sort_order` based on iteration order
8. Return `Vec<ClassifiedOutput>`

**Acceptance Criteria:**
- [x] Parses `[final]` and `[intermediate]` tags case-insensitively
- [x] Falls back to positional inference when no tags present
- [x] Logs warning if multiple `[final]` nodes found
- [x] Returns error if no outputs found at all
- [x] Handles both `gifs` and `videos` output arrays
- [x] Sort order assigned sequentially

### Task 2.2: Add `extract_all_outputs` to ComfyUI API [COMPLETE]
**File:** `apps/backend/crates/comfyui/src/api.rs`

Add a method that returns ALL output file infos from history (not just the first).

```rust
/// Extract all output files from a ComfyUI history response, keyed by node ID.
pub fn extract_all_output_infos(
    history: &serde_json::Value,
    prompt_id: &str,
) -> Result<Vec<(String, OutputFileInfo)>, String>
```

Returns `Vec<(node_id, OutputFileInfo)>` for every output file across all nodes.

**Acceptance Criteria:**
- [x] Returns all outputs from all nodes (not just the first)
- [x] Each entry includes the `node_id` it came from
- [x] Handles `gifs`, `videos`, and `images` output arrays
- [x] Returns error only if no history entry exists for the prompt_id
- [x] Empty outputs returns empty vec (not error)

### Task 2.3: Unit tests for output classifier [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/output_classifier.rs` (in `#[cfg(test)]` block)

Test cases:
1. Single output, no tags → classified as `Final`
2. Two outputs, both tagged → correct classification
3. Two outputs, no tags → last = `Final`, first = `Intermediate`
4. Multiple `[final]` tags → warning, last one used
5. Mixed case tags (`[FINAL]`, `[Final]`) → all recognized
6. No outputs → error

**Acceptance Criteria:**
- [x] All 6 test cases pass
- [x] Tests use realistic ComfyUI history JSON structures

---

## Phase 3: Completion Handler Extension

### Task 3.1: Refactor `handle_completion` for multi-output download [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/completion_handler.rs`

Extend `handle_completion` to:
1. Call `classify_outputs()` to get all classified outputs
2. Download ALL outputs (not just the first)
3. For the `Final` output: store at delivery path, extract metadata
4. For `Intermediate` outputs: store at artifact path
5. Return enriched `CompletionResult` with artifact info

Add to `CompletionResult`:
```rust
pub struct CompletionResult {
    // ... existing fields ...
    pub classified_outputs: Vec<ClassifiedOutput>,
    pub downloaded_artifacts: Vec<DownloadedArtifact>,
}

pub struct DownloadedArtifact {
    pub classified: ClassifiedOutput,
    pub storage_key: String,
    pub file_size_bytes: i64,
    pub duration_secs: Option<f64>,
}
```

The download logic should:
- Download final output first (fatal on failure)
- Download intermediates concurrently via `futures::join_all` (non-fatal on failure)
- Log errors for failed artifact downloads but continue

**Acceptance Criteria:**
- [x] All outputs enumerated via `classify_outputs()`
- [x] Final output downloaded and stored at segment path (existing logic)
- [x] Intermediate outputs downloaded and stored at `artifacts/{segment_id}/{node_id}/{filename}`
- [x] Failed artifact downloads logged but don't fail the completion
- [x] `CompletionResult` includes artifact info for downstream use
- [x] Existing segment-only flow still works (backwards compatible)

### Task 3.2: Create scene video version from single-output workflows [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/completion_handler.rs` or new `version_creator.rs`

For workflow patterns B and C (single-output, single+intermediates), create a `scene_video_version` record directly after completion instead of waiting for stitching.

```rust
/// Create a scene_video_version from a completed single-output workflow.
pub async fn create_version_from_completion(
    pool: &sqlx::PgPool,
    completion: &CompletionResult,
    generation_snapshot: serde_json::Value,
) -> Result<SceneVideoVersion, PipelineError>
```

This function:
1. Calls `SceneVideoVersionRepo::create()` with `source = "generated"`, the final output path, file size, duration
2. Passes `generation_snapshot`
3. Creates artifact records via `SceneVideoVersionArtifactRepo::create()` for each intermediate
4. Returns the created version

**Acceptance Criteria:**
- [x] Scene video version created with `source = "generated"`
- [x] `generation_snapshot` populated
- [x] `is_final` set to `false` (QA review required)
- [x] Artifact records created for all intermediates
- [x] Artifact `version_id` correctly links to the new version
- [x] Version number auto-incremented (repo handles this)

---

## Phase 4: Generation Snapshot

### Task 4.1: Build generation snapshot from context [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/snapshot.rs` (new)

Create a module that builds a `serde_json::Value` snapshot from `GenerationContext` and execution metadata.

```rust
/// Build a generation snapshot from the context used for this execution.
pub fn build_generation_snapshot(
    ctx: &GenerationContext,
    instance_id: DbId,
    scene_type_name: &str,
) -> serde_json::Value
```

Snapshot structure:
```json
{
  "scene_type": "scene_type_name",
  "clip_position": "full_clip",
  "seed_image": "path/to/seed.png",
  "prompts": { "positive": "resolved text...", "negative": "..." },
  "generation_params": { "3.cfg": 7.5, "3.steps": 20 },
  "lora_config": { ... },
  "comfyui_instance_id": 1,
  "generated_at": "2026-03-06T12:00:00Z"
}
```

**Acceptance Criteria:**
- [x] Includes scene type name, clip position, seed image path
- [x] Includes resolved prompts keyed by slot label
- [x] Includes generation params and LoRA config (if present)
- [x] Includes ComfyUI instance ID and timestamp
- [x] Returns `serde_json::Value` (not a typed struct — flexible for future fields)
- [x] Unit test verifies snapshot structure

### Task 4.2: Wire snapshot through completion flow [COMPLETE]
**File:** `apps/backend/crates/pipeline/src/completion_handler.rs`, `apps/backend/crates/worker/src/event_loop.rs`

Pass the `GenerationContext` (or snapshot) through the completion flow so it's available when creating scene video versions.

Options:
- Pass `GenerationContext` into `handle_completion()`
- Or build the snapshot in the event loop before calling completion, and pass it through

The event loop already has access to the job params (segment_id, scene_id). It would need to also load/pass the generation context or a pre-built snapshot.

**Acceptance Criteria:**
- [x] Generation snapshot is available at the point where `create_version_from_completion` is called
- [x] Snapshot is built from the actual parameters used (not re-loaded from DB)
- [x] For Pattern A (multi-segment), snapshot is stored per-segment for later aggregation during stitching

---

## Phase 5: API Endpoint

### Task 5.1: Create artifacts API handler [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Add handler for listing artifacts for a scene video version.

```rust
/// GET /api/v1/scene-video-versions/{id}/artifacts
pub async fn list_artifacts(
    State(state): State<AppState>,
    Path(version_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<SceneVideoVersionArtifact>>>>
```

**Acceptance Criteria:**
- [x] Returns artifacts ordered by `sort_order ASC`
- [x] Returns 404 if version doesn't exist
- [x] Excludes soft-deleted artifacts
- [x] Response uses standard `DataResponse` envelope

### Task 5.2: Register artifacts route [COMPLETE]
**File:** `apps/backend/crates/api/src/routes/scene.rs` (or appropriate route file)

Add the route: `GET /api/v1/scene-video-versions/{id}/artifacts`

**Acceptance Criteria:**
- [x] Route registered and accessible
- [x] Uses correct handler function
- [x] Follows existing route naming patterns

---

## Phase 6: Frontend

### Task 6.1: Add artifact types and API hook [COMPLETE]
**Files:**
- `apps/frontend/src/features/scenes/types.ts`
- `apps/frontend/src/features/scenes/hooks/useArtifacts.ts` (new)

Add TypeScript types matching the backend model and a TanStack Query hook.

```typescript
export interface SceneVideoVersionArtifact {
  id: number;
  version_id: number;
  role: "final" | "intermediate";
  label: string;
  node_id: string | null;
  file_path: string;
  file_size_bytes: number | null;
  duration_secs: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
}
```

Hook: `useVersionArtifacts(versionId: number)` — fetches `GET /scene-video-versions/{id}/artifacts`

**Acceptance Criteria:**
- [x] Type matches backend model
- [x] Hook uses TanStack Query with proper query key
- [x] Hook is enabled only when `versionId` is provided

### Task 6.2: Create ArtifactTimeline component [COMPLETE]
**File:** `apps/frontend/src/features/scenes/ArtifactTimeline.tsx` (new)

Horizontal timeline showing artifacts for a single clip version: `clip1 -> clip2 -> ... -> final`

```tsx
interface ArtifactTimelineProps {
  versionId: number;
}
```

Component:
- Fetches artifacts via `useVersionArtifacts`
- Renders artifacts as horizontal cards with an arrow/connector between them
- Each card shows: role badge, label, duration, file size
- Clicking a card opens `ClipPlaybackModal` (reuse existing)
- Final artifact has accent border/badge
- Loading/empty states handled

**Acceptance Criteria:**
- [x] Artifacts displayed in horizontal flow ordered by `sort_order`
- [x] Final artifact visually distinguished with badge and accent
- [x] Clicking artifact opens video playback modal
- [x] Shows duration and file size per artifact
- [x] Gracefully handles versions with no artifacts (hidden)
- [x] Uses design system components (Badge, Card, Button)

### Task 6.3: Integrate ArtifactTimeline into ClipCard [COMPLETE]
**File:** `apps/frontend/src/features/scenes/ClipCard.tsx`

Add the artifact timeline as a collapsible section in ClipCard, below the generation snapshot section.

- Only show if the clip has `source === "generated"` (no artifacts for imported clips)
- Collapsible with chevron toggle, similar to generation snapshot
- Label: "Pipeline Artifacts"

**Acceptance Criteria:**
- [x] Artifact timeline section appears for generated clips
- [x] Hidden for imported clips
- [x] Collapsible with toggle (matches generation snapshot pattern)
- [x] Does not fetch artifacts until expanded (lazy loading)
- [x] TypeScript compiles with no errors

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260306000005_scene_video_version_artifacts.sql` | New migration for artifacts table |
| `apps/backend/crates/db/src/models/scene_video_version_artifact.rs` | Artifact model and DTOs |
| `apps/backend/crates/db/src/repositories/scene_video_version_artifact_repo.rs` | Artifact CRUD repository |
| `apps/backend/crates/db/src/models/scene_video_version.rs` | Add `generation_snapshot` to create DTO |
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | Update create/create_as_final queries |
| `apps/backend/crates/pipeline/src/output_classifier.rs` | New: classify outputs by node title convention |
| `apps/backend/crates/pipeline/src/snapshot.rs` | New: build generation snapshot from context |
| `apps/backend/crates/pipeline/src/completion_handler.rs` | Extend for multi-output download |
| `apps/backend/crates/pipeline/src/lib.rs` | Export new modules |
| `apps/backend/crates/comfyui/src/api.rs` | Add `extract_all_output_infos()` |
| `apps/backend/crates/worker/src/event_loop.rs` | Wire snapshot through completion flow |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | Add artifacts list handler |
| `apps/backend/crates/api/src/routes/scene.rs` | Register artifacts route |
| `apps/frontend/src/features/scenes/types.ts` | Add artifact type |
| `apps/frontend/src/features/scenes/hooks/useArtifacts.ts` | New: TanStack Query hook |
| `apps/frontend/src/features/scenes/ArtifactTimeline.tsx` | New: horizontal artifact pipeline UI |
| `apps/frontend/src/features/scenes/ClipCard.tsx` | Integrate artifact timeline |

---

## Dependencies

### Existing Components to Reuse
- `ComfyUIApi::download_output()` from `crates/comfyui/src/api.rs`
- `StorageProvider` trait from `crates/core/src/storage/`
- `probe_stored_duration()` from `crates/pipeline/src/completion_handler.rs`
- `SceneVideoVersionRepo` from `crates/db/src/repositories/`
- `ClipPlaybackModal` from `apps/frontend/src/features/scenes/`
- `Badge`, `Card`, `Button` from design system
- `formatBytes`, `formatDuration` from `@/lib/format`

### New Infrastructure Needed
- `scene_video_version_artifacts` table
- `SceneVideoVersionArtifactRepo`
- `output_classifier` pipeline module
- `snapshot` pipeline module
- `ArtifactTimeline` React component
- `useVersionArtifacts` hook

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database & Models — Tasks 1.1-1.4
2. Phase 2: Output Classifier — Tasks 2.1-2.3
3. Phase 3: Completion Handler Extension — Tasks 3.1-3.2
4. Phase 4: Generation Snapshot — Tasks 4.1-4.2
5. Phase 5: API Endpoint — Tasks 5.1-5.2
6. Phase 6: Frontend — Tasks 6.1-6.3

**MVP Success Criteria:**
- All ComfyUI outputs downloaded and stored (final + intermediates)
- Node title convention correctly classifies outputs
- Generation snapshot populated on created versions
- Artifacts visible in scene detail UI with playback

### Post-MVP Enhancements
- Artifact thumbnails (PRD Req 2.1)
- Artifact comparison view (PRD Req 2.2)

---

## Notes

1. The `scene_types` table does not currently have a `workflow_pattern` column. For MVP, the pattern can be inferred: if `target_duration_secs` is set and estimated segments > 1, use Pattern A; otherwise, Pattern B/C.
2. Migration numbering follows existing convention: `YYYYMMDD000NNN`. Check for conflicts with existing migrations before running.
3. The `futures` crate is already in the workspace dependencies for concurrent artifact downloads.

---

## Version History

- **v1.0** (2026-03-06): Initial task list creation from PRD-127
