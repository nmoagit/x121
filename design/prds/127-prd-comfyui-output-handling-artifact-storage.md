# PRD-127: ComfyUI Output Handling & Artifact Storage

## 1. Introduction/Overview

The current pipeline operates at the segment level — it downloads one output per ComfyUI execution and stores it as a segment record. However, real-world ComfyUI workflows produce multiple outputs: intermediate clips (rough cuts, test renders, preview passes) alongside the final video. Additionally, not all workflows follow the multi-segment + stitch pattern; some produce a final video directly from a single ComfyUI run.

This PRD defines a unified output handling system that:
- Downloads **all** outputs from any ComfyUI workflow execution
- Uses a **node title convention** (`[final]`, `[intermediate]`) to classify outputs by role
- Stores intermediate outputs as **artifacts** attached to scene video versions
- Stores the final output using the platform's **delivery naming convention**
- Populates the **generation snapshot** (workflow parameters) on scene video versions
- Supports three workflow patterns: multi-segment + stitch, single final output, and single final + intermediates

## 2. Related PRDs & Dependencies

- **Depends on:** PRD-005 (ComfyUI WebSocket Bridge), PRD-024 (Recursive Video Generation Loop), PRD-001 (Data Model)
- **Extends:** PRD-024 (adds artifact handling to the completion flow), PRD-069 (complements provenance with version-level snapshots)
- **Depended on by:** PRD-025 (Incremental Re-stitching), PRD-039 (Delivery System)
- **Related:** PRD-069 (Generation Provenance — segment-level receipts), PRD-075 (Workflow Import & Validation)

## 3. Goals

- Handle all ComfyUI workflow output patterns (multi-segment, single-output, single-output + intermediates) through a single unified pipeline.
- Download and store every output produced by a ComfyUI execution, not just the primary video.
- Classify outputs by role using a simple, explicit node title convention.
- Store intermediate artifacts as first-class records linked to scene video versions.
- Populate `generation_snapshot` on scene video versions with the workflow parameters used for generation.
- Display artifacts in the scene detail UI as a visual pipeline (intermediate clips leading to the final).

## 4. User Stories

- As a Creator, I want all outputs from my ComfyUI workflow (previews, test renders, final video) automatically downloaded and stored so that nothing is lost.
- As a Creator, I want to label my ComfyUI output nodes with `[final]` or `[intermediate]` so the platform knows which output is the deliverable.
- As a Reviewer, I want to see intermediate clips alongside the final video on the scene detail page so I can understand the generation pipeline's progression.
- As a Creator, I want the generation parameters (workflow, CFG, steps, seed, etc.) saved with each video version so I can reproduce or understand results.
- As a Creator, I want single-output workflows (no stitching) to work just as well as multi-segment workflows so I'm not forced into one pipeline pattern.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Node Title Convention for Output Classification

**Description:** ComfyUI workflow output nodes use a bracket-prefix convention in their title to declare their role. The pipeline reads these titles to classify each output.

**Convention:**
- `[final] <description>` — The deliverable output. Stored using the platform's delivery naming convention. Becomes the `file_path` on the scene video version.
- `[intermediate] <description>` — Supporting output (preview, rough cut, test render). Stored as an artifact record.
- No tag — Falls back to inference: the last output node in the workflow graph is treated as `final`, all others as `intermediate`.

**Acceptance Criteria:**
- [ ] Pipeline parses output node titles from ComfyUI execution history
- [ ] Bracket-prefix tags (`[final]`, `[intermediate]`) are recognized case-insensitively
- [ ] Untagged outputs fall back to position-based inference (last output node = final)
- [ ] If multiple nodes are tagged `[final]`, the pipeline logs a warning and uses the last one
- [ ] The convention is documented in a workflow authoring guide

#### Requirement 1.2: Multi-Output Download

**Description:** The completion handler downloads all outputs from a ComfyUI execution, not just the first video file.

**Acceptance Criteria:**
- [ ] After execution completes, the pipeline enumerates all output files from the ComfyUI history response
- [ ] Each output file is downloaded via the ComfyUI `/view` endpoint
- [ ] Downloads are performed concurrently where possible
- [ ] Failed downloads for individual artifacts do not block the final output processing
- [ ] Download errors for artifacts are logged but non-fatal; download errors for the final output are fatal

#### Requirement 1.3: Artifact Storage

**Description:** Intermediate outputs are stored as artifact records linked to a scene video version.

**Acceptance Criteria:**
- [ ] New `scene_video_version_artifacts` table stores artifact metadata
- [ ] Each artifact records: role, label (from node title), ComfyUI node ID, file path, file size, duration, sort order
- [ ] Artifacts are stored at path: `artifacts/{scene_video_version_id}/{node_id}/{filename}`
- [ ] Artifact file sizes and durations are extracted (ffprobe for video, file size from download)
- [ ] Artifacts follow the same soft-delete pattern as scene video versions (kept forever)
- [ ] When a scene video version is soft-deleted, its artifacts are also soft-deleted

#### Requirement 1.4: Final Output Storage with Delivery Convention

**Description:** The output tagged `[final]` (or inferred as final) is stored using the platform's standard delivery naming convention and becomes the scene video version's `file_path`.

**Acceptance Criteria:**
- [ ] Final output is renamed/stored according to the project's delivery naming convention
- [ ] Final output path is set as `file_path` on the scene video version record
- [ ] File size, duration, resolution, and frame rate are extracted via ffprobe and stored on the version record
- [ ] If no final output is identified, the pipeline marks the generation as failed with a descriptive error

#### Requirement 1.5: Generation Snapshot Population

**Description:** When a scene video version is created from a completed pipeline run, the `generation_snapshot` JSONB column is populated with a summary of the workflow parameters used.

**Snapshot contents:**
- Workflow template name/version (from scene type)
- Resolved prompt texts (keyed by slot name)
- Generation parameters (CFG, steps, sampler, scheduler, seed, etc.)
- LoRA configuration (name, version, weight)
- Seed image path/variant ID
- ComfyUI instance ID
- Timestamp of generation

**Acceptance Criteria:**
- [ ] `generation_snapshot` is populated on every generated (not imported) scene video version
- [ ] Snapshot is a denormalized summary — readable without joining other tables
- [ ] Snapshot is immutable after creation (write-once)
- [ ] Snapshot is distinct from PRD-069 segment-level receipts: the snapshot is a version-level summary for quick UI display, while PRD-069 receipts are granular per-segment records for reproducibility
- [ ] `CreateSceneVideoVersion` DTO accepts an optional `generation_snapshot` field
- [ ] Frontend `ClipCard` already renders the snapshot (implemented in prior work)

#### Requirement 1.6: Workflow Pattern Support

**Description:** The pipeline supports three distinct workflow patterns through the same unified output handling code.

**Pattern A — Multi-Segment + Stitch:**
- Multiple ComfyUI executions produce segments
- Segments are stitched into a final video (PRD-025)
- Each segment execution may produce artifacts
- The stitched result becomes the scene video version

**Pattern B — Single Final Output:**
- One ComfyUI execution produces the final video directly
- No stitching required
- The final output becomes the scene video version immediately

**Pattern C — Single Final + Intermediates:**
- One ComfyUI execution produces multiple outputs
- One is tagged `[final]`, others are `[intermediate]`
- All are downloaded; final becomes the version, intermediates become artifacts

**Acceptance Criteria:**
- [ ] All three patterns use the same `handle_completion()` code path for output enumeration and download
- [ ] Pattern A: artifacts are attached to the segment record; version-level artifacts are populated during stitching
- [ ] Pattern B: a scene video version is created directly from the single output
- [ ] Pattern C: a scene video version is created from the final output; intermediates stored as artifacts
- [ ] The workflow pattern is determined by scene type configuration (existing `scene_types` table)
- [ ] No workflow-pattern-specific branching in the output download logic — only in what happens after download

#### Requirement 1.7: Scene Video Version Creation from Pipeline

**Description:** The pipeline creates scene video version records when a generation run completes, bridging the current segment-only flow to the version-level data model.

**Acceptance Criteria:**
- [ ] For Pattern B and C: `SceneVideoVersionRepo::create()` is called directly after output processing
- [ ] For Pattern A: version creation happens after stitching (deferred to PRD-025)
- [ ] The `source` field is set to `"generated"`
- [ ] `generation_snapshot` is populated per Requirement 1.5
- [ ] Version number is auto-incremented per scene (existing repo logic)
- [ ] The version is not automatically marked as `is_final` — that requires QA review

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Artifact Thumbnails

**Description:** Generate thumbnail frames from video artifacts for faster browsing in the UI.

**Acceptance Criteria:**
- [ ] Extract a representative frame from each video artifact
- [ ] Store as a small JPEG/WebP alongside the artifact
- [ ] Display in the scene detail artifact timeline

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Artifact Comparison View

**Description:** Side-by-side comparison of intermediate artifacts to track progression through the workflow.

**Acceptance Criteria:**
- [ ] Select two artifacts and view them side-by-side
- [ ] Synchronized playback for video artifacts

## 6. Non-Goals (Out of Scope)

- **Stitching logic** — Covered by PRD-025 (Incremental Re-stitching & Smoothing)
- **Segment-level provenance receipts** — Covered by PRD-069 (Generation Provenance)
- **QA workflow for artifacts** — Artifacts are reference-only; QA applies to scene video versions
- **Artifact delivery** — Only the final output participates in the delivery system (PRD-039)
- **Workflow validation** — Covered by PRD-075 (Workflow Import & Validation); this PRD assumes valid workflows
- **Automatic role detection via AI/ML** — Out of scope; rely on convention and positional fallback

## 7. Design Considerations

### Scene Detail Page — Artifact Timeline

Artifacts are displayed on the scene detail page as a visual pipeline showing the progression from intermediates to final:

```
Scene Detail > Clips Tab

  v3 (latest)
  +--------------------------------------------------+
  | [intermediate] Rough Cut    [intermediate] Pass 2    [final] Final Video  |
  |   00:12 / 2.1MB              00:14 / 3.8MB            00:15 / 5.2MB      |
  |   [play]                     [play]                   [play]             |
  +--------------------------------------------------+
  | Generation Parameters  [expand]                                          |
  +--------------------------------------------------+

  v2
  ...
```

- Each version shows its artifacts in a horizontal flow: `clip1 -> clip2 -> ... -> final`
- Artifacts are ordered by their `sort_order` (derived from node execution order)
- Clicking an artifact opens it in the video player
- The final output is visually distinguished (e.g., border accent, "Final" badge)
- Artifacts are non-interactive from a QA perspective (no approve/reject)

### Existing Components to Reuse

- `ClipCard` — Extend or compose for artifact display
- `VideoPlayer` / `ClipPlaybackModal` — Reuse for artifact playback
- `Badge` component — For role labels (`Final`, `Intermediate`)
- Generation snapshot collapsible section — Already implemented in `ClipCard`

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| `ComfyUIApi::download_output()` | `crates/comfyui/src/api.rs` | Already downloads single files; extend to iterate all outputs |
| `ComfyUIApi::get_history()` | `crates/comfyui/src/api.rs` | Returns all outputs keyed by node ID |
| `completion_handler::handle_completion()` | `crates/pipeline/src/completion_handler.rs` | Extend to enumerate all outputs, classify, and store |
| `StorageProvider` trait | `crates/core/src/storage/` | Use for all artifact storage |
| `SceneVideoVersionRepo` | `crates/db/src/repositories/` | Use `create()` for version creation; add `generation_snapshot` to DTO |
| `ClipCard` | `apps/frontend/src/features/scenes/` | Extend with artifact display |
| `ClipPlaybackModal` | `apps/frontend/src/features/scenes/` | Reuse for artifact playback |

### New Infrastructure Needed

| Component | Purpose |
|-----------|---------|
| `scene_video_version_artifacts` table | Store artifact metadata |
| `SceneVideoVersionArtifactRepo` | CRUD for artifacts |
| `output_classifier` module (pipeline crate) | Parse node titles, classify outputs by role |
| Artifact timeline UI component | Display artifacts as horizontal pipeline on scene detail |

### Database Changes

**New table: `scene_video_version_artifacts`**

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

**Modified DTO: `CreateSceneVideoVersion`**

Add `generation_snapshot: Option<serde_json::Value>` field and include it in the INSERT query.

### API Changes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/scene-video-versions/{id}/artifacts` | GET | List artifacts for a version |
| No new mutation endpoints | — | Artifacts are created by the pipeline, not via API |

## 9. Quality Assurance

### DRY-GUY Agent Enforcement

**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics

- All outputs from a ComfyUI execution are downloaded and stored (zero data loss)
- Node title convention correctly classifies outputs in >95% of tagged workflows
- Positional fallback correctly identifies the final output in >90% of untagged workflows
- `generation_snapshot` is populated on 100% of generated scene video versions
- All three workflow patterns (A, B, C) produce correct scene video version records
- Artifact display loads in <500ms on the scene detail page

## 11. Open Questions

1. **Should artifacts also be stored for segment-level executions in Pattern A?** Currently segments store only the primary output. If artifacts are stored per-segment, the data volume increases significantly for multi-segment scenes.
2. **ComfyUI output node ordering** — Is the history API's node ordering deterministic? If not, `sort_order` may need to be derived from the workflow graph topology instead.
3. **Maximum artifact count per version** — Should there be a limit to prevent runaway workflows from filling storage?

## 12. Version History

- **v1.0** (2026-03-06): Initial PRD creation
