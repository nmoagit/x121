# Task List: Dynamic Generation Seeds

**PRD Reference:** `design/prds/146-prd-dynamic-generation-seeds.md`
**Scope:** Multi-media workflow seed system — admin-labeled media input slots, avatar media assignments, passthrough seeds, multi-seed pipeline injection.

## Overview

This implements a media input counterpart to the existing Workflow Prompt Slots (PRD-115). Admins label each LoadImage/LoadVideo/LoadAudio node in a workflow, then content creators assign media files to those slots per avatar. The pipeline resolves all media at generation time and injects each file into its correct workflow node. The implementation mirrors the `workflow_prompt_slots` pattern exactly for consistency.

### What Already Exists
- `workflow_prompt_slots` table, model, repo, handler, routes — **pattern to mirror**
- `SeedSlot` struct in `crates/core/src/pipeline.rs` — **extend with media_type**
- `set_seed_image()` in `crates/pipeline/src/workflow_builder.rs` — **replace with inject_media()**
- `load_generation_context()` in `crates/pipeline/src/context_loader.rs` — **extend for multi-seed**
- `LOAD_IMAGE_CLASSES` in `crates/core/src/workflow_import.rs` — **extend for video/audio**
- `SeedDataDropSlot` component — **reuse in Seeds tab**
- `AvatarSeedDataModal` — **refactor into Seeds tab**

### What We're Building
1. `workflow_media_slots` table + model + repo + handler + routes
2. `avatar_media_assignments` table + model + repo + handler + routes
3. Media slot resolution engine (`resolve_media_slots()`)
4. Multi-seed context loading and workflow injection
5. Auto-detection of media nodes during workflow import
6. Frontend Seeds tab on avatar detail page

### Key Design Decisions
1. Mirror `workflow_prompt_slots` pattern for consistency and developer familiarity
2. Avatar-level assignments for MVP, nullable `scene_type_id` column ready for per-scene-type overrides
3. Passthrough as a flag on assignments (same file reference, auto-inherited track)
4. Comma-separated values already supported in browse APIs for OR filtering

---

## Phase 1: Database Schema

### Task 1.1: Create workflow_media_slots table migration
**File:** `apps/db/migrations/20260325000001_create_workflow_media_slots.sql`

Create the table for storing workflow media input node metadata, mirroring `workflow_prompt_slots`.

```sql
BEGIN;

CREATE TABLE workflow_media_slots (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    node_id         TEXT NOT NULL,
    input_name      TEXT NOT NULL DEFAULT 'image',
    class_type      TEXT NOT NULL,
    slot_label      TEXT NOT NULL,
    media_type      TEXT NOT NULL DEFAULT 'image',
    is_required     BOOLEAN NOT NULL DEFAULT true,
    fallback_mode   TEXT,
    fallback_value  TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    description     TEXT,
    seed_slot_name  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, node_id, input_name)
);

CREATE INDEX idx_workflow_media_slots_workflow_id ON workflow_media_slots(workflow_id);

ALTER TABLE workflow_media_slots ADD CONSTRAINT ck_workflow_media_slots_media_type
    CHECK (media_type IN ('image', 'video', 'audio', 'other'));

ALTER TABLE workflow_media_slots ADD CONSTRAINT ck_workflow_media_slots_fallback_mode
    CHECK (fallback_mode IS NULL OR fallback_mode IN ('skip_node', 'use_default', 'auto_generate'));

CREATE TRIGGER trg_workflow_media_slots_updated_at
    BEFORE UPDATE ON workflow_media_slots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
```

**Acceptance Criteria:**
- [ ] Migration creates table with all columns from PRD schema
- [ ] Unique constraint on (workflow_id, node_id, input_name)
- [ ] CHECK constraints on media_type and fallback_mode
- [ ] FK cascade delete from workflows
- [ ] Index on workflow_id
- [ ] updated_at trigger

### Task 1.2: Create avatar_media_assignments table migration
**File:** `apps/db/migrations/20260325000002_create_avatar_media_assignments.sql`

Create the table for avatar-to-slot media file mappings.

```sql
BEGIN;

CREATE TABLE avatar_media_assignments (
    id                   BIGSERIAL PRIMARY KEY,
    avatar_id            BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    media_slot_id        BIGINT NOT NULL REFERENCES workflow_media_slots(id) ON DELETE CASCADE,
    scene_type_id        BIGINT REFERENCES scene_types(id) ON DELETE CASCADE,
    image_variant_id     BIGINT REFERENCES image_variants(id) ON DELETE SET NULL,
    file_path            TEXT,
    media_type           TEXT NOT NULL DEFAULT 'image',
    is_passthrough       BOOLEAN NOT NULL DEFAULT false,
    passthrough_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    notes                TEXT,
    created_by           BIGINT REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (avatar_id, media_slot_id, scene_type_id)
);

CREATE INDEX idx_avatar_media_assignments_avatar ON avatar_media_assignments(avatar_id);
CREATE INDEX idx_avatar_media_assignments_slot ON avatar_media_assignments(media_slot_id);

ALTER TABLE avatar_media_assignments ADD CONSTRAINT ck_avatar_media_assignments_media_type
    CHECK (media_type IN ('image', 'video', 'audio', 'other'));

ALTER TABLE avatar_media_assignments ADD CONSTRAINT ck_avatar_media_assignments_source
    CHECK (image_variant_id IS NOT NULL OR file_path IS NOT NULL);

ALTER TABLE avatar_media_assignments ADD CONSTRAINT ck_avatar_media_assignments_passthrough
    CHECK (NOT is_passthrough OR passthrough_track_id IS NOT NULL);

CREATE TRIGGER trg_avatar_media_assignments_updated_at
    BEFORE UPDATE ON avatar_media_assignments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
```

**Acceptance Criteria:**
- [ ] Migration creates table with all columns from PRD schema
- [ ] `UNIQUE NULLS NOT DISTINCT` on (avatar_id, media_slot_id, scene_type_id)
- [ ] CHECK: at least one of image_variant_id or file_path must be set
- [ ] CHECK: passthrough requires track_id
- [ ] FK cascade from avatars and media_slots
- [ ] Indexes on avatar_id and media_slot_id

### Task 1.3: Enhance pipeline seed_slots JSONB
**File:** `apps/db/migrations/20260325000003_enhance_pipeline_seed_slots.sql`

Update existing seed slot JSONB entries with new `media_type`, `allowed_extensions`, and `track_affinity` fields.

```sql
BEGIN;

-- Backfill existing seed slots with media_type: "image"
UPDATE pipelines
SET seed_slots = (
    SELECT jsonb_agg(
        elem || '{"media_type": "image", "allowed_extensions": [], "track_affinity": null}'::jsonb
    )
    FROM jsonb_array_elements(seed_slots) elem
)
WHERE seed_slots IS NOT NULL AND jsonb_array_length(seed_slots) > 0;

COMMIT;
```

**Acceptance Criteria:**
- [ ] Existing seed slot entries gain `media_type: "image"` default
- [ ] `allowed_extensions` defaults to empty array
- [ ] `track_affinity` defaults to null
- [ ] Migration is idempotent

---

## Phase 2: Backend Models & Repositories

### Task 2.1: WorkflowMediaSlot model
**File:** `apps/backend/crates/db/src/models/workflow_media_slot.rs`

Create model structs mirroring `workflow_prompt_slot.rs`.

**Acceptance Criteria:**
- [ ] `WorkflowMediaSlot` FromRow struct with all table columns
- [ ] `CreateWorkflowMediaSlot` Deserialize DTO
- [ ] `UpdateWorkflowMediaSlot` Deserialize DTO with all fields Optional
- [ ] Module registered in `models/mod.rs`

### Task 2.2: WorkflowMediaSlotRepo
**File:** `apps/backend/crates/db/src/repositories/workflow_media_slot_repo.rs`

Create CRUD repository mirroring `workflow_prompt_slot_repo.rs`.

**Acceptance Criteria:**
- [ ] `COLUMNS` constant with all column names
- [ ] `create(pool, input) -> WorkflowMediaSlot`
- [ ] `find_by_id(pool, id) -> Option<WorkflowMediaSlot>`
- [ ] `list_by_workflow(pool, workflow_id) -> Vec<WorkflowMediaSlot>`
- [ ] `update(pool, id, input) -> Option<WorkflowMediaSlot>` with COALESCE
- [ ] `delete(pool, id) -> bool`
- [ ] `bulk_create(pool, inputs) -> Vec<WorkflowMediaSlot>`
- [ ] Module registered in `repositories/mod.rs` with pub use export

### Task 2.3: AvatarMediaAssignment model
**File:** `apps/backend/crates/db/src/models/avatar_media_assignment.rs`

**Acceptance Criteria:**
- [ ] `AvatarMediaAssignment` FromRow struct with all table columns
- [ ] `CreateAvatarMediaAssignment` Deserialize DTO
- [ ] `UpdateAvatarMediaAssignment` Deserialize DTO with all fields Optional
- [ ] Module registered in `models/mod.rs`

### Task 2.4: AvatarMediaAssignmentRepo
**File:** `apps/backend/crates/db/src/repositories/avatar_media_assignment_repo.rs`

**Acceptance Criteria:**
- [ ] `create(pool, input) -> AvatarMediaAssignment`
- [ ] `find_by_id(pool, id) -> Option<AvatarMediaAssignment>`
- [ ] `list_by_avatar(pool, avatar_id) -> Vec<AvatarMediaAssignment>`
- [ ] `find_by_avatar_and_slot(pool, avatar_id, media_slot_id, scene_type_id) -> Option<AvatarMediaAssignment>`
- [ ] `update(pool, id, input) -> Option<AvatarMediaAssignment>`
- [ ] `delete(pool, id) -> bool`
- [ ] `list_for_resolution(pool, avatar_id) -> Vec<AvatarMediaAssignment>` (all assignments for media resolution)
- [ ] Module registered in `repositories/mod.rs` with pub use export

---

## Phase 3: Core Resolution Engine

### Task 3.1: Enhance SeedSlot struct
**File:** `apps/backend/crates/core/src/pipeline.rs`

Add `media_type`, `allowed_extensions`, and `track_affinity` fields to `SeedSlot`.

**Acceptance Criteria:**
- [ ] `SeedSlot` has `media_type: String`, `allowed_extensions: Vec<String>`, `track_affinity: Option<String>`
- [ ] `parse_seed_slots()` handles new fields with defaults for backward compat
- [ ] `validate_seed_images()` updated to validate media_type

### Task 3.2: Media resolution engine
**File:** `apps/backend/crates/core/src/media_resolution.rs`

Create `resolve_media_slots()` — pure function that resolves all media inputs for a scene.

```rust
pub struct ResolvedMediaSlot {
    pub slot_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub media_type: String,
    pub class_type: String,
    pub file_path: String,
    pub source: MediaSource,
    pub is_passthrough: bool,
    pub passthrough_track_id: Option<DbId>,
}

pub enum MediaSource {
    AvatarDefault,
    SceneTypeOverride,
    Fallback,
}

pub fn resolve_media_slots(
    media_slots: &[WorkflowMediaSlot],
    avatar_assignments: &[AvatarMediaAssignment],
    scene_type_id: DbId,
    image_variant_paths: &HashMap<DbId, String>,
) -> Result<Vec<ResolvedMediaSlot>, Vec<UnresolvedSlot>>;
```

**Acceptance Criteria:**
- [ ] Scene-type-specific assignments take priority over avatar-level defaults
- [ ] Required slots without assignments produce `UnresolvedSlot` errors
- [ ] Optional slots apply fallback behavior when unassigned
- [ ] `image_variant_id` resolved to file_path via the provided map
- [ ] Function is pure — no DB access
- [ ] Module registered in `core/src/lib.rs`

---

## Phase 4: Pipeline Integration

### Task 4.1: Update GenerationContext for multi-seed
**File:** `apps/backend/crates/pipeline/src/workflow_builder.rs`

Replace `seed_image_path: String` with `resolved_media: Vec<ResolvedMediaSlot>` on `GenerationContext`. Keep `seed_image_path` as a deprecated fallback field.

**Acceptance Criteria:**
- [ ] `GenerationContext` has `resolved_media: Vec<ResolvedMediaSlot>` field
- [ ] `seed_image_path` retained but marked deprecated for backward compat
- [ ] All references to `seed_image_path` updated or guarded

### Task 4.2: Replace set_seed_image with inject_media
**File:** `apps/backend/crates/pipeline/src/workflow_builder.rs`

Create `inject_media()` that loops over all resolved media slots and injects filenames.

**Acceptance Criteria:**
- [ ] `inject_media(workflow, resolved_media)` function created
- [ ] Each slot's file injected into correct node/input
- [ ] Missing nodes produce clear `PipelineError::WorkflowBuild` errors
- [ ] `build_workflow()` calls `inject_media()` when `resolved_media` is non-empty
- [ ] Falls back to `set_seed_image()` when `resolved_media` is empty (backward compat)

### Task 4.3: Update context loader for multi-seed
**File:** `apps/backend/crates/pipeline/src/context_loader.rs`

Load and resolve multiple media slots instead of single `image_variant_id`.

**Acceptance Criteria:**
- [ ] Context loader queries `workflow_media_slots` for the scene's workflow
- [ ] Context loader queries `avatar_media_assignments` for the avatar
- [ ] Calls `resolve_media_slots()` and sets `resolved_media` on context
- [ ] Backward compat: falls back to legacy `image_variant_id` when no media slots exist
- [ ] Continuation segments (index > 0) replace primary seed with previous frame
- [ ] Missing required slots produce `PipelineError::MissingConfig`

---

## Phase 5: API Endpoints

### Task 5.1: Media slot handlers
**File:** `apps/backend/crates/api/src/handlers/media_management.rs`

Handlers for workflow media slot CRUD, mirroring `prompt_management.rs`.

**Acceptance Criteria:**
- [ ] `list_media_slots(workflow_id)` — GET
- [ ] `update_media_slot(workflow_id, slot_id)` — PUT
- [ ] `ensure_media_slot_exists()` helper

### Task 5.2: Avatar media assignment handlers
**File:** `apps/backend/crates/api/src/handlers/media_management.rs`

Handlers for avatar media assignment CRUD.

**Acceptance Criteria:**
- [ ] `list_avatar_media_assignments(avatar_id)` — GET
- [ ] `upsert_avatar_media_assignment(avatar_id)` — POST (create or update)
- [ ] `update_avatar_media_assignment(avatar_id, assignment_id)` — PUT
- [ ] `delete_avatar_media_assignment(avatar_id, assignment_id)` — DELETE
- [ ] `get_seed_summary(avatar_id)` — GET aggregated view
- [ ] `upload_and_assign(avatar_id)` — POST multipart upload
- [ ] Validation: media_type must match between assignment and slot

### Task 5.3: Route registration
**File:** `apps/backend/crates/api/src/routes/media_management.rs`

Register routes under `/workflows/{id}/media-slots` and `/avatars/{id}/media-assignments`.

**Acceptance Criteria:**
- [ ] `workflow_media_slot_router() -> Router<AppState>`
- [ ] `avatar_media_assignment_router() -> Router<AppState>`
- [ ] Routes merged into main router in `routes/mod.rs`
- [ ] Handler module registered in `handlers/mod.rs`
- [ ] Route module registered in `routes/mod.rs`

---

## Phase 6: Workflow Import Enhancement

### Task 6.1: Auto-detect media nodes during workflow import
**File:** `apps/backend/crates/core/src/workflow_import.rs`

Extend workflow import to detect all media input nodes (LoadImage, LoadVideo, LoadAudio).

**Acceptance Criteria:**
- [ ] New constants: `LOAD_VIDEO_CLASSES`, `LOAD_AUDIO_CLASSES`, `ALL_MEDIA_CLASSES`
- [ ] `discover_media_nodes(workflow_json) -> Vec<DiscoveredMediaNode>` function
- [ ] Each node gets: node_id, class_type, input_name, auto-generated label, media_type
- [ ] Auto-labels: "Image Input 1", "Video Input 1", "Audio Input 1"

### Task 6.2: Create media slots on workflow import
**File:** `apps/backend/crates/api/src/handlers/workflow.rs` (or wherever import is handled)

After workflow import, auto-create `workflow_media_slots` records for discovered media nodes.

**Acceptance Criteria:**
- [ ] Workflow import creates media slot records for all media nodes
- [ ] Re-import preserves existing slot labels (matched by node_id)
- [ ] New nodes get new slots; removed nodes' slots are deleted
- [ ] `cargo check` passes

---

## Phase 7: Frontend — Avatar Seeds Tab

### Task 7.1: API hooks for media slots and assignments
**File:** `apps/frontend/src/features/avatars/hooks/use-media-assignments.ts`

TanStack Query hooks for all new endpoints.

**Acceptance Criteria:**
- [ ] `useWorkflowMediaSlots(workflowId)` — list media slots
- [ ] `useAvatarMediaAssignments(avatarId)` — list assignments
- [ ] `useAggregatedSeedSlots(avatarId)` — seed summary
- [ ] `useAssignMedia(avatarId)` — create/update mutation
- [ ] `useRemoveMediaAssignment()` — delete mutation
- [ ] `useUploadAndAssign(avatarId)` — multipart upload mutation

### Task 7.2: AvatarSeedsTab component
**File:** `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx`

Unified Seeds tab showing all media slots across all workflows.

**Acceptance Criteria:**
- [ ] Shows all slots from all workflows assigned to the avatar's scene types
- [ ] Slots grouped by required vs optional
- [ ] Slots deduplicated by `seed_slot_name`
- [ ] Each slot shows: label, media type, current assignment (thumbnail/filename), which workflows use it
- [ ] Upload/replace action via `SeedDataDropSlot` component
- [ ] Passthrough toggle with track selector
- [ ] Missing required slots shown prominently
- [ ] Naming engine (PRD-116) used for file storage paths

### Task 7.3: Register Seeds tab in avatar detail page
**File:** `apps/frontend/src/features/avatars/AvatarDetailTabs.tsx` (or equivalent)

Add the Seeds tab alongside existing tabs (Overview, Images, Scenes, etc.).

**Acceptance Criteria:**
- [ ] "Seeds" tab appears in avatar detail page
- [ ] Tab is visible for all pipelines
- [ ] Tab shows loading state while data fetches
- [ ] Empty state when no workflows have media slots

### Task 7.4: Media slot editor in workflow detail
**File:** `apps/frontend/src/features/workflows/components/MediaSlotEditor.tsx`

Admin UI for labeling media input nodes, mirroring the prompt slot editor pattern.

**Acceptance Criteria:**
- [ ] Shows all auto-detected media slots for a workflow
- [ ] Each slot: editable label, media type display, required toggle, fallback mode selector
- [ ] `seed_slot_name` dropdown linked to pipeline seed slots
- [ ] Description textarea
- [ ] Inline save per slot

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260325000001_create_workflow_media_slots.sql` | Media slots table |
| `apps/db/migrations/20260325000002_create_avatar_media_assignments.sql` | Avatar assignments table |
| `apps/db/migrations/20260325000003_enhance_pipeline_seed_slots.sql` | Seed slot JSONB enhancement |
| `apps/backend/crates/db/src/models/workflow_media_slot.rs` | Media slot model |
| `apps/backend/crates/db/src/models/avatar_media_assignment.rs` | Assignment model |
| `apps/backend/crates/db/src/repositories/workflow_media_slot_repo.rs` | Media slot CRUD |
| `apps/backend/crates/db/src/repositories/avatar_media_assignment_repo.rs` | Assignment CRUD |
| `apps/backend/crates/core/src/pipeline.rs` | Enhanced SeedSlot struct |
| `apps/backend/crates/core/src/media_resolution.rs` | Resolution engine |
| `apps/backend/crates/core/src/workflow_import.rs` | Media node discovery |
| `apps/backend/crates/pipeline/src/workflow_builder.rs` | inject_media(), GenerationContext |
| `apps/backend/crates/pipeline/src/context_loader.rs` | Multi-seed context loading |
| `apps/backend/crates/api/src/handlers/media_management.rs` | API handlers |
| `apps/backend/crates/api/src/routes/media_management.rs` | Route registration |
| `apps/frontend/src/features/avatars/hooks/use-media-assignments.ts` | Frontend hooks |
| `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx` | Seeds tab component |
| `apps/frontend/src/features/workflows/components/MediaSlotEditor.tsx` | Workflow media config |

---

## Dependencies

### Existing Components to Reuse
- `WorkflowPromptSlot` model/repo/handler/routes pattern from PRD-115
- `SeedDataDropSlot` component for file upload UI
- `SeedSlot` struct from `crates/core/src/pipeline.rs`
- `LOAD_IMAGE_CLASSES` from `crates/core/src/workflow_import.rs`
- `resolve_prompts()` pattern from `crates/core/src/prompt_resolution.rs`
- `AvatarSeedDataModal` classification logic

### New Infrastructure Needed
- `workflow_media_slots` table
- `avatar_media_assignments` table
- `resolve_media_slots()` in core crate
- `inject_media()` in pipeline crate
- `discover_media_nodes()` in core crate
- Frontend Seeds tab + hooks

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1-1.3
2. Phase 2: Backend Models & Repos — Tasks 2.1-2.4
3. Phase 3: Core Resolution Engine — Tasks 3.1-3.2
4. Phase 4: Pipeline Integration — Tasks 4.1-4.3
5. Phase 5: API Endpoints — Tasks 5.1-5.3
6. Phase 6: Workflow Import — Tasks 6.1-6.2
7. Phase 7: Frontend — Tasks 7.1-7.4

**MVP Success Criteria:**
- Multi-input workflows can be configured with labeled media slots
- Avatars can assign media files to slots via Seeds tab
- Generation pipeline resolves and injects all media files
- Existing single-seed workflows continue to work without changes

### Post-MVP Enhancements
- Per-scene-type seed overrides (schema ready, UI deferred)
- Auto-classification on upload
- Seed version history
- Media validation rules
- Seed preview generation

---

## Notes

1. **Backward compatibility is critical** — existing workflows with no media slots must continue to use `scene.image_variant_id` through the legacy fallback path.
2. **Migration order matters** — `workflow_media_slots` must be created before `avatar_media_assignments` (FK dependency).
3. **The `scene.image_variant_id` column is NOT dropped** — it stays for backward compat. A future cleanup PRD will remove it after all workflows are migrated.
4. **Commit at each phase boundary** to keep changes reviewable.

---

## Version History

- **v1.0** (2026-03-24): Initial task list creation from PRD-146
