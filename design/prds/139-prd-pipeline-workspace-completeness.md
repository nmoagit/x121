# PRD-139: Pipeline Workspace Completeness

## 1. Introduction / Overview

PRD-138 established pipelines as a top-level entity with isolated workspaces. However, the pipeline workspace sidebar only contains a minimal subset of navigation items, and many backend services still operate globally without pipeline awareness. This PRD completes the pipeline integration by:

1. Replicating the full navigation structure inside each pipeline workspace
2. Adding a dynamic pipeline list in the global sidebar
3. Making ALL entity listings pipeline-aware (tracks, scene types, workflows, prompts)
4. Removing hardcoded "clothed"/"topless" references in favor of pipeline seed slots
5. Making queue, delivery, naming, and dashboard pipeline-aware
6. Adding cross-pipeline validation (scene types can only reference tracks from the same pipeline)

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-138** (Multi-Pipeline Architecture) — Pipeline entity, routing, PipelineProvider

### Extends
- **PRD-111** (Track System) — Tracks become pipeline-filtered in all queries
- **PRD-116** (Dynamic Naming Engine) — Naming rules read from pipeline config
- **PRD-123** (Scene Type Unification) — Scene types pipeline-filtered
- **PRD-75** (Workflow Management) — Workflows pipeline-filtered
- **PRD-113** (Character Ingest) — Seed validation uses pipeline seed slots
- **PRD-07/08** (Job Queue) — Queue shows pipeline context

## 3. Goals

1. Pipeline workspace has full feature parity with the global navigation
2. Every entity listing (tracks, scene types, workflows, prompts) filters by pipeline
3. Zero hardcoded "clothed"/"topless" references — all dynamic from pipeline seed slots
4. Queue, delivery, dashboard, and naming are all pipeline-aware
5. Cross-pipeline data integrity — scene types can only reference tracks from the same pipeline

## 4. User Stories

- **As an operator**, when I enter a pipeline workspace, I want the full toolset (queue, workflows, prompts, review, delivery) — not a stripped-down subset.
- **As an admin**, I want to see all pipelines in the sidebar and switch between them quickly.
- **As a production manager**, I want the queue to show which pipeline each job belongs to.
- **As a content operator**, I want track listings to only show tracks relevant to my pipeline.
- **As an admin**, I want naming rules configurable per pipeline with different templates.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Dynamic Pipeline List in Global Sidebar

**Description:** The global sidebar shows a "Pipelines" group with dynamically loaded pipeline entries.

**Acceptance Criteria:**
- [ ] "Pipelines" section fetches active pipelines via API
- [ ] Each pipeline shown as an indented nav item
- [ ] Clicking navigates to `/pipelines/:code/dashboard`

#### Requirement 1.2: Full Navigation in Pipeline Workspace

**Description:** Pipeline workspace sidebar replicates ALL sections (Content, Production, Review, Tools, Pipeline Admin) with paths scoped to `/pipelines/:code/`.

**Acceptance Criteria:**
- [ ] Content section: Projects, Characters, Scene Catalogue, Library, Images, Scenes, Models, Storyboard, Model Dashboard, Contact Sheet, Duplicates
- [ ] Production section: Queue, Generation, Test Shots, Batch, Delivery, Checkpoints, Debugger, Render Timeline
- [ ] Review section: Annotations, Reviews, Notes, Production Notes, QA Gates, Cinema, Temporal
- [ ] Tools section: Workflows, Prompts, Config, Presets, Search, Activity Console, Model Ingest, Batch Metadata, Pipeline Hooks, Import Workflow, Undo Tree
- [ ] Pipeline Admin: Naming Rules, Output Profiles, Settings
- [ ] Pipeline name and "Switch Pipeline" link at top

#### Requirement 1.3: Pipeline-Scoped Routes for All Sections

**Description:** Add routes under `/pipelines/:code/` for all sections.

**Acceptance Criteria:**
- [ ] All Content, Production, Review, Tools routes duplicated under pipeline prefix
- [ ] Pipeline admin routes: naming, output-profiles
- [ ] All use PipelineWorkspaceLayout as parent
- [ ] Root-level routes remain for backward compatibility

#### Requirement 1.4: Pipeline-Filtered Track Listings

**Description:** Track API and frontend only show tracks belonging to the current pipeline.

**Acceptance Criteria:**
- [ ] `TrackRepo::list()` accepts optional `pipeline_id` filter
- [ ] Track list handler accepts `pipeline_id` query param
- [ ] Frontend `useTracks()` passes pipeline_id from context
- [ ] Scene catalogue track matrix filtered by pipeline

#### Requirement 1.5: Pipeline-Filtered Scene Type Listings

**Description:** Scene type queries filter by pipeline.

**Acceptance Criteria:**
- [ ] `SceneTypeRepo::list()` and `list_with_tracks()` accept pipeline_id filter
- [ ] Scene type handlers pass pipeline filter
- [ ] Frontend scene catalogue scoped to pipeline
- [ ] `find_by_slug()` validates pipeline context to avoid cross-pipeline matches

#### Requirement 1.6: Pipeline-Filtered Workflow Listings

**Description:** Workflow queries filter by pipeline.

**Acceptance Criteria:**
- [ ] `WorkflowRepo::list()` accepts pipeline_id filter
- [ ] Workflow list/import handlers pass pipeline filter
- [ ] Frontend workflow pages scoped to pipeline

#### Requirement 1.7: Remove Hardcoded Track Slug References

**Description:** Replace all hardcoded "clothed"/"topless" string literals with dynamic pipeline seed slot lookups.

**Acceptance Criteria:**
- [ ] `naming_engine.rs` — Replace hardcoded "topless" prefix check with pipeline naming rules
- [ ] `delivery_assembly.rs` — Replace hardcoded track ordering assumptions with pipeline config
- [ ] `matchDroppedVideos.ts` — Replace `DEFAULT_TRACK_SLUG = "clothed"` with pipeline seed slot
- [ ] `use-character-import.ts` — Replace `charAssignment.clothed`/`.topless` with dynamic slots
- [ ] `TrackBadge.tsx` — Replace hardcoded color mapping with dynamic colors
- [ ] `generation.rs` — Seed image auto-resolve uses pipeline tracks, not hardcoded slugs

#### Requirement 1.8: Queue Manager Pipeline Awareness

**Description:** Queue/job list shows pipeline info and supports filtering.

**Acceptance Criteria:**
- [ ] Job list API returns pipeline_code via project → pipeline join
- [ ] Queue manager UI shows pipeline badge per job
- [ ] Pipeline workspace queue auto-filters to that pipeline
- [ ] Admin queue shows all pipelines with filter

#### Requirement 1.9: Pipeline-Scoped Naming Rules

**Description:** Naming rules admin page operates per-pipeline.

**Acceptance Criteria:**
- [ ] In pipeline workspace: shows/edits that pipeline's naming_rules
- [ ] In admin context: pipeline selector for cross-pipeline management
- [ ] Save updates pipeline's naming_rules JSONB

#### Requirement 1.10: Dashboard Pipeline Scoping

**Description:** Dashboard stats scope to the current pipeline.

**Acceptance Criteria:**
- [ ] Pipeline workspace dashboard shows stats for that pipeline only
- [ ] Active tasks, project progress filtered by pipeline_id
- [ ] Queue status shows pipeline-specific counts

#### Requirement 1.11: Cross-Pipeline Validation

**Description:** Prevent scene types from referencing tracks belonging to a different pipeline.

**Acceptance Criteria:**
- [ ] `add_track()` on scene type validates track's pipeline_id matches scene type's pipeline_id
- [ ] `set_tracks()` validates all track_ids belong to same pipeline
- [ ] Character ingest validates seed images against pipeline seed slots
- [ ] Prompt overrides validated against pipeline-scoped scene types

#### Requirement 1.12: Character Ingest Pipeline Awareness

**Description:** Character ingest validates seed images against pipeline's seed slot requirements.

**Acceptance Criteria:**
- [ ] Ingest handler loads project's pipeline to get seed slots
- [ ] Image classification uses pipeline seed slot names
- [ ] Validation rejects when required seed slots are missing
- [ ] Frontend CharacterSeedDataModal loads slots from pipeline context

## 6. Non-Goals (Out of Scope)

- Pipeline-specific user permissions
- Pipeline-specific worker pools
- Output format profiles becoming pipeline-scoped (they remain global — different pipelines can share output formats)

## 7. Design Considerations

### Sidebar Layout (Pipeline Workspace)
Identical section structure to global nav. The only differences:
- All paths prefixed with `/pipelines/:code/`
- Pipeline name/code at top with "Switch Pipeline" link
- Pipeline Admin section replaces global Admin (subset of admin items relevant within a pipeline)

### Global Admin Area
Admin pages at `/admin/*` remain cross-pipeline. They include:
- Pipeline management (CRUD pipelines)
- Infrastructure, Cloud GPUs, Workers, Hardware (shared resources)
- Audit, Sessions, Backups (system-wide)

### Track Badge Colors
Replace hardcoded clothed=sky/topless=pink with a deterministic color function based on track slug hash, so any track gets a consistent color.

## 8. Technical Considerations

### Existing Code to Reuse
- `navigation.ts` — Full nav group definitions as source of truth
- `buildPipelineNavGroups()` — Extend to mirror all groups
- `PipelineProvider` / `usePipelineContext()` — Already provides pipeline data
- All existing page components — Reused via lazy imports

### Database Changes
- None — pipeline_id already exists on all tables from PRD-138
- Queries need WHERE clauses added, not schema changes

### API Changes
- Track, scene type, workflow list endpoints gain `pipeline_id` query param
- Job list endpoint returns pipeline_code (JOIN through project)
- Dashboard endpoints accept pipeline_id scope

### Hardcoded Reference Removal
| File | Hardcoded | Replace With |
|------|-----------|-------------|
| `naming_engine.rs:331` | `"topless"` check | pipeline.naming_rules.prefix_rules |
| `delivery_assembly.rs:240` | track ordering | pipeline seed slot order |
| `matchDroppedVideos.ts:22` | `"clothed"` default | pipeline.seed_slots[0].name |
| `use-character-import.ts:871` | `.clothed`/`.topless` | dynamic slot names |
| `TrackBadge.tsx:20` | color map | hash-based color function |
| `generation.rs:161` | track assumption | pipeline track lookup |

## 9. Success Metrics

- Pipeline workspace has 100% feature parity with global navigation
- Zero remaining hardcoded "clothed"/"topless" references in codebase
- Queue manager clearly shows pipeline per job
- Each pipeline can have independently configured naming rules

## 10. Open Questions

None — requirements derived directly from codebase audit.

## 11. Version History

- **v1.0** (2026-03-22): Initial PRD creation
- **v1.1** (2026-03-22): Expanded scope based on comprehensive codebase audit — added hardcoded reference removal, cross-pipeline validation, character ingest awareness, dashboard scoping
