# Task List: Generation Strategy, Workflow & Prompt Management

**PRD Reference:** `design/prds/115-prd-generation-strategy-workflow-prompt-management.md`
**Scope:** Add generation strategy selection per scene type (`platform_orchestrated` vs `workflow_managed`), workflow prompt node mapping with semantic labels, scene-type prompt slot defaults, character+scene prompt overrides with additive fragments, a reusable prompt fragment library with scene-type pinning, in-app prompt editing UI, a centralized prompt resolution engine, and the workflow-managed generation flow.

## Overview

The platform currently assumes a single generation model (recursive segment chaining from PRD-24). This PRD adds support for a second strategy — workflow-managed generation — where ComfyUI handles all chunking, interpolation, and upscaling internally. It also closes a critical gap in prompt management: the inability to add character+scene-specific prompt overrides without manually editing ComfyUI workflows.

The implementation introduces workflow prompt slot mapping (identifying all CLIPTextEncode nodes), a hierarchical prompt resolution engine (workflow default -> scene-type override -> placeholder substitution -> fragment append), and a prompt fragment library for reusable prompt snippets. All prompt configuration moves into the platform UI.

### What Already Exists
- `x121_db::models::workflow` — `Workflow` entity with `json_content`, `discovered_params_json` (PRD-75)
- `x121_db::repositories::workflow_repo` — CRUD for workflows
- `x121_db::models::scene_type` — `SceneType` entity with prompt templates, variant applicability
- `x121_db::repositories::scene_type_repo` — CRUD with project-scoped and studio-level queries
- `x121_db::models::prompt_library_entry` — Prompt library with tags, usage_count, avg_rating (PRD-63)
- `x121_db::models::prompt_version` — Prompt version tracking with scene_type_id (PRD-63)
- `x121_core::prompt_editor` — Placeholder extraction (`extract_placeholders`), validation, diff computation
- `x121_core::workflow_import` — Parameter discovery, CLIPTextEncode detection heuristics
- `x121_api::handlers::prompt_editor` — Version CRUD, library CRUD, diff endpoints
- `x121_api::handlers::scene_type` — Scene type CRUD with prompt preview
- `apps/frontend/src/features/prompt-editor/` — LivePreview, PromptLibraryBrowser, VersionTimeline
- `apps/frontend/src/features/workflow-import/` — ImportWizard, ParameterEditor, ValidationResults
- `apps/frontend/src/features/scene-types/` — Scene type editor components
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete` helpers

### What We're Building
1. Database migration: `generation_strategy`, `expected_chunks`, `chunk_output_pattern` on `scene_types`
2. Database migration: `workflow_prompt_slots` table for prompt node mapping
3. Database migration: `scene_type_prompt_defaults` table for per-slot defaults
4. Database migration: `character_scene_prompt_overrides` table for additive fragments
5. Database migration: `prompt_fragments` and `prompt_fragment_scene_pins` tables
6. Database migration: `scene_artifacts` table for workflow-managed chunk tracking
7. Model structs and repositories for all new tables
8. Centralized `resolve_prompts()` engine in `crates/core`
9. API handlers for prompt slot management, fragment library, overrides, resolution
10. Frontend feature module for prompt management UI (slots panel, fragment dropdown, override editor)
11. Integration tests for all new functionality

### Key Design Decisions
1. **Prompt resolution hierarchy** — workflow default -> scene-type override -> placeholder substitution -> fragment append. Single `resolve_prompts()` function used by both preview API and generation dispatch.
2. **Fragment denormalization** — Fragment text is stored in override JSONB alongside the fragment_id, so deleting a fragment does not break existing overrides.
3. **Additive fragments only** — Fragments are appended to the base prompt, never replace it. Separator is `, ` by default.
4. **Slot-level granularity** — Overrides and defaults are per prompt slot, not per workflow or scene type. This enables precise control over multi-prompt workflows.
5. **Generation strategy on scene_types** — Not on workflows, because the same workflow could theoretically be used with either strategy depending on how the platform orchestrates.

---

## Phase 1: Database Migrations

### Task 1.1: Add generation strategy columns to `scene_types`
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_add_generation_strategy_to_scene_types.sql`

Add generation strategy selection and chunk tracking fields to the existing `scene_types` table.

```sql
-- PRD-115 Req 1.1: Generation strategy selection per scene type
ALTER TABLE scene_types ADD COLUMN generation_strategy TEXT NOT NULL DEFAULT 'platform_orchestrated';
ALTER TABLE scene_types ADD COLUMN expected_chunks INTEGER;
ALTER TABLE scene_types ADD COLUMN chunk_output_pattern TEXT;

-- Constraint: valid strategy values
ALTER TABLE scene_types ADD CONSTRAINT ck_scene_types_generation_strategy
    CHECK (generation_strategy IN ('platform_orchestrated', 'workflow_managed'));
```

**Acceptance Criteria:**
- [ ] `generation_strategy` column added with default `'platform_orchestrated'`
- [ ] CHECK constraint enforces only `'platform_orchestrated'` or `'workflow_managed'`
- [ ] `expected_chunks` nullable integer for workflow-managed chunk count
- [ ] `chunk_output_pattern` nullable text for QA artifact matching
- [ ] Existing scene type rows default to `'platform_orchestrated'` (backward compatible)
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Create `workflow_prompt_slots` table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_workflow_prompt_slots.sql`

Create the table mapping ComfyUI prompt input nodes to semantic labels.

```sql
-- PRD-115 Req 1.2: Workflow prompt node mapping
CREATE TABLE workflow_prompt_slots (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     BIGINT  NOT NULL REFERENCES workflows(id) ON DELETE CASCADE ON UPDATE CASCADE,
    node_id         TEXT    NOT NULL,
    input_name      TEXT    NOT NULL DEFAULT 'text',
    slot_label      TEXT    NOT NULL,
    slot_type       TEXT    NOT NULL DEFAULT 'positive',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    default_text    TEXT,
    is_user_editable BOOLEAN NOT NULL DEFAULT true,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique per workflow+node+input
CREATE UNIQUE INDEX uq_workflow_prompt_slots_workflow_node_input
    ON workflow_prompt_slots (workflow_id, node_id, input_name);

-- FK index
CREATE INDEX idx_workflow_prompt_slots_workflow_id
    ON workflow_prompt_slots (workflow_id);

-- Constraint: valid slot types
ALTER TABLE workflow_prompt_slots ADD CONSTRAINT ck_workflow_prompt_slots_type
    CHECK (slot_type IN ('positive', 'negative'));

-- Updated_at trigger
CREATE TRIGGER trg_workflow_prompt_slots_updated_at
    BEFORE UPDATE ON workflow_prompt_slots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` `TIMESTAMPTZ`
- [ ] FK to `workflows(id)` with `ON DELETE CASCADE`
- [ ] Unique constraint on `(workflow_id, node_id, input_name)` prevents duplicate slot mappings
- [ ] `slot_type` CHECK constraint enforces `'positive'` or `'negative'`
- [ ] `is_user_editable` defaults to `true`
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.3: Create `scene_type_prompt_defaults` table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_scene_type_prompt_defaults.sql`

Store scene-type-level default prompt text per workflow prompt slot.

```sql
-- PRD-115 Req 1.3: Scene-type prompt slot defaults
CREATE TABLE scene_type_prompt_defaults (
    id              BIGSERIAL PRIMARY KEY,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_slot_id  BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_text     TEXT   NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one default per scene-type+slot
CREATE UNIQUE INDEX uq_scene_type_prompt_defaults_scene_type_slot
    ON scene_type_prompt_defaults (scene_type_id, prompt_slot_id);

-- FK indexes
CREATE INDEX idx_scene_type_prompt_defaults_scene_type_id
    ON scene_type_prompt_defaults (scene_type_id);
CREATE INDEX idx_scene_type_prompt_defaults_prompt_slot_id
    ON scene_type_prompt_defaults (prompt_slot_id);

-- Updated_at trigger
CREATE TRIGGER trg_scene_type_prompt_defaults_updated_at
    BEFORE UPDATE ON scene_type_prompt_defaults
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique constraint on `(scene_type_id, prompt_slot_id)` prevents duplicates
- [ ] FK to `scene_types(id)` with CASCADE, FK to `workflow_prompt_slots(id)` with CASCADE
- [ ] `prompt_text` is NOT NULL (if a default is set, it must have content)
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.4: Create `character_scene_prompt_overrides` table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_character_scene_prompt_overrides.sql`

Store per-character, per-scene-type, per-prompt-slot additive fragments.

```sql
-- PRD-115 Req 1.4: Character+scene prompt overrides (additive fragments)
CREATE TABLE character_scene_prompt_overrides (
    id              BIGSERIAL PRIMARY KEY,
    character_id    BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    prompt_slot_id  BIGINT NOT NULL REFERENCES workflow_prompt_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    fragments       JSONB  NOT NULL DEFAULT '[]'::jsonb,
    notes           TEXT,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one override per character+scene_type+slot
CREATE UNIQUE INDEX uq_char_scene_prompt_overrides_char_scene_slot
    ON character_scene_prompt_overrides (character_id, scene_type_id, prompt_slot_id);

-- FK indexes
CREATE INDEX idx_char_scene_prompt_overrides_character_id
    ON character_scene_prompt_overrides (character_id);
CREATE INDEX idx_char_scene_prompt_overrides_scene_type_id
    ON character_scene_prompt_overrides (scene_type_id);
CREATE INDEX idx_char_scene_prompt_overrides_prompt_slot_id
    ON character_scene_prompt_overrides (prompt_slot_id);
CREATE INDEX idx_char_scene_prompt_overrides_created_by
    ON character_scene_prompt_overrides (created_by);

-- GIN index for JSONB fragment queries
CREATE INDEX idx_char_scene_prompt_overrides_fragments
    ON character_scene_prompt_overrides USING GIN (fragments);

-- Updated_at trigger
CREATE TRIGGER trg_char_scene_prompt_overrides_updated_at
    BEFORE UPDATE ON character_scene_prompt_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique constraint on `(character_id, scene_type_id, prompt_slot_id)`
- [ ] FKs to `characters`, `scene_types`, `workflow_prompt_slots` all with CASCADE
- [ ] `created_by` FK to `users(id)` with `ON DELETE SET NULL`
- [ ] `fragments` JSONB defaults to `'[]'` (empty array)
- [ ] GIN index on `fragments` for querying
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.5: Create `prompt_fragments` and `prompt_fragment_scene_pins` tables
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_prompt_fragments.sql`

Global reusable prompt fragment library with scene-type pinning.

```sql
-- PRD-115 Req 1.5: Prompt fragment library
CREATE TABLE prompt_fragments (
    id              BIGSERIAL PRIMARY KEY,
    text            TEXT    NOT NULL,
    description     TEXT,
    category        TEXT,
    tags            JSONB   NOT NULL DEFAULT '[]'::jsonb,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN index for tag-based queries
CREATE INDEX idx_prompt_fragments_tags ON prompt_fragments USING GIN (tags);

-- Full-text search on fragment text
CREATE INDEX idx_prompt_fragments_text ON prompt_fragments USING GIN (to_tsvector('english', text));

-- Category filter
CREATE INDEX idx_prompt_fragments_category ON prompt_fragments (category) WHERE category IS NOT NULL;

-- FK index
CREATE INDEX idx_prompt_fragments_created_by ON prompt_fragments (created_by);

-- Updated_at trigger
CREATE TRIGGER trg_prompt_fragments_updated_at
    BEFORE UPDATE ON prompt_fragments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Scene-type pinning (many-to-many)
CREATE TABLE prompt_fragment_scene_pins (
    fragment_id     BIGINT NOT NULL REFERENCES prompt_fragments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (fragment_id, scene_type_id)
);

-- FK indexes for the join table
CREATE INDEX idx_prompt_fragment_scene_pins_scene_type_id
    ON prompt_fragment_scene_pins (scene_type_id);
```

**Acceptance Criteria:**
- [ ] `prompt_fragments` table with text, description, category, tags, usage_count
- [ ] GIN index on `tags` for JSONB queries
- [ ] Full-text search index on `text` column
- [ ] `prompt_fragment_scene_pins` join table with composite PK
- [ ] Both tables have CASCADE FKs
- [ ] `usage_count` defaults to 0
- [ ] `set_updated_at()` trigger on `prompt_fragments`
- [ ] Migration runs cleanly

### Task 1.6: Create `scene_artifacts` table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_scene_artifacts.sql`

Track intermediate chunk artifacts from workflow-managed generation.

```sql
-- PRD-115 Req 1.8: Scene artifacts for workflow-managed chunk QA
CREATE TABLE scene_artifacts (
    id              BIGSERIAL PRIMARY KEY,
    scene_id        BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    artifact_type   TEXT   NOT NULL,
    sequence_index  INTEGER,
    file_path       TEXT   NOT NULL,
    duration_secs   DOUBLE PRECISION,
    resolution      TEXT,
    metadata        JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK index
CREATE INDEX idx_scene_artifacts_scene_id ON scene_artifacts (scene_id);

-- Constraint: valid artifact types
ALTER TABLE scene_artifacts ADD CONSTRAINT ck_scene_artifacts_type
    CHECK (artifact_type IN ('chunk', 'interpolated', 'upscaled', 'final'));

-- Updated_at trigger
CREATE TRIGGER trg_scene_artifacts_updated_at
    BEFORE UPDATE ON scene_artifacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] FK to `scenes(id)` with CASCADE
- [ ] `artifact_type` CHECK constraint enforces valid values
- [ ] `sequence_index` nullable for non-ordered artifacts
- [ ] `metadata` JSONB defaults to `'{}'`
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

---

## Phase 2: Models & Repositories

### Task 2.1: Update `SceneType` model for generation strategy
**File:** `apps/backend/crates/db/src/models/scene_type.rs`

Add the three new generation strategy fields to the existing `SceneType` struct, `CreateSceneType`, and `UpdateSceneType`.

```rust
// Add to SceneType struct:
pub generation_strategy: String,       // "platform_orchestrated" or "workflow_managed"
pub expected_chunks: Option<i32>,
pub chunk_output_pattern: Option<String>,

// Add to CreateSceneType:
pub generation_strategy: Option<String>,  // Defaults to "platform_orchestrated"
pub expected_chunks: Option<i32>,
pub chunk_output_pattern: Option<String>,

// Add to UpdateSceneType:
pub generation_strategy: Option<String>,
pub expected_chunks: Option<i32>,
pub chunk_output_pattern: Option<String>,
```

**Acceptance Criteria:**
- [ ] `SceneType` entity struct includes `generation_strategy`, `expected_chunks`, `chunk_output_pattern`
- [ ] `CreateSceneType` has optional `generation_strategy` (defaults to `"platform_orchestrated"` in repo)
- [ ] `UpdateSceneType` has all three as optional
- [ ] `SceneTypeRepo` `COLUMNS` const updated with new columns
- [ ] `SceneTypeRepo::create` and `SceneTypeRepo::update` bind the new fields
- [ ] All existing scene type tests still compile and pass

### Task 2.2: Create `WorkflowPromptSlot` model
**File:** `apps/backend/crates/db/src/models/workflow_prompt_slot.rs`

Follow the three-struct pattern (entity/create/update).

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `workflow_prompt_slots` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkflowPromptSlot {
    pub id: DbId,
    pub workflow_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub slot_type: String,           // "positive" or "negative"
    pub sort_order: i32,
    pub default_text: Option<String>,
    pub is_user_editable: bool,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new workflow prompt slot.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkflowPromptSlot {
    pub workflow_id: DbId,
    pub node_id: String,
    pub input_name: Option<String>,   // Defaults to "text"
    pub slot_label: String,
    pub slot_type: Option<String>,    // Defaults to "positive"
    pub sort_order: Option<i32>,
    pub default_text: Option<String>,
    pub is_user_editable: Option<bool>,
    pub description: Option<String>,
}

/// DTO for updating a workflow prompt slot. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWorkflowPromptSlot {
    pub slot_label: Option<String>,
    pub slot_type: Option<String>,
    pub sort_order: Option<i32>,
    pub default_text: Option<String>,
    pub is_user_editable: Option<bool>,
    pub description: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTO derives `Debug, Clone, Deserialize`
- [ ] Update DTO derives `Debug, Clone, Deserialize` with all fields optional
- [ ] Uses `DbId` and `Timestamp` from `x121_core::types`
- [ ] Module registered in `models/mod.rs`

### Task 2.3: Create `SceneTypePromptDefault` model
**File:** `apps/backend/crates/db/src/models/scene_type_prompt_default.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_type_prompt_defaults` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypePromptDefault {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub prompt_text: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting a scene-type prompt default.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertSceneTypePromptDefault {
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub prompt_text: String,
}
```

**Acceptance Criteria:**
- [ ] Entity struct with all columns
- [ ] Upsert DTO for create-or-update semantics (unique constraint on scene_type_id + prompt_slot_id)
- [ ] Module registered in `models/mod.rs`

### Task 2.4: Create `CharacterScenePromptOverride` model
**File:** `apps/backend/crates/db/src/models/character_scene_prompt_override.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_scene_prompt_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterScenePromptOverride {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,   // JSONB array of fragment entries
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting character+scene prompt overrides.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertCharacterSceneOverride {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
}
```

**Acceptance Criteria:**
- [ ] Entity struct includes `fragments` as `serde_json::Value` (JSONB)
- [ ] Upsert DTO for create-or-update semantics
- [ ] Module registered in `models/mod.rs`

### Task 2.5: Create `PromptFragment` model
**File:** `apps/backend/crates/db/src/models/prompt_fragment.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `prompt_fragments` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PromptFragment {
    pub id: DbId,
    pub text: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: serde_json::Value,       // JSONB array of strings
    pub usage_count: i32,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new prompt fragment.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePromptFragment {
    pub text: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<serde_json::Value>,
    pub created_by: Option<DbId>,
}

/// DTO for updating a prompt fragment.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePromptFragment {
    pub text: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] `tags` is `serde_json::Value` matching JSONB array
- [ ] `usage_count` is `i32` (matches SQL INTEGER)
- [ ] Create DTO has optional `tags` (defaults to `'[]'` in repo)
- [ ] Module registered in `models/mod.rs`

### Task 2.6: Create `SceneArtifact` model
**File:** `apps/backend/crates/db/src/models/scene_artifact.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_artifacts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneArtifact {
    pub id: DbId,
    pub scene_id: DbId,
    pub artifact_type: String,         // "chunk", "interpolated", "upscaled", "final"
    pub sequence_index: Option<i32>,
    pub file_path: String,
    pub duration_secs: Option<f64>,
    pub resolution: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a scene artifact.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneArtifact {
    pub scene_id: DbId,
    pub artifact_type: String,
    pub sequence_index: Option<i32>,
    pub file_path: String,
    pub duration_secs: Option<f64>,
    pub resolution: Option<String>,
    pub metadata: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] `duration_secs` is `Option<f64>` matching SQL `DOUBLE PRECISION`
- [ ] `metadata` is `serde_json::Value` matching JSONB
- [ ] Module registered in `models/mod.rs`

### Task 2.7: Create `WorkflowPromptSlotRepo`
**File:** `apps/backend/crates/db/src/repositories/workflow_prompt_slot_repo.rs`

Zero-sized struct with `COLUMNS` const following existing repository patterns.

```rust
pub struct WorkflowPromptSlotRepo;

impl WorkflowPromptSlotRepo {
    pub async fn create(pool: &PgPool, input: &CreateWorkflowPromptSlot) -> Result<WorkflowPromptSlot, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<WorkflowPromptSlot>, sqlx::Error>;
    pub async fn list_by_workflow(pool: &PgPool, workflow_id: DbId) -> Result<Vec<WorkflowPromptSlot>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateWorkflowPromptSlot) -> Result<Option<WorkflowPromptSlot>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn bulk_create(pool: &PgPool, slots: &[CreateWorkflowPromptSlot]) -> Result<Vec<WorkflowPromptSlot>, sqlx::Error>;
    pub async fn delete_by_workflow(pool: &PgPool, workflow_id: DbId) -> Result<u64, sqlx::Error>;
}
```

Key details:
- `list_by_workflow`: `ORDER BY sort_order ASC, id ASC`
- `bulk_create`: used during workflow import to create all slots at once
- `delete_by_workflow`: used during workflow re-import to clear old slots before re-creating

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all table columns
- [ ] `list_by_workflow` returns slots ordered by `sort_order`, then `id`
- [ ] `bulk_create` inserts multiple slots efficiently
- [ ] `delete_by_workflow` removes all slots for a workflow (for re-import)
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 2.8: Create `SceneTypePromptDefaultRepo`
**File:** `apps/backend/crates/db/src/repositories/scene_type_prompt_default_repo.rs`

```rust
pub struct SceneTypePromptDefaultRepo;

impl SceneTypePromptDefaultRepo {
    pub async fn upsert(pool: &PgPool, input: &UpsertSceneTypePromptDefault) -> Result<SceneTypePromptDefault, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SceneTypePromptDefault>, sqlx::Error>;
    pub async fn list_by_scene_type(pool: &PgPool, scene_type_id: DbId) -> Result<Vec<SceneTypePromptDefault>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn delete_by_scene_type(pool: &PgPool, scene_type_id: DbId) -> Result<u64, sqlx::Error>;
}
```

Key details:
- `upsert` uses `INSERT ... ON CONFLICT (scene_type_id, prompt_slot_id) DO UPDATE SET prompt_text = EXCLUDED.prompt_text`

**Acceptance Criteria:**
- [ ] `upsert` performs INSERT or UPDATE based on unique constraint
- [ ] `list_by_scene_type` returns all defaults for a scene type
- [ ] Module registered in `repositories/mod.rs`

### Task 2.9: Create `CharacterScenePromptOverrideRepo`
**File:** `apps/backend/crates/db/src/repositories/character_scene_prompt_override_repo.rs`

```rust
pub struct CharacterScenePromptOverrideRepo;

impl CharacterScenePromptOverrideRepo {
    pub async fn upsert(pool: &PgPool, input: &UpsertCharacterSceneOverride) -> Result<CharacterScenePromptOverride, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CharacterScenePromptOverride>, sqlx::Error>;
    pub async fn list_by_character_and_scene_type(pool: &PgPool, character_id: DbId, scene_type_id: DbId) -> Result<Vec<CharacterScenePromptOverride>, sqlx::Error>;
    pub async fn list_by_character(pool: &PgPool, character_id: DbId) -> Result<Vec<CharacterScenePromptOverride>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key details:
- `upsert` uses `INSERT ... ON CONFLICT (character_id, scene_type_id, prompt_slot_id) DO UPDATE SET fragments = EXCLUDED.fragments, notes = EXCLUDED.notes`
- `list_by_character_and_scene_type` returns all overrides for a character+scene_type pair (across all prompt slots)

**Acceptance Criteria:**
- [ ] `upsert` performs INSERT or UPDATE on unique constraint
- [ ] `list_by_character_and_scene_type` returns overrides across all slots for the pair
- [ ] Module registered in `repositories/mod.rs`

### Task 2.10: Create `PromptFragmentRepo`
**File:** `apps/backend/crates/db/src/repositories/prompt_fragment_repo.rs`

```rust
pub struct PromptFragmentRepo;

impl PromptFragmentRepo {
    pub async fn create(pool: &PgPool, input: &CreatePromptFragment) -> Result<PromptFragment, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<PromptFragment>, sqlx::Error>;
    pub async fn list(pool: &PgPool, search: Option<&str>, category: Option<&str>, limit: i64, offset: i64) -> Result<Vec<PromptFragment>, sqlx::Error>;
    pub async fn list_pinned(pool: &PgPool, scene_type_id: DbId) -> Result<Vec<PromptFragment>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdatePromptFragment) -> Result<Option<PromptFragment>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn increment_usage(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn pin_to_scene_type(pool: &PgPool, fragment_id: DbId, scene_type_id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn unpin_from_scene_type(pool: &PgPool, fragment_id: DbId, scene_type_id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn count(pool: &PgPool, search: Option<&str>, category: Option<&str>) -> Result<i64, sqlx::Error>;
}
```

Key details:
- `list` supports text search via `to_tsvector('english', text) @@ plainto_tsquery('english', $search)`, category filter, ordered by `usage_count DESC`
- `list_pinned` joins through `prompt_fragment_scene_pins` for a specific scene type, ordered by `usage_count DESC`
- `increment_usage` does `UPDATE prompt_fragments SET usage_count = usage_count + 1 WHERE id = $1`
- `pin_to_scene_type` inserts into `prompt_fragment_scene_pins`, ignoring on conflict
- `unpin_from_scene_type` deletes from `prompt_fragment_scene_pins`

**Acceptance Criteria:**
- [ ] `list` supports full-text search on fragment text
- [ ] `list` supports category filtering
- [ ] `list_pinned` returns fragments pinned to a specific scene type
- [ ] `increment_usage` atomically increments the counter
- [ ] `pin_to_scene_type` uses `INSERT ... ON CONFLICT DO NOTHING`
- [ ] `unpin_from_scene_type` deletes the pin row
- [ ] Module registered in `repositories/mod.rs`

### Task 2.11: Create `SceneArtifactRepo`
**File:** `apps/backend/crates/db/src/repositories/scene_artifact_repo.rs`

```rust
pub struct SceneArtifactRepo;

impl SceneArtifactRepo {
    pub async fn create(pool: &PgPool, input: &CreateSceneArtifact) -> Result<SceneArtifact, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SceneArtifact>, sqlx::Error>;
    pub async fn list_by_scene(pool: &PgPool, scene_id: DbId) -> Result<Vec<SceneArtifact>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn delete_by_scene(pool: &PgPool, scene_id: DbId) -> Result<u64, sqlx::Error>;
}
```

Key details:
- `list_by_scene` ordered by `sequence_index ASC NULLS LAST, created_at ASC`

**Acceptance Criteria:**
- [ ] `list_by_scene` returns artifacts ordered by sequence index
- [ ] `delete_by_scene` removes all artifacts for a scene (for re-generation cleanup)
- [ ] Module registered in `repositories/mod.rs`

---

## Phase 3: Prompt Resolution Engine

### Task 3.1: Create centralized `resolve_prompts()` function
**File:** `apps/backend/crates/core/src/prompt_resolution.rs`

This is the single source of truth for prompt resolution, used by both the preview API and the generation dispatch.

```rust
use std::collections::HashMap;
use serde::Serialize;
use crate::types::DbId;

/// Describes where the final prompt text originated.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum PromptSource {
    WorkflowDefault,
    SceneTypeDefault,
    WithFragments,
}

/// A single fragment that was applied to a prompt.
#[derive(Debug, Clone, Serialize)]
pub struct FragmentInfo {
    pub fragment_id: Option<DbId>,    // None for inline fragments
    pub text: String,
}

/// Input slot data for resolution.
#[derive(Debug, Clone)]
pub struct PromptSlotInput {
    pub slot_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub slot_type: String,
    pub default_text: Option<String>,
    pub is_user_editable: bool,
}

/// A fragment entry from the JSONB array.
#[derive(Debug, Clone, Deserialize)]
pub struct FragmentEntry {
    pub r#type: String,               // "fragment_ref" or "inline"
    pub fragment_id: Option<DbId>,
    pub text: String,
}

/// The resolved prompt for a single slot.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedPromptSlot {
    pub slot_id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub slot_type: String,
    pub resolved_text: String,
    pub source: PromptSource,
    pub unresolved_placeholders: Vec<String>,
    pub applied_fragments: Vec<FragmentInfo>,
}

/// Resolve all prompt slots for a given workflow/scene-type/character combination.
///
/// Resolution order:
/// 1. Pick base text: scene-type default if set, else workflow default
/// 2. Substitute `{placeholder}` tokens from character metadata
/// 3. Append character+scene fragment overrides (joined with separator)
/// 4. Report any unresolved placeholders
pub fn resolve_prompts(
    slots: &[PromptSlotInput],
    scene_type_defaults: &HashMap<DbId, String>,
    character_metadata: &HashMap<String, String>,
    fragment_overrides: &HashMap<DbId, Vec<FragmentEntry>>,
    separator: &str,
) -> Vec<ResolvedPromptSlot>;

/// Substitute `{key}` placeholders in text with values from metadata.
///
/// Reuses the `PLACEHOLDER_RE` pattern from `prompt_editor`.
pub fn resolve_placeholders(text: &str, metadata: &HashMap<String, String>) -> String;

/// Find any `{key}` placeholders in text that have no matching metadata key.
pub fn find_unresolved_placeholders(text: &str, metadata: &HashMap<String, String>) -> Vec<String>;
```

**Acceptance Criteria:**
- [ ] `resolve_prompts()` in `crates/core/src/prompt_resolution.rs`
- [ ] Reuses `PLACEHOLDER_RE` from `prompt_editor` (or shared pattern)
- [ ] Resolution order: workflow default -> scene-type override -> placeholder substitution -> fragment append
- [ ] Fragments joined with configurable `separator` (default `, `)
- [ ] `source` field indicates which level provided the text
- [ ] `applied_fragments` lists all fragments used
- [ ] Fragment text also undergoes placeholder substitution
- [ ] `find_unresolved_placeholders` reports missing keys
- [ ] Unit tests covering all resolution paths:
  - Workflow default only
  - Scene-type override
  - With fragments appended
  - Placeholder substitution
  - Unresolved placeholder detection
  - Empty fragments list
  - Fragment text with placeholders

### Task 3.2: Register `prompt_resolution` module in `core/lib.rs`
**File:** `apps/backend/crates/core/src/lib.rs`

Add `pub mod prompt_resolution;` to the core library exports.

**Acceptance Criteria:**
- [ ] Module exported from `crates/core/src/lib.rs`
- [ ] All public types accessible as `x121_core::prompt_resolution::*`
- [ ] Code compiles with `cargo check -p x121_core`

---

## Phase 4: API Handlers

### Task 4.1: Create prompt management handler module
**File:** `apps/backend/crates/api/src/handlers/prompt_management.rs`

Implement handlers for all PRD-115 Req 1.9 endpoints.

```rust
// --- Workflow Prompt Slots ---

/// GET /api/v1/workflows/{workflow_id}/prompt-slots
pub async fn list_prompt_slots(
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
) -> AppResult<Json<Vec<WorkflowPromptSlot>>>;

/// PUT /api/v1/workflows/{workflow_id}/prompt-slots/{slot_id}
pub async fn update_prompt_slot(
    State(state): State<AppState>,
    Path((workflow_id, slot_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateWorkflowPromptSlot>,
) -> AppResult<Json<WorkflowPromptSlot>>;

// --- Scene-Type Prompt Defaults ---

/// GET /api/v1/scene-types/{scene_type_id}/prompt-defaults
pub async fn list_prompt_defaults(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
) -> AppResult<Json<Vec<SceneTypePromptDefault>>>;

/// PUT /api/v1/scene-types/{scene_type_id}/prompt-defaults/{slot_id}
pub async fn upsert_prompt_default(
    State(state): State<AppState>,
    Path((scene_type_id, slot_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpsertPromptDefaultRequest>,
) -> AppResult<Json<SceneTypePromptDefault>>;

// --- Character+Scene Prompt Overrides ---

/// GET /api/v1/characters/{character_id}/scenes/{scene_type_id}/prompt-overrides
pub async fn get_character_scene_overrides(
    State(state): State<AppState>,
    Path((character_id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<Vec<CharacterScenePromptOverride>>>;

/// PUT /api/v1/characters/{character_id}/scenes/{scene_type_id}/prompt-overrides
pub async fn upsert_character_scene_overrides(
    State(state): State<AppState>,
    Path((character_id, scene_type_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpsertOverrideRequest>,
    auth: AuthUser,
) -> AppResult<Json<Vec<CharacterScenePromptOverride>>>;

// --- Prompt Resolution (Preview) ---

/// POST /api/v1/prompts/resolve
pub async fn resolve_prompt_preview(
    State(state): State<AppState>,
    Json(input): Json<ResolvePromptRequest>,
) -> AppResult<Json<Vec<ResolvedPromptSlot>>>;

// --- Prompt Fragments ---

/// GET /api/v1/prompt-fragments?search=&category=&scene_type_id=
pub async fn list_fragments(
    State(state): State<AppState>,
    Query(params): Query<FragmentListParams>,
) -> AppResult<Json<DataResponse<Vec<PromptFragment>>>>;

/// POST /api/v1/prompt-fragments
pub async fn create_fragment(
    State(state): State<AppState>,
    Json(input): Json<CreatePromptFragment>,
    auth: AuthUser,
) -> AppResult<(StatusCode, Json<PromptFragment>)>;

/// PUT /api/v1/prompt-fragments/{id}
pub async fn update_fragment(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePromptFragment>,
) -> AppResult<Json<PromptFragment>>;

/// DELETE /api/v1/prompt-fragments/{id}
pub async fn delete_fragment(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode>;

/// POST /api/v1/prompt-fragments/{id}/pin/{scene_type_id}
pub async fn pin_fragment(
    State(state): State<AppState>,
    Path((id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode>;

/// DELETE /api/v1/prompt-fragments/{id}/pin/{scene_type_id}
pub async fn unpin_fragment(
    State(state): State<AppState>,
    Path((id, scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode>;
```

Request/response types defined in the same file:

```rust
#[derive(Debug, Deserialize)]
pub struct UpsertPromptDefaultRequest {
    pub prompt_text: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertOverrideRequest {
    pub overrides: Vec<SlotOverride>,
}

#[derive(Debug, Deserialize)]
pub struct SlotOverride {
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResolvePromptRequest {
    pub scene_type_id: DbId,
    pub character_id: DbId,
    pub slot_id: Option<DbId>,          // If None, resolve all slots
}

#[derive(Debug, Deserialize)]
pub struct FragmentListParams {
    pub search: Option<String>,
    pub category: Option<String>,
    pub scene_type_id: Option<DbId>,    // If set, pinned fragments shown first
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
```

**Acceptance Criteria:**
- [ ] All 13 endpoints from PRD-115 Req 1.9 implemented
- [ ] `list_prompt_slots` returns slots ordered by `sort_order`
- [ ] `update_prompt_slot` validates slot belongs to the specified workflow
- [ ] `upsert_prompt_default` uses repo upsert for create-or-update
- [ ] `get_character_scene_overrides` returns overrides across all slots
- [ ] `upsert_character_scene_overrides` increments `usage_count` on fragment refs
- [ ] `resolve_prompt_preview` calls `core::prompt_resolution::resolve_prompts()`
- [ ] `list_fragments` supports search, category, and scene_type_id pinned-first ordering
- [ ] `create_fragment` returns 201 status
- [ ] `pin_fragment` returns 200 on success, idempotent
- [ ] `unpin_fragment` returns 204 on success
- [ ] Handler module registered in `handlers/mod.rs`
- [ ] All endpoints follow standard `{ data }` / `{ error }` envelope

### Task 4.2: Create prompt management routes
**File:** `apps/backend/crates/api/src/lib.rs` (modify existing route tree)

Register all new routes in the API router:

```rust
// Workflow prompt slots (nested under workflows)
.route("/workflows/{workflow_id}/prompt-slots", get(prompt_management::list_prompt_slots))
.route("/workflows/{workflow_id}/prompt-slots/{slot_id}", put(prompt_management::update_prompt_slot))

// Scene-type prompt defaults (nested under scene-types)
.route("/scene-types/{id}/prompt-defaults", get(prompt_management::list_prompt_defaults))
.route("/scene-types/{id}/prompt-defaults/{slot_id}", put(prompt_management::upsert_prompt_default))

// Character+scene prompt overrides (nested under characters)
.route("/characters/{id}/scenes/{scene_type_id}/prompt-overrides",
    get(prompt_management::get_character_scene_overrides)
    .put(prompt_management::upsert_character_scene_overrides))

// Prompt resolution
.route("/prompts/resolve", post(prompt_management::resolve_prompt_preview))

// Prompt fragments (top-level)
.route("/prompt-fragments", get(prompt_management::list_fragments).post(prompt_management::create_fragment))
.route("/prompt-fragments/{id}", put(prompt_management::update_fragment).delete(prompt_management::delete_fragment))
.route("/prompt-fragments/{id}/pin/{scene_type_id}",
    post(prompt_management::pin_fragment).delete(prompt_management::unpin_fragment))
```

**Acceptance Criteria:**
- [ ] All routes registered under the `/api/v1/` prefix
- [ ] Route paths match PRD-115 Req 1.9 endpoint table exactly
- [ ] Routes import handler functions from `prompt_management` module
- [ ] Route tree documentation comment updated

### Task 4.3: Update scene type handler for generation strategy
**File:** `apps/backend/crates/api/src/handlers/scene_type.rs`

Ensure create/update handlers accept and pass through the new `generation_strategy`, `expected_chunks`, and `chunk_output_pattern` fields. No handler logic changes needed — the fields flow through the existing DTO pattern.

**Acceptance Criteria:**
- [ ] Scene type create/update endpoints accept `generation_strategy` field
- [ ] Scene type GET responses include the new fields
- [ ] Validation: `generation_strategy` must be `"platform_orchestrated"` or `"workflow_managed"` (enforced by DB constraint, but handler can also validate for better error messages)
- [ ] Existing scene type handler tests still pass

### Task 4.4: Enhance workflow import handler for prompt slot auto-creation
**File:** `apps/backend/crates/api/src/handlers/workflow_import.rs` or `apps/backend/crates/api/src/handlers/generation.rs` (wherever workflow import lives)

After a workflow is imported (PRD-75), auto-detect CLIPTextEncode nodes and create `workflow_prompt_slots` rows.

```rust
// During workflow import:
// 1. Parse workflow JSON -> find all CLIPTextEncode nodes
// 2. For each node:
//    a. Extract current text value -> default_text
//    b. Apply heuristic: node title/name contains "neg" -> slot_type = 'negative'
//    c. Generate auto-label: "Positive Prompt 1", "Negative Prompt 1", etc.
//    d. Create workflow_prompt_slots row via bulk_create
```

This builds on the existing `discover_parameters()` function in `core::workflow_import`.

**Acceptance Criteria:**
- [ ] Workflow import auto-creates `workflow_prompt_slots` for all CLIPTextEncode nodes
- [ ] Auto-labels generated as "Positive Prompt N" / "Negative Prompt N"
- [ ] `default_text` extracted from workflow JSON node inputs
- [ ] `slot_type` set via heuristic (node name contains "neg" -> "negative", else "positive")
- [ ] If workflow is re-imported, existing slot labels are preserved (match by `node_id`)
- [ ] Re-import adds new slots and removes orphaned slots

---

## Phase 5: Frontend Feature Module

### Task 5.1: Create prompt management feature module structure
**Files:**
- `apps/frontend/src/features/prompt-management/index.ts`
- `apps/frontend/src/features/prompt-management/types.ts`
- `apps/frontend/src/features/prompt-management/hooks/`

Create the feature module directory structure with TypeScript types matching the backend models.

```typescript
// types.ts
export interface WorkflowPromptSlot {
  id: number;
  workflow_id: number;
  node_id: string;
  input_name: string;
  slot_label: string;
  slot_type: 'positive' | 'negative';
  sort_order: number;
  default_text: string | null;
  is_user_editable: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SceneTypePromptDefault {
  id: number;
  scene_type_id: number;
  prompt_slot_id: number;
  prompt_text: string;
  created_at: string;
  updated_at: string;
}

export interface CharacterScenePromptOverride {
  id: number;
  character_id: number;
  scene_type_id: number;
  prompt_slot_id: number;
  fragments: FragmentEntry[];
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface FragmentEntry {
  type: 'fragment_ref' | 'inline';
  fragment_id?: number;
  text: string;
}

export interface PromptFragment {
  id: number;
  text: string;
  description: string | null;
  category: string | null;
  tags: string[];
  usage_count: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResolvedPromptSlot {
  slot_id: number;
  node_id: string;
  input_name: string;
  slot_label: string;
  slot_type: 'positive' | 'negative';
  resolved_text: string;
  source: 'WorkflowDefault' | 'SceneTypeDefault' | 'WithFragments';
  unresolved_placeholders: string[];
  applied_fragments: { fragment_id: number | null; text: string }[];
}
```

**Acceptance Criteria:**
- [ ] All TypeScript interfaces match backend model fields
- [ ] Types exported from `index.ts`
- [ ] `FragmentEntry` discriminated union for `fragment_ref` and `inline`
- [ ] Module follows existing feature module patterns

### Task 5.2: Create TanStack Query hooks for prompt management
**Files:**
- `apps/frontend/src/features/prompt-management/hooks/useWorkflowPromptSlots.ts`
- `apps/frontend/src/features/prompt-management/hooks/useSceneTypePromptDefaults.ts`
- `apps/frontend/src/features/prompt-management/hooks/useCharacterSceneOverrides.ts`
- `apps/frontend/src/features/prompt-management/hooks/usePromptFragments.ts`
- `apps/frontend/src/features/prompt-management/hooks/usePromptPreview.ts`
- `apps/frontend/src/features/prompt-management/hooks/useCreateFragment.ts`

```typescript
// useWorkflowPromptSlots.ts
export function useWorkflowPromptSlots(workflowId: number) {
  return useQuery({
    queryKey: ['workflow-prompt-slots', { workflowId }],
    queryFn: () => api.get(`/workflows/${workflowId}/prompt-slots`),
  });
}

// usePromptFragments.ts
export function usePromptFragments(params: { sceneTypeId?: number; search?: string; category?: string }) {
  return useQuery({
    queryKey: ['prompt-fragments', params],
    queryFn: () => api.get('/prompt-fragments', { params }),
  });
}

// usePromptPreview.ts
export function usePromptPreview(sceneTypeId: number, characterId: number, slotId?: number) {
  return useQuery({
    queryKey: ['prompt-preview', { sceneTypeId, characterId, slotId }],
    queryFn: () => api.post('/prompts/resolve', { scene_type_id: sceneTypeId, character_id: characterId, slot_id: slotId }),
  });
}

// useCreateFragment.ts
export function useCreateFragment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePromptFragmentInput) => api.post('/prompt-fragments', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-fragments'] });
    },
  });
}
```

**Acceptance Criteria:**
- [ ] Each hook follows TanStack Query patterns from existing hooks in the project
- [ ] Query keys are descriptive and follow `[resource, filters]` convention
- [ ] Mutations invalidate relevant queries on success
- [ ] All hooks use the shared `api` client (never raw `fetch`)
- [ ] Hooks exported from feature module `index.ts`

### Task 5.3: Create Prompt Slots Panel component
**File:** `apps/frontend/src/features/prompt-management/PromptSlotsPanel.tsx`

Displays all prompt slots for a workflow in the scene type editor. Each slot is an editable textarea showing the scene-type default (or workflow default as placeholder). Supports live preview with character metadata substitution.

**Acceptance Criteria:**
- [ ] Shows all workflow prompt slots with labels and types
- [ ] Each slot is an editable `<textarea>` (or uses existing text input component from design system)
- [ ] Syntax highlighting for `{placeholder}` tokens (bold/colored spans)
- [ ] Character selector dropdown for live preview resolution
- [ ] Live preview shows resolved text below each slot
- [ ] Non-editable slots (`is_user_editable === false`) rendered as read-only with lock icon
- [ ] Unsaved changes indicator
- [ ] Save button calls `upsert_prompt_default` for each changed slot

### Task 5.4: Create Fragment Dropdown component
**File:** `apps/frontend/src/features/prompt-management/FragmentDropdown.tsx`

Searchable dropdown for selecting prompt fragments when editing character+scene overrides. Shows pinned fragments first, then all fragments sorted by usage.

**Acceptance Criteria:**
- [ ] Two sections: "Pinned for {scene_type}" and "All Fragments"
- [ ] Searchable by text, category, and tags
- [ ] Each fragment shows text, category badge, and usage count
- [ ] "+ Add new fragment" footer for inline creation
- [ ] Inline creation form: text input + optional category/tags
- [ ] On selection, fragment added to the override's fragment list
- [ ] Uses existing `Combobox` or `Select` from design system

### Task 5.5: Create Character Scene Override Editor component
**File:** `apps/frontend/src/features/prompt-management/CharacterSceneOverrideEditor.tsx`

Displays and edits character+scene prompt overrides for a specific character + scene type pair. Shows base prompt per slot, fragment additions, and live resolved preview.

**Acceptance Criteria:**
- [ ] Groups overrides by prompt slot (one section per slot)
- [ ] Shows base prompt text (from scene-type default or workflow default) as read-only
- [ ] Fragment list with drag-and-drop reordering
- [ ] Remove button (x) on each fragment
- [ ] Fragment dropdown for adding new fragments
- [ ] Full resolved prompt preview (base + fragments + placeholders) with copy-to-clipboard
- [ ] Save button commits all overrides to backend
- [ ] Notes field per override for creator annotations
- [ ] Loading and error states handled with `isPending` / `isError`

### Task 5.6: Create Generation Strategy Selector component
**File:** `apps/frontend/src/features/prompt-management/GenerationStrategySelector.tsx`

Dropdown selector in the scene type editor for choosing between `platform_orchestrated` and `workflow_managed`.

**Acceptance Criteria:**
- [ ] Dropdown with two options: "Platform Orchestrated (PRD-24)" and "Workflow Managed (SVD/SVI)"
- [ ] Selecting `workflow_managed` shows optional fields: expected chunks, chunk output pattern
- [ ] Selection persisted via scene type update API
- [ ] Help text explaining each strategy
- [ ] Uses existing `Select` component from design system

---

## Phase 6: Integration Tests

### Task 6.1: DB-level workflow prompt slot tests
**File:** `apps/backend/crates/db/tests/workflow_prompt_slot.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_prompt_slot(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_by_workflow_ordered(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_slot_label(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_unique_constraint_workflow_node_input(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_bulk_create(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_by_workflow(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Slot creation returns correct fields
- [ ] `list_by_workflow` returns slots ordered by `sort_order`
- [ ] Update changes label, preserves other fields
- [ ] Duplicate `(workflow_id, node_id, input_name)` violates unique constraint
- [ ] `bulk_create` inserts multiple slots in one call
- [ ] `delete_by_workflow` removes all slots for a workflow
- [ ] All tests pass

### Task 6.2: DB-level prompt fragment tests
**File:** `apps/backend/crates/db/tests/prompt_fragment.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_fragment(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_search_fragments(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_pinned(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_increment_usage(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pin_unpin(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pin_idempotent(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Fragment creation returns correct fields with `usage_count = 0`
- [ ] Text search finds fragments by content
- [ ] `list_pinned` returns only fragments pinned to the specified scene type
- [ ] `increment_usage` increases count by 1 each call
- [ ] Pin/unpin roundtrip works correctly
- [ ] Pinning an already-pinned fragment does not error (idempotent)
- [ ] All tests pass

### Task 6.3: Core prompt resolution tests
**File:** `apps/backend/crates/core/src/prompt_resolution.rs` (inline `#[cfg(test)]` module)

```rust
#[cfg(test)]
mod tests {
    #[test] fn test_resolve_workflow_default_only();
    #[test] fn test_resolve_scene_type_override();
    #[test] fn test_resolve_with_fragments();
    #[test] fn test_placeholder_substitution();
    #[test] fn test_unresolved_placeholders_detected();
    #[test] fn test_fragment_text_placeholder_substitution();
    #[test] fn test_empty_fragments_no_trailing_separator();
    #[test] fn test_custom_separator();
}
```

**Acceptance Criteria:**
- [ ] Workflow default used when no scene-type override exists
- [ ] Scene-type override replaces workflow default
- [ ] Fragments appended with `, ` separator
- [ ] `{placeholder}` tokens substituted from metadata
- [ ] Unresolved placeholders reported correctly
- [ ] Fragment text also undergoes placeholder substitution
- [ ] No trailing separator when fragments list is empty
- [ ] Custom separator respected
- [ ] All tests pass

### Task 6.4: API-level prompt management endpoint tests
**File:** `apps/backend/crates/api/tests/prompt_management_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_prompt_slots(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_prompt_slot(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_upsert_prompt_default(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_character_scene_overrides(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_upsert_character_scene_overrides(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_resolve_prompt_preview(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_fragments(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_fragment(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pin_unpin_fragment(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_fragment(pool: PgPool);
```

Each test uses `common::build_test_app` and the shared HTTP helpers.

**Acceptance Criteria:**
- [ ] `GET /workflows/{id}/prompt-slots` returns list of slots
- [ ] `PUT /workflows/{id}/prompt-slots/{slot_id}` updates slot label
- [ ] `PUT /scene-types/{id}/prompt-defaults/{slot_id}` creates/updates default
- [ ] `GET /characters/{id}/scenes/{st_id}/prompt-overrides` returns overrides
- [ ] `PUT /characters/{id}/scenes/{st_id}/prompt-overrides` upserts overrides
- [ ] `POST /prompts/resolve` returns resolved slots with source information
- [ ] `GET /prompt-fragments?search=dress` returns matching fragments
- [ ] `POST /prompt-fragments` creates fragment with 201
- [ ] `POST /prompt-fragments/{id}/pin/{st_id}` pins successfully
- [ ] `DELETE /prompt-fragments/{id}` removes fragment
- [ ] All tests pass

### Task 6.5: Frontend component tests
**File:** `apps/frontend/src/features/prompt-management/__tests__/`

```typescript
// PromptSlotsPanel.test.tsx
// FragmentDropdown.test.tsx
// CharacterSceneOverrideEditor.test.tsx
// GenerationStrategySelector.test.tsx
```

**Acceptance Criteria:**
- [ ] `PromptSlotsPanel` renders all slots with labels
- [ ] `PromptSlotsPanel` shows read-only lock for non-editable slots
- [ ] `FragmentDropdown` shows pinned fragments first
- [ ] `FragmentDropdown` filters on search input
- [ ] `CharacterSceneOverrideEditor` displays base prompt and fragments
- [ ] `GenerationStrategySelector` shows correct options
- [ ] All tests pass with Vitest + Testing Library

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/YYYYMMDDHHMMSS_add_generation_strategy_to_scene_types.sql` | Alter scene_types table |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_workflow_prompt_slots.sql` | Prompt node mapping table |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_scene_type_prompt_defaults.sql` | Scene-type prompt defaults |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_character_scene_prompt_overrides.sql` | Character+scene overrides |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_prompt_fragments.sql` | Fragment library + pinning |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_scene_artifacts.sql` | Workflow-managed chunk artifacts |
| `apps/backend/crates/db/src/models/scene_type.rs` | Updated SceneType model (generation strategy) |
| `apps/backend/crates/db/src/models/workflow_prompt_slot.rs` | New WorkflowPromptSlot model |
| `apps/backend/crates/db/src/models/scene_type_prompt_default.rs` | New SceneTypePromptDefault model |
| `apps/backend/crates/db/src/models/character_scene_prompt_override.rs` | New CharacterScenePromptOverride model |
| `apps/backend/crates/db/src/models/prompt_fragment.rs` | New PromptFragment model |
| `apps/backend/crates/db/src/models/scene_artifact.rs` | New SceneArtifact model |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model modules |
| `apps/backend/crates/db/src/repositories/workflow_prompt_slot_repo.rs` | Slot CRUD + bulk operations |
| `apps/backend/crates/db/src/repositories/scene_type_prompt_default_repo.rs` | Default upsert + list |
| `apps/backend/crates/db/src/repositories/character_scene_prompt_override_repo.rs` | Override upsert + list |
| `apps/backend/crates/db/src/repositories/prompt_fragment_repo.rs` | Fragment CRUD + search + pinning |
| `apps/backend/crates/db/src/repositories/scene_artifact_repo.rs` | Artifact CRUD |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo modules |
| `apps/backend/crates/core/src/prompt_resolution.rs` | Centralized resolution engine |
| `apps/backend/crates/core/src/lib.rs` | Register prompt_resolution module |
| `apps/backend/crates/api/src/handlers/prompt_management.rs` | All new API handlers |
| `apps/backend/crates/api/src/handlers/scene_type.rs` | Updated for generation strategy fields |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register prompt_management module |
| `apps/backend/crates/api/src/lib.rs` | Register new routes |
| `apps/frontend/src/features/prompt-management/index.ts` | Feature module entry |
| `apps/frontend/src/features/prompt-management/types.ts` | TypeScript interfaces |
| `apps/frontend/src/features/prompt-management/hooks/` | TanStack Query hooks |
| `apps/frontend/src/features/prompt-management/PromptSlotsPanel.tsx` | Slot editor component |
| `apps/frontend/src/features/prompt-management/FragmentDropdown.tsx` | Fragment selector |
| `apps/frontend/src/features/prompt-management/CharacterSceneOverrideEditor.tsx` | Override editor |
| `apps/frontend/src/features/prompt-management/GenerationStrategySelector.tsx` | Strategy selector |
| `apps/backend/crates/db/tests/workflow_prompt_slot.rs` | Slot DB tests |
| `apps/backend/crates/db/tests/prompt_fragment.rs` | Fragment DB tests |
| `apps/backend/crates/api/tests/prompt_management_api.rs` | API endpoint tests |
| `apps/frontend/src/features/prompt-management/__tests__/` | Frontend component tests |

---

## Dependencies

### Existing Components to Reuse
- `x121_db::repositories::*` — CRUD pattern (zero-sized struct, `COLUMNS` const, `&PgPool`)
- `x121_db::models::*` — Three-struct pattern (entity/create/update)
- `x121_core::types::{DbId, Timestamp}` — Shared type aliases
- `x121_core::error::CoreError` — Domain error variants (NotFound, Conflict, Validation)
- `x121_core::prompt_editor` — `extract_placeholders()`, `PLACEHOLDER_RE`, validation functions
- `x121_core::workflow_import` — `discover_parameters()` for CLIPTextEncode detection
- `x121_api::error::{AppError, AppResult}` — HTTP error mapping
- `x121_api::state::AppState` — Shared app state with `pool: PgPool`
- `x121_api::middleware::auth::AuthUser` — Auth extractor for user identification
- `x121_api::response::DataResponse` — Standard envelope response
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete`
- `apps/frontend/src/lib/api.ts` — Shared API client
- `apps/frontend/src/features/prompt-editor/` — Existing prompt editing components to reference
- `apps/frontend/src/features/workflow-import/` — Existing workflow import components to reference

### Upstream PRDs (Must Be Complete)
- PRD-23 (Scene Type Configuration) — scene_types table, prompt templates
- PRD-24 (Recursive Video Generation Loop) — segment chaining
- PRD-63 (Prompt Editor & Versioning) — prompt versions, shared library
- PRD-75 (ComfyUI Workflow Import & Validation) — parameter discovery, workflows table

### Downstream PRDs (Will Use This)
- PRD-33 (Workflow Canvas) — shows prompt node labels in visual node graph
- PRD-57 (Batch Orchestrator) — respects generation strategy when submitting jobs
- PRD-74 (Config Templates) — includes generation strategy setting
- PRD-112 (Project Hub) — character+scene overrides in character detail page

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1-1.6
2. Phase 2: Models & Repositories — Tasks 2.1-2.11
3. Phase 3: Prompt Resolution Engine — Tasks 3.1-3.2
4. Phase 4: API Handlers — Tasks 4.1-4.4
5. Phase 5: Frontend Feature Module — Tasks 5.1-5.6
6. Phase 6: Integration Tests — Tasks 6.1-6.5

**MVP Success Criteria:**
- Generation strategy selectable per scene type (platform_orchestrated / workflow_managed)
- All CLIPTextEncode prompt nodes auto-detected during workflow import with semantic labels
- Scene-type default prompts configurable per workflow prompt slot
- Character+scene-specific prompt fragments addable via searchable dropdown
- Prompt fragment library grows organically with usage tracking and scene-type pinning
- Live prompt preview resolves full chain (base + placeholders + fragments)
- All prompt editing happens in-platform — no need to open ComfyUI
- All integration tests pass (DB-level, API-level, unit-level)

### Post-MVP Enhancements
- Batch prompt override application (PRD-115 Req 2.1) — apply fragments to multiple characters
- Prompt override templates (PRD-115 Req 2.2) — save common fragment combinations
- AI-suggested prompt fragments (PRD-115 Req 2.3) — auto-suggest based on character metadata
- Prompt A/B testing (PRD-115 Req 2.4) — compare prompt variants side-by-side
- Prompt weight syntax (PRD-115 Req 2.5) — visual `(word:1.3)` weight controls

---

## Notes

1. **Migration ordering:** The `scene_types` ALTER (Task 1.1) must run before `scene_type_prompt_defaults` (Task 1.3) since defaults reference scene_types. The `workflows` table must already exist (PRD-75) before `workflow_prompt_slots` (Task 1.2). Order all migrations with sequential timestamps.
2. **Prompt slot re-import:** When a workflow is re-imported with different CLIPTextEncode nodes, match existing slots by `node_id`. Preserve labels for matching nodes, add new slots, and optionally remove orphaned slots (with admin confirmation since they may have scene-type defaults attached).
3. **Fragment separator:** Using `, ` (comma-space) as the default separator. This is configurable in `resolve_prompts()` for future flexibility. Could be made per-scene-type if the open question is resolved differently.
4. **Fragment denormalization safety:** When a fragment's text is updated in the library, existing override JSONB entries retain the old text. A background job or on-read refresh strategy can update denormalized text. This is acceptable for MVP since the override is the source of truth at execution time.
5. **Performance:** The `resolve_prompts()` function should be fast (sub-millisecond for typical inputs). All data is pre-loaded — no database queries inside the resolution loop. The API handler loads all inputs, then calls the pure function.
6. **Shared regex:** The `PLACEHOLDER_RE` regex in `prompt_editor` should be reused in `prompt_resolution`. Either make it `pub` or extract to a shared location in `core`.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-115
