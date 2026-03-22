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

### Task 1.1: [COMPLETE] Create pipelines table migration
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
- [x] Migration creates `pipelines` table with all columns
- [x] `code` column has UNIQUE constraint
- [x] `updated_at` trigger is set
- [x] Indexes on `code` and `is_active`
- [x] JSONB columns have proper defaults

### Task 1.2: [COMPLETE] Seed pipeline data
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
- [x] x121 pipeline created with clothed + topless seed slots
- [x] y122 pipeline created with speaker seed slot
- [x] Both have naming_rules and delivery_config populated
- [x] Both are `is_active = true`

### Task 1.3: [COMPLETE] Add pipeline_id FK to projects
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
- [x] `pipeline_id` column added to `projects`
- [x] All existing projects assigned to x121 pipeline
- [x] Column is NOT NULL after backfill
- [x] Foreign key constraint to `pipelines(id)` enforced
- [x] Index created on `pipeline_id`

### Task 1.4: [COMPLETE] Add pipeline_id FK to tracks
**File:** `apps/db/migrations/{timestamp}_add_pipeline_id_to_tracks.sql`

Add `pipeline_id` column to `tracks` and backfill existing data to x121.

```sql
ALTER TABLE tracks ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE tracks SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');
ALTER TABLE tracks ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_tracks_pipeline_id ON tracks(pipeline_id);
```

**Acceptance Criteria:**
- [x] `pipeline_id` column added to `tracks`
- [x] All existing tracks assigned to x121 pipeline
- [x] Column is NOT NULL after backfill
- [x] Foreign key and index created

### Task 1.5: [COMPLETE] Add pipeline_id FK to workflows
**File:** `apps/db/migrations/{timestamp}_add_pipeline_id_to_workflows.sql`

Add `pipeline_id` column to `workflows` and backfill existing data to x121.

```sql
ALTER TABLE workflows ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);
UPDATE workflows SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');
ALTER TABLE workflows ALTER COLUMN pipeline_id SET NOT NULL;
CREATE INDEX idx_workflows_pipeline_id ON workflows(pipeline_id);
```

**Acceptance Criteria:**
- [x] `pipeline_id` column added to `workflows`
- [x] All existing workflows assigned to x121 pipeline
- [x] Column is NOT NULL after backfill
- [x] Foreign key and index created

### Task 1.6: [COMPLETE] Add pipeline_id FK to scene_types
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
- [x] `pipeline_id` column added to `scene_types` (nullable)
- [x] Global scene types (project_id IS NULL) assigned to x121
- [x] Project-scoped scene types left as pipeline_id = NULL (inherited from project)
- [x] Index created

---

## Phase 2: Backend Models & Repos

### Task 2.1: [COMPLETE] Pipeline model and DTOs
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
- [x] `Pipeline` struct with all DB columns
- [x] `CreatePipeline` DTO with required fields
- [x] `UpdatePipeline` DTO with all-optional fields
- [x] Registered in `models/mod.rs`
- [x] Follows existing model patterns (derives, types)

### Task 2.2: [COMPLETE] Pipeline repository
**File:** `apps/backend/crates/db/src/repos/pipeline.rs`

Create CRUD repository for pipelines following existing repo patterns.

**Acceptance Criteria:**
- [x] `PipelineRepo::list(pool, filters)` — list with optional `is_active` filter
- [x] `PipelineRepo::get_by_id(pool, id)` — single pipeline by ID
- [x] `PipelineRepo::get_by_code(pool, code)` — single pipeline by code
- [x] `PipelineRepo::create(pool, dto)` — insert new pipeline
- [x] `PipelineRepo::update(pool, id, dto)` — partial update
- [x] `PipelineRepo::delete(pool, id)` — soft delete (set `is_active = false`)
- [x] Registered in `repos/mod.rs`
- [x] Uses `sqlx::query_as!` with compile-time checking

### Task 2.3: [COMPLETE] Add pipeline_id to existing models
**Files:** `apps/backend/crates/db/src/models/{project,track,workflow,scene_type}.rs`

Add `pipeline_id` field to existing model structs and DTOs.

**Acceptance Criteria:**
- [x] `Project` struct gains `pipeline_id: DbId`
- [x] `CreateProject` DTO gains `pipeline_id: DbId`
- [x] `Track` struct gains `pipeline_id: DbId`
- [x] `CreateTrack` DTO gains `pipeline_id: DbId`
- [x] `Workflow` struct gains `pipeline_id: DbId` (model in `models/workflow.rs`)
- [x] `CreateWorkflow` DTO gains `pipeline_id: DbId`
- [x] `SceneType` struct gains `pipeline_id: Option<DbId>`

### Task 2.4: [COMPLETE] Update existing repos for pipeline filtering
**Files:** `apps/backend/crates/db/src/repos/{project,track,workflow,scene_type}.rs`

Update list/query methods to accept optional `pipeline_id` filter.

**Acceptance Criteria:**
- [x] `ProjectRepo::list` accepts optional `pipeline_id` filter
- [x] `TrackRepo::list` accepts optional `pipeline_id` filter
- [x] `WorkflowRepo::list` accepts optional `pipeline_id` filter
- [x] `SceneTypeRepo` list methods accept optional `pipeline_id` filter
- [x] All create methods include `pipeline_id` in INSERT statements
- [x] Existing queries updated to include `pipeline_id` in SELECT

### Task 2.5: [COMPLETE] Pipeline seed slot types in core crate
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
- [x] `SeedSlot` struct defined with name, required, description
- [x] `PipelineNamingRules` struct for delivery naming templates
- [x] Parse functions from JSONB to typed structs with error handling
- [x] Validation: seed slot names must be unique within a pipeline
- [x] Registered in `core/src/lib.rs`

---

## Phase 3: API Layer

### Task 3.1: [COMPLETE] Pipeline API handlers
**File:** `apps/backend/crates/api/src/handlers/pipelines.rs`

CRUD handlers for the `/api/v1/pipelines` endpoints.

**Acceptance Criteria:**
- [x] `GET /api/v1/pipelines` — list all pipelines (filterable by `is_active`)
- [x] `GET /api/v1/pipelines/:id` — get pipeline by ID (includes parsed seed_slots)
- [x] `POST /api/v1/pipelines` — create pipeline (admin only)
- [x] `PUT /api/v1/pipelines/:id` — update pipeline
- [x] `DELETE /api/v1/pipelines/:id` — soft delete (reject if active projects exist)
- [x] All responses use `{ data, meta }` / `{ error }` envelope
- [x] Seed slot validation on create/update (names unique, at least one slot)

### Task 3.2: [COMPLETE] Register pipeline routes
**File:** `apps/backend/crates/api/src/routes.rs` (or equivalent router file)

Register pipeline API routes in the application router.

**Acceptance Criteria:**
- [x] Pipeline routes registered under `/api/v1/pipelines`
- [x] Routes use appropriate middleware (auth, admin-only for create/delete)
- [x] Follows existing route registration patterns

### Task 3.3: [COMPLETE] Update project API for pipeline context
**Files:** `apps/backend/crates/api/src/handlers/projects.rs`

Update project handlers to require and validate `pipeline_id`.

**Acceptance Criteria:**
- [x] Project creation requires `pipeline_id` in request body
- [x] Project creation validates that `pipeline_id` references an active pipeline
- [x] Project list endpoint accepts optional `pipeline_id` query parameter
- [x] Project detail response includes pipeline information (code, name, seed_slots)

### Task 3.4: [COMPLETE] Update track, workflow, scene_type APIs for pipeline filtering
**Files:** `apps/backend/crates/api/src/handlers/{tracks,workflows,scene_types}.rs`

Update list/create handlers to be pipeline-aware.

**Acceptance Criteria:**
- [x] Track list accepts `pipeline_id` filter
- [x] Track creation requires `pipeline_id`
- [x] Workflow list accepts `pipeline_id` filter
- [x] Workflow creation requires `pipeline_id`
- [x] Scene type list respects pipeline scoping
- [x] Create handlers validate pipeline_id references an active pipeline

---

## Phase 4: Pipeline Orchestration

### Task 4.1: [COMPLETE] Pipeline context loading in pipeline crate
**File:** `apps/backend/crates/pipeline/src/context_loader.rs`

Extend the context loading to resolve pipeline configuration before building workflows.

**Acceptance Criteria:**
- [x] `load_pipeline_context(pool, project_id)` resolves the project's pipeline
- [x] Pipeline seed slots are loaded and available in `GenerationContext`
- [x] Pipeline naming rules are available for delivery
- [x] Pipeline config is cached per-project within a generation session
- [x] Error handling for missing/inactive pipeline

### Task 4.2: [COMPLETE] Dynamic seed image validation in character ingest
**Files:** `apps/backend/crates/db/src/models/character_ingest.rs`, relevant handler

Replace hardcoded "clothed"/"topless" validation with pipeline-driven seed slot validation.

**Acceptance Criteria:**
- [x] Ingest session resolves pipeline from the target project
- [x] Image classification uses pipeline's seed slot names (not hardcoded)
- [x] Validation checks all required seed slots have matching images
- [x] Validation produces clear errors listing missing seed slots
- [x] x121 pipeline validates for clothed + topless (backward compatible)
- [x] y122 pipeline validates for speaker only

### Task 4.3: [COMPLETE] Pipeline-scoped delivery naming
**Files:** `apps/backend/crates/core/src/naming.rs`, `apps/backend/crates/api/src/background/delivery_assembly.rs`

Replace hardcoded naming logic with pipeline-driven naming templates.

**Acceptance Criteria:**
- [x] `resolve_video_filename()` reads naming template from pipeline config
- [x] Template variables: `{scene_type}`, `{prefix}`, `{transition}`, `{index}`, `{track}`
- [x] Prefix rules resolved from pipeline's `naming_rules.prefix_rules` map
- [x] x121 naming produces identical output to current hardcoded logic (backward compatible)
- [x] y122 naming produces its own format
- [x] Deprecated `scene_video_filename()` removed

---

## Phase 5: Frontend

### Task 5.1: [COMPLETE] Pipeline data hooks and API client
**File:** `apps/frontend/src/features/pipelines/hooks/usePipelines.ts`

TanStack Query hooks for pipeline data fetching.

**Acceptance Criteria:**
- [x] `usePipelines()` — fetch all pipelines
- [x] `usePipeline(id)` — fetch single pipeline with config
- [x] `useCreatePipeline()` — mutation for creating pipeline
- [x] `useUpdatePipeline()` — mutation for updating pipeline
- [x] API client functions in `api/` directory
- [x] Proper error handling and loading states

### Task 5.2: [COMPLETE] Pipeline navigation in sidebar
**Files:** `apps/frontend/src/app/layout/Sidebar.tsx` (or equivalent)

Add pipeline-level navigation sections to the sidebar.

**Acceptance Criteria:**
- [x] Sidebar fetches pipelines on mount
- [x] Each active pipeline renders as a top-level nav section
- [x] Pipeline sections expand to show: Projects, Characters, Scene Types, Workflows, Settings
- [x] Active pipeline is highlighted based on current route
- [x] Pipeline icon/badge shows pipeline code (x121, y122)

### Task 5.3: [COMPLETE] Pipeline-scoped routing
**File:** `apps/frontend/src/app/router.tsx`

Add nested routes under each pipeline.

**Acceptance Criteria:**
- [x] Routes: `/pipelines/:pipelineCode/projects`, `/pipelines/:pipelineCode/characters`, etc.
- [x] Pipeline code resolved from URL and passed as context to child routes
- [x] Existing project/character/workflow pages wrapped with pipeline context
- [x] 404 handling for invalid pipeline codes

### Task 5.4: [COMPLETE] Pipeline admin page
**Files:** `apps/frontend/src/features/pipelines/pages/PipelineSettingsPage.tsx`

Admin page for viewing and editing pipeline configuration.

**Acceptance Criteria:**
- [x] Displays pipeline name, code, description
- [x] Editable seed slots (add/remove/reorder)
- [x] Editable naming rules (template editor)
- [x] Editable delivery config
- [x] Save button calls update API
- [x] Only accessible to admin users

### Task 5.5: [COMPLETE] Pipeline-aware project creation
**Files:** `apps/frontend/src/features/projects/components/CreateProjectForm.tsx` (or equivalent)

Project creation form contextualized to the current pipeline.

**Acceptance Criteria:**
- [x] Pipeline is pre-selected from the navigation context (not a dropdown)
- [x] Form sends `pipeline_id` in the creation request
- [x] Pipeline name shown in the form header for clarity

### Task 5.6: [COMPLETE] Dynamic seed image upload slots
**Files:** `apps/frontend/src/features/characters/components/SeedImageUpload.tsx` (or equivalent)

Character upload form renders seed image slots dynamically based on pipeline config.

**Acceptance Criteria:**
- [x] Fetches pipeline's `seed_slots` on mount
- [x] Renders one upload area per seed slot
- [x] Labels each upload area with the slot's name and description
- [x] Validates all required slots have images before submission
- [x] x121 shows "Clothed" + "Topless" upload areas
- [x] y122 shows single "Speaker" upload area

---

## Phase 6: Testing & Migration Verification

### Task 6.1: [COMPLETE] Pipeline repo integration tests
**File:** `apps/backend/crates/db/src/repos/pipeline_test.rs` (or test module)

**Acceptance Criteria:**
- [x] Test create pipeline with valid data
- [x] Test create pipeline with duplicate code (expect error)
- [x] Test get by id and get by code
- [x] Test update pipeline (partial update)
- [x] Test soft delete
- [x] Test list with is_active filter

### Task 6.2: [COMPLETE] Pipeline API integration tests
**File:** `apps/backend/crates/api/tests/pipelines.rs` (or test module)

**Acceptance Criteria:**
- [x] Test CRUD endpoints return correct status codes and response format
- [x] Test admin-only access for create/delete
- [x] Test delete rejection when active projects exist
- [x] Test seed slot validation on create/update

### Task 6.3: [COMPLETE] Pipeline scoping tests
**File:** `apps/backend/crates/api/tests/pipeline_scoping.rs`

**Acceptance Criteria:**
- [x] Test project list filtered by pipeline_id returns only that pipeline's projects
- [x] Test track list filtered by pipeline_id
- [x] Test workflow list filtered by pipeline_id
- [x] Test scene type list filtered by pipeline_id
- [x] Test creating a project with invalid pipeline_id (expect error)

### Task 6.4: [COMPLETE] Seed validation tests
**File:** `apps/backend/crates/db/tests/seed_validation.rs` (or test module)

**Acceptance Criteria:**
- [x] Test x121 pipeline validates clothed + topless present
- [x] Test x121 pipeline rejects when topless missing
- [x] Test y122 pipeline validates speaker present
- [x] Test y122 pipeline rejects when speaker missing

### Task 6.5: [COMPLETE] Migration verification
**Description:** Manual verification checklist after running migrations.

**Acceptance Criteria:**
- [x] All existing projects have `pipeline_id` set to x121
- [x] All existing tracks have `pipeline_id` set to x121
- [x] All existing workflows have `pipeline_id` set to x121
- [x] All global scene types have `pipeline_id` set to x121
- [x] No NULL values in NOT NULL `pipeline_id` columns
- [x] Application starts without errors
- [x] Existing x121 project/character/workflow CRUD works unchanged
- [x] Existing delivery export produces identical output

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
