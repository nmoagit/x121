# Task List: Scene Type Configuration

**PRD Reference:** `design/prds/023-prd-scene-type-configuration.md`
**Scope:** Define reusable scene types with workflow, model, LoRA, prompt template, duration, variant applicability, and transition configuration, plus batch scene matrix generation for N characters x M scene types x K variants.

## Overview

Scene types are reusable generation "recipes" that get stamped across characters. This feature eliminates per-scene manual configuration by defining scene types with all generation parameters (workflow, LoRA, prompts, duration), supporting prompt templates with character metadata substitution, configuring variant applicability (clothed/topless/both/clothes_off), and generating the full scene matrix for batch submission. Scene types can be scoped to studio-level (shared) or project-level.

### What Already Exists
- PRD-000: Database conventions
- PRD-001: Data model (scene type entity defined)
- PRD-017: Asset registry for workflow/LoRA references
- PRD-021: Source image management (variants as scene seeds)

### What We're Building
1. `scene_types` table with full configuration schema
2. Prompt template resolver with character metadata substitution
3. Scene matrix generator (N characters x M scene types x K variants)
4. Scene type CRUD with validation
5. Configuration UI with prompt template editor
6. Matrix visualization component

### Key Design Decisions
1. **Studio vs. project scope** — Scene types at studio level are shared across projects; project-level types are local. Scope stored as a nullable `project_id` (NULL = studio-level).
2. **Prompt template placeholders** — `{character_name}`, `{hair_color}`, etc. are resolved at generation time from character metadata (PRD-13).
3. **LoRA config as JSONB** — Multiple LoRAs with per-LoRA weights stored as a JSON array, allowing flexible configuration.
4. **Duration as integers** — Target and segment durations in seconds (integer) for simplicity. Tolerance as a separate field.

---

## Phase 1: Database Schema

### Task 1.1: Scene Types Table
**File:** `migrations/YYYYMMDD_create_scene_types.sql`

```sql
CREATE TABLE scene_types (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,  -- NULL = studio-level
    name TEXT NOT NULL,
    description TEXT,
    workflow_id BIGINT REFERENCES workflows(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    lora_config JSONB,  -- [{lora_id, weight, ...}, ...]
    model_config JSONB,  -- {model_name, vae, ...}
    prompt_template TEXT,
    negative_prompt_template TEXT,
    target_duration_secs INTEGER NOT NULL DEFAULT 30,
    segment_duration_secs INTEGER NOT NULL DEFAULT 5,
    duration_tolerance_secs INTEGER NOT NULL DEFAULT 2,
    variant_applicability TEXT NOT NULL DEFAULT 'both',  -- 'clothed', 'topless', 'both', 'clothes_off'
    transition_config JSONB,  -- {boundary_segment: 4, transition_workflow_id: ...}
    generation_params JSONB,  -- {cfg_scale, denoise_strength, steps, seed, ...}
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scene_types_project_id ON scene_types(project_id);
CREATE INDEX idx_scene_types_workflow_id ON scene_types(workflow_id);
CREATE UNIQUE INDEX uq_scene_types_project_name ON scene_types(COALESCE(project_id, 0), name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Scene types support both studio (project_id NULL) and project scope
- [ ] Workflow, LoRA, model configuration stored
- [ ] Prompt templates with positive and negative sections
- [ ] Duration configuration with tolerance
- [ ] Variant applicability and transition config
- [ ] Unique name within scope (project or studio)

---

## Phase 2: Scene Type CRUD Service

### Task 2.1: Scene Type Repository
**File:** `src/repositories/scene_type_repo.rs`

```rust
use crate::types::DbId;

pub async fn create_scene_type(
    pool: &sqlx::PgPool,
    input: &CreateSceneTypeInput,
) -> Result<DbId, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        INSERT INTO scene_types (project_id, name, description, workflow_id, lora_config,
            model_config, prompt_template, negative_prompt_template,
            target_duration_secs, segment_duration_secs, duration_tolerance_secs,
            variant_applicability, transition_config, generation_params)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
        "#,
        // ... parameters
    )
    .fetch_one(pool)
    .await
}

pub async fn list_scene_types(
    pool: &sqlx::PgPool,
    project_id: Option<DbId>,
) -> Result<Vec<SceneType>, sqlx::Error> {
    // Return studio-level types + project-specific types
    // Studio-level available to all projects
    todo!()
}
```

**Acceptance Criteria:**
- [ ] CRUD operations for scene types
- [ ] Listing includes studio-level types for any project
- [ ] Validation: workflow exists, LoRA config is valid JSON
- [ ] Soft-delete via `is_active` flag

### Task 2.2: Scene Type Validation Service
**File:** `src/services/scene_type_validation.rs`

```rust
pub async fn validate_scene_type(
    pool: &sqlx::PgPool,
    input: &CreateSceneTypeInput,
) -> Result<Vec<ValidationWarning>, anyhow::Error> {
    // 1. Validate workflow exists and is compatible
    // 2. Validate LoRA references exist
    // 3. Validate prompt template placeholders are known fields
    // 4. Validate variant_applicability is a valid value
    // 5. Validate duration settings are reasonable
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Workflow compatibility check
- [ ] LoRA existence validation
- [ ] Prompt placeholder validation against known metadata fields
- [ ] Duration range validation (positive integers, segment <= target)
- [ ] Returns warnings (non-blocking) and errors (blocking)

---

## Phase 3: Prompt Template Engine

### Task 3.1: Template Resolver
**File:** `src/services/prompt_template_service.rs`

```rust
use std::collections::HashMap;

pub fn resolve_prompt_template(
    template: &str,
    character_metadata: &HashMap<String, String>,
) -> ResolvedPrompt {
    // Replace {placeholder} tokens with character metadata values
    // Track unresolvable placeholders
    let mut resolved = template.to_string();
    let mut unresolved = Vec::new();

    let placeholder_re = regex::Regex::new(r"\{(\w+)\}").unwrap();
    for cap in placeholder_re.captures_iter(template) {
        let key = &cap[1];
        match character_metadata.get(key) {
            Some(value) => {
                resolved = resolved.replace(&cap[0], value);
            }
            None => {
                unresolved.push(key.to_string());
            }
        }
    }

    ResolvedPrompt { text: resolved, unresolved_placeholders: unresolved }
}
```

**Acceptance Criteria:**
- [ ] Replaces `{character_name}`, `{hair_color}`, etc. with metadata values
- [ ] Returns list of unresolvable placeholders for warnings
- [ ] Handles nested braces gracefully
- [ ] Empty metadata value resolves to empty string (not placeholder)

### Task 3.2: Prompt Preview API
**File:** `src/routes/scene_type_routes.rs`

```rust
/// GET /api/scene-types/:id/preview-prompt/:character_id
pub async fn preview_prompt_handler(
    Path((scene_type_id, character_id)): Path<(DbId, DbId)>,
) -> Result<Json<PromptPreviewResponse>, ApiError> {
    // Load scene type's prompt template
    // Load character's metadata
    // Resolve and return with unresolved warnings
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Shows resolved prompt for a specific character
- [ ] Unresolvable placeholders highlighted in response
- [ ] Both positive and negative prompts resolved

---

## Phase 4: Scene Matrix Generator

### Task 4.1: Matrix Generation Service
**File:** `src/services/scene_matrix_service.rs`

```rust
pub struct MatrixCell {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub variant_type: String,
    pub status: String,
    pub scene_id: Option<DbId>,
}

pub async fn generate_scene_matrix(
    pool: &sqlx::PgPool,
    character_ids: &[DbId],
    scene_type_ids: &[DbId],
) -> Result<Vec<MatrixCell>, anyhow::Error> {
    // For each character x scene_type:
    //   Check variant_applicability to determine which variants apply
    //   Create matrix cells for each applicable combination
    //   Check if scenes already exist (and their status)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Generates N characters x M scene types x K variants matrix
- [ ] Respects variant_applicability (clothed only, topless only, both, clothes_off)
- [ ] Includes existing scene status if scenes already exist
- [ ] Completes in <2 seconds for 20 characters x 10 scene types

### Task 4.2: Matrix API Endpoint
**File:** `src/routes/scene_type_routes.rs`

```rust
/// POST /api/scene-types/matrix
pub async fn generate_matrix_handler(
    Json(body): Json<MatrixRequest>,
) -> Result<Json<MatrixResponse>, ApiError> {
    // body: { character_ids: [...], scene_type_ids: [...] }
    // Returns the full matrix with per-cell status
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Accepts character and scene type ID arrays
- [ ] Returns full matrix with per-cell status
- [ ] Status per cell: not_started, generating, review, approved, failed

---

## Phase 5: API Endpoints

### Task 5.1: Scene Type CRUD Endpoints
**File:** `src/routes/scene_type_routes.rs`

```rust
/// POST /api/scene-types — Create scene type
/// GET /api/scene-types — List scene types (studio + project)
/// GET /api/scene-types/:id — Get scene type details
/// PUT /api/scene-types/:id — Update scene type
/// DELETE /api/scene-types/:id — Soft-delete scene type
```

**Acceptance Criteria:**
- [ ] Full CRUD with validation
- [ ] List includes both studio-level and project-level types
- [ ] Delete is soft (sets `is_active = false`)
- [ ] Update validates all fields

---

## Phase 6: Frontend Components

### Task 6.1: Scene Type Editor Form
**File:** `frontend/src/components/scene-types/SceneTypeEditor.tsx`

```typescript
interface SceneTypeEditorProps {
  sceneType?: SceneType;  // null for create, populated for edit
  onSave: (data: SceneTypeInput) => void;
}

export function SceneTypeEditor({ sceneType, onSave }: SceneTypeEditorProps) {
  // Single scrollable form with sections:
  // - Basic info (name, description, scope)
  // - Workflow assignment (dropdown from PRD-75)
  // - LoRA configuration (multi-select with weight sliders)
  // - Prompt template (editor with placeholder highlighting)
  // - Duration (target, segment, tolerance)
  // - Variant applicability (radio buttons)
  // - Transition config (shown when clothes_off selected)
  // - Generation params (CFG, steps, denoise)
}
```

**Acceptance Criteria:**
- [ ] All configuration in a single scrollable form
- [ ] Workflow selection from available workflows
- [ ] LoRA multi-select with per-LoRA weight sliders
- [ ] Prompt template with placeholder highlighting
- [ ] Duration fields with validation
- [ ] Variant applicability radio buttons
- [ ] Transition config shown conditionally for clothes_off

### Task 6.2: Prompt Template Editor
**File:** `frontend/src/components/scene-types/PromptTemplateEditor.tsx`

```typescript
export function PromptTemplateEditor({ value, onChange, availablePlaceholders }: PromptEditorProps) {
  // Text editor with syntax highlighting for {placeholders}
  // Auto-complete dropdown for available metadata fields
  // Character selector for live preview
  // Unresolvable placeholder warnings
}
```

**Acceptance Criteria:**
- [ ] `{placeholder}` tokens visually highlighted
- [ ] Auto-complete for known metadata field names
- [ ] Live preview with character selection
- [ ] Warnings for unresolvable placeholders

### Task 6.3: Scene Matrix View
**File:** `frontend/src/components/scene-types/SceneMatrixView.tsx`

```typescript
interface SceneMatrixViewProps {
  matrix: MatrixCell[];
  characters: Character[];
  sceneTypes: SceneType[];
}

export function SceneMatrixView({ matrix, characters, sceneTypes }: SceneMatrixViewProps) {
  // Grid: characters as rows, scene types as columns
  // Variant sub-columns under each scene type
  // Color-coded status per cell
  // Click any cell for detail/navigation
  // Selectable cells for batch submission
}
```

**Acceptance Criteria:**
- [ ] Characters as rows, scene types as columns, variant sub-columns
- [ ] Color-coded status: grey (not started), blue (generating), yellow (review), green (approved), red (failed)
- [ ] Click to navigate to scene detail
- [ ] Checkbox selection for batch operations

---

## Phase 7: Testing

### Task 7.1: Scene Type CRUD Tests
**File:** `tests/scene_type_crud_test.rs`

**Acceptance Criteria:**
- [ ] Create scene type with all fields -> success
- [ ] Duplicate name within same scope -> error
- [ ] List returns studio + project types
- [ ] Delete soft-deletes

### Task 7.2: Prompt Template Tests
**File:** `tests/prompt_template_test.rs`

**Acceptance Criteria:**
- [ ] All placeholders resolved -> clean output
- [ ] Missing placeholder -> listed in unresolved
- [ ] Empty metadata -> placeholder replaced with empty string
- [ ] No placeholders in template -> returned as-is

### Task 7.3: Matrix Generation Tests
**File:** `tests/scene_matrix_test.rs`

**Acceptance Criteria:**
- [ ] Clothed-only scene type -> only clothed cells
- [ ] Both -> clothed + topless cells
- [ ] Clothes_off -> single cell with transition config
- [ ] 20x10 matrix generates in <2 seconds

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_scene_types.sql` | Scene types table |
| `src/repositories/scene_type_repo.rs` | Scene type CRUD operations |
| `src/services/scene_type_validation.rs` | Validation service |
| `src/services/prompt_template_service.rs` | Prompt template resolver |
| `src/services/scene_matrix_service.rs` | Matrix generation |
| `src/routes/scene_type_routes.rs` | API endpoints |
| `frontend/src/components/scene-types/SceneTypeEditor.tsx` | Editor form |
| `frontend/src/components/scene-types/PromptTemplateEditor.tsx` | Prompt editor |
| `frontend/src/components/scene-types/SceneMatrixView.tsx` | Matrix view |

## Dependencies

### Existing Components to Reuse
- PRD-001: Data model entities
- PRD-013: Character metadata for prompt substitution
- PRD-017: Asset registry for workflow/LoRA references

### New Infrastructure Needed
- Prompt template parser with regex-based placeholder resolution

## Implementation Order

### MVP
1. Phase 1: Database Schema — Task 1.1
2. Phase 2: CRUD Service — Tasks 2.1-2.2
3. Phase 3: Prompt Template — Tasks 3.1-3.2
4. Phase 5: API Endpoints — Task 5.1
5. Phase 6: Frontend — Tasks 6.1-6.2

**MVP Success Criteria:**
- Scene types created with full configuration
- Prompt templates resolve correctly for any character
- Studio and project scoping works

### Post-MVP Enhancements
1. Phase 4: Matrix Generator — Tasks 4.1-4.2
2. Phase 6: Frontend — Task 6.3 (Matrix view)
3. Phase 7: Testing
4. Scene type cloning

## Notes

1. **Workflow references:** Scene types reference workflows from PRD-075 (ComfyUI Workflow Import & Validation). The workflow_id FK assumes that table exists.
2. **LoRA config format:** `[{"lora_id": 1, "weight": 0.8, "trigger_words": ["keyword"]}, ...]` — flexible JSON allowing any number of LoRAs.
3. **Transition config format:** `{"boundary_segment": 4, "transition_workflow_id": 5}` — which segment switches variant and which workflow handles the transition.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-023 v1.0
