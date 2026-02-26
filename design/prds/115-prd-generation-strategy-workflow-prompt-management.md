# PRD-115: Generation Strategy & Workflow Prompt Management

## 1. Introduction/Overview

The platform currently assumes a single video generation model: **recursive segment chaining** (PRD-24), where the platform orchestrates multi-segment generation — generating one segment at a time, extracting the last frame, and feeding it as input to the next segment. Prompts are resolved from three position-based templates (`full_clip`, `start_clip`, `continuation_clip`) via placeholder substitution from character metadata.

However, the team has developed ComfyUI workflows where **chunking, interpolation, and upscaling all happen within the workflow itself** using SVD/SVI LoRA. In this model, ComfyUI receives the seed image and workflow, handles all internal chunk generation, frame interpolation, and resolution upscaling, and outputs the final video directly. The platform doesn't need to orchestrate segments — it just submits and receives. This is expected to become the **default generation process**.

Additionally, the current prompt system has a critical gap: while templates support `{placeholder}` substitution from character metadata, there is **no way to add character+scene-specific prompt overrides**. In practice, different characters in the same scene need different prompt additions based on their attributes (e.g., clothing type determines whether the prompt says "pull up dress" or "pull down jeans"). These per-character-per-scene adjustments currently require manually editing prompts in ComfyUI — which defeats the purpose of the platform.

This PRD introduces:
1. **Generation strategy selection** — choose between platform-orchestrated (PRD-24 recursive chaining) and workflow-managed (in-workflow chunking) per scene type
2. **Prompt node mapping** — identify and label all prompt input nodes in a ComfyUI workflow so the platform knows which prompts go where
3. **Character+scene prompt overrides** — additive prompt fragments that are appended to the default prompt for specific character+scene combinations
4. **Prompt fragment library** — a reusable, searchable, tagged library of prompt snippets with scene-type pinning
5. **In-app prompt editing** — edit all prompts that feed into a workflow from the platform UI, eliminating the need to open ComfyUI

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-23 (Scene Type Configuration — prompt templates, position-based prompts, placeholder substitution)
  - PRD-24 (Recursive Video Generation Loop — segment chaining, stop decisions, boundary frames)
  - PRD-63 (Prompt Editor & Versioning — prompt versions, shared library, live preview)
  - PRD-75 (ComfyUI Workflow Import & Validation — parameter discovery, workflow parsing, CLIPTextEncode detection)
- **Extends:**
  - PRD-23 — adds `generation_strategy` field to scene types
  - PRD-24 — the recursive chaining strategy becomes one of two options (not the only one)
  - PRD-63 — the prompt library is extended with a fragment sublibrary
  - PRD-75 — parameter discovery enhanced with semantic node labeling
- **Integrates with:**
  - PRD-33 (Workflow Canvas) — visual node graph shows prompt node labels
  - PRD-57 (Batch Orchestrator) — batch submission respects generation strategy
  - PRD-74 (Config Templates) — templates include generation strategy setting
  - PRD-112 (Project Hub) — character+scene prompt overrides accessible from character detail page (Scenes tab)

## 3. Goals

- Allow admins to select the generation strategy per scene type: platform-orchestrated (recursive chaining) or workflow-managed (in-workflow chunking with SVD/SVI LoRA).
- Map every prompt input node in a ComfyUI workflow to a semantic label, so the platform knows exactly which prompts feed which nodes.
- Enable character+scene-specific prompt customization via additive fragments — without modifying the base scene-type prompt template.
- Build a reusable prompt fragment library with global scope and scene-type pinning for quick selection.
- Eliminate the need to open ComfyUI for prompt editing — all prompt configuration happens in the platform UI.

## 4. User Stories

- **As an admin**, I want to select whether a scene type uses recursive chaining or in-workflow chunking, so I can use our SVD/SVI LoRA workflows that handle everything internally.
- **As a creator**, I want to see which prompt nodes exist in a workflow and what default text they contain, so I understand what each node does without opening ComfyUI.
- **As a creator**, I want to add character-specific prompt lines to a scene (e.g., "she pulls up dress" for Chloe in the bottom scene), so I don't have to manually edit the ComfyUI workflow per character.
- **As a creator**, I want to pick prompt additions from a dropdown of reusable fragments, and add new ones if mine doesn't exist, so I build up a library over time.
- **As a creator**, I want to edit the actual prompt text that will be sent to each workflow node from within the platform, so I never need to open ComfyUI's interface.
- **As a creator**, I want to see a live preview of the fully resolved prompt (base template + character metadata + fragments) before submitting a generation job.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Generation Strategy Selection

**Description:** Each scene type must have a `generation_strategy` field that determines how video generation is orchestrated. Two strategies are supported:

1. **`platform_orchestrated`** (existing PRD-24 behavior) — the platform manages segment-by-segment generation, frame extraction, boundary selection, and stitching. Multiple segments are created, each with its own prompt type (`full_clip`, `start_clip`, `continuation_clip`).

2. **`workflow_managed`** (new) — the platform submits the entire workflow to ComfyUI as a single job. ComfyUI handles internal chunking, interpolation, and upscaling via SVD/SVI LoRA. The platform receives the final video (and optionally intermediate chunk artifacts for QA).

**Database Change:**

```sql
-- Add generation_strategy column to scene_types
ALTER TABLE scene_types ADD COLUMN generation_strategy TEXT NOT NULL DEFAULT 'platform_orchestrated';
-- Valid values: 'platform_orchestrated', 'workflow_managed'

-- Add chunk tracking fields for workflow_managed strategy
ALTER TABLE scene_types ADD COLUMN expected_chunks INTEGER;  -- NULL = unknown, workflow decides
ALTER TABLE scene_types ADD COLUMN chunk_output_pattern TEXT; -- e.g., "chunk_{n}.mp4" for QA tracking
```

**Behavior Differences:**

| Aspect | `platform_orchestrated` | `workflow_managed` |
|--------|------------------------|-------------------|
| Segment creation | Platform creates N segments | Platform creates 1 "scene execution" record |
| Prompt selection | Position-based (start/continuation) | All prompts injected into workflow nodes before submission |
| Frame extraction | Platform extracts last frame per segment | Not needed — ComfyUI handles internally |
| Duration control | Elastic stop decision (PRD-24) | Duration configured in workflow parameters |
| Output | Multiple segment videos → stitched | Single final video (+ optional chunk artifacts) |
| QA review | Per-segment approval | Chunk artifacts available for QA if workflow outputs them |
| Progress tracking | Per-segment progress | ComfyUI execution progress (node-by-node) |

**Acceptance Criteria:**
- [ ] `scene_types.generation_strategy` column exists with default `platform_orchestrated`
- [ ] Scene type create/update API accepts `generation_strategy` field
- [ ] Scene type editor UI shows strategy selection dropdown
- [ ] `workflow_managed` scenes skip the recursive segment loop entirely
- [ ] `workflow_managed` scenes submit the full workflow JSON with all prompt nodes pre-filled
- [ ] If the workflow outputs intermediate chunk files, they are captured and stored for QA review
- [ ] `platform_orchestrated` behavior is unchanged (backward compatible)
- [ ] Batch orchestrator (PRD-57) respects the generation strategy when submitting jobs

---

#### Requirement 1.2: Workflow Prompt Node Mapping

**Description:** When a ComfyUI workflow is imported (PRD-75), the platform auto-detects all prompt input nodes (CLIPTextEncode and similar) and allows admins to assign semantic labels. These labels are stored in the workflow's discovered parameters and used by the prompt editing UI to show which prompt goes to which node.

**Enhanced Parameter Discovery:**

The existing PRD-75 heuristic detects CLIPTextEncode nodes and classifies them as `Prompt` or `NegativePrompt`. This PRD enhances that with:

1. **Auto-detection** — existing heuristic (node name contains "neg" → negative, else → positive)
2. **Semantic labeling** — admin assigns a human-readable label (e.g., "Main Positive Prompt", "Chunk 2 Negative", "Upscale Refinement Prompt")
3. **Prompt slot ordering** — admin sets the display order of prompt slots
4. **Default text capture** — the current text value in the workflow JSON is stored as the "workflow default"

**Database Schema:**

```sql
CREATE TABLE workflow_prompt_slots (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,                    -- ComfyUI node ID (e.g., "3", "7")
    input_name TEXT NOT NULL DEFAULT 'text',  -- Input field name on the node
    slot_label TEXT NOT NULL,                 -- Human-readable label ("Main Positive Prompt")
    slot_type TEXT NOT NULL DEFAULT 'positive', -- 'positive' | 'negative'
    sort_order INTEGER NOT NULL DEFAULT 0,
    default_text TEXT,                        -- Default prompt text from workflow JSON
    is_user_editable BOOLEAN NOT NULL DEFAULT true, -- Can users override this slot?
    description TEXT,                         -- Optional: "This prompt controls the initial scene setup"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, node_id, input_name)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflow_prompt_slots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Workflow Import Enhancement:**

```
During workflow import (PRD-75):
1. Parse workflow JSON → find all CLIPTextEncode nodes
2. For each node:
   a. Extract current text value → default_text
   b. Apply heuristic: node title/name contains "neg" → slot_type = 'negative'
   c. Generate auto-label: "Positive Prompt 1", "Negative Prompt 1", etc.
   d. Create workflow_prompt_slots row
3. Admin reviews and relabels in the workflow editor UI
```

**Acceptance Criteria:**
- [ ] Workflow import auto-creates `workflow_prompt_slots` for all CLIPTextEncode nodes
- [ ] Auto-labels generated as "Positive Prompt N" / "Negative Prompt N" with correct N
- [ ] Default text extracted from workflow JSON and stored in `default_text`
- [ ] Admin can relabel slots via API (`PUT /api/v1/workflows/:id/prompt-slots/:slot_id`)
- [ ] Admin can reorder slots via `sort_order`
- [ ] Admin can mark slots as non-editable (`is_user_editable = false`) to lock system prompts
- [ ] Prompt slots displayed in workflow detail UI with labels, types, and default text
- [ ] If workflow JSON is re-imported, existing slot labels are preserved (matched by node_id)

---

#### Requirement 1.3: Scene-Type Prompt Slot Defaults

**Description:** When a workflow is assigned to a scene type, the scene type inherits the workflow's prompt slots. The admin can then set scene-type-level default prompts for each slot — these replace or extend the workflow defaults and serve as the "base prompt" for that scene.

**Database Schema:**

```sql
CREATE TABLE scene_type_prompt_defaults (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    prompt_slot_id BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,                 -- Scene-type default for this slot
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (scene_type_id, prompt_slot_id)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_type_prompt_defaults
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Prompt Resolution Hierarchy:**

```
For each prompt slot in a workflow:
  1. Workflow default (from workflow_prompt_slots.default_text)
  2. Scene-type override (from scene_type_prompt_defaults.prompt_text)  ← wins if set
  3. Character+scene fragments (Req 1.5) appended to the resolved text
  4. Placeholder substitution ({character_name}, {hair_color}, etc.)
  → Final resolved prompt sent to ComfyUI node
```

**Acceptance Criteria:**
- [ ] When a workflow is assigned to a scene type, prompt slots are displayed in the scene type editor
- [ ] Admin can set per-slot default prompts that override the workflow's default text
- [ ] Placeholder substitution applies to scene-type defaults (same `{key}` pattern as PRD-23)
- [ ] If no scene-type default is set, the workflow default is used
- [ ] Live preview shows the resolved prompt for a selected character (extends PRD-23 preview)
- [ ] Scene-type prompt defaults support `{placeholder}` tokens with validation warnings

---

#### Requirement 1.4: Character+Scene Prompt Overrides (Additive Fragments)

**Description:** For a specific character in a specific scene type, creators can add prompt fragments that are appended to the resolved base prompt. These fragments handle character-specific adjustments like clothing, posing, or facing direction. Fragments are selected from the prompt fragment library (Req 1.5) or typed directly.

**Database Schema:**

```sql
CREATE TABLE character_scene_prompt_overrides (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    prompt_slot_id BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE,
    fragments JSONB NOT NULL DEFAULT '[]',     -- Ordered array of fragment references + inline text
    notes TEXT,                                -- Creator notes explaining why these fragments
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (character_id, scene_type_id, prompt_slot_id)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON character_scene_prompt_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Fragments JSONB Structure:**

```json
[
  {"type": "fragment_ref", "fragment_id": 42, "text": "she pulls up dress"},
  {"type": "inline", "text": "she is facing away from the camera"},
  {"type": "fragment_ref", "fragment_id": 17, "text": "soft studio lighting"}
]
```

Each entry is either a reference to a prompt fragment library entry (`fragment_ref`) or an inline text addition (`inline`). The `text` field is denormalized from the fragment library for display and is refreshed when the source fragment is updated.

**Prompt Resolution (Full Chain):**

```
For character "Chloe" in scene type "bottom_scene", prompt slot "Main Positive":

Step 1: Base text = scene_type_prompt_defaults.prompt_text
        → "A beautiful {character_name} with {hair_color} hair in a seductive pose"

Step 2: Placeholder substitution (character metadata)
        → "A beautiful Chloe with blonde hair in a seductive pose"

Step 3: Append character+scene fragments (ordered)
        → "A beautiful Chloe with blonde hair in a seductive pose, she pulls up dress, she is facing away from the camera"

Step 4: Final text sent to ComfyUI node "Main Positive Prompt"
```

**Fragment Separator:** Fragments are joined with `, ` (comma + space) by default. Configurable per scene type if needed.

**Acceptance Criteria:**
- [ ] Character+scene prompt overrides stored per prompt slot (not per scene type)
- [ ] Fragments are ordered — display and application respects the array order
- [ ] Fragment references link to the prompt fragment library; inline text also supported
- [ ] Override can be set from the character detail page (Scenes tab) in PRD-112
- [ ] Override can also be set from the scene type editor (per-character view)
- [ ] Live preview shows base prompt + fragments resolved for a specific character
- [ ] Removing a fragment from the library does not break existing overrides (denormalized `text` preserved)
- [ ] API: `PUT /api/v1/characters/:id/scenes/:scene_type_id/prompt-overrides`
- [ ] API: `GET /api/v1/characters/:id/scenes/:scene_type_id/prompt-overrides` returns resolved preview
- [ ] Fragments can reference `{placeholder}` tokens (resolved from character metadata)

---

#### Requirement 1.5: Prompt Fragment Library

**Description:** A global library of reusable prompt snippets (fragments) that can be added to character+scene overrides via a searchable dropdown. Fragments are tagged and can be pinned to specific scene types for quick access. If a needed fragment doesn't exist, the user can create one inline.

**Database Schema:**

```sql
CREATE TABLE prompt_fragments (
    id BIGSERIAL PRIMARY KEY,
    text TEXT NOT NULL,                        -- The fragment text (e.g., "she pulls up dress")
    description TEXT,                          -- Optional: when to use this fragment
    category TEXT,                             -- e.g., "clothing", "posing", "direction", "lighting"
    tags JSONB NOT NULL DEFAULT '[]',          -- ["clothing", "female", "dress"]
    usage_count INTEGER NOT NULL DEFAULT 0,    -- Auto-incremented on use
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scene-type pinning (many-to-many)
CREATE TABLE prompt_fragment_scene_pins (
    fragment_id BIGINT NOT NULL REFERENCES prompt_fragments(id) ON DELETE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    PRIMARY KEY (fragment_id, scene_type_id)
);
```

**Dropdown Behavior:**

```
When user opens fragment dropdown for "Chloe × bottom_scene × Main Positive":

Section 1: "Pinned for bottom_scene" (fragments pinned to this scene type)
  ├── "she pulls up dress" [clothing] (used 47 times)
  ├── "she pulls down jeans" [clothing] (used 32 times)
  └── "she unbuttons shirt" [clothing] (used 18 times)

Section 2: "All Fragments" (searchable, sorted by usage)
  ├── "she is facing away from the camera" [posing] (used 156 times)
  ├── "soft studio lighting" [lighting] (used 89 times)
  └── ... (search/filter by text, category, tag)

Footer: "+ Add new fragment" → inline creation form
```

**Acceptance Criteria:**
- [ ] Fragments are global (not scoped to a project or scene type)
- [ ] Fragments can be pinned to one or more scene types for quick access
- [ ] Fragment dropdown shows pinned fragments first, then all fragments sorted by usage
- [ ] Dropdown is searchable by text, category, and tags
- [ ] New fragments can be created inline from the dropdown (text + optional category/tags)
- [ ] `usage_count` incremented when a fragment is added to a character+scene override
- [ ] Fragments support `{placeholder}` tokens (e.g., "she has {hair_color} hair")
- [ ] API: `GET /api/v1/prompt-fragments?scene_type_id=X&search=dress` — filtered list
- [ ] API: `POST /api/v1/prompt-fragments` — create new fragment
- [ ] API: `PUT /api/v1/prompt-fragments/:id` — update fragment text/tags
- [ ] API: `POST /api/v1/prompt-fragments/:id/pin/:scene_type_id` — pin to scene type
- [ ] Deleting a fragment does not break existing overrides (text is denormalized)

---

#### Requirement 1.6: In-App Prompt Editing UI

**Description:** The platform provides a prompt editing interface that shows all prompt slots in a workflow, their resolved values, and allows editing — eliminating the need to open ComfyUI. This UI appears in two contexts:

1. **Scene Type Editor** — edit scene-type default prompts for each workflow slot
2. **Character Detail Page (Scenes Tab)** — edit character+scene overrides with fragment dropdown

**Scene Type Editor — Prompt Slots Panel:**

```
┌─────────────────────────────────────────────────┐
│ Workflow: "SVD Dance v3" (6 prompt slots)        │
│                                                   │
│ ┌── Main Positive Prompt (slot 1) ──────────────┐│
│ │ A beautiful {character_name} with {hair_color}  ││
│ │ hair dancing gracefully in a studio             ││
│ │ [Preview: "A beautiful Chloe with blonde..."]   ││
│ └─────────────────────────────────────────────────┘│
│                                                   │
│ ┌── Main Negative Prompt (slot 2) ──────────────┐│
│ │ blurry, low quality, distorted face             ││
│ └─────────────────────────────────────────────────┘│
│                                                   │
│ ┌── Chunk 2 Positive (slot 3) ──────────────────┐│
│ │ Continue the dance motion, {character_name}     ││
│ │ maintaining pose consistency                    ││
│ └─────────────────────────────────────────────────┘│
│ ... (more slots)                                  │
└─────────────────────────────────────────────────┘
```

**Character Scenes Tab — Override Panel:**

```
┌─────────────────────────────────────────────────┐
│ Chloe × Bottom Scene                             │
│                                                   │
│ Main Positive Prompt                              │
│ Base: "A beautiful Chloe with blonde hair..."     │
│                                                   │
│ Additions:                                        │
│ ┌─ [×] she pulls up dress          [clothing] ─┐│
│ ├─ [×] she is facing away from cam  [posing]   ─┤│
│ └─ [+ Add fragment ▾]                           ─┘│
│                                                   │
│ Preview (resolved):                               │
│ "A beautiful Chloe with blonde hair in a          │
│  seductive pose, she pulls up dress, she is       │
│  facing away from the camera"                     │
│                                                   │
│ Main Negative Prompt                              │
│ Base: "blurry, low quality..."                    │
│ Additions: (none)                                 │
└─────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Scene type editor shows all workflow prompt slots with labels and types
- [ ] Each slot is an editable textarea with syntax highlighting for `{placeholder}` tokens
- [ ] Live preview resolves placeholders for a selected character (dropdown selector)
- [ ] Character detail page (Scenes tab) shows prompt overrides per scene type
- [ ] Fragment dropdown with pinned-first ordering and inline creation
- [ ] Drag-and-drop reordering of fragments within an override
- [ ] Remove fragment button (×) on each added fragment
- [ ] Full resolved prompt preview (base + fragments + placeholders) with copy-to-clipboard
- [ ] Unsaved changes indicator; save button commits to backend
- [ ] Non-editable slots (marked in Req 1.2) shown as read-only with lock icon

**Frontend Hooks:**
- `useWorkflowPromptSlots(workflowId)` — list prompt slots for a workflow
- `useSceneTypePromptDefaults(sceneTypeId)` — get/set scene-type defaults per slot
- `useCharacterSceneOverrides(characterId, sceneTypeId)` — get/set fragment overrides
- `usePromptFragments(sceneTypeId?, search?)` — search fragment library
- `usePromptPreview(sceneTypeId, characterId, slotId)` — resolve full prompt chain
- `useCreateFragment()` — inline fragment creation mutation

---

#### Requirement 1.7: Prompt Resolution Engine

**Description:** A centralized prompt resolution function that takes a workflow's prompt slots, scene-type defaults, character metadata, and character+scene fragment overrides, and produces the final resolved prompt text for each node. This is the single source of truth used by both the live preview UI and the generation job submission.

**Resolution Algorithm:**

```rust
pub struct ResolvedPromptSlot {
    pub slot_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub slot_type: String,
    pub resolved_text: String,
    pub source: PromptSource,           // WorkflowDefault, SceneTypeDefault, WithFragments
    pub unresolved_placeholders: Vec<String>,
    pub applied_fragments: Vec<FragmentInfo>,
}

pub fn resolve_prompts(
    prompt_slots: &[WorkflowPromptSlot],
    scene_type_defaults: &HashMap<DbId, String>,
    character_metadata: &HashMap<String, String>,
    fragment_overrides: &HashMap<DbId, Vec<FragmentEntry>>,
) -> Vec<ResolvedPromptSlot> {
    for slot in prompt_slots {
        // Step 1: Pick base text (scene-type default > workflow default)
        let base = scene_type_defaults.get(&slot.id)
            .unwrap_or(&slot.default_text);

        // Step 2: Resolve placeholders
        let resolved = resolve_placeholders(base, character_metadata);

        // Step 3: Append fragments (if any)
        let fragments = fragment_overrides.get(&slot.id);
        let with_fragments = if let Some(frags) = fragments {
            let frag_texts: Vec<&str> = frags.iter().map(|f| {
                resolve_placeholders(&f.text, character_metadata)
            }).collect();
            format!("{}, {}", resolved, frag_texts.join(", "))
        } else {
            resolved
        };

        // Step 4: Record unresolved placeholders
        let unresolved = find_unresolved(&with_fragments);

        results.push(ResolvedPromptSlot { ... });
    }
}
```

**Acceptance Criteria:**
- [ ] Single `resolve_prompts()` function in `crates/core` used by both preview API and generation dispatch
- [ ] Resolution order: workflow default → scene-type override → placeholder substitution → fragment append
- [ ] Fragments are joined with `, ` separator (configurable)
- [ ] Unresolved placeholders reported for UI warnings
- [ ] `source` field indicates which level provided the text (for debugging/transparency)
- [ ] `applied_fragments` lists all fragments used (for provenance/audit)
- [ ] Fragment text also undergoes placeholder substitution
- [ ] API: `POST /api/v1/prompts/resolve` — resolve for a given scene_type + character + slot

---

#### Requirement 1.8: Workflow-Managed Generation Flow

**Description:** When a scene uses the `workflow_managed` strategy, the generation flow differs from PRD-24's recursive loop. The platform prepares the workflow JSON by injecting resolved prompts into the appropriate nodes, submits it as a single ComfyUI job, and tracks the execution.

**Generation Flow:**

```
1. Load scene type → get workflow JSON + generation_strategy
2. Assert strategy == 'workflow_managed'
3. Load prompt slots → resolve all prompts (Req 1.7)
4. Clone workflow JSON → inject resolved prompts into each node:
   For each slot: workflow_json[slot.node_id]["inputs"][slot.input_name] = resolved_text
5. Inject seed image into the appropriate LoadImage node(s)
6. Submit modified workflow to ComfyUI (or RunPod serverless)
7. Track execution via ComfyUI events (node progress, completion)
8. On completion:
   a. Download final video output
   b. If chunk artifacts are output, download and store for QA
   c. Create scene record with final video path
   d. Mark scene as ready for review
```

**Chunk QA Tracking:**

For `workflow_managed` scenes, the platform does not create `segments` records. Instead, if the workflow outputs intermediate chunks (configured via `chunk_output_pattern` on the scene type), those are stored as scene artifacts:

```sql
CREATE TABLE scene_artifacts (
    id BIGSERIAL PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,       -- 'chunk', 'interpolated', 'upscaled', 'final'
    sequence_index INTEGER,            -- Chunk ordering (0-based)
    file_path TEXT NOT NULL,
    duration_secs FLOAT,
    resolution TEXT,                   -- e.g., "1920x1080"
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scene_artifacts_scene_id ON scene_artifacts(scene_id);
```

**Acceptance Criteria:**
- [ ] Workflow-managed scenes inject resolved prompts into workflow JSON before submission
- [ ] Prompt injection modifies the correct node/input based on `workflow_prompt_slots` mapping
- [ ] Seed image injected into LoadImage nodes (detected during import)
- [ ] ComfyUI execution tracked via existing `comfyui_executions` table
- [ ] Intermediate chunk artifacts stored in `scene_artifacts` if workflow outputs them
- [ ] Final video stored as the scene's primary output
- [ ] No `segments` records created for workflow-managed scenes (segments are PRD-24 only)
- [ ] Scene status transitions: `generating` → `review` → `approved`/`rejected`
- [ ] Generation progress shown via ComfyUI node-level execution events

---

#### Requirement 1.9: Admin API Endpoints

**Description:** API endpoints for managing prompt slots, scene-type defaults, character+scene overrides, and prompt fragments.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/workflows/:id/prompt-slots` | List prompt slots for a workflow |
| `PUT` | `/api/v1/workflows/:id/prompt-slots/:slot_id` | Update slot label, type, order, editability |
| `GET` | `/api/v1/scene-types/:id/prompt-defaults` | Get scene-type defaults per slot |
| `PUT` | `/api/v1/scene-types/:id/prompt-defaults/:slot_id` | Set scene-type default for a slot |
| `GET` | `/api/v1/characters/:id/scenes/:scene_type_id/prompt-overrides` | Get character+scene overrides |
| `PUT` | `/api/v1/characters/:id/scenes/:scene_type_id/prompt-overrides` | Set character+scene overrides |
| `POST` | `/api/v1/prompts/resolve` | Resolve full prompt chain (preview) |
| `GET` | `/api/v1/prompt-fragments` | List fragments (search, filter, scene-type pin) |
| `POST` | `/api/v1/prompt-fragments` | Create fragment |
| `PUT` | `/api/v1/prompt-fragments/:id` | Update fragment text/tags |
| `DELETE` | `/api/v1/prompt-fragments/:id` | Delete fragment |
| `POST` | `/api/v1/prompt-fragments/:id/pin/:scene_type_id` | Pin fragment to scene type |
| `DELETE` | `/api/v1/prompt-fragments/:id/pin/:scene_type_id` | Unpin fragment from scene type |

**Acceptance Criteria:**
- [ ] All endpoints follow standard envelope: `{ data }` / `{ error }`
- [ ] Prompt slot updates require admin role
- [ ] Character+scene overrides require creator or admin role
- [ ] Fragment creation/update requires creator or admin role
- [ ] `GET /prompt-fragments` supports `?search=`, `?category=`, `?scene_type_id=` (returns pinned first)
- [ ] `POST /prompts/resolve` accepts `{ scene_type_id, character_id, slot_id? }` and returns all resolved slots

---

### Phase 2: Post-MVP Enhancements

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Batch Prompt Override Application

**Description:** Apply the same prompt fragment overrides to multiple characters at once. For example, if all characters wearing dresses in a scene need "she pulls up dress", apply it to all of them in one action from the batch orchestrator UI.

---

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Prompt Override Templates

**Description:** Save common fragment combinations as reusable override templates. Example: "Female dress outfit" template = `["she pulls up dress", "she is wearing a flowing dress"]`. Apply the template to any character+scene pair.

---

#### Requirement 2.3: **[OPTIONAL — Post-MVP]** AI-Suggested Prompt Fragments

**Description:** Based on character metadata (clothing type, pose, etc.), the system suggests relevant prompt fragments. If `metadata.clothing = "dress"`, suggest "she pulls up dress" automatically.

---

#### Requirement 2.4: **[OPTIONAL — Post-MVP]** Prompt A/B Testing

**Description:** Generate the same scene with different prompt variants and compare results side-by-side. Link test shots (PRD-58) to specific prompt configurations for quality assessment.

---

#### Requirement 2.5: **[OPTIONAL — Post-MVP]** Prompt Weight Syntax

**Description:** Support ComfyUI's prompt weight syntax `(word:1.3)` with visual controls (slider to adjust weight per word/phrase) in the prompt editor.

## 6. Non-Goals (Out of Scope)

- **Visual workflow node editing** — this PRD manages prompts only, not workflow structure. Visual node editing is covered by PRD-33.
- **Automatic prompt generation** — the system does not generate prompt text automatically (AI-suggested fragments are post-MVP).
- **Workflow versioning** — changes to prompt slot labels do not create a new workflow version. Workflow versioning is managed by PRD-75.
- **Prompt translation** — no multi-language prompt support.
- **Negative prompt fragments** — fragments are additive to positive prompts by default. Negative prompt overrides work the same way but are a separate slot.

## 7. Design Considerations

- **Prompt Slots Panel** in the scene type editor follows the existing form pattern from PRD-23 (scene type editor), adding a new tab or section for prompt management.
- **Fragment Dropdown** uses the design system's `Combobox` component with sections (pinned / all) and an inline creation footer.
- **Live Preview** extends the existing PRD-23 prompt preview endpoint to include fragments and multi-slot resolution.
- **Character Detail Scenes Tab** (PRD-112 Req 1.16) gains a prompt override section per scene type, collapsible by default.
- **Read-only lock icon** on non-editable slots uses the design system's `LockClosed` icon.

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Source | Usage |
|-----------|--------|-------|
| Placeholder resolution | `core::scene_type_config::resolve_placeholders()` | Reused for all prompt resolution |
| Prompt preview endpoint | `handlers/scene_type.rs::preview_prompt` | Extended with fragment support |
| Parameter discovery | `core::workflow_import.rs::discover_parameters()` | Enhanced for prompt slot creation |
| Prompt library | `db::models::prompt_library_entry` | Pattern reused for fragment library |
| Prompt versioning | `db::models::prompt_version` | Pattern reused if slot defaults need versioning |
| ComfyUI workflow submission | `comfyui::manager::submit_workflow()` | Used for workflow-managed generation |

### New Infrastructure Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| `resolve_prompts()` | `crates/core/src/prompt_resolution.rs` | Centralized resolution engine |
| Prompt slot CRUD | `crates/db/src/repositories/prompt_slot_repo.rs` | Slot, default, override persistence |
| Fragment library | `crates/db/src/repositories/prompt_fragment_repo.rs` | Fragment CRUD + search + pinning |
| API handlers | `crates/api/src/handlers/prompt_management.rs` | All new endpoints |
| Frontend feature | `apps/frontend/src/features/prompt-management/` | Slots panel, fragment dropdown, override editor |

### Database Changes

4 new tables: `workflow_prompt_slots`, `scene_type_prompt_defaults`, `character_scene_prompt_overrides`, `prompt_fragments`, `prompt_fragment_scene_pins`, `scene_artifacts`

1 altered table: `scene_types` (add `generation_strategy`, `expected_chunks`, `chunk_output_pattern`)

### API Changes

~13 new endpoints under prompt management (see Req 1.9).

Extension to generation dispatch to support workflow-managed strategy.

## 9. Success Metrics

- Creators can configure and submit a `workflow_managed` generation job without opening ComfyUI.
- All prompt slots in a workflow are visible and editable from the platform UI.
- Character+scene prompt overrides reduce per-character ComfyUI editing time to zero.
- The prompt fragment library grows organically as creators add fragments during their workflow.
- Prompt resolution is deterministic — the same inputs always produce the same resolved prompt.

## 10. Open Questions

1. **Fragment separator** — should fragments be joined with `, ` (comma-space), `\n` (newline), or a configurable separator per scene type?
2. **Fragment position** — should fragments always append at the end, or should there be an option to insert at the beginning or at a marked position (e.g., `{fragments}` placeholder in the base prompt)?
3. **Prompt slot versioning** — when an admin changes a scene-type default prompt, should the old value be versioned (like PRD-63 prompt versions), or is overwrite sufficient?
4. **Workflow re-import** — if a workflow is re-imported with different/additional prompt nodes, how should existing slot labels and scene-type defaults be handled? Preserve matching nodes and add new ones?
5. **Multi-workflow scenes** — could a single scene type reference multiple workflows (e.g., one for generation, one for upscaling)? If so, prompt slots would span multiple workflows.

## 11. Version History

- **v1.0** (2026-02-24): Initial PRD creation. Generation strategy selection, prompt node mapping, character+scene overrides with additive fragments, fragment library with scene-type pinning, in-app prompt editing, workflow-managed generation flow.
