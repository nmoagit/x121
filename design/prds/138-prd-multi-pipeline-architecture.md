# PRD-138: Multi-Pipeline Architecture

## 1. Introduction / Overview

The platform currently operates as a single-purpose video generation system (x121) with hardcoded assumptions about seed images (clothed + topless), scene types, naming conventions, and delivery formats. This PRD introduces **Pipeline** as a first-class, top-level entity that allows the platform to support multiple distinct video generation pipelines — each with its own seed image requirements, workflows, naming rules, and delivery formats — while sharing the core infrastructure (projects, characters, storage, job queuing, workers).

**Example pipelines:**
- **x121** — Adult content pipeline: 2 seed images per character (clothed + topless), multiple scene-type workflows, variant-based delivery naming
- **y122** — Speaker pipeline: 1 seed image per character (speaker.png), speaking-scene workflow (LTX img2vid), presenter-style delivery

The pipeline concept makes the platform extensible without duplicating infrastructure. New content verticals are added by creating a new pipeline record in the database, defining its seed slots, assigning workflows, and configuring delivery naming — all without code changes.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-05** (ComfyUI Bridge) — Pipeline submits workflows via ComfyUI integration
- **PRD-24** (Video Generation Pipeline) — Core pipeline orchestration crate
- **PRD-75** (Workflow Management) — Existing `workflows` table for JSON storage
- **PRD-111** (Track System) — Tracks define content variants (clothed, topless, speaker)
- **PRD-113** (Character Ingest) — Import system needs pipeline-aware seed validation
- **PRD-116** (Naming Engine) — Delivery naming templates, now pipeline-scoped

### Extends
- **PRD-74** (Project Configuration Templates) — Project configs become pipeline-scoped
- **PRD-123** (Scene Type Unification) — Scene types become pipeline-scoped
- **PRD-137** (Output Format Profiles) — Format profiles may be pipeline-scoped

### Conflicts With
- Hardcoded references to "clothed"/"topless" throughout the codebase — must be made dynamic
- `naming::scene_video_filename()` (already deprecated) — fully replaced by pipeline naming rules

## 3. Goals

1. **Pipeline as top-level entity** — All projects, characters, workflows, scene types, and tracks are scoped to a pipeline
2. **DB-driven configuration** — Seed slot requirements, naming rules, and delivery formats stored in database, not code
3. **Dynamic import validation** — Character ingest validates seed images against the pipeline's seed slot spec, not hardcoded names
4. **Pipeline-scoped navigation** — Frontend presents pipelines as top-level navigation sections (not just a dropdown)
5. **Zero-downtime migration** — Existing data migrates to a default "x121" pipeline without breakage
6. **Extensibility** — Adding a new pipeline (e.g., y122) requires only DB records, no code changes to core infrastructure

## 4. User Stories

- **As an admin**, I want to create a new pipeline (y122) with its own seed image requirements and workflows, so I can support a new content vertical without modifying the existing x121 pipeline.
- **As a project manager**, I want to create a project within a specific pipeline, so the system enforces the correct seed image requirements and uses the right workflows for that pipeline's content type.
- **As a content operator**, I want to import characters with seed images that match the pipeline's requirements (e.g., 1 speaker image for y122 vs 2 images for x121), so the system validates my uploads correctly.
- **As a delivery manager**, I want each pipeline to have its own naming convention for exported files, so deliverables are organized according to each client's expectations.
- **As a developer**, I want to add a new pipeline by inserting database records, so I don't need to modify Rust code or deploy a new build.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Pipelines Table

**Description:** Create a `pipelines` database table as the top-level entity that all other entities scope to.

**Acceptance Criteria:**
- [ ] `pipelines` table exists with: `id`, `code` (unique slug, e.g., "x121", "y122"), `name`, `description`, `is_active`, `created_at`, `updated_at`
- [ ] `seed_slots` JSONB column defines required seed images: `[{"name": "clothed", "required": true, "description": "Clothed reference image"}, ...]`
- [ ] `naming_rules` JSONB column defines delivery file naming templates (pipeline-specific)
- [ ] `delivery_config` JSONB column for pipeline-specific delivery settings (archive naming, folder structure)
- [ ] Migration seeds two pipelines: x121 (clothed + topless) and y122 (speaker)

#### Requirement 1.2: Project-Pipeline Scoping

**Description:** Every project belongs to exactly one pipeline. The project inherits the pipeline's configuration.

**Acceptance Criteria:**
- [ ] `projects` table gains `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id)` column
- [ ] Migration sets all existing projects' `pipeline_id` to the x121 pipeline
- [ ] Project creation API requires `pipeline_id`
- [ ] Project list API can filter by `pipeline_id`
- [ ] Project detail API includes pipeline information in response

#### Requirement 1.3: Pipeline-Scoped Tracks

**Description:** Tracks (content variants) are scoped to a pipeline. x121 has "clothed" and "topless" tracks; y122 has a "speaker" track.

**Acceptance Criteria:**
- [ ] `tracks` table gains `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id)` column
- [ ] Migration assigns existing tracks to the x121 pipeline
- [ ] Track CRUD API is filtered by pipeline context
- [ ] When creating a project, the available tracks are determined by its pipeline

#### Requirement 1.4: Pipeline-Scoped Workflows

**Description:** Workflows are owned by a pipeline. A workflow belongs to exactly one pipeline and cannot be shared across pipelines.

**Acceptance Criteria:**
- [ ] `workflows` table gains `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id)` column
- [ ] Migration assigns existing workflows to the x121 pipeline
- [ ] Workflow CRUD API is filtered by pipeline context
- [ ] Workflow list/selection in scene type configuration only shows workflows from the same pipeline

#### Requirement 1.5: Pipeline-Scoped Scene Types

**Description:** Scene types are scoped to a pipeline. Each pipeline defines its own set of scene types.

**Acceptance Criteria:**
- [ ] `scene_types` gains `pipeline_id BIGINT REFERENCES pipelines(id)` column (nullable for backward compat with project-scoped scene types)
- [ ] Global scene types (where `project_id IS NULL`) are pipeline-scoped
- [ ] Project-level scene type overrides inherit the pipeline from their project
- [ ] Scene type listing API respects pipeline scoping

#### Requirement 1.6: Dynamic Seed Image Validation

**Description:** The character import/ingest system validates seed images against the pipeline's `seed_slots` definition instead of hardcoded "clothed"/"topless".

**Acceptance Criteria:**
- [ ] `CharacterIngestSession` resolves seed slot requirements from the project's pipeline
- [ ] Image classification in ingest entries uses pipeline seed slot names (not hardcoded)
- [ ] Validation passes when all required seed slots have matching images
- [ ] Validation fails with clear error when required seed slots are missing
- [ ] Character upload UI adapts to show the correct seed image slots for the pipeline

#### Requirement 1.7: Pipeline-Scoped Delivery Naming

**Description:** The delivery/export system uses the pipeline's `naming_rules` to generate filenames and folder structures instead of the hardcoded x121 convention.

**Acceptance Criteria:**
- [ ] `DeliveryManifest` reads naming templates from the pipeline's `naming_rules`
- [ ] Delivery assembly resolves naming using pipeline context, not hardcoded logic
- [ ] Different pipelines produce differently-named output files
- [ ] The deprecated `scene_video_filename()` function is removed

#### Requirement 1.8: Pipeline Navigation in Frontend

**Description:** The frontend presents pipelines as top-level navigation sections, not just a project filter.

**Acceptance Criteria:**
- [ ] Sidebar navigation shows pipeline entries (e.g., "x121", "y122") as top-level sections
- [ ] Clicking a pipeline section shows that pipeline's projects, characters, and settings
- [ ] Pipeline admin page allows viewing/editing pipeline configuration (seed slots, naming rules)
- [ ] Project creation form is contextualized to the selected pipeline

#### Requirement 1.9: Pipeline CRUD API

**Description:** RESTful API endpoints for managing pipelines.

**Acceptance Criteria:**
- [ ] `GET /api/v1/pipelines` — list all pipelines
- [ ] `GET /api/v1/pipelines/:id` — get pipeline detail (including seed slots, naming rules)
- [ ] `POST /api/v1/pipelines` — create pipeline (admin only)
- [ ] `PUT /api/v1/pipelines/:id` — update pipeline configuration
- [ ] `DELETE /api/v1/pipelines/:id` — soft-delete pipeline (only if no active projects)
- [ ] All responses follow the `{ data, meta }` / `{ error }` envelope format

#### Requirement 1.10: Data Migration

**Description:** Migrate all existing data to the pipeline-scoped model without data loss or downtime.

**Acceptance Criteria:**
- [ ] Migration creates the x121 pipeline record with correct seed slots (`[{name: "clothed"}, {name: "topless"}]`)
- [ ] Migration creates the y122 pipeline record with seed slots (`[{name: "speaker"}]`)
- [ ] All existing projects are assigned to x121 pipeline
- [ ] All existing tracks are assigned to x121 pipeline
- [ ] All existing workflows are assigned to x121 pipeline
- [ ] All existing global scene types are assigned to x121 pipeline
- [ ] All foreign key constraints are enforced after migration
- [ ] Rollback migration reverses all changes cleanly

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Pipeline Templates

**[OPTIONAL — Post-MVP]** Pipeline templates allow creating new pipelines from a predefined configuration, including seed slots, default scene types, and starter workflows.

#### Requirement 2.2: Pipeline Cloning

**[OPTIONAL — Post-MVP]** Clone an existing pipeline's configuration (scene types, workflows, naming rules) to create a new pipeline quickly.

#### Requirement 2.3: Pipeline-Specific Worker Configuration

**[OPTIONAL — Post-MVP]** Different pipelines can specify GPU requirements, model preferences, and worker pool assignments for their generation jobs.

#### Requirement 2.4: Cross-Pipeline Analytics

**[OPTIONAL — Post-MVP]** Dashboard showing generation metrics, costs, and throughput across all pipelines.

## 6. Non-Goals (Out of Scope)

- **Character sharing across pipelines** — Same real person in different pipelines creates separate character records. No cross-pipeline character linking.
- **Workflow sharing across pipelines** — Workflows are pipeline-owned. Copying a workflow to another pipeline is a manual operation (not automated sharing).
- **Runtime pipeline switching** — A project cannot change its pipeline after creation.
- **Pipeline-specific authentication** — All pipelines share the same auth/user system.
- **Automatic workflow discovery** — Workflows are manually assigned to pipelines, not auto-detected.

## 7. Design Considerations

### Frontend Navigation
```
Sidebar:
├── Dashboard (cross-pipeline overview)
├── x121
│   ├── Projects
│   ├── Characters
│   ├── Scene Types
│   ├── Workflows
│   └── Settings (seed slots, naming, delivery)
├── y122
│   ├── Projects
│   ├── Characters
│   ├── Scene Types
│   ├── Workflows
│   └── Settings
├── Admin
│   ├── Pipelines (create/manage pipelines)
│   ├── Workers
│   └── System Settings
```

### Character Upload Adaptation
When uploading seed images for a character, the UI renders upload slots dynamically based on `pipeline.seed_slots`:
- x121: Shows "Clothed" + "Topless" upload areas
- y122: Shows single "Speaker" upload area

### Existing Components to Reuse
- `design-system/` components for navigation, forms, cards
- `TanStack Router` for nested pipeline routes
- Existing `tracks` system (PRD-111) maps directly to pipeline-scoped variants
- `project_configs` (PRD-74) pattern for JSON configuration storage

## 8. Technical Considerations

### Existing Code to Reuse
- **Pipeline crate** (`crates/pipeline/`) — `GenerationContext`, `build_workflow()`, `dispatch_pending_jobs()` — all stay generic, just receive pipeline context
- **Worker crate** (`crates/worker/`) — No changes needed, stays pipeline-agnostic
- **ComfyUI crate** (`crates/comfyui/`) — No changes needed
- **Track system** (PRD-111) — Already supports arbitrary tracks, just needs `pipeline_id` FK
- **Workflow system** (PRD-75) — Already has `workflows` table with JSON storage
- **Naming engine** (PRD-116) — Template-based naming, just needs to read templates from pipeline config
- **Delivery assembly** — Reads naming from pipeline instead of hardcoded rules

### New Infrastructure Needed
- `pipelines` table + model + repo + API handlers
- `pipeline_id` FK columns on `projects`, `tracks`, `workflows`, `scene_types`
- Pipeline context resolution in the pipeline crate (load pipeline config before building workflow)
- Frontend pipeline routing and navigation

### Database Changes
```sql
-- New table
CREATE TABLE pipelines (
    id          BIGSERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,      -- "x121", "y122"
    name        TEXT NOT NULL,
    description TEXT,
    seed_slots  JSONB NOT NULL DEFAULT '[]',
    naming_rules JSONB NOT NULL DEFAULT '{}',
    delivery_config JSONB NOT NULL DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK additions
ALTER TABLE projects ADD COLUMN pipeline_id BIGINT NOT NULL REFERENCES pipelines(id);
ALTER TABLE tracks ADD COLUMN pipeline_id BIGINT NOT NULL REFERENCES pipelines(id);
ALTER TABLE workflows ADD COLUMN pipeline_id BIGINT NOT NULL REFERENCES pipelines(id);
ALTER TABLE scene_types ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

-- Indexes
CREATE INDEX idx_projects_pipeline_id ON projects(pipeline_id);
CREATE INDEX idx_tracks_pipeline_id ON tracks(pipeline_id);
CREATE INDEX idx_workflows_pipeline_id ON workflows(pipeline_id);
CREATE INDEX idx_scene_types_pipeline_id ON scene_types(pipeline_id);
```

### API Changes
- **New endpoints:** Full CRUD for `/api/v1/pipelines`
- **Modified endpoints:** Project creation requires `pipeline_id`. All list endpoints support `pipeline_id` filter.
- **Context propagation:** API handlers that load projects also resolve the pipeline context for downstream use.

## 9. Success Metrics

- All existing x121 functionality works identically after migration (zero regression)
- A new y122 pipeline can be created and configured entirely through DB records + admin UI
- Character import correctly validates against pipeline-specific seed slots
- Delivery export produces correctly-named files per pipeline's naming rules
- Frontend navigation cleanly separates pipeline contexts

## 10. Open Questions

1. **Seed slot metadata** — Should seed slots define validation beyond name? (e.g., minimum resolution, aspect ratio, file format constraints)
2. **Pipeline-specific prompts** — Should the prompt fragment system (PRD-32) be pipeline-scoped, or remain global?
3. **Pipeline permissions** — Should different users have access to different pipelines? (Post-MVP consideration)

## 11. Version History

- **v1.0** (2026-03-22): Initial PRD creation
