# PRD-142: Dynamic Generation Seeds

**Document ID:** 142-prd-dynamic-generation-seeds
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

---

## 1. Introduction/Overview

The platform's generation pipeline currently has a rigid, single-seed architecture: each scene references one `image_variant_id`, the context loader resolves that single image variant's file path, the workflow builder finds the first `LoadImage` node in the workflow JSON, and injects the seed filename. This works for simple workflows with one input image, but breaks down for advanced ComfyUI workflows that require multiple media inputs — such as a reference image plus a depth map, a speaker image plus an audio file, or a clothed image plus a topless reference for inpainting.

This PRD introduces **Workflow Media Slots** — a media input counterpart to the existing Workflow Prompt Slots (PRD-115). Just as prompt slots let admins label each CLIPTextEncode node and control what text goes where, media slots let admins label each LoadImage, LoadVideo, LoadAudio, or other media-input node in a workflow and define what kind of media goes into each. The system then resolves media assignments at generation time: for each slot, it finds the correct file from the avatar's image variants (or other media sources), uploads it to ComfyUI, and injects the filename into the correct workflow node.

The architecture also supports **passthrough seeds** — where a media file used as a generation seed is simultaneously the deliverable output for another track. For example, in x121 the "clothed" seed image might be both the input for topless generation AND the deliverable clothed image. Passthrough means the same file reference (not a copy) serves both purposes.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-75** (Workflow Import & Validation) — Workflow JSON parsing, parameter discovery, node classification
- **PRD-115** (Generation Strategy & Workflow Prompt Management) — Prompt slot pattern this mirrors; prompt resolution engine
- **PRD-138** (Multi-Pipeline Architecture) — Pipeline seed slot definitions; pipeline-scoped workflows
- **PRD-141** (Pipeline-Scoped Imports and Storage) — Import rules for classifying seed files per pipeline

### Extends
- **PRD-115** — Extends the "workflow slot" concept from prompts to media; reuses the admin labeling UX pattern
- **PRD-138** — Evolves pipeline `seed_slots` JSONB from a flat list into a richer specification with media type info
- **PRD-24** (Recursive Video Generation) — Context loader and workflow builder gain multi-seed support

### Integrates With
- **PRD-116** (Naming Engine) — Media files stored via naming engine templates
- **PRD-113** (Avatar Ingest) — Import system classifies files into media slots
- **PRD-111** (Track System) — Tracks determine which seed slots are relevant per scene
- **PRD-112** (Project Hub) — Avatar detail page Seeds tab shows all slot assignments

## 3. Goals

### Primary Goals

1. **Multi-media workflow support** — Workflows with multiple LoadImage/LoadVideo/LoadAudio nodes can have each input independently labeled, assigned, and resolved.
2. **Admin-labeled media slots** — During workflow configuration, admins label each media input node with a semantic name (like prompt slots in PRD-115), and seeds are matched by slot label.
3. **Flexible media types** — Support images, video, audio, and other file formats as generation inputs, not just images.
4. **Passthrough seeds** — A file can serve as both a generation seed (input to a workflow) AND a deliverable (passthrough output), using the same file reference with auto-inherited track assignment.
5. **Future-proof schema** — Schema supports per-track seed requirements even if MVP treats seeds at the avatar level.

### Secondary Goals

6. **Backward compatibility** — Existing single-seed workflows continue to work without reconfiguration.
7. **Naming engine integration** — Seed files stored and referenced using PRD-116 naming templates.
8. **Unified Seeds tab** — Avatar detail page shows all slots from all workflows assigned to the avatar's scene types, providing a single view of what media is needed.

## 4. User Stories

- **As an admin**, I want to label each media input node in a ComfyUI workflow (e.g., "Reference Image", "Depth Map", "Audio Track"), so the platform knows which file to inject where during generation.
- **As an admin**, I want to mark some media slots as optional with fallback behavior (e.g., "if no depth map provided, use the auto-generated one"), so workflows can degrade gracefully.
- **As a content creator**, I want to assign seed media files to an avatar per slot (e.g., assign a clothed image to the "Reference Image" slot and an audio file to the "Audio" slot), so generation uses the correct inputs.
- **As a content creator**, I want to see all required and optional media slots across all workflows in one "Seeds" tab on the avatar detail page, so I know exactly what files are needed.
- **As a content creator**, I want a seed image to be marked as "passthrough" so it becomes the deliverable for its track without requiring generation, reducing redundant work.
- **As a developer**, I want the context loader to resolve multiple seed files per scene (one per media slot) instead of a single `image_variant_id`, so the workflow builder can inject each file into its correct node.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Workflow Media Slots Table

**Description:** When a ComfyUI workflow is imported (PRD-75), the platform auto-detects all media input nodes (LoadImage, LoadVideo, LoadAudio, and similar class types) and creates a `workflow_media_slots` record for each. Admins then label these slots with semantic names, matching the pattern established by `workflow_prompt_slots` in PRD-115.

**Database Schema:**

```sql
CREATE TABLE workflow_media_slots (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    node_id         TEXT NOT NULL,                          -- ComfyUI node ID (e.g., "10", "14")
    input_name      TEXT NOT NULL DEFAULT 'image',          -- Input field name on the node (e.g., "image", "audio", "video")
    class_type      TEXT NOT NULL,                          -- ComfyUI node class (e.g., "LoadImage", "LoadVideo", "LoadAudio")
    slot_label      TEXT NOT NULL,                          -- Admin-assigned label ("Reference Image", "Depth Map")
    media_type      TEXT NOT NULL DEFAULT 'image',          -- 'image' | 'video' | 'audio' | 'other'
    is_required     BOOLEAN NOT NULL DEFAULT true,          -- Must be filled for generation
    fallback_mode   TEXT,                                   -- NULL | 'skip_node' | 'use_default' | 'auto_generate'
    fallback_value  TEXT,                                   -- Default filename or generation instruction
    sort_order      INTEGER NOT NULL DEFAULT 0,
    description     TEXT,                                   -- Admin note: "This is the main reference image"
    seed_slot_name  TEXT,                                   -- Links to pipeline seed_slots[].name for auto-matching
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, node_id, input_name)
);

CREATE INDEX idx_workflow_media_slots_workflow_id ON workflow_media_slots(workflow_id);

CREATE TRIGGER trg_workflow_media_slots_updated_at
    BEFORE UPDATE ON workflow_media_slots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Key Fields:**

| Field | Purpose |
|-------|---------|
| `class_type` | The ComfyUI node class — determines what kind of media the node expects |
| `slot_label` | Human-readable label assigned by admin — displayed in UI and used for matching |
| `media_type` | Broad categorization for validation (image, video, audio, other) |
| `is_required` | If true, generation fails when this slot has no assigned media |
| `fallback_mode` | What to do when an optional slot has no media assigned |
| `seed_slot_name` | Links this workflow slot to a pipeline seed slot name for automatic matching |

**Auto-Detection During Workflow Import:**

```
During workflow import (extending PRD-75):
1. Parse workflow JSON → find all nodes with class_type matching media patterns:
   - "LoadImage", "LoadImageFromPath" → media_type = 'image'
   - "LoadVideo", "LoadVideoFromPath", "VHS_LoadVideo" → media_type = 'video'
   - "LoadAudio", "LoadAudioFromPath" → media_type = 'audio'
   - Other LoadX patterns → media_type = 'other'
2. For each detected node:
   a. Determine input_name from the node's input spec (usually "image", "video", "audio")
   b. Extract any existing filename value as the default
   c. Generate auto-label: "Image Input 1", "Video Input 1", etc.
   d. Create workflow_media_slots row
3. Admin reviews and relabels in the workflow editor UI
```

**Acceptance Criteria:**
- [ ] `workflow_media_slots` table created with all columns
- [ ] Workflow import auto-creates media slot records for all LoadImage/LoadVideo/LoadAudio nodes
- [ ] Auto-labels generated as "{MediaType} Input N" with correct sequential numbering
- [ ] Admin can relabel slots via API
- [ ] Admin can set `is_required`, `fallback_mode`, and `seed_slot_name` per slot
- [ ] If workflow JSON is re-imported, existing slot labels are preserved (matched by `node_id`)
- [ ] Media slots displayed in workflow detail UI alongside prompt slots

---

#### Requirement 1.2: Avatar Media Assignments Table

**Description:** Each avatar has media files assigned to workflow media slots. This replaces the current single `scene.image_variant_id` with a flexible many-to-many mapping between avatars and media slots. A single assignment serves all scenes that use a given workflow.

**Recommendation on Scope: Avatar-Level vs. Per-Scene-Type Overrides**

Two models were considered:

1. **One seed per slot per avatar** (recommended for MVP) — An avatar has one "clothed reference image" that is used across all scene types whose workflow has a "clothed reference" media slot. Simple, matches the current mental model.

2. **Per-scene-type overrides** — An avatar could have different "clothed reference images" for different scene types (e.g., a different outfit per scene). More flexible, but adds complexity.

**Recommendation:** Start with option 1 (avatar-level assignments). Add optional `scene_type_id` column (nullable) to support per-scene-type overrides later without schema migration. When `scene_type_id IS NULL`, the assignment applies to all scene types. When set, it overrides the avatar-level default for that specific scene type.

**Database Schema:**

```sql
CREATE TABLE avatar_media_assignments (
    id                  BIGSERIAL PRIMARY KEY,
    avatar_id           BIGINT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    media_slot_id       BIGINT NOT NULL REFERENCES workflow_media_slots(id) ON DELETE CASCADE,
    scene_type_id       BIGINT REFERENCES scene_types(id) ON DELETE CASCADE,  -- NULL = all scene types
    -- Media source (exactly one of these must be set):
    image_variant_id    BIGINT REFERENCES image_variants(id) ON DELETE SET NULL,
    file_path           TEXT,                               -- Direct path for non-image media (audio, video)
    -- Metadata:
    media_type          TEXT NOT NULL DEFAULT 'image',      -- Must match slot's media_type
    is_passthrough      BOOLEAN NOT NULL DEFAULT false,     -- Also serves as deliverable
    passthrough_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,  -- Track for passthrough delivery
    notes               TEXT,
    created_by          BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Unique per avatar × slot (optionally per scene type):
    UNIQUE NULLS NOT DISTINCT (avatar_id, media_slot_id, scene_type_id)
);

CREATE INDEX idx_avatar_media_assignments_avatar ON avatar_media_assignments(avatar_id);
CREATE INDEX idx_avatar_media_assignments_slot ON avatar_media_assignments(media_slot_id);

CREATE TRIGGER trg_avatar_media_assignments_updated_at
    BEFORE UPDATE ON avatar_media_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Resolution Hierarchy:**

```
For a given avatar + scene_type + media_slot:

1. Check for scene_type_id-specific assignment → use if found
2. Fall back to avatar-level assignment (scene_type_id IS NULL)
3. If neither exists and slot is required → generation error
4. If neither exists and slot is optional → apply fallback_mode
```

**Acceptance Criteria:**
- [ ] `avatar_media_assignments` table created
- [ ] Supports both image_variant_id references and direct file_path for non-image media
- [ ] Unique constraint prevents duplicate assignments for same avatar + slot + scene_type
- [ ] `scene_type_id` is nullable — NULL means "applies to all scene types"
- [ ] Resolution hierarchy respects scene_type override > avatar default > fallback
- [ ] API validates that `media_type` matches the slot's expected media_type
- [ ] Passthrough assignments correctly reference a track

---

#### Requirement 1.3: Passthrough Seeds

**Description:** A media file assigned to a workflow slot can be marked as "passthrough" — meaning it simultaneously serves as the deliverable output for a specified track. The same file reference is used (no copy), and the track assignment is auto-inherited.

**Use Case:** In x121, the "clothed" seed image is both:
- Input to the topless generation workflow (as the reference for face/body consistency)
- The deliverable "clothed" video/image output (no generation needed — the seed IS the output)

**Behavior:**
- When `is_passthrough = true`, the system treats this file as an already-completed deliverable for `passthrough_track_id`
- Passthrough does NOT prevent the file from also being used as a generation seed — it can be both simultaneously
- Delivery assembly (PRD-141) includes passthrough files in the deliverable manifest for their assigned track
- Passthrough assignments are visible in the avatar Seeds tab with a badge

**Acceptance Criteria:**
- [ ] Setting `is_passthrough = true` requires `passthrough_track_id` to be set
- [ ] Passthrough files appear in delivery manifests for their assigned track
- [ ] Passthrough files are NOT copied — same file reference used
- [ ] A media assignment can be passthrough AND used as a generation seed simultaneously
- [ ] Passthrough status shown with a visual indicator in the Seeds tab UI
- [ ] Removing a passthrough flag does not delete the file — only changes its role

---

#### Requirement 1.4: Media Slot Resolution Engine

**Description:** A centralized function that, given a scene, resolves all media slots for the scene's workflow(s) into concrete file paths. This replaces the current single-seed resolution in `context_loader.rs` and follows the same pattern as the prompt resolution engine (PRD-115 Req 1.7).

**Resolution Algorithm:**

```rust
pub struct ResolvedMediaSlot {
    pub slot_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub media_type: String,
    pub class_type: String,
    pub file_path: String,                    // Resolved absolute path
    pub source: MediaSource,                  // AvatarDefault, SceneTypeOverride, Fallback
    pub is_passthrough: bool,
    pub passthrough_track_id: Option<DbId>,
}

pub enum MediaSource {
    AvatarDefault,          // Avatar-level assignment (scene_type_id IS NULL)
    SceneTypeOverride,      // Scene-type-specific assignment
    Fallback,               // Slot's fallback_value used
}

pub fn resolve_media_slots(
    media_slots: &[WorkflowMediaSlot],
    avatar_assignments: &[AvatarMediaAssignment],
    scene_type_id: DbId,
) -> Result<Vec<ResolvedMediaSlot>, Vec<UnresolvedSlot>> {
    // For each slot:
    // 1. Check scene_type-specific assignment
    // 2. Fall back to avatar-level assignment
    // 3. If not found and required → add to unresolved errors
    // 4. If not found and optional → apply fallback
    // 5. Resolve image_variant_id to file_path if needed
}
```

**Acceptance Criteria:**
- [ ] `resolve_media_slots()` function in `crates/core` handles all resolution logic
- [ ] Scene-type-specific assignments take priority over avatar-level defaults
- [ ] Required slots without assignments produce clear error messages listing what is missing
- [ ] Optional slots apply fallback behavior when unassigned
- [ ] Resolution returns both the file path and metadata about the source
- [ ] Function is pure (no DB access) — all data loaded beforehand by the context loader

---

#### Requirement 1.5: Context Loader Multi-Seed Support

**Description:** The pipeline context loader (`crates/pipeline/src/context_loader.rs`) is updated to load and resolve multiple media slots instead of a single `image_variant_id`. The `GenerationContext` struct gains a `resolved_media_slots` field replacing the single `seed_image_path`.

**Changes to GenerationContext:**

```rust
pub struct GenerationContext {
    pub scene_id: DbId,
    pub segment_index: u32,
    pub clip_position: ClipPosition,
    // REMOVED: pub seed_image_path: String,
    pub resolved_media: Vec<ResolvedMediaSlot>,  // NEW: all resolved media inputs
    pub workflow_template: serde_json::Value,
    pub resolved_prompts: Vec<ResolvedPromptSlot>,
    pub generation_params: Option<serde_json::Value>,
    pub lora_config: Option<serde_json::Value>,
    pub resolved_video_settings: ResolvedVideoSettings,
}
```

**Context Loader Changes:**

```
Current flow (single seed):
1. Load scene → get image_variant_id
2. Load image variant → get file_path
3. Set seed_image_path = file_path

New flow (multi-seed):
1. Load scene → get scene_type → get workflow → get workflow_media_slots
2. Load avatar_media_assignments for this avatar
3. Call resolve_media_slots() → get Vec<ResolvedMediaSlot>
4. Set resolved_media = resolved slots
5. For segment_index > 0 (continuations):
   The primary seed slot is replaced with the previous segment's last frame
   (other slots remain as-is)
```

**Backward Compatibility:** If a workflow has no `workflow_media_slots` defined (pre-migration workflows), the context loader falls back to the legacy single-seed behavior using `scene.image_variant_id`. This fallback is removed once all workflows are migrated.

**Acceptance Criteria:**
- [ ] `GenerationContext` has `resolved_media: Vec<ResolvedMediaSlot>` field
- [ ] Context loader resolves all media slots for the scene's workflow
- [ ] Continuation segments (segment_index > 0) replace the primary seed with the previous frame
- [ ] Backward compatibility: workflows without media slots use legacy `image_variant_id`
- [ ] Missing required media slots produce clear `PipelineError::MissingConfig` errors
- [ ] All resolved media paths are validated to exist before proceeding

---

#### Requirement 1.6: Workflow Builder Multi-Seed Injection

**Description:** The workflow builder (`crates/pipeline/src/workflow_builder.rs`) is updated to inject multiple media files into their respective workflow nodes, replacing the current `set_seed_image()` that only handles a single LoadImage node.

**Changes:**

```rust
// REMOVED: fn set_seed_image(workflow, seed_image_path) → finds first LoadImage

// NEW: Inject all resolved media into their target nodes
fn inject_media(
    workflow: &mut serde_json::Value,
    resolved_media: &[ResolvedMediaSlot],
) -> Result<(), PipelineError> {
    for slot in resolved_media {
        let node = workflow
            .get_mut(&slot.node_id)
            .ok_or_else(|| PipelineError::WorkflowBuild(
                format!("Node {} not found for media slot '{}'", slot.node_id, slot.slot_label)
            ))?;

        let filename = Path::new(&slot.file_path)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or(&slot.file_path);

        node["inputs"][&slot.input_name] = serde_json::Value::String(filename.to_string());
    }
    Ok(())
}
```

**Submitter Changes:**

The submitter currently uploads a single seed image to ComfyUI. It must now upload all media files:

```
Current flow:
1. Upload seed image to ComfyUI /upload/image
2. Set filename in workflow JSON

New flow:
1. For each resolved media slot:
   a. Download file from storage
   b. Upload to ComfyUI using the appropriate endpoint:
      - Images → POST /upload/image
      - Other media → POST /upload/image (ComfyUI uses same endpoint) or custom handler
   c. Get the uploaded filename from ComfyUI response
2. Inject all filenames into workflow JSON via inject_media()
```

**Acceptance Criteria:**
- [ ] `build_workflow()` calls `inject_media()` instead of `set_seed_image()`
- [ ] Each media slot's file is injected into the correct node/input
- [ ] Missing nodes produce clear error messages referencing the slot label
- [ ] Submitter uploads all media files before submitting the workflow
- [ ] Backward compatibility: if `resolved_media` is empty but legacy `seed_image_path` is set, fallback to old behavior
- [ ] Unit tests cover multi-seed injection with 1, 2, and 3+ media slots

---

#### Requirement 1.7: Pipeline Seed Slot Enhancement

**Description:** The existing pipeline `seed_slots` JSONB (PRD-138) is enhanced with a `media_type` field to support non-image seeds. The `SeedSlot` struct in `crates/core/src/pipeline.rs` gains additional metadata.

**Enhanced SeedSlot:**

```rust
pub struct SeedSlot {
    pub name: String,
    pub required: bool,
    pub description: String,
    pub media_type: String,         // NEW: 'image' | 'video' | 'audio' | 'other'
    pub allowed_extensions: Vec<String>,  // NEW: e.g., ["png", "jpg", "webp"]
    pub track_affinity: Option<String>,   // NEW: track name this slot maps to (for auto-matching)
}
```

**Migration:** Existing seed slot records get `media_type: "image"` and empty `allowed_extensions` (accept all).

**Acceptance Criteria:**
- [ ] `SeedSlot` struct has `media_type`, `allowed_extensions`, and `track_affinity` fields
- [ ] Existing seed slots default to `media_type: "image"` after migration
- [ ] SeedSlotEditor in frontend shows the new fields
- [ ] Import rule matching validates media type against seed slot definition
- [ ] Pipeline settings page allows configuring all new fields

---

#### Requirement 1.8: Avatar Seeds Tab (Unified View)

**Description:** The avatar detail page gains a "Seeds" tab that aggregates all media slots from all workflows assigned to the avatar's scene types. This provides a single view of what media the avatar needs, what is assigned, and what is missing.

**Slot Aggregation Logic:**

```
1. Find all scene types assigned to the avatar (via avatar_scene_overrides or project's scene types)
2. For each scene type, get its workflow(s)
3. For each workflow, get its workflow_media_slots
4. Deduplicate slots by seed_slot_name (pipeline seed slot name):
   - Multiple workflows may reference the same pipeline seed slot
   - Show one row per unique seed_slot_name, list which workflows use it
5. For each slot, show:
   - Slot label and media type
   - Currently assigned media (thumbnail for images, filename for others)
   - Which workflows/scene types use this slot
   - Passthrough status and track assignment
   - Upload/replace action
```

**UI Layout:**

```
Seeds Tab
┌─────────────────────────────────────────────────────┐
│ Required Seeds                                       │
│                                                      │
│ ┌─ Reference Image (image) ────────────────────────┐│
│ │ [thumbnail]  clothed_front.png                    ││
│ │ Status: Assigned ✓  |  Passthrough → clothed track││
│ │ Used by: Bottom Scene, Top Scene, Dance Scene     ││
│ │ [Replace] [Remove]                                ││
│ └───────────────────────────────────────────────────┘│
│                                                      │
│ ┌─ Topless Reference (image) ──────────────────────┐│
│ │ [thumbnail]  topless_front.png                    ││
│ │ Status: Assigned ✓                                 ││
│ │ Used by: Bottom Scene, Top Scene                   ││
│ │ [Replace] [Remove]                                ││
│ └───────────────────────────────────────────────────┘│
│                                                      │
│ Optional Seeds                                       │
│                                                      │
│ ┌─ Audio Reference (audio) ────────────────────────┐│
│ │ [drop zone]  No file assigned                     ││
│ │ Fallback: skip_node                                ││
│ │ Used by: Dance Scene                               ││
│ └───────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Frontend Hooks:**
- `useWorkflowMediaSlots(workflowId)` — List media slots for a workflow
- `useAvatarMediaAssignments(avatarId)` — Get all media assignments for an avatar
- `useAggregatedSeedSlots(avatarId)` — Aggregated view: all slots across all workflows
- `useAssignMedia(avatarId)` — Mutation to create/update an avatar_media_assignment
- `useRemoveMediaAssignment(assignmentId)` — Mutation to remove an assignment

**Acceptance Criteria:**
- [ ] Seeds tab shows all media slots from all workflows linked to the avatar's scene types
- [ ] Slots grouped by required vs optional
- [ ] Slots deduplicated by `seed_slot_name` when multiple workflows share the same pipeline seed slot
- [ ] Each slot shows current assignment (thumbnail for images, filename for others)
- [ ] Each slot shows which workflows/scene types use it
- [ ] Upload/replace action supports file drop and file picker
- [ ] Passthrough badge and track shown for passthrough assignments
- [ ] Missing required slots shown prominently with upload call-to-action
- [ ] Naming engine (PRD-116) used for file storage paths

---

#### Requirement 1.9: API Endpoints

**Description:** RESTful API endpoints for managing workflow media slots and avatar media assignments.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/workflows/:id/media-slots` | List media slots for a workflow |
| `PUT` | `/api/v1/workflows/:id/media-slots/:slot_id` | Update slot label, required, fallback, seed_slot_name |
| `GET` | `/api/v1/avatars/:id/media-assignments` | List all media assignments for an avatar |
| `POST` | `/api/v1/avatars/:id/media-assignments` | Create or update a media assignment |
| `DELETE` | `/api/v1/avatars/:id/media-assignments/:assignment_id` | Remove a media assignment |
| `PUT` | `/api/v1/avatars/:id/media-assignments/:assignment_id` | Update assignment (passthrough, notes) |
| `GET` | `/api/v1/avatars/:id/seed-summary` | Aggregated seed slot view (all workflows) |
| `POST` | `/api/v1/avatars/:id/media-assignments/upload` | Upload a file and create assignment |

**Acceptance Criteria:**
- [ ] All endpoints follow standard `{ data }` / `{ error }` envelope format
- [ ] Media slot updates require admin role
- [ ] Avatar media assignments require creator or admin role
- [ ] Upload endpoint accepts multipart form with `slot_id` and file
- [ ] Seed summary endpoint returns aggregated view with deduplication
- [ ] Validation: media_type must match between assignment and slot
- [ ] Validation: image_variant_id OR file_path must be set, not both

---

#### Requirement 1.10: Migration from Single-Seed to Multi-Seed

**Description:** Migrate existing data from the single-seed model (`scene.image_variant_id`) to the multi-seed model without data loss. This is a multi-step migration that preserves backward compatibility.

**Migration Strategy:**

```
Step 1: Create new tables (workflow_media_slots, avatar_media_assignments)

Step 2: For each existing workflow with at least one LoadImage node:
  - Create a workflow_media_slots row for the first LoadImage node
  - Set slot_label = "Seed Image" (or match to pipeline seed slot if possible)
  - Set seed_slot_name to first pipeline seed slot name (e.g., "clothed")

Step 3: For each scene that has image_variant_id set:
  - Find the workflow's first media slot
  - Create an avatar_media_assignments row:
    avatar_id = scene.avatar_id
    media_slot_id = first workflow media slot
    image_variant_id = scene.image_variant_id

Step 4: DO NOT drop scene.image_variant_id yet — keep for backward compat
  - Context loader checks resolved_media first, falls back to image_variant_id
  - Drop in a future migration after verification
```

**Acceptance Criteria:**
- [ ] Migration creates media slot rows for all existing LoadImage workflows
- [ ] Migration creates avatar assignment rows from existing scene.image_variant_id references
- [ ] No data loss — all existing seed assignments preserved
- [ ] `scene.image_variant_id` column retained for backward compatibility
- [ ] Context loader fallback works for un-migrated workflows
- [ ] Migration is idempotent (safe to re-run)

---

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL -- Post-MVP]** Per-Scene-Type Seed Overrides

**Description:** Allow different media assignments for the same avatar + slot combination per scene type. The `scene_type_id` column on `avatar_media_assignments` is already present (nullable in MVP); this enables the UI and validation to support it.

---

#### Requirement 2.2: **[OPTIONAL -- Post-MVP]** Per-Track Seed Requirements

**Description:** Different tracks within the same pipeline can require different seeds. The schema already has `seed_slot_name` linking to pipeline seed slots; this extends it with per-track filtering so the Seeds tab only shows relevant slots per track context.

---

#### Requirement 2.3: **[OPTIONAL -- Post-MVP]** Auto-Classification on Upload

**Description:** When files are uploaded to the Seeds tab, the system auto-classifies them based on filename patterns (using PRD-141 import rules) and suggests which slot they belong to.

---

#### Requirement 2.4: **[OPTIONAL -- Post-MVP]** Seed Version History

**Description:** Track the history of media assignments per slot — when a file was assigned, replaced, or removed, and by whom. Enables rollback to a previous seed.

---

#### Requirement 2.5: **[OPTIONAL -- Post-MVP]** Media Validation Rules

**Description:** Workflow media slots define validation rules (minimum resolution, aspect ratio, file format, duration range for video/audio). Files are validated on assignment and warnings shown for mismatches.

---

#### Requirement 2.6: **[OPTIONAL -- Post-MVP]** Seed Preview Generation

**Description:** For workflows with multiple seeds, show a composite preview of all inputs arranged as they will be used in the workflow, helping creators verify the right files are in the right slots.

## 6. Non-Goals (Out of Scope)

- **Media file editing** — This PRD handles assignment and injection, not editing. Cropping, resizing, or audio trimming are separate features.
- **Automatic media generation** — Auto-generating depth maps or audio from other sources is out of scope. Fallback modes only support "skip" or "use a default file."
- **Cross-avatar media sharing** — Media files are per-avatar. Sharing a reference image across avatars requires uploading it to each.
- **Workflow node creation** — This PRD does not create new nodes in workflows; it only labels and injects into existing nodes discovered during import.
- **Video seed injection** — While the schema supports video media types, the ComfyUI upload mechanism for video files may require additional work beyond this PRD. Image injection is the primary MVP target.

## 7. Design Considerations

### Workflow Media Slots UI

The workflow detail page (from PRD-75) gains a "Media Inputs" section alongside the existing "Prompt Slots" section (PRD-115). The pattern is identical: a list of detected nodes with admin-editable labels, types, and configuration.

### Avatar Seeds Tab

The Seeds tab replaces the current seed image display on the avatar detail page. It uses the existing `SeedDataDropSlot` component for file upload slots, extended with media type awareness and passthrough controls.

### Passthrough Visual Indicator

Passthrough assignments show a small badge or icon indicating they serve double duty (seed + deliverable). The track name is shown alongside.

### Existing Components to Reuse

| Component | Source | Usage |
|-----------|--------|-------|
| `SeedDataDropSlot` | `features/avatars/components/` | File upload slots — extend for media types |
| `SeedSlotEditor` | `features/pipelines/components/` | Pattern for editing slot metadata |
| `WorkflowPromptSlotEditor` | Pattern from PRD-115 | Mirror for media slot admin UI |
| `AvatarSeedDataModal` | `features/avatars/components/` | Refactor into Seeds tab content |

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Source | Usage |
|-----------|--------|-------|
| `workflow_prompt_slots` table pattern | PRD-115 migration | Schema pattern for `workflow_media_slots` |
| `resolve_prompts()` | `crates/core/src/prompt_resolution.rs` | Pattern for `resolve_media_slots()` |
| `set_seed_image()` | `crates/pipeline/src/workflow_builder.rs` | Refactored into `inject_media()` |
| `load_generation_context()` | `crates/pipeline/src/context_loader.rs` | Extended with multi-seed loading |
| `validate_seed_images()` | `crates/core/src/pipeline.rs` | Extended for media type validation |
| `SeedSlot` struct | `crates/core/src/pipeline.rs` | Enhanced with `media_type` field |
| `ImageVariantRepo` | `crates/db/src/repositories/` | Used to resolve `image_variant_id` to file paths |
| Pipeline seed_slots JSONB | `pipelines` table | Enhanced with media_type metadata |

### New Infrastructure Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| `workflow_media_slots` table | Migration | Store workflow media input node metadata |
| `avatar_media_assignments` table | Migration | Store avatar-to-slot media mappings |
| `resolve_media_slots()` | `crates/core/src/media_resolution.rs` | Centralized media slot resolution |
| `inject_media()` | `crates/pipeline/src/workflow_builder.rs` | Multi-file workflow injection |
| Media slot repo | `crates/db/src/repositories/workflow_media_slot_repo.rs` | CRUD for media slots |
| Assignment repo | `crates/db/src/repositories/avatar_media_assignment_repo.rs` | CRUD for assignments |
| API handlers | `crates/api/src/handlers/media_assignment.rs` | All new endpoints |
| Frontend Seeds tab | `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx` | Unified seed view |
| Frontend media slot editor | `apps/frontend/src/features/workflows/components/MediaSlotEditor.tsx` | Admin workflow config |

### Database Changes

**New tables (2):**
- `workflow_media_slots` — workflow media input node metadata
- `avatar_media_assignments` — avatar-to-slot media file mappings

**Altered tables (1):**
- `pipelines` — `seed_slots` JSONB enhanced with `media_type`, `allowed_extensions`, `track_affinity` fields

**Retained for compatibility (1):**
- `scenes.image_variant_id` — kept until full migration verified, then dropped in future PRD

### API Changes

8 new endpoints for media slot and assignment management (see Req 1.9).

Modification to the generation dispatch flow: context loader resolves multiple media instead of single seed.

## 9. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Workflow has no LoadImage nodes | No media slots created; workflow works without seeds (prompt-only) |
| Required slot with no assignment | Generation blocked with clear error: "Avatar X missing required seed: {slot_label}" |
| Optional slot with no assignment | Fallback mode applied: `skip_node` removes node from workflow, `use_default` keeps original filename |
| Avatar assigned to scene type with different workflow than previously | Media assignments linked to media_slot_id (workflow-specific), so changing workflow invalidates old assignments. Seeds tab shows the new slots. |
| Multiple workflows share same pipeline seed slot name | Deduplicated in Seeds tab; one upload satisfies all workflows |
| Passthrough file deleted from storage | Delivery assembly reports error; file must be re-uploaded |
| Workflow re-imported with different/additional LoadImage nodes | New nodes get new media slot rows; existing slots preserved by node_id match |
| Continuation segment (segment_index > 0) | Primary media slot (first slot or marked as "primary") replaced with previous segment's last frame; other slots unchanged |

## 10. Success Metrics

- All existing single-seed workflows work without reconfiguration after migration.
- Multi-input workflows (2+ media slots) can be configured and used for generation without touching ComfyUI.
- The Seeds tab shows 100% of required media slots and their assignment status for any avatar.
- Passthrough seeds correctly appear in delivery manifests without duplication.
- Media slot resolution is deterministic — same inputs always resolve to the same files.
- Average time to configure a new workflow's media inputs is under 5 minutes (labeling + assigning).

## 11. Testing Requirements

### Unit Tests
- `resolve_media_slots()` with all assignment types (avatar default, scene_type override, fallback)
- `inject_media()` with 0, 1, 2, 3+ media slots
- `validate_seed_images()` with new media_type validation
- Migration data consistency checks
- Passthrough flag validation (requires track_id)

### Integration Tests
- End-to-end: create workflow → auto-detect slots → label → assign media → generate → verify injection
- Backward compatibility: workflow without media slots uses legacy `image_variant_id`
- Seed summary aggregation across multiple workflows
- Upload + assign in single request

## 12. Open Questions

1. **Primary slot designation** — For continuation segments, how is the "primary" seed slot identified? Options: (a) first slot by sort_order, (b) a `is_primary` boolean on the slot, (c) slot with `seed_slot_name` matching the first pipeline seed slot.
2. **ComfyUI upload for non-image media** — Does ComfyUI's `/upload/image` endpoint handle video and audio files, or are different endpoints needed? This needs verification against ComfyUI's API.
3. **Passthrough and delivery timing** — Should passthrough deliverables appear in the delivery manifest immediately upon assignment, or only after the avatar's generation is complete for other tracks?
4. **Slot deduplication key** — When multiple workflows reference the same pipeline seed slot, should deduplication use `seed_slot_name` string match, or should there be a formal `pipeline_seed_slot_id` FK?
5. **Drop scene.image_variant_id** — What is the timeline for dropping the legacy column? Should this be tracked as a separate cleanup PRD?

## 13. Version History

- **v1.0** (2026-03-24): Initial PRD creation. Workflow media slots (mirroring prompt slots), avatar media assignments, passthrough seeds, multi-seed context loader and workflow builder, avatar Seeds tab, migration strategy from single-seed system.
