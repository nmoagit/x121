# PRD-143: Pipeline-Scoped Metadata & Speech Requirements

**Document ID:** 143-prd-pipeline-scoped-metadata-and-speech
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-23
**Last Updated:** 2026-03-23

---

## 1. Introduction/Overview

The metadata and speech systems are currently global or project-scoped, with no awareness of which pipeline they belong to. The `metadata_templates` table supports global and project-level defaults but has no `pipeline_id`. The `speech_types` table is entirely global with a single `UNIQUE(name)` constraint, meaning "Greeting" exists once for the entire platform. The `project_speech_config` table ties speech requirements to projects but has no pipeline-level defaults for projects to inherit from. There is also no formal system for managing the generator scripts that produce `metadata.json` files from `bio.json` and `tov.json` inputs.

Different pipelines have fundamentally different metadata and speech needs. The x121 adult content pipeline requires metadata fields like body type, ethnicity, and explicit content tags, while the y122 speaker pipeline needs fields like speaking style, topic expertise, and presentation format. Similarly, each pipeline defines its own set of speech types (x121 might have "Flirty" and "Whisper" while y122 needs "Introduction" and "Q&A Response"), and each pipeline's generator scripts produce different output structures.

This PRD introduces pipeline scoping for metadata templates, speech types, speech configuration, and generator script management. It establishes a 3-tier hierarchy (Global, Pipeline, Project) for metadata templates and a 2-tier hierarchy (Pipeline, Project) for speech configuration, ensuring each pipeline operates with its own independent metadata definitions, speech requirements, and generation tooling.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-138** (Multi-Pipeline Architecture) — `pipelines` table, `pipeline_id` on projects, pipeline CRUD
- **PRD-142** (Pipeline-Scoped Avatars) — avatars have explicit `pipeline_id`; metadata and speech records hang off avatars

### Extends
- **PRD-113** (Character Ingest) — `metadata_templates`, `metadata_template_fields` tables, template-driven metadata forms
- **PRD-124/PRD-136** (Speech System / Multilingual Speech) — `speech_types`, `character_speeches` (now `avatar_speeches`), `project_speech_config`, `languages`, `speech_statuses`
- **PRD-139** (Pipeline Workspace Completeness) — pipeline settings page sections, frontend pipeline context

### Conflicts With
- Global `UNIQUE(name)` constraint on `speech_types` — must be replaced with `UNIQUE(pipeline_id, name)`
- Global default template resolution — must become pipeline-aware
- `SpeechTypeRepo::find_by_name` — currently does not accept `pipeline_id`

## 3. Goals

### Primary Goals
1. **Pipeline-scoped metadata templates** with 3-tier resolution (Global -> Pipeline -> Project)
2. **Pipeline-scoped speech types** as fully independent records per pipeline
3. **Pipeline-level speech configuration** that projects inherit by default and can override
4. **Generator script management** system with pipeline assignment, versioning, and execution

### Secondary Goals
5. Backfill all existing metadata templates and speech types to the x121 pipeline
6. Pipeline settings page gains metadata, speech, and script configuration sections
7. Admin page for generator script CRUD with upload and test capabilities

## 4. User Stories

- **As a pipeline administrator**, I want to define metadata templates specific to my pipeline (e.g., x121 needs explicit-content fields, y122 needs presentation fields), so each pipeline captures the right data for its content type.
- **As a pipeline administrator**, I want to define speech types specific to my pipeline (e.g., y122 has "Introduction" and "Q&A Response" while x121 has "Flirty" and "Whisper"), so each pipeline's speech requirements match its content domain.
- **As a project manager**, I want my project to automatically inherit my pipeline's speech requirements (types, languages, min variants) without manual configuration, so setup is fast and consistent.
- **As a project manager**, I want to override specific speech requirements at the project level (e.g., require 3 variants of "Greeting" instead of the pipeline default of 1), so I can customize per-project needs.
- **As a content operator**, I want the avatar metadata form to show fields from my pipeline's template (not some other pipeline's), so I fill in the correct data.
- **As a content operator**, I want the avatar speech tab to show my pipeline's speech types (not a global list), so I record the right speeches.
- **As a platform administrator**, I want to manage generator scripts (upload, version, test, assign to pipelines), so metadata generation is pipeline-specific and auditable.
- **As a platform administrator**, I want to run a generator script for an avatar and get a `metadata.json` output from its `bio.json` and `tov.json`, so I can automate metadata production.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Add `pipeline_id` to `metadata_templates`

**Description:** Add an optional `pipeline_id` foreign key to the `metadata_templates` table, creating a 3-tier scoping model: Global (both `pipeline_id` and `project_id` are NULL), Pipeline (only `pipeline_id` set), Project (both `pipeline_id` and `project_id` set or `project_id` set alone).

**Acceptance Criteria:**
- [ ] Migration adds `pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE SET NULL` to `metadata_templates`
- [ ] Index on `pipeline_id` exists for efficient filtering
- [ ] Existing unique constraint on global default (`uq_metadata_templates_global_default`) is preserved
- [ ] New unique partial index: at most one default per pipeline (`UNIQUE ON pipeline_id WHERE pipeline_id IS NOT NULL AND project_id IS NULL AND is_default = true`)
- [ ] Backfill migration assigns existing non-global templates to x121 pipeline (via `project -> pipeline_id` join)

**Technical Notes:** The global default stays as-is (both `pipeline_id` and `project_id` NULL, `is_default = true`). A pipeline-level default has `pipeline_id` set, `project_id` NULL, `is_default = true`. A project-level default has `project_id` set and `is_default = true`.

#### Requirement 1.2: 3-Tier Metadata Template Resolution

**Description:** Update `MetadataTemplateRepo::find_default` to resolve templates in priority order: Project -> Pipeline -> Global.

**Acceptance Criteria:**
- [ ] `find_default(pool, project_id, pipeline_id)` signature updated to accept both IDs
- [ ] Resolution order: (1) project-specific default, (2) pipeline-specific default, (3) global default
- [ ] If `project_id` is provided, its `pipeline_id` is used automatically (no need to pass both)
- [ ] `MetadataTemplateRepo::list` gains optional `pipeline_id` filter
- [ ] Unit tests cover all three tiers and fallback behavior

**Technical Notes:** Query can use a single `ORDER BY` clause: `project_id IS NOT NULL DESC, pipeline_id IS NOT NULL DESC, LIMIT 1` with appropriate `WHERE` conditions.

#### Requirement 1.3: Update Metadata Template Admin UI

**Description:** Update `MetadataTemplateEditor.tsx` and the settings panel to show pipeline scope when editing or creating templates.

**Acceptance Criteria:**
- [ ] Template list shows a "Scope" column: Global, Pipeline (name), or Project (name)
- [ ] Creating a template allows selecting scope: Global, specific pipeline, or specific project
- [ ] Editing a template shows its current scope as read-only (scope cannot change after creation)
- [ ] Pipeline settings page has a "Metadata Template" section showing the pipeline's assigned template

#### Requirement 1.4: Add `pipeline_id` to `speech_types`

**Description:** Make speech types pipeline-scoped by adding a `pipeline_id` foreign key and replacing the global unique constraint with a per-pipeline unique constraint.

**Acceptance Criteria:**
- [ ] Migration adds `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE` to `speech_types`
- [ ] Backfill migration assigns all existing speech types to x121 pipeline
- [ ] Global `UNIQUE(name)` constraint dropped
- [ ] New `UNIQUE(pipeline_id, name)` constraint created
- [ ] Index on `pipeline_id` for efficient filtering
- [ ] Seed migration creates y122-specific speech types (e.g., "Introduction", "Explanation", "Q&A Response", "Summary", "Neutral")

**Technical Notes:** Because `pipeline_id` is `NOT NULL`, the backfill must run before the constraint is applied. Use a multi-step migration: (1) add nullable column, (2) backfill x121, (3) set NOT NULL, (4) drop old unique, (5) add new unique.

#### Requirement 1.5: Update `SpeechTypeRepo` for Pipeline Scope

**Description:** All speech type repository methods must accept and filter by `pipeline_id`.

**Acceptance Criteria:**
- [ ] `SpeechTypeRepo::list_all` renamed to `list_by_pipeline(pool, pipeline_id)` — returns only that pipeline's types
- [ ] `SpeechTypeRepo::find_by_name(pool, pipeline_id, name)` — scoped to pipeline
- [ ] `SpeechTypeRepo::create(pool, pipeline_id, name)` — creates within a pipeline
- [ ] `SpeechTypeRepo::find_or_create(pool, pipeline_id, name)` — scoped to pipeline
- [ ] All callers updated to pass `pipeline_id`
- [ ] Unit tests verify pipeline isolation (same name in two pipelines = two distinct records)

#### Requirement 1.6: Update Speech-Related Handlers

**Description:** All API handlers that touch speech types or avatar speeches must pass pipeline context.

**Acceptance Criteria:**
- [ ] `GET /speech-types` requires `pipeline_id` query parameter — returns only that pipeline's types
- [ ] `POST /speech-types` requires `pipeline_id` in request body
- [ ] Speech type CRUD handlers validate `pipeline_id` exists and is active
- [ ] Avatar speech creation validates that `speech_type_id` belongs to the avatar's pipeline
- [ ] Error returned if a speech type from a different pipeline is referenced

#### Requirement 1.7: Create `pipeline_speech_config` Table

**Description:** Create a new table for pipeline-level speech configuration defaults that projects inherit.

**Acceptance Criteria:**
- [ ] Table `pipeline_speech_config` with columns: `id BIGSERIAL`, `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE`, `speech_type_id SMALLINT NOT NULL REFERENCES speech_types(id) ON DELETE CASCADE`, `language_id SMALLINT NOT NULL REFERENCES languages(id) ON DELETE CASCADE`, `min_variants INT NOT NULL DEFAULT 1`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- [ ] Unique constraint on `(pipeline_id, speech_type_id, language_id)`
- [ ] Index on `pipeline_id`
- [ ] Seed data: x121 pipeline gets speech config for all current speech types in English with `min_variants = 1`

**Technical Notes:** This table mirrors `project_speech_config` but at pipeline scope. The schema is intentionally identical (minus swapping `project_id` for `pipeline_id`) to keep the pattern consistent.

#### Requirement 1.8: Pipeline Speech Config Resolution

**Description:** Update speech config resolution so projects inherit pipeline defaults and can override them.

**Acceptance Criteria:**
- [ ] `GET /projects/{id}/speech-config` returns merged config: pipeline defaults + project overrides
- [ ] Project-level entries override pipeline-level entries for the same `(speech_type_id, language_id)` pair
- [ ] If no project config exists for a `(type, language)` pair, pipeline default is used
- [ ] Response clearly indicates which entries are inherited vs overridden (e.g., `source: "pipeline"` or `source: "project"`)
- [ ] `PipelineSpeechConfigRepo` CRUD: `list_by_pipeline`, `upsert`, `delete`

#### Requirement 1.9: Pipeline Speech Config API

**Description:** CRUD endpoints for managing pipeline-level speech configuration.

**Acceptance Criteria:**
- [ ] `GET /pipelines/{id}/speech-config` — lists all speech config entries for the pipeline
- [ ] `PUT /pipelines/{id}/speech-config` — bulk upsert speech config (array of `{speech_type_id, language_id, min_variants}`)
- [ ] `DELETE /pipelines/{id}/speech-config/{config_id}` — removes a single config entry
- [ ] Validation: `speech_type_id` must belong to the same pipeline
- [ ] Validation: `language_id` must be a valid language
- [ ] Admin role required for all endpoints

#### Requirement 1.10: Pipeline Metadata Template API

**Description:** Endpoints for viewing and assigning the pipeline's metadata template.

**Acceptance Criteria:**
- [ ] `GET /pipelines/{id}/metadata-template` — returns the pipeline's default metadata template (or null if only global default exists)
- [ ] `PUT /pipelines/{id}/metadata-template` — assigns a template as the pipeline's default (sets `is_default = true, pipeline_id = {id}` on the template)
- [ ] Only one default template per pipeline (existing default is unset when a new one is assigned)
- [ ] Admin role required

#### Requirement 1.11: Create `pipeline_generator_scripts` Table

**Description:** Create a table for managing metadata generator scripts that are assigned to pipelines.

**Acceptance Criteria:**
- [ ] Table `pipeline_generator_scripts` with columns: `id BIGSERIAL PRIMARY KEY`, `uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE`, `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `description TEXT`, `script_type TEXT NOT NULL CHECK (script_type IN ('python', 'javascript', 'shell'))`, `script_content TEXT NOT NULL`, `version INT NOT NULL DEFAULT 1`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- [ ] Unique constraint on `(pipeline_id, name, version)`
- [ ] Index on `pipeline_id`
- [ ] `updated_at` trigger
- [ ] Only one active script per pipeline per name: `UNIQUE ON (pipeline_id, name) WHERE is_active = true`

**Technical Notes:** `script_content` stores the full script text. For MVP, scripts are stored in the database. Post-MVP could move to filesystem storage with path references.

#### Requirement 1.12: Generator Script CRUD API

**Description:** Admin endpoints for managing generator scripts.

**Acceptance Criteria:**
- [ ] `GET /admin/generator-scripts` — lists all scripts, filterable by `pipeline_id`
- [ ] `GET /admin/generator-scripts/{id}` — returns script with full content
- [ ] `POST /admin/generator-scripts` — creates a new script (requires `pipeline_id`, `name`, `script_type`, `script_content`)
- [ ] `PUT /admin/generator-scripts/{id}` — updates script content (increments version automatically)
- [ ] `DELETE /admin/generator-scripts/{id}` — soft-deletes script (sets `is_active = false`)
- [ ] Validation: `pipeline_id` must reference an active pipeline
- [ ] Admin role required for all endpoints

#### Requirement 1.13: Generator Script Execution API

**Description:** Endpoint to execute a generator script for a specific avatar, producing metadata output.

**Acceptance Criteria:**
- [ ] `POST /admin/generator-scripts/{id}/execute` with body `{ avatar_id }` — runs the script
- [ ] Script receives avatar's `bio.json` and `tov.json` content as input
- [ ] Script output (generated `metadata.json`) is stored via the existing `metadata_generations` tracking table
- [ ] Execution is synchronous for MVP (scripts are expected to be fast, < 5 seconds)
- [ ] Response includes: generated metadata JSON, script version used, execution duration
- [ ] Error handling: script timeout (30s max), script errors returned with stderr output
- [ ] Validation: avatar must belong to the same pipeline as the script

**Technical Notes:** For MVP, use `std::process::Command` to execute scripts. Python scripts run via the system Python interpreter. Input is passed as temporary files or stdin JSON. Post-MVP can use sandboxed execution.

#### Requirement 1.14: Update Avatar Metadata Tab

**Description:** Update `AvatarMetadataTab.tsx` to resolve the metadata template from the avatar's pipeline context.

**Acceptance Criteria:**
- [ ] Template resolution uses the avatar's `pipeline_id` (from the avatar record or pipeline context)
- [ ] Falls back through 3-tier hierarchy: project template -> pipeline template -> global template
- [ ] Template fields displayed match the resolved template (not a hardcoded global template)
- [ ] If the pipeline has a different template than global, the pipeline template's fields are shown

#### Requirement 1.15: Update Avatar Speech Tab

**Description:** Update `AvatarSpeechTab.tsx` to show only the pipeline's speech types.

**Acceptance Criteria:**
- [ ] Speech type dropdown/selector only shows types belonging to the avatar's pipeline
- [ ] Creating a new speech entry validates the type belongs to the pipeline
- [ ] Speech config requirements shown are merged (pipeline defaults + project overrides)
- [ ] Progress indicators reflect the merged config (e.g., "2/3 Greeting variants recorded")

#### Requirement 1.16: Pipeline Settings — Metadata Section

**Description:** Add a metadata template configuration section to the pipeline settings page.

**Acceptance Criteria:**
- [ ] Section titled "Metadata Template" appears on the pipeline settings page
- [ ] Displays the currently assigned template name, field count, and version
- [ ] "Change Template" button opens a modal to select from available templates
- [ ] "Create New" button allows creating a new pipeline-specific template inline
- [ ] Pattern matches existing pipeline settings sections (seed slots, import rules, delivery config)

#### Requirement 1.17: Pipeline Settings — Speech Config Section

**Description:** Add a speech configuration section to the pipeline settings page.

**Acceptance Criteria:**
- [ ] Section titled "Speech Requirements" appears on the pipeline settings page
- [ ] Displays a grid/table of speech types x languages x min_variants for this pipeline
- [ ] Add/remove speech type rows (from this pipeline's speech types)
- [ ] Add/remove language columns (from global languages list)
- [ ] Edit `min_variants` per cell
- [ ] Save button persists to `pipeline_speech_config`

#### Requirement 1.18: Pipeline Settings — Generator Script Section

**Description:** Add a generator script section to the pipeline settings page.

**Acceptance Criteria:**
- [ ] Section titled "Generator Script" appears on the pipeline settings page
- [ ] Displays the active script name, type, version, and last-updated date
- [ ] "Manage Scripts" link navigates to the dedicated admin script management page
- [ ] If no script is assigned, shows an empty state with a link to create one

#### Requirement 1.19: Admin Script Management Page

**Description:** Dedicated admin page for managing generator scripts across all pipelines.

**Acceptance Criteria:**
- [ ] Route: `/admin/generator-scripts`
- [ ] Lists all scripts with columns: name, pipeline, script type, version, status (active/inactive), updated date
- [ ] Filterable by pipeline
- [ ] Create script: form with name, pipeline selector, script type dropdown, code editor textarea
- [ ] Edit script: opens the script with a code editor textarea, saving increments version
- [ ] Deactivate/activate toggle
- [ ] "Test" button: runs the script with a selected avatar and shows output in a preview panel

#### Requirement 1.20: Project Speech Config UI Update

**Description:** Update the project speech configuration UI to show pipeline defaults as the baseline.

**Acceptance Criteria:**
- [ ] Project speech config UI shows inherited pipeline defaults with visual distinction (e.g., dimmed rows, "inherited" badge)
- [ ] Overridden values are shown in full contrast with an "overridden" badge
- [ ] "Reset to pipeline default" action removes the project-level override for a given type/language
- [ ] Adding a new entry only allows selecting from the pipeline's speech types (not all global types)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Script Testing Sandbox

**Description:** Isolated execution environment for testing scripts with sample data before activating them.

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Script Version Rollback

**Description:** Ability to rollback to a previous script version with one-click revert.

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Cross-Pipeline Template Comparison

**Description:** Side-by-side view comparing metadata templates across pipelines to identify field gaps.

#### **[OPTIONAL - Post-MVP]** Requirement 2.4: Speech Type Bulk Copy Between Pipelines

**Description:** Copy a set of speech types from one pipeline to another with a single action.

## 6. Non-Functional Requirements

### Performance
- Metadata template resolution (3-tier) must complete in < 50ms
- Speech type listing by pipeline must complete in < 20ms
- Generator script execution timeout: 30 seconds maximum
- Pipeline speech config merge (pipeline + project) must complete in < 50ms

### Security
- Generator script execution runs with minimal OS permissions (no network access, no filesystem writes outside temp directory)
- Script content is stored as plain text — no executable binaries allowed
- Admin role required for all script management and pipeline config endpoints
- Pipeline isolation enforced at query level — no cross-pipeline data leakage in any response

## 7. Non-Goals (Out of Scope)

- **Changing the `languages` table** — languages remain global and shared across all pipelines
- **Changing the `speech_statuses` table** — statuses remain global (draft, approved, rejected)
- **Cross-pipeline metadata sharing** — templates are not shared or linked across pipelines; if two pipelines need the same template, create separate copies
- **Automatic script migration** — scripts are not automatically copied when creating a new pipeline
- **Real-time script execution** — no WebSocket-based live output streaming for generator scripts in MVP
- **Script marketplace or library** — no central repository of reusable scripts across pipelines
- **Changing `avatar_speeches` / `character_speeches` schema** — the speech records table is untouched; pipeline scoping flows through `speech_types.pipeline_id` and avatar's `pipeline_id`
- **Changing `avatar_metadata_versions` schema** — metadata versioning/approval workflow is unchanged; pipeline scoping flows through template resolution

## 8. Design Considerations

### Pipeline Settings Page Layout
The pipeline settings page (`/admin/pipelines/$pipelineId`) already has sections for seed slots, import rules, and delivery config. Three new sections are added:
- **Metadata Template** — below existing sections, same card-with-modal pattern
- **Speech Requirements** — grid/table editor similar to the naming rules matrix pattern
- **Generator Script** — summary card with link to dedicated admin page

### Admin Script Management Page
- Route: `/admin/generator-scripts`
- Split-pane layout: script list on left, editor on right
- Code editor uses a `<textarea>` with monospace font for MVP (post-MVP: CodeMirror integration)
- Test output panel below the editor

### Visual Hierarchy for Inherited vs Overridden Config
- Pipeline defaults shown with reduced opacity (0.6) and "Inherited" badge
- Project overrides shown at full opacity with "Overridden" badge
- "Reset" icon button next to overridden values to revert to pipeline default

## 9. Technical Considerations

### Existing Code to Reuse
- `MetadataTemplateRepo` (`crates/db/src/repositories/metadata_template_repo.rs`) — extend with `pipeline_id` filtering
- `SpeechTypeRepo` (`crates/db/src/repositories/speech_type_repo.rs`) — refactor to accept `pipeline_id`
- `MetadataTemplateEditor.tsx` (`apps/frontend/src/features/settings/components/`) — extend for pipeline scope selector
- `AvatarMetadataTab.tsx` (`apps/frontend/src/features/avatars/tabs/`) — update template resolution
- `AvatarSpeechTab.tsx` (`apps/frontend/src/features/avatars/tabs/`) — update type filtering
- `PipelineSettingsPage.tsx` (`apps/frontend/src/features/pipelines/`) — add new sections
- `usePipelineContextSafe()` hook — pipeline context for frontend components
- `pipeline_scoped_key()` from `core::storage` — storage path construction
- Pipeline settings card/modal pattern from PRD-141 (`ImportRulesEditor`)
- `TERMINAL_PANEL` / `TERMINAL_HEADER` UI classes for consistent section styling

### New Infrastructure
- `PipelineGeneratorScriptRepo` — new repository for the `pipeline_generator_scripts` table
- `PipelineSpeechConfigRepo` — new repository for `pipeline_speech_config`
- Script execution service in `core` crate — `std::process::Command` runner with timeout, temp file management, output capture
- Admin generator scripts page — new frontend feature module

### Database Changes

| Table | Change |
|-------|--------|
| `metadata_templates` | Add `pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE SET NULL`, add index, add unique partial index for pipeline default |
| `speech_types` | Add `pipeline_id BIGINT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE`, drop `UNIQUE(name)`, add `UNIQUE(pipeline_id, name)`, add index |
| `project_speech_config` | No schema change; resolution logic updated to merge with pipeline defaults |
| **NEW:** `pipeline_speech_config` | `id BIGSERIAL`, `pipeline_id BIGINT NOT NULL`, `speech_type_id SMALLINT NOT NULL`, `language_id SMALLINT NOT NULL`, `min_variants INT NOT NULL DEFAULT 1`, `created_at TIMESTAMPTZ`; unique on `(pipeline_id, speech_type_id, language_id)` |
| **NEW:** `pipeline_generator_scripts` | `id BIGSERIAL`, `uuid UUID`, `pipeline_id BIGINT NOT NULL`, `name TEXT NOT NULL`, `description TEXT`, `script_type TEXT NOT NULL`, `script_content TEXT NOT NULL`, `version INT NOT NULL DEFAULT 1`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`; unique on `(pipeline_id, name, version)`, unique partial on `(pipeline_id, name) WHERE is_active = true` |

All new tables follow the project's ID strategy: `BIGSERIAL id` for internal use. The `pipeline_generator_scripts` table also has a `uuid UUID` column for external API references, per conventions.

### API Changes

| Endpoint | Method | Change |
|----------|--------|--------|
| `/api/v1/metadata-templates` | GET | Add optional `pipeline_id` query param for filtering |
| `/api/v1/metadata-templates/default` | GET | Add optional `pipeline_id` param; resolution becomes 3-tier |
| `/api/v1/speech-types` | GET | Add required `pipeline_id` query param |
| `/api/v1/speech-types` | POST | Add required `pipeline_id` in body |
| `/api/v1/projects/{id}/speech-config` | GET | Response includes merged pipeline + project config with `source` field |
| `/api/v1/pipelines/{id}/speech-config` | GET | **NEW** — list pipeline speech config |
| `/api/v1/pipelines/{id}/speech-config` | PUT | **NEW** — bulk upsert pipeline speech config |
| `/api/v1/pipelines/{id}/speech-config/{config_id}` | DELETE | **NEW** — delete single config entry |
| `/api/v1/pipelines/{id}/metadata-template` | GET | **NEW** — get pipeline's default template |
| `/api/v1/pipelines/{id}/metadata-template` | PUT | **NEW** — assign default template |
| `/api/v1/admin/generator-scripts` | GET | **NEW** — list scripts, filterable by pipeline_id |
| `/api/v1/admin/generator-scripts/{id}` | GET | **NEW** — get script with content |
| `/api/v1/admin/generator-scripts` | POST | **NEW** — create script |
| `/api/v1/admin/generator-scripts/{id}` | PUT | **NEW** — update script (auto-increment version) |
| `/api/v1/admin/generator-scripts/{id}` | DELETE | **NEW** — soft-delete (deactivate) |
| `/api/v1/admin/generator-scripts/{id}/execute` | POST | **NEW** — run script for an avatar |

### Migration Strategy

The migration must be executed in a specific order:
1. Add nullable `pipeline_id` to `metadata_templates`
2. Backfill `metadata_templates.pipeline_id` from `project_id -> projects.pipeline_id` join; assign orphans to x121
3. Add nullable `pipeline_id` to `speech_types`
4. Backfill all existing `speech_types` to x121 pipeline
5. Set `speech_types.pipeline_id` to `NOT NULL`
6. Drop `UNIQUE(name)` on `speech_types`, create `UNIQUE(pipeline_id, name)`
7. Seed y122-specific speech types
8. Create `pipeline_speech_config` table
9. Seed x121 pipeline speech config from existing project patterns
10. Create `pipeline_generator_scripts` table

## 10. Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| No pipeline template, no global template | Return error: "No metadata template configured for this pipeline" |
| Pipeline template deleted while avatars reference it | Fallback to global template; log warning |
| Speech type deleted that has existing avatar speeches | `ON DELETE RESTRICT` prevents deletion; return error explaining referenced speeches must be reassigned first (change from CASCADE to RESTRICT on `avatar_speeches.speech_type_id`) |
| Generator script references a Python module not installed | Script execution returns stderr output with "ModuleNotFoundError" and HTTP 422 |
| Generator script exceeds 30s timeout | Process killed, HTTP 408 returned with "Script execution timed out" |
| Avatar's `bio.json` or `tov.json` missing when running generator | HTTP 422 with specific message indicating which input file is missing |
| Creating a speech type with a name that exists in another pipeline | Allowed — names are unique per pipeline, not globally |
| Project has speech config overrides, then pipeline config is deleted | Project overrides remain; inherited entries disappear from merged view |
| Script `is_active` set to false while pipeline references it | Pipeline settings shows "No active script" state; execution endpoint returns 404 |
| Two pipelines reference same global metadata template | Both see the same global default; each can override with a pipeline-specific template |

## 11. Success Metrics

- **Template resolution correctness**: 100% of metadata forms show the correct pipeline-scoped template fields
- **Speech type isolation**: Zero cross-pipeline speech type leakage in any API response
- **Config inheritance accuracy**: Project speech config correctly merges pipeline defaults in all test cases
- **Script execution reliability**: Generator scripts complete within timeout for 95% of executions
- **Migration safety**: Zero data loss during backfill of existing templates and speech types to x121
- **Admin workflow completeness**: Scripts can be created, edited, tested, and assigned without leaving the admin UI

## 12. Testing Requirements

### Unit Tests
- `MetadataTemplateRepo::find_default` — test all three tiers and every fallback combination
- `SpeechTypeRepo::list_by_pipeline` — verify isolation between pipelines
- `SpeechTypeRepo::create` — verify same name allowed in different pipelines, duplicate name rejected in same pipeline
- `PipelineSpeechConfigRepo` — CRUD operations, unique constraint enforcement
- `PipelineGeneratorScriptRepo` — CRUD, version increment, active uniqueness
- Speech config merge logic — pipeline defaults + project overrides, various overlap patterns

### Integration Tests
- Create metadata templates at global, pipeline, and project levels; verify resolution returns correct tier
- Create speech types for two pipelines with overlapping names; verify API returns only requested pipeline's types
- Configure pipeline speech defaults; create project; verify project inherits pipeline config
- Override one config entry at project level; verify merged response shows override + inherited entries
- Upload a generator script, execute it for an avatar, verify output stored in `metadata_generations`
- Execute script with missing input files; verify appropriate error response
- Execute script that times out; verify 408 response and process termination

### Frontend Tests
- Avatar metadata tab renders correct template fields for pipeline context
- Avatar speech tab shows only pipeline-scoped speech types
- Project speech config UI distinguishes inherited vs overridden entries
- Pipeline settings page renders all three new sections
- Script management page CRUD flow works end-to-end

## 13. Open Questions

None. All architectural decisions have been confirmed.

## 14. Version History

- **v1.0** (2026-03-23): Initial PRD creation
