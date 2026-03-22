# Task List: Multi-Pipeline Architecture

**PRD Reference:** `design/prds/138-prd-multi-pipeline-architecture.md`
**Scope:** Introduce Pipeline as a top-level entity, scope all major entities to pipelines, make import/delivery pipeline-aware, add pipeline navigation to frontend.

## Overview

This implementation introduces `pipelines` as the top-level organizational entity in the platform. All projects, tracks, workflows, and scene types become pipeline-scoped. The existing x121 data migrates to a default pipeline, and the system becomes extensible for new pipelines (y122, etc.) through DB configuration alone. The backend is code-driven with pipeline specs stored in the database.

### What Already Exists
- `tracks` table (PRD-111) — already supports arbitrary content variants, needs `pipeline_id` FK
- `workflows` table (PRD-75) — full workflow management with JSON storage, needs `pipeline_id` FK
- `scene_types` table (PRD-123) — unified scene definitions, needs `pipeline_id` FK
- `projects` table — core entity, needs `pipeline_id` FK
- Pipeline crate (`crates/pipeline/`) — fully functional orchestration, needs pipeline context loading
- Character ingest (PRD-113) — import system with image classification, needs dynamic seed validation
- Naming engine (PRD-116) — template-based naming, needs to read from pipeline config
- Delivery assembly — needs pipeline-scoped naming rules

### What We're Building
1. `pipelines` table + model + repo + API handlers
2. FK additions and backfill migration for projects, tracks, workflows, scene_types
3. Pipeline context resolution in pipeline crate
4. Dynamic seed slot validation in character ingest
5. Pipeline-scoped delivery naming
6. Frontend pipeline navigation and admin

### Key Design Decisions
1. Pipeline is top-level — everything scopes under it, no cross-pipeline sharing
2. Characters are pipeline-scoped — same person in different pipelines = different records
3. Seed slots are modifiable after creation — pipelines can evolve
4. DB-driven config — adding a new pipeline requires only DB records, no code changes
5. Existing data migrates to x121 pipeline — zero regression

---

## Phase 1: Database Foundation

### Task 1.1: Create pipelines table migration
**File:** `apps/db/migrations/{timestamp}_create_pipelines.sql`

Create the core `pipelines` table with all configuration columns.

```sql
CREATE TABLE pipelines (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    seed_slots      JSONB NOT NULL DEFAULT '[]'::jsonb,
    naming_rules    JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_pipelines_updated_at
    BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_pipelines_code ON pipelines(code);
CREATE INDEX idx_pipelines_is_active ON pipelines(is_active);
```

**Acceptance Criteria:**
- [ ] Migration creates `pipelines` table with all columns
- [ ] `code` column has UNIQUE constraint
- [ ] `updated_at` trigger is set
- [ ] Indexes on `code` and `is_active`
- [ ] JSONB columns have proper defaults

### Task 1.2: Seed pipeline data
**File:** `apps/db/migrations/{timestamp}_seed_pipelines.sql`

Insert the initial x121 and y122 pipeline records.

```sql
INSERT INTO pipelines (code, name, description, seed_slots, naming_rules, delivery_config)
VALUES
(
    'x121',
    'X121 Adult Content',
    'Two-track adult content pipeline with clothed and topless seed images',
    '[
        {"name": "clothed", "required": true, "description": "Clothed reference image"},
        {"name": "topless", "required": true, "description": "Topless reference image"}
    ]'::jsonb,
    '{
        "video_template": "{prefix}{scene_type}{transition}{index}.mp4",
        "prefix_rules": {"topless": "topless_", "clothed": ""},
        "transition_suffix": "_clothes_off"
    }'::jsonb,
    '{
        "archive_template": "{project}_{character}_{profile}",
        "folder_structure": "flat"
    }'::jsonb
),
(
    'y122',
    'Y122 Speaker',
    'Single-track speaker pipeline with one seed image',
    '[
        {"name": "speaker", "required": true, "description": "Speaker reference image"}
    ]'::jsonb,
    '{
        "video_template": "{scene_type}{index}.mp4",
        "prefix_rules": {},
        "transition_suffix": ""
    }'::jsonb,
    '{
        "archive_template": "{project}_{character}_{profile}",
        "folder_structure": "flat"
    }'::jsonb
);
```

**Acceptance Criteria:**
- [ ] x121 pipeline created with clothed + topless seed slots
- [ ] y122 pipeline created with speaker seed slot
- [ ] Both have naming_rules and delivery_config populated
- [ ] Both are `is_active = true`

### Task 1.3: Add pipeline_id FK to projects
**File:** `apps/db/migrations/{timestamp}_add_pipeline_id_to_projects.sql`

Add `pipeline_id` column to `projects` and backfill existing data to x121.

```sql
-- Add nullable column first
ALTER TABLE projects ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

-- Backfill all existing projects to x121
UPDATE projects SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');

-- Make NOT NULL after backfill
ALTER TABLE projects ALTER COLUMN pipeline_id SET NOT NULL;

CREATE INDEX idx_projects_pipeline_id ON projects(pipeline_id);
```

**Acceptance Criteria:**
- [ ] `pipeline_id` column added to `projects`
- [ ] All existing projects assigned to x121 pipeline
- [ ] Column is NOT NULL after backfill
- [ ] Foreign key constraint to `pipelines(id)` enforced
- [ ] Index created on `pipeline_id`

### Task 1.4: Add pipeline_id FK to tracks
**File:** `apps/db/migrations/{timestamp}_add_pipeline_id_to_tracks.sql`

Add `pipeline_id` column to `tracks` and backfill existing data to x121.

```sql
ALTER TABLE tracks ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE tracks SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');
ALTER TABLE tracks ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_tracks_pipeline_id ON tracks(pipeline_id);
```

**Acceptance Criteria:**
- [ ] `pipeline_id` column added to `tracks`
- [ ] All existing tracks assigned to x121 pipeline
- [ ] Column is NOT NULL after backfill
- [ ] Foreign key and index created

### Task 1.5: Add pipeline_id FK to workflows
**File:** `apps/db/migrations/{timestamp}_add_pipeline_id_to_workflows.sql`

Add `pipeline_id` column to `workflows` and backfill existing data to x121.

```sql
ALTER TABLE workflows ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE workflows SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');
ALTER TABLE workflows ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_workflows_pipeline_id ON workflows(pipeline_id);
```

**Acceptance Criteria:**
- [ ] `pipeline_id` column added to `workflows`
- [ ] All existing workflows assigned to x121 pipeline
- [ ] Column is NOT NULL after backfill
- [ ] Foreign key and index created

### Task 1.6: Add pipeline_id FK to scene_types
**File:** `apps/db/migrations/{timestamp}_add_pipeline_id_to_scene_types.sql`

Add `pipeline_id` column to `scene_types`. Nullable because scene types can be project-scoped (where the pipeline is inherited from the project).

```sql
ALTER TABLE scene_types ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

-- Backfill global scene types (project_id IS NULL) to x121
UPDATE scene_types
SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121')
WHERE project_id IS NULL;

CREATE INDEX idx_scene_types_pipeline_id ON scene_types(pipeline_id);
```

**Acceptance Criteria:**
- [ ] `pipeline_id` column added to `scene_types` (nullable)
- [ ] Global scene types (project_id IS NULL) assigned to x121
- [ ] Project-scoped scene types left as pipeline_id = NULL (inherited from project)
- [ ] Index created

---

## Phase 2: Backend Models & Repos

### Task 2.1: Pipeline model and DTOs
**File:** `apps/backend/crates/db/src/models/pipeline.rs`

Create the Pipeline entity model and associated DTOs following existing patterns.

```rust
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Pipeline {
    pub id: DbId,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub seed_slots: serde_json::Value,
    pub naming_rules: serde_json::Value,
    pub delivery_config: serde_json::Value,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePipeline {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub seed_slots: serde_json::Value,
    pub naming_rules: Option<serde_json::Value>,
    pub delivery_config: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePipeline {
    pub name: Option<String>,
    pub description: Option<String>,
    pub seed_slots: Option<serde_json::Value>,
    pub naming_rules: Option<serde_json::Value>,
    pub delivery_config: Option<serde_json::Value>,
    pub is_active: Option<bool>,
}
```

**Acceptance Criteria:**
- [ ] `Pipeline` struct with all DB columns
- [ ] `CreatePipeline` DTO with required fields
- [ ] `UpdatePipeline` DTO with all-optional fields
- [ ] Registered in `models/mod.rs`
- [ ] Follows existing model patterns (derives, types)

### Task 2.2: Pipeline repository
**File:** `apps/backend/crates/db/src/repos/pipeline.rs`

Create CRUD repository for pipelines following existing repo patterns.

**Acceptance Criteria:**
- [ ] `PipelineRepo::list(pool, filters)` — list with optional `is_active` filter
- [ ] `PipelineRepo::get_by_id(pool, id)` — single pipeline by ID
- [ ] `PipelineRepo::get_by_code(pool, code)` — single pipeline by code
- [ ] `PipelineRepo::create(pool, dto)` — insert new pipeline
- [ ] `PipelineRepo::update(pool, id, dto)` — partial update
- [ ] `PipelineRepo::delete(pool, id)` — soft delete (set `is_active = false`)
- [ ] Registered in `repos/mod.rs`
- [ ] Uses `sqlx::query_as!` with compile-time checking

### Task 2.3: Add pipeline_id to existing models
**Files:** `apps/backend/crates/db/src/models/{project,track,workflow,scene_type}.rs`

Add `pipeline_id` field to existing model structs and DTOs.

**Acceptance Criteria:**
- [ ] `Project` struct gains `pipeline_id: DbId`
- [ ] `CreateProject` DTO gains `pipeline_id: DbId`
- [ ] `Track` struct gains `pipeline_id: DbId`
- [ ] `CreateTrack` DTO gains `pipeline_id: DbId`
- [ ] `Workflow` struct gains `pipeline_id: DbId` (model in `models/workflow.rs`)
- [ ] `CreateWorkflow` DTO gains `pipeline_id: DbId`
- [ ] `SceneType` struct gains `pipeline_id: Option<DbId>`

### Task 2.4: Update existing repos for pipeline filtering
**Files:** `apps/backend/crates/db/src/repos/{project,track,workflow,scene_type}.rs`

Update list/query methods to accept optional `pipeline_id` filter.

**Acceptance Criteria:**
- [ ] `ProjectRepo::list` accepts optional `pipeline_id` filter
- [ ] `TrackRepo::list` accepts optional `pipeline_id` filter
- [ ] `WorkflowRepo::list` accepts optional `pipeline_id` filter
- [ ] `SceneTypeRepo` list methods accept optional `pipeline_id` filter
- [ ] All create methods include `pipeline_id` in INSERT statements
- [ ] Existing queries updated to include `pipeline_id` in SELECT

### Task 2.5: Pipeline seed slot types in core crate
**File:** `apps/backend/crates/core/src/pipeline.rs`

Define typed seed slot structures in the core crate for use across the application.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedSlot {
    pub name: String,
    pub required: bool,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineNamingRules {
    pub video_template: String,
    #[serde(default)]
    pub prefix_rules: HashMap<String, String>,
    #[serde(default)]
    pub transition_suffix: String,
}

pub fn parse_seed_slots(json: &serde_json::Value) -> Result<Vec<SeedSlot>, CoreError> { ... }
pub fn parse_naming_rules(json: &serde_json::Value) -> Result<PipelineNamingRules, CoreError> { ... }
```

**Acceptance Criteria:**
- [ ] `SeedSlot` struct defined with name, required, description
- [ ] `PipelineNamingRules` struct for delivery naming templates
- [ ] Parse functions from JSONB to typed structs with error handling
- [ ] Validation: seed slot names must be unique within a pipeline
- [ ] Registered in `core/src/lib.rs`

---

## Phase 3: API Layer

### Task 3.1: Pipeline API handlers
**File:** `apps/backend/crates/api/src/handlers/pipelines.rs`

CRUD handlers for the `/api/v1/pipelines` endpoints.

**Acceptance Criteria:**
- [ ] `GET /api/v1/pipelines` — list all pipelines (filterable by `is_active`)
- [ ] `GET /api/v1/pipelines/:id` — get pipeline by ID (includes parsed seed_slots)
- [ ] `POST /api/v1/pipelines` — create pipeline (admin only)
- [ ] `PUT /api/v1/pipelines/:id` — update pipeline
- [ ] `DELETE /api/v1/pipelines/:id` — soft delete (reject if active projects exist)
- [ ] All responses use `{ data, meta }` / `{ error }` envelope
- [ ] Seed slot validation on create/update (names unique, at least one slot)

### Task 3.2: Register pipeline routes
**File:** `apps/backend/crates/api/src/routes.rs` (or equivalent router file)

Register pipeline API routes in the application router.

**Acceptance Criteria:**
- [ ] Pipeline routes registered under `/api/v1/pipelines`
- [ ] Routes use appropriate middleware (auth, admin-only for create/delete)
- [ ] Follows existing route registration patterns

### Task 3.3: Update project API for pipeline context
**Files:** `apps/backend/crates/api/src/handlers/projects.rs`

Update project handlers to require and validate `pipeline_id`.

**Acceptance Criteria:**
- [ ] Project creation requires `pipeline_id` in request body
- [ ] Project creation validates that `pipeline_id` references an active pipeline
- [ ] Project list endpoint accepts optional `pipeline_id` query parameter
- [ ] Project detail response includes pipeline information (code, name, seed_slots)

### Task 3.4: Update track, workflow, scene_type APIs for pipeline filtering
**Files:** `apps/backend/crates/api/src/handlers/{tracks,workflows,scene_types}.rs`

Update list/create handlers to be pipeline-aware.

**Acceptance Criteria:**
- [ ] Track list accepts `pipeline_id` filter
- [ ] Track creation requires `pipeline_id`
- [ ] Workflow list accepts `pipeline_id` filter
- [ ] Workflow creation requires `pipeline_id`
- [ ] Scene type list respects pipeline scoping
- [ ] Create handlers validate pipeline_id references an active pipeline

---

## Phase 4: Pipeline Orchestration

### Task 4.1: Pipeline context loading in pipeline crate
**File:** `apps/backend/crates/pipeline/src/context_loader.rs`

Extend the context loading to resolve pipeline configuration before building workflows.

**Acceptance Criteria:**
- [ ] `load_pipeline_context(pool, project_id)` resolves the project's pipeline
- [ ] Pipeline seed slots are loaded and available in `GenerationContext`
- [ ] Pipeline naming rules are available for delivery
- [ ] Pipeline config is cached per-project within a generation session
- [ ] Error handling for missing/inactive pipeline

### Task 4.2: Dynamic seed image validation in character ingest
**Files:** `apps/backend/crates/db/src/models/character_ingest.rs`, relevant handler

Replace hardcoded "clothed"/"topless" validation with pipeline-driven seed slot validation.

**Acceptance Criteria:**
- [ ] Ingest session resolves pipeline from the target project
- [ ] Image classification uses pipeline's seed slot names (not hardcoded)
- [ ] Validation checks all required seed slots have matching images
- [ ] Validation produces clear errors listing missing seed slots
- [ ] x121 pipeline validates for clothed + topless (backward compatible)
- [ ] y122 pipeline validates for speaker only

### Task 4.3: Pipeline-scoped delivery naming
**Files:** `apps/backend/crates/core/src/naming.rs`, `apps/backend/crates/api/src/background/delivery_assembly.rs`

Replace hardcoded naming logic with pipeline-driven naming templates.

**Acceptance Criteria:**
- [ ] `resolve_video_filename()` reads naming template from pipeline config
- [ ] Template variables: `{scene_type}`, `{prefix}`, `{transition}`, `{index}`, `{track}`
- [ ] Prefix rules resolved from pipeline's `naming_rules.prefix_rules` map
- [ ] x121 naming produces identical output to current hardcoded logic (backward compatible)
- [ ] y122 naming produces its own format
- [ ] Deprecated `scene_video_filename()` removed

---

## Phase 5: Frontend

### Task 5.1: Pipeline data hooks and API client
**File:** `apps/frontend/src/features/pipelines/hooks/usePipelines.ts`

TanStack Query hooks for pipeline data fetching.

**Acceptance Criteria:**
- [ ] `usePipelines()` — fetch all pipelines
- [ ] `usePipeline(id)` — fetch single pipeline with config
- [ ] `useCreatePipeline()` — mutation for creating pipeline
- [ ] `useUpdatePipeline()` — mutation for updating pipeline
- [ ] API client functions in `api/` directory
- [ ] Proper error handling and loading states

### Task 5.2: Pipeline navigation in sidebar
**Files:** `apps/frontend/src/app/layout/Sidebar.tsx` (or equivalent)

Add pipeline-level navigation sections to the sidebar.

**Acceptance Criteria:**
- [ ] Sidebar fetches pipelines on mount
- [ ] Each active pipeline renders as a top-level nav section
- [ ] Pipeline sections expand to show: Projects, Characters, Scene Types, Workflows, Settings
- [ ] Active pipeline is highlighted based on current route
- [ ] Pipeline icon/badge shows pipeline code (x121, y122)

### Task 5.3: Pipeline-scoped routing
**File:** `apps/frontend/src/app/router.tsx`

Add nested routes under each pipeline.

**Acceptance Criteria:**
- [ ] Routes: `/pipelines/:pipelineCode/projects`, `/pipelines/:pipelineCode/characters`, etc.
- [ ] Pipeline code resolved from URL and passed as context to child routes
- [ ] Existing project/character/workflow pages wrapped with pipeline context
- [ ] 404 handling for invalid pipeline codes

### Task 5.4: Pipeline admin page
**Files:** `apps/frontend/src/features/pipelines/pages/PipelineSettingsPage.tsx`

Admin page for viewing and editing pipeline configuration.

**Acceptance Criteria:**
- [ ] Displays pipeline name, code, description
- [ ] Editable seed slots (add/remove/reorder)
- [ ] Editable naming rules (template editor)
- [ ] Editable delivery config
- [ ] Save button calls update API
- [ ] Only accessible to admin users

### Task 5.5: Pipeline-aware project creation
**Files:** `apps/frontend/src/features/projects/components/CreateProjectForm.tsx` (or equivalent)

Project creation form contextualized to the current pipeline.

**Acceptance Criteria:**
- [ ] Pipeline is pre-selected from the navigation context (not a dropdown)
- [ ] Form sends `pipeline_id` in the creation request
- [ ] Pipeline name shown in the form header for clarity

### Task 5.6: Dynamic seed image upload slots
**Files:** `apps/frontend/src/features/characters/components/SeedImageUpload.tsx` (or equivalent)

Character upload form renders seed image slots dynamically based on pipeline config.

**Acceptance Criteria:**
- [ ] Fetches pipeline's `seed_slots` on mount
- [ ] Renders one upload area per seed slot
- [ ] Labels each upload area with the slot's name and description
- [ ] Validates all required slots have images before submission
- [ ] x121 shows "Clothed" + "Topless" upload areas
- [ ] y122 shows single "Speaker" upload area

---

## Phase 6: Testing & Migration Verification

### Task 6.1: Pipeline repo integration tests
**File:** `apps/backend/crates/db/src/repos/pipeline_test.rs` (or test module)

**Acceptance Criteria:**
- [ ] Test create pipeline with valid data
- [ ] Test create pipeline with duplicate code (expect error)
- [ ] Test get by id and get by code
- [ ] Test update pipeline (partial update)
- [ ] Test soft delete
- [ ] Test list with is_active filter

### Task 6.2: Pipeline API integration tests
**File:** `apps/backend/crates/api/tests/pipelines.rs` (or test module)

**Acceptance Criteria:**
- [ ] Test CRUD endpoints return correct status codes and response format
- [ ] Test admin-only access for create/delete
- [ ] Test delete rejection when active projects exist
- [ ] Test seed slot validation on create/update

### Task 6.3: Pipeline scoping tests
**File:** `apps/backend/crates/api/tests/pipeline_scoping.rs`

**Acceptance Criteria:**
- [ ] Test project list filtered by pipeline_id returns only that pipeline's projects
- [ ] Test track list filtered by pipeline_id
- [ ] Test workflow list filtered by pipeline_id
- [ ] Test scene type list filtered by pipeline_id
- [ ] Test creating a project with invalid pipeline_id (expect error)

### Task 6.4: Seed validation tests
**File:** `apps/backend/crates/db/tests/seed_validation.rs` (or test module)

**Acceptance Criteria:**
- [ ] Test x121 pipeline validates clothed + topless present
- [ ] Test x121 pipeline rejects when topless missing
- [ ] Test y122 pipeline validates speaker present
- [ ] Test y122 pipeline rejects when speaker missing

### Task 6.5: Migration verification
**Description:** Manual verification checklist after running migrations.

**Acceptance Criteria:**
- [ ] All existing projects have `pipeline_id` set to x121
- [ ] All existing tracks have `pipeline_id` set to x121
- [ ] All existing workflows have `pipeline_id` set to x121
- [ ] All global scene types have `pipeline_id` set to x121
- [ ] No NULL values in NOT NULL `pipeline_id` columns
- [ ] Application starts without errors
- [ ] Existing x121 project/character/workflow CRUD works unchanged
- [ ] Existing delivery export produces identical output

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/{ts}_create_pipelines.sql` | Create pipelines table |
| `apps/db/migrations/{ts}_seed_pipelines.sql` | Seed x121 and y122 data |
| `apps/db/migrations/{ts}_add_pipeline_id_to_projects.sql` | Add FK to projects |
| `apps/db/migrations/{ts}_add_pipeline_id_to_tracks.sql` | Add FK to tracks |
| `apps/db/migrations/{ts}_add_pipeline_id_to_workflows.sql` | Add FK to workflows |
| `apps/db/migrations/{ts}_add_pipeline_id_to_scene_types.sql` | Add FK to scene_types |
| `apps/backend/crates/db/src/models/pipeline.rs` | Pipeline entity model and DTOs |
| `apps/backend/crates/db/src/repos/pipeline.rs` | Pipeline CRUD repository |
| `apps/backend/crates/core/src/pipeline.rs` | SeedSlot, NamingRules types + parsing |
| `apps/backend/crates/api/src/handlers/pipelines.rs` | Pipeline API handlers |
| `apps/backend/crates/pipeline/src/context_loader.rs` | Pipeline context resolution |
| `apps/backend/crates/core/src/naming.rs` | Pipeline-scoped delivery naming |
| `apps/frontend/src/features/pipelines/` | Pipeline feature directory |
| `apps/frontend/src/app/layout/Sidebar.tsx` | Pipeline navigation |
| `apps/frontend/src/app/router.tsx` | Pipeline-scoped routes |

---

## Dependencies

### Existing Components to Reuse
- `Track` model and repo from `crates/db/src/models/track.rs` — pattern for pipeline-scoped entities
- `ProjectConfig` model from `crates/db/src/models/project_config.rs` — JSONB config pattern
- `PaginationParams` from `crate::query` — list endpoint filtering
- `naming_engine` from `crate::core` — template-based naming (extend for pipeline)
- Sidebar component from design system
- TanStack Router nested routing patterns

### New Infrastructure Needed
- `pipelines` table and all FK migrations
- `Pipeline` model, repo, API handlers
- `SeedSlot` and `PipelineNamingRules` types in core crate
- Pipeline navigation component
- Pipeline admin settings page
- Dynamic seed image upload component

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Foundation — Tasks 1.1-1.6
2. Phase 2: Backend Models & Repos — Tasks 2.1-2.5
3. Phase 3: API Layer — Tasks 3.1-3.4
4. Phase 4: Pipeline Orchestration — Tasks 4.1-4.3
5. Phase 5: Frontend — Tasks 5.1-5.6
6. Phase 6: Testing — Tasks 6.1-6.5

**MVP Success Criteria:**
- All existing x121 functionality works identically after migration
- y122 pipeline can be configured and used to create projects with single seed image
- Delivery export uses pipeline-specific naming rules
- Frontend navigates between pipelines as separate sections

### Post-MVP Enhancements
- Pipeline templates (clone pipeline configs)
- Pipeline-specific worker pool assignment
- Cross-pipeline analytics dashboard

---

## Notes

1. **Migration order matters** — pipelines table must be created and seeded BEFORE any FK additions to other tables. Run tasks 1.1 and 1.2 before 1.3-1.6.
2. **Backward compatibility** — All existing API endpoints must continue to work during the transition. Add `pipeline_id` as an optional filter initially, make required only for new endpoints.
3. **Testing with real data** — Run migration verification (Task 6.5) against a copy of production data before deploying.
4. **Frontend routing** — The pipeline-scoped routes (`/pipelines/:code/...`) are NEW routes. Existing routes should redirect to `/pipelines/x121/...` for backward compatibility.
5. **Seed slot naming** — The `name` field in seed slots must match the `variant_label` used in `image_variants` table and the track slug in `tracks` table.

---

## Version History

- **v1.0** (2026-03-22): Initial task list creation from PRD-138
