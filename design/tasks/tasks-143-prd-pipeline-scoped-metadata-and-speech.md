# Task List: Pipeline-Scoped Metadata & Speech Requirements

**PRD Reference:** `design/prds/143-prd-pipeline-scoped-metadata-and-speech.md`
**Scope:** Make metadata templates, speech types, speech config, and generator scripts pipeline-specific with proper hierarchy, admin UI, and execution capabilities.

## Overview

This implementation adds pipeline scoping to four subsystems: metadata templates (3-tier: Global → Pipeline → Project), speech types (pipeline-scoped records), speech config (pipeline defaults + project overrides), and generator scripts (new CRUD + execution system). The migration backfills existing data to x121, seeds y122-specific types, and creates two new tables. Backend work updates repos/handlers for pipeline filtering, and frontend adds three new sections to pipeline settings plus a dedicated admin page for scripts.

### What Already Exists
- `metadata_templates` + `metadata_template_fields` tables — extend with `pipeline_id`
- `speech_types` table — add `pipeline_id`, replace unique constraint
- `project_speech_config` table — resolution logic changes, no schema change
- `MetadataTemplateRepo` — extend `find_default` and `list` with pipeline filter
- `SpeechTypeRepo` — refactor all methods to accept `pipeline_id`
- `MetadataTemplateEditor.tsx` — extend for pipeline scope display
- `AvatarMetadataTab.tsx` / `AvatarSpeechTab.tsx` — update template/type resolution
- Pipeline settings page — add three new card sections (matches existing pattern)

### What We're Building
1. Migration adding `pipeline_id` to 2 tables + creating 2 new tables + backfill/seed
2. 3-tier metadata template resolution
3. Pipeline-scoped speech type repo + handlers
4. `pipeline_speech_config` table + merged resolution
5. `pipeline_generator_scripts` table + CRUD + execution service
6. Pipeline settings sections (metadata, speech, scripts)
7. Admin script management page
8. Updated avatar metadata/speech tabs

### Key Design Decisions
1. Metadata templates use nullable `pipeline_id` (null = global) for 3-tier hierarchy
2. Speech types use `NOT NULL pipeline_id` — every type belongs to exactly one pipeline
3. Generator scripts stored as text in DB (not filesystem) for MVP
4. Script execution via `std::process::Command` with 30s timeout

---

## Phase 1: Database Migrations

### Task 1.1: Add `pipeline_id` to `metadata_templates` and backfill
**File:** `apps/db/migrations/20260324100001_add_pipeline_id_to_metadata_templates.sql`

```sql
-- Add nullable pipeline_id
ALTER TABLE metadata_templates ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE SET NULL;

-- Backfill from project's pipeline
UPDATE metadata_templates mt SET pipeline_id = p.pipeline_id
FROM projects p WHERE mt.project_id = p.id AND mt.pipeline_id IS NULL;

-- Index for efficient filtering
CREATE INDEX idx_metadata_templates_pipeline_id ON metadata_templates(pipeline_id);

-- Unique partial index: at most one default per pipeline
CREATE UNIQUE INDEX uq_metadata_templates_pipeline_default
ON metadata_templates(pipeline_id) WHERE pipeline_id IS NOT NULL AND project_id IS NULL AND is_default = true;
```

**Acceptance Criteria:**
- [ ] `pipeline_id` column added (nullable for global defaults)
- [ ] Backfill correctly resolves pipeline from project
- [ ] Index and unique partial index created
- [ ] Existing global default constraint preserved
- [ ] Migration applies cleanly

### Task 1.2: Add `pipeline_id` to `speech_types`, replace unique constraint, seed y122
**File:** `apps/db/migrations/20260324100002_pipeline_scope_speech_types.sql`

```sql
-- Step 1: Add nullable column
ALTER TABLE speech_types ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE CASCADE;

-- Step 2: Backfill all existing to x121
UPDATE speech_types SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');

-- Step 3: Set NOT NULL
ALTER TABLE speech_types ALTER COLUMN pipeline_id SET NOT NULL;

-- Step 4: Drop global unique, add pipeline-scoped unique
DROP INDEX IF EXISTS speech_types_name_key;
CREATE UNIQUE INDEX uq_speech_types_pipeline_name ON speech_types(pipeline_id, name);

-- Step 5: Index
CREATE INDEX idx_speech_types_pipeline_id ON speech_types(pipeline_id);

-- Step 6: Seed y122 speech types
INSERT INTO speech_types (name, sort_order, pipeline_id)
SELECT v.name, v.sort, p.id
FROM pipelines p,
     (VALUES
       ('Introduction', 1),
       ('Explanation', 2),
       ('Q&A Response', 3),
       ('Summary', 4),
       ('Neutral', 5)
     ) AS v(name, sort)
WHERE p.code = 'y122'
ON CONFLICT DO NOTHING;
```

**Acceptance Criteria:**
- [ ] All existing speech types assigned to x121
- [ ] `pipeline_id` is NOT NULL after backfill
- [ ] Old `UNIQUE(name)` dropped, new `UNIQUE(pipeline_id, name)` created
- [ ] y122 gets 5 speech types seeded
- [ ] Migration applies cleanly

### Task 1.3: Create `pipeline_speech_config` table and seed
**File:** `apps/db/migrations/20260324100003_create_pipeline_speech_config.sql`

```sql
CREATE TABLE pipeline_speech_config (
    id BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    speech_type_id SMALLINT NOT NULL REFERENCES speech_types(id) ON DELETE CASCADE,
    language_id SMALLINT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    min_variants INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pipeline_id, speech_type_id, language_id)
);

CREATE INDEX idx_pipeline_speech_config_pipeline ON pipeline_speech_config(pipeline_id);

-- Seed x121: all current speech types × English × min_variants=1
INSERT INTO pipeline_speech_config (pipeline_id, speech_type_id, language_id, min_variants)
SELECT p.id, st.id, l.id, 1
FROM pipelines p
CROSS JOIN speech_types st
CROSS JOIN languages l
WHERE p.code = 'x121' AND st.pipeline_id = p.id AND l.code = 'en'
ON CONFLICT DO NOTHING;
```

**Acceptance Criteria:**
- [ ] Table created with correct schema and constraints
- [ ] x121 seeded with all speech types × English
- [ ] Unique constraint on `(pipeline_id, speech_type_id, language_id)`

### Task 1.4: Create `pipeline_generator_scripts` table
**File:** `apps/db/migrations/20260324100004_create_pipeline_generator_scripts.sql`

```sql
CREATE TABLE pipeline_generator_scripts (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    pipeline_id BIGINT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    script_type TEXT NOT NULL CHECK (script_type IN ('python', 'javascript', 'shell')),
    script_content TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_generator_scripts_pipeline_name_version
ON pipeline_generator_scripts(pipeline_id, name, version);

CREATE UNIQUE INDEX uq_generator_scripts_pipeline_name_active
ON pipeline_generator_scripts(pipeline_id, name) WHERE is_active = true;

CREATE INDEX idx_generator_scripts_pipeline ON pipeline_generator_scripts(pipeline_id);

CREATE TRIGGER trg_generator_scripts_updated_at
BEFORE UPDATE ON pipeline_generator_scripts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table created with all columns and constraints
- [ ] Unique version constraint and unique active constraint
- [ ] `updated_at` trigger
- [ ] Migration applies cleanly

---

## Phase 2: Backend — Metadata Template Pipeline Scoping [COMPLETE]

### Task 2.1: Update `MetadataTemplate` model [COMPLETE]
**File:** `apps/backend/crates/db/src/models/metadata_template.rs`

Add `pipeline_id: Option<DbId>` to `MetadataTemplate`, `CreateMetadataTemplate`, and update COLUMNS.

**Acceptance Criteria:**
- [x] `MetadataTemplate` struct has `pub pipeline_id: Option<DbId>`
- [x] `CreateMetadataTemplate` has `pub pipeline_id: Option<DbId>`
- [x] COLUMNS constant updated
- [x] `cargo check` passes

### Task 2.2: Update `MetadataTemplateRepo` for 3-tier resolution [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/metadata_template_repo.rs`

Update `find_default` to accept `pipeline_id` and resolve: Project → Pipeline → Global. Update `list` to accept optional `pipeline_id` filter.

**Acceptance Criteria:**
- [x] `find_default(pool, project_id, pipeline_id)` resolves 3-tier hierarchy
- [x] `list(pool, project_id, pipeline_id)` filters by pipeline when provided
- [x] Create query includes `pipeline_id` bind
- [x] `cargo check` passes

### Task 2.3: Update metadata template handlers [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/metadata_template.rs`

Accept `pipeline_id` query param on list/default endpoints. Auto-resolve pipeline from project when not provided.

**Acceptance Criteria:**
- [x] `GET /metadata-templates` accepts `pipeline_id` query param
- [x] `GET /metadata-templates/default` resolves through 3-tier hierarchy
- [x] `POST /metadata-templates` accepts `pipeline_id` in body
- [x] `cargo check` passes

### Task 2.4: Pipeline metadata template API [COMPLETE]
**Files:** `apps/backend/crates/api/src/handlers/pipelines.rs`, `apps/backend/crates/api/src/routes/pipelines.rs`

Add `GET/PUT /pipelines/{id}/metadata-template` endpoints.

**Acceptance Criteria:**
- [x] `GET` returns the pipeline's default template (or null)
- [x] `PUT` assigns a template as pipeline default
- [x] Only one default per pipeline enforced
- [x] `cargo check` passes

---

## Phase 3: Backend — Speech Types & Config Pipeline Scoping [COMPLETE]

### Task 3.1: Update `SpeechType` model [COMPLETE]
**File:** `apps/backend/crates/db/src/models/speech_type.rs`

Add `pipeline_id: DbId` to the struct and COLUMNS.

**Acceptance Criteria:**
- [x] `SpeechType` has `pub pipeline_id: DbId`
- [x] `CreateSpeechType` includes `pipeline_id` — N/A, no CreateSpeechType DTO exists; create method accepts pipeline_id directly
- [x] COLUMNS updated
- [x] `cargo check` passes

### Task 3.2: Refactor `SpeechTypeRepo` for pipeline scope [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/speech_type_repo.rs`

Added `list_by_pipeline(pipeline_id)`. Updated `find_by_name`, `create`, `find_or_create` to require `pipeline_id`. Retained `list_all` for backward compatibility.

**Acceptance Criteria:**
- [x] `list_by_pipeline(pool, pipeline_id)` returns only that pipeline's types
- [x] `find_by_name(pool, pipeline_id, name)` scoped
- [x] `create(pool, pipeline_id, name)` scoped
- [x] `find_or_create(pool, pipeline_id, name)` scoped
- [x] All callers updated (speech_type.rs, avatar_speech.rs, project_speech_import.rs)
- [x] `cargo check` passes

### Task 3.3: Update speech-related handlers [COMPLETE]
**Files:** `apps/backend/crates/api/src/handlers/speech_type.rs`, `apps/backend/crates/api/src/handlers/avatar_speech.rs`

Require `pipeline_id` on speech type endpoints. Avatar speech import resolves pipeline from avatar's project.

**Acceptance Criteria:**
- [x] `GET /speech-types` accepts `pipeline_id` query param (optional, filters when provided)
- [x] `POST /speech-types` requires `pipeline_id` in body
- [x] Avatar speech import resolves pipeline from avatar's project for type creation
- [x] `cargo check` passes

### Task 3.4: Create `PipelineSpeechConfig` model and repo [COMPLETE]
**Files:** `apps/backend/crates/db/src/models/pipeline_speech_config.rs`, `apps/backend/crates/db/src/repositories/pipeline_speech_config_repo.rs`

New model and repo for pipeline-level speech config.

**Acceptance Criteria:**
- [x] `PipelineSpeechConfig` struct with all fields
- [x] `PipelineSpeechConfigRepo::list_by_pipeline(pool, pipeline_id)`
- [x] `PipelineSpeechConfigRepo::bulk_upsert(pool, pipeline_id, entries)`
- [x] `PipelineSpeechConfigRepo::delete(pool, id)`
- [x] Registered in `mod.rs`
- [x] `cargo check` passes

### Task 3.5: Merged speech config resolution [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/project_speech_config_repo.rs`

Updated `get_or_default` to merge pipeline defaults with project overrides.

**Implementation Note:** The `source` field was not added to the response struct because the existing `ProjectSpeechConfig` model is used for both project and pipeline-derived entries. The resolution logic checks pipeline config first, then falls back to generating defaults. The frontend can determine source by comparing project config entries against pipeline defaults.

**Acceptance Criteria:**
- [x] `GET /projects/{id}/speech-config` returns merged config
- [ ] Each entry has `source: "pipeline"` or `source: "project"` — deferred to frontend phase
- [x] Project entries override pipeline entries for same `(type_id, language_id)`
- [x] Missing project entries filled from pipeline defaults
- [x] `cargo check` passes

### Task 3.6: Pipeline speech config API [COMPLETE]
**Files:** `apps/backend/crates/api/src/handlers/pipeline_speech_config.rs`, `apps/backend/crates/api/src/routes/pipelines.rs`

CRUD endpoints for pipeline speech config.

**Acceptance Criteria:**
- [x] `GET /pipelines/{id}/speech-config` lists config
- [x] `PUT /pipelines/{id}/speech-config` bulk upserts
- [x] `DELETE /pipelines/{id}/speech-config/{config_id}` removes entry
- [x] Validates speech_type_id belongs to same pipeline
- [x] Routes registered
- [x] `cargo check` passes

---

## Phase 4: Backend — Generator Script System [COMPLETE]

### Task 4.1: Create `PipelineGeneratorScript` model and repo [COMPLETE]
**Files:** `apps/backend/crates/db/src/models/pipeline_generator_script.rs`, `apps/backend/crates/db/src/repositories/pipeline_generator_script_repo.rs`

**Acceptance Criteria:**
- [x] `PipelineGeneratorScript` struct with all fields
- [x] `CreatePipelineGeneratorScript` and `UpdatePipelineGeneratorScript` DTOs
- [x] CRUD methods: `create`, `find_by_id`, `find_by_uuid`, `list(pipeline_id)`, `update` (auto-increments version), `deactivate`
- [x] `find_active_for_pipeline(pool, pipeline_id, name)` method
- [x] Registered in `mod.rs`
- [x] `cargo check` passes

### Task 4.2: Generator script CRUD handlers [COMPLETE]
**Files:** `apps/backend/crates/api/src/handlers/generator_script.rs`, `apps/backend/crates/api/src/routes/generator_scripts.rs`

**Acceptance Criteria:**
- [x] `GET /admin/generator-scripts` — list with optional `pipeline_id` filter
- [x] `GET /admin/generator-scripts/{id}` — get with full content
- [x] `POST /admin/generator-scripts` — create
- [x] `PUT /admin/generator-scripts/{id}` — update (version increments)
- [x] `DELETE /admin/generator-scripts/{id}` — soft delete (deactivate)
- [x] Routes registered under `/admin/generator-scripts`
- [x] `cargo check` passes

### Task 4.3: Script execution service [COMPLETE]
**File:** `apps/backend/crates/core/src/script_executor.rs`

Execute scripts via `std::process::Command` with timeout, temp file I/O, and output capture.

**Implementation Note:** Added `tempfile` as a regular dependency to `x121-core` and `uuid` to `x121-db`. Script runs in `spawn_blocking` to avoid blocking the async runtime. Uses polling-based timeout via `try_wait` loop.

**Acceptance Criteria:**
- [x] `execute_script(script_type, script_content, input_json) -> Result<ScriptOutput>`
- [x] Python scripts run via `python3 <temp_file> <input_file>`
- [x] Input JSON passed as temp file path (first CLI arg)
- [x] 30-second timeout with process kill
- [x] Captures stdout (output) and stderr (errors)
- [x] Returns `ScriptOutput { output_json, stderr, duration_ms }`
- [ ] Unit tests for timeout and basic execution — deferred to test phase

### Task 4.4: Script execution handler [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/generator_script.rs`

**Implementation Note:** Output is not stored in `metadata_generations` table because that table tracks file-based metadata generation tracking, not script output. The handler returns the output directly. Storage can be added when the metadata generation workflow is formalized.

**Acceptance Criteria:**
- [x] `POST /admin/generator-scripts/{id}/execute` with `{ avatar_id }`
- [x] Loads avatar's metadata from DB
- [x] Passes to script executor
- [ ] Stores output in `metadata_generations` table — deferred (different table schema)
- [x] Returns generated JSON, script version, duration
- [x] Validates avatar belongs to same pipeline as script
- [x] Error handling for missing inputs, timeout, script errors
- [x] `cargo check` passes

---

## Phase 5: Frontend — Pipeline Settings Sections [COMPLETE]

### Task 5.1: Metadata Template section on pipeline settings [COMPLETE]
**File:** `apps/frontend/src/features/pipelines/PipelineSettingsPage.tsx`

Add a read-only card showing the pipeline's assigned metadata template, with modal to change/create.

**Implementation Note:** Created `use-pipeline-settings.ts` hooks for metadata template, speech config, and generator scripts. The modal uses a select dropdown to pick from existing templates (from `useMetadataTemplates`).

**Acceptance Criteria:**
- [x] "Metadata Template" card shows template name, field count, version
- [x] Click opens modal to select or create template
- [x] Uses same card/modal pattern as other settings sections
- [x] `size="sm"` inputs in modal
- [x] `npx tsc --noEmit` passes (from `apps/frontend`)

### Task 5.2: Speech Requirements section on pipeline settings [COMPLETE]
**File:** `apps/frontend/src/features/pipelines/PipelineSettingsPage.tsx`

Add a section showing pipeline speech types × languages × min_variants grid.

**Implementation Note:** Reuses the same matrix grid pattern from `SpeechRequirementsEditor`. The grid is embedded directly in the modal to keep it self-contained. Speech types are fetched with `useSpeechTypes(pipelineId)` for pipeline scoping.

**Acceptance Criteria:**
- [x] "Speech Requirements" card shows summary (N types, M languages)
- [x] Click opens modal with editable grid
- [x] Can add/remove speech type rows and language columns
- [x] Edit `min_variants` per cell
- [x] Save persists to `PUT /pipelines/{id}/speech-config`
- [x] `npx tsc --noEmit` passes

### Task 5.3: Generator Script section on pipeline settings [COMPLETE]
**File:** `apps/frontend/src/features/pipelines/PipelineSettingsPage.tsx`

Summary card showing active script with link to admin page.

**Acceptance Criteria:**
- [x] "Generator Script" card shows script name, type, version, last updated
- [x] "Manage Scripts" link navigates to `/admin/generator-scripts`
- [x] Empty state when no script assigned
- [x] `npx tsc --noEmit` passes

---

## Phase 6: Frontend — Avatar & Project Updates [COMPLETE]

### Task 6.1: Update `AvatarMetadataTab` for pipeline template resolution [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarMetadataTab.tsx`

**Implementation Note:** No frontend changes needed. The backend `GET /avatars/{id}/metadata/template` already resolves through the 3-tier hierarchy (project → pipeline → global) as implemented in Phase 2. The frontend simply calls `useMetadataTemplate(avatarId)` which delegates to the backend.

**Acceptance Criteria:**
- [x] Template resolved using avatar's pipeline context (via project → pipeline)
- [x] Falls through 3-tier: project → pipeline → global
- [x] Correct fields displayed for the resolved template
- [x] `npx tsc --noEmit` passes

### Task 6.2: Update `AvatarSpeechTab` for pipeline-scoped types [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarSpeechTab.tsx`

**Implementation Note:** Added `useProject(projectId)` to resolve `pipeline_id`, then pass it to `useSpeechTypes(pipelineId)` for pipeline-scoped type filtering.

**Acceptance Criteria:**
- [x] Speech type selector only shows types from avatar's pipeline
- [x] Speech hooks pass `pipeline_id` to API
- [x] Progress indicators use merged config (pipeline + project)
- [x] `npx tsc --noEmit` passes

### Task 6.3: Update speech type hooks [COMPLETE]
**File:** `apps/frontend/src/features/avatars/hooks/use-avatar-speeches.ts`

**Implementation Note:** `useSpeechTypes` now accepts optional `pipelineId` parameter. Query key includes `pipelineId` when provided for cache isolation. Also updated `SpeechType` interface to include `pipeline_id` field.

**Acceptance Criteria:**
- [x] `useSpeechTypes(pipelineId)` passes `pipeline_id` to API
- [x] Query key includes `pipelineId` for cache isolation
- [x] `npx tsc --noEmit` passes

### Task 6.4: Update project speech config UI [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/SpeechRequirementsEditor.tsx`

**Implementation Note:** Added optional `pipelineConfig` prop. When provided, cells show "inherited" (dimmed text) or "overridden" (amber badge with reset button) indicators. Also updated `ProjectConfigTab` to pass pipeline speech config and pipeline-scoped speech types.

**Acceptance Criteria:**
- [x] Shows pipeline defaults as inherited (dimmed, "inherited" badge)
- [x] Project overrides at full contrast with "overridden" badge
- [x] "Reset to pipeline default" action removes override
- [x] Speech type selector limited to pipeline's types
- [x] `npx tsc --noEmit` passes

---

## Phase 7: Frontend — Admin Script Management Page [COMPLETE]

### Task 7.1: Create script management hooks [COMPLETE]
**File:** `apps/frontend/src/features/generator-scripts/hooks/use-generator-scripts.ts`

**Acceptance Criteria:**
- [x] `useGeneratorScripts(pipelineId?)` — list with optional filter
- [x] `useGeneratorScript(id)` — single script detail
- [x] `useCreateScript()` — mutation
- [x] `useUpdateScript()` — mutation (version auto-increments)
- [x] `useDeleteScript()` — mutation (deactivate)
- [x] `useExecuteScript()` — mutation returning output
- [x] Query key factory
- [x] `npx tsc --noEmit` passes

### Task 7.2: Create admin script management page [COMPLETE]
**Files:** `apps/frontend/src/features/generator-scripts/GeneratorScriptsPage.tsx`, `apps/frontend/src/app/pages/GeneratorScriptsPage.tsx`

**Implementation Note:** Route registered at `/admin/generator-scripts`, nav item added to Admin group. Activate/deactivate is handled via the delete button which soft-deletes (deactivates). Create uses a 2xl modal with pipeline selector, script type dropdown, and code textarea. Edit modal shows version info and auto-increments on save.

**Acceptance Criteria:**
- [x] Route `/admin/generator-scripts` registered in router
- [x] Nav item added to Admin group
- [x] Script list with columns: name, pipeline, type, version, status, updated
- [x] Pipeline filter
- [x] Create form: name, pipeline selector, script type, code textarea
- [x] Edit: code textarea, save increments version
- [x] Activate/deactivate toggle
- [x] Test button: select avatar, run script, show output in preview panel
- [x] Uses terminal design system (TERMINAL_PANEL, monospace, `size="sm"` inputs)
- [x] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260324100001_*.sql` | Add pipeline_id to metadata_templates |
| `apps/db/migrations/20260324100002_*.sql` | Pipeline-scope speech_types + seed y122 |
| `apps/db/migrations/20260324100003_*.sql` | Create pipeline_speech_config |
| `apps/db/migrations/20260324100004_*.sql` | Create pipeline_generator_scripts |
| `apps/backend/crates/db/src/models/metadata_template.rs` | Add pipeline_id to model |
| `apps/backend/crates/db/src/models/speech_type.rs` | Add pipeline_id to model |
| `apps/backend/crates/db/src/models/pipeline_speech_config.rs` | NEW model |
| `apps/backend/crates/db/src/models/pipeline_generator_script.rs` | NEW model |
| `apps/backend/crates/db/src/repositories/metadata_template_repo.rs` | 3-tier resolution |
| `apps/backend/crates/db/src/repositories/speech_type_repo.rs` | Pipeline-scoped methods |
| `apps/backend/crates/db/src/repositories/pipeline_speech_config_repo.rs` | NEW repo |
| `apps/backend/crates/db/src/repositories/pipeline_generator_script_repo.rs` | NEW repo |
| `apps/backend/crates/db/src/repositories/project_speech_config_repo.rs` | Merged resolution |
| `apps/backend/crates/api/src/handlers/metadata_template.rs` | Pipeline filtering |
| `apps/backend/crates/api/src/handlers/speech_type.rs` | Pipeline-scoped endpoints |
| `apps/backend/crates/api/src/handlers/pipeline_speech_config.rs` | NEW handler |
| `apps/backend/crates/api/src/handlers/generator_script.rs` | NEW handler + execution |
| `apps/backend/crates/core/src/script_executor.rs` | NEW execution service |
| `apps/frontend/src/features/pipelines/PipelineSettingsPage.tsx` | 3 new sections |
| `apps/frontend/src/features/avatars/tabs/AvatarMetadataTab.tsx` | Pipeline template resolution |
| `apps/frontend/src/features/avatars/tabs/AvatarSpeechTab.tsx` | Pipeline-scoped types |
| `apps/frontend/src/features/avatars/hooks/use-avatar-speeches.ts` | Pipeline-aware hooks |
| `apps/frontend/src/features/generator-scripts/` | NEW feature module |
| `apps/frontend/src/app/pages/GeneratorScriptsPage.tsx` | NEW admin page |

---

## Dependencies

### Existing Components to Reuse
- `MetadataTemplateRepo` — extend with pipeline_id
- `SpeechTypeRepo` — refactor for pipeline scope
- `ProjectSpeechConfigRepo` — extend resolution logic
- `PipelineSettingsPage.tsx` card/modal pattern
- `usePipelineContextSafe()` hook
- `TERMINAL_PANEL` / `TERMINAL_HEADER` UI classes
- Pipeline settings card/modal pattern from import rules editor

### New Infrastructure Needed
- `PipelineSpeechConfigRepo` — new repository
- `PipelineGeneratorScriptRepo` — new repository
- `script_executor.rs` — script execution with `std::process::Command`
- `generator-scripts` frontend feature module
- Admin page route + nav item

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1-1.4
2. Phase 2: Metadata Template Scoping — Tasks 2.1-2.4
3. Phase 3: Speech Types & Config — Tasks 3.1-3.6
4. Phase 4: Generator Scripts — Tasks 4.1-4.4
5. Phase 5: Pipeline Settings UI — Tasks 5.1-5.3
6. Phase 6: Avatar & Project Updates — Tasks 6.1-6.4
7. Phase 7: Admin Script Page — Tasks 7.1-7.2

**MVP Success Criteria:**
- Metadata templates resolve through Global → Pipeline → Project hierarchy
- Speech types fully isolated per pipeline
- Pipeline speech config inherited by projects with override capability
- Generator scripts uploadable, executable, and producing metadata.json
- All UI shows pipeline-scoped data only

### Post-MVP Enhancements
- Script testing sandbox
- Script version rollback
- Cross-pipeline template comparison
- Speech type bulk copy between pipelines

---

## Notes

1. **Migration ordering is critical:** Phase 1 must complete before Phase 2-3 (models require columns). Run `sqlx migrate run` first.
2. **Speech type backfill must happen before NOT NULL:** The migration is multi-step — add nullable, backfill, set NOT NULL.
3. **`list_all` callers:** Renaming `SpeechTypeRepo::list_all` → `list_by_pipeline` will break every caller. Identify all call sites before starting Task 3.2.
4. **Script execution security:** For MVP, scripts run with the server process's permissions. Post-MVP should sandbox execution (chroot, containers, or WASM).
5. **Merged config response format:** The project speech config response gains a `source` field. Frontend TypeScript types need updating.

---

## Version History

- **v1.0** (2026-03-23): Initial task list creation from PRD-143
