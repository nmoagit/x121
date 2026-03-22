# Task List: Pipeline Workspace Completeness

**PRD Reference:** `design/prds/139-prd-pipeline-workspace-completeness.md`
**Scope:** Complete pipeline integration across entire app — full workspace nav, pipeline-filtered listings, hardcoded removal, queue/delivery/naming/dashboard awareness.

## Overview

PRD-138 added the pipeline entity and basic scoping. This task list completes the integration: every listing, every reference, every feature becomes pipeline-aware. The codebase audit identified 20+ areas needing changes across backend repos, handlers, frontend hooks, and hardcoded string literals.

### What Already Exists
- Pipeline entity, repos, API, PipelineProvider context (PRD-138)
- `pipeline_id` columns on projects, tracks, workflows, scene_types
- Pipeline workspace layout and routing shell
- `buildPipelineNavItems()` (minimal, needs expansion)

### What We're Building
1. Full pipeline workspace navigation (all sections)
2. Dynamic pipeline list in global sidebar
3. Pipeline-filtered repos and handlers (tracks, scene types, workflows)
4. Hardcoded "clothed"/"topless" removal (6+ files)
5. Queue, delivery, naming, dashboard pipeline awareness
6. Cross-pipeline validation guards
7. ~40 pipeline-scoped routes

### Key Design Decisions
1. Pipeline nav derived from global nav — same sections, prefixed paths
2. Repos gain optional pipeline_id filter — backward compatible
3. Hardcoded slugs replaced with pipeline.seed_slots/naming_rules lookups
4. Track badge colors use deterministic hash — works for any track slug
5. Cross-pipeline validation at repo level — DB integrity over UI checks

---

## Phase 1: Sidebar & Navigation

### Task 1.1: [COMPLETE] Expand pipeline-navigation.ts with full nav structure
**File:** `apps/frontend/src/app/pipeline-navigation.ts`

Replace minimal nav with `buildPipelineNavGroups(code)` returning ALL sections (Content, Production, Review, Tools, Pipeline Admin) with prefixed paths. Use `navigation.ts` as source of truth.

**Acceptance Criteria:**
- [x] Returns `NavGroupDef[]` with Overview, Content, Production, Review, Tools, Pipeline Admin groups
- [x] Content: all 11 items (Projects, Characters, Scene Catalogue, Library, Images, Scenes, Models, Storyboard, Model Dashboard, Contact Sheet, Duplicates)
- [x] Production: all 8 items
- [x] Review: all 7 items
- [x] Tools: all 12 items
- [x] Pipeline Admin: Naming Rules, Output Profiles, Settings
- [x] All paths prefixed with `/pipelines/${code}/`
- [x] Old `buildPipelineNavItems()` removed

### Task 1.2: [COMPLETE] Dynamic pipeline list in global sidebar
**File:** `apps/frontend/src/app/Sidebar.tsx`

Add dynamic pipeline entries under the "Pipelines" group in the global sidebar.

**Acceptance Criteria:**
- [x] "Pipelines" group fetches active pipelines via `usePipelines()`
- [x] Each pipeline rendered as indented nav item with name
- [x] Clicking navigates to `/pipelines/:code/dashboard`
- [x] "All Pipelines" shown as first non-indented item
- [x] Loading state handled

### Task 1.3: [COMPLETE] Update pipeline workspace sidebar for full nav groups
**File:** `apps/frontend/src/app/Sidebar.tsx`

`PipelineSidebarContent` renders `buildPipelineNavGroups()` as collapsible groups instead of flat list.

**Acceptance Criteria:**
- [x] Renders full nav groups with section headers
- [x] Groups collapsible/expandable (matching global sidebar behavior)
- [x] Pipeline name and code at top
- [x] "Switch Pipeline" link back to `/`
- [x] Active item highlighting works

---

## Phase 2: Route Expansion

### Task 2.1: [COMPLETE] Add all pipeline-scoped routes
**File:** `apps/frontend/src/app/router.tsx`

Add route definitions under `/pipelines/$pipelineCode/` for ALL sections. Reuse existing lazy page imports.

**Acceptance Criteria:**
- [x] Content routes: scene-catalogue, library, images, scenes, models, characters, storyboard, model-dashboard, contact-sheet, duplicates
- [x] Production routes: queue, generation, test-shots, batch, delivery, checkpoints, debugger, render-timeline
- [x] Review routes: annotations, reviews, notes, production-notes, qa-gates, cinema, temporal
- [x] Tools routes: workflows, prompts, config, presets, search, branching, activity-console, model-ingest, batch-metadata, pipeline-hooks, workflow-import, undo
- [x] Pipeline admin routes: naming, output-profiles
- [x] All wrapped in PipelineWorkspaceLayout
- [x] Root-level routes kept for backward compat

---

## Phase 3: Backend Pipeline Filtering

### Task 3.1: [COMPLETE] Pipeline-filtered track repo and handler
**Files:** `apps/backend/crates/db/src/repositories/track_repo.rs`, `apps/backend/crates/api/src/handlers/track.rs`

**Acceptance Criteria:**
- [x] `TrackRepo::list()` accepts optional `pipeline_id` parameter
- [x] When provided, adds `WHERE pipeline_id = $N` clause
- [x] Track list handler accepts `pipeline_id` query param
- [x] Frontend `useTracks()` passes pipeline_id when in pipeline context

### Task 3.2: [COMPLETE] Pipeline-filtered scene type repo and handler
**Files:** `apps/backend/crates/db/src/repositories/scene_type_repo.rs`, `apps/backend/crates/api/src/handlers/scene_type.rs`

**Acceptance Criteria:**
- [x] `SceneTypeRepo::list()` accepts optional `pipeline_id` filter
- [x] `list_with_tracks()` passes pipeline filter through
- [x] `find_by_slug()` accepts optional pipeline_id to disambiguate
- [x] Scene type handlers pass pipeline filter from query params
- [x] Frontend scene catalogue hooks pass pipeline_id

### Task 3.3: [COMPLETE] Pipeline-filtered workflow repo and handler
**Files:** `apps/backend/crates/db/src/repositories/workflow_repo.rs`, `apps/backend/crates/api/src/handlers/workflow_import.rs`

**Acceptance Criteria:**
- [x] `WorkflowRepo::list()` accepts optional `pipeline_id` filter
- [x] Workflow list handler accepts `pipeline_id` query param
- [x] Frontend workflow hooks pass pipeline_id

### Task 3.4: [COMPLETE] Cross-pipeline validation in scene type track operations
**File:** `apps/backend/crates/db/src/repositories/scene_type_repo.rs`

**Acceptance Criteria:**
- [x] `add_track()` validates track's pipeline_id matches scene type's pipeline_id
- [x] `set_tracks()` validates all track_ids belong to same pipeline
- [x] Returns error if pipeline mismatch detected

---

## Phase 4: Hardcoded Reference Removal

### Task 4.1: [COMPLETE] Backend hardcoded slug removal
**Files:** Multiple backend files

**Acceptance Criteria:**
- [x] `naming_engine.rs` — Replace `Some("topless") => "topless_"` with pipeline naming_rules.prefix_rules lookup
- [x] `delivery_assembly.rs` — Replace hardcoded track ordering with pipeline seed slot order
- [x] `generation.rs` — Seed image auto-resolve uses pipeline's tracks, not hardcoded slugs

### Task 4.2: [COMPLETE] Frontend hardcoded slug removal
**Files:** Multiple frontend files

**Acceptance Criteria:**
- [x] `matchDroppedVideos.ts` — Replace `DEFAULT_TRACK_SLUG = "clothed"` with pipeline.seed_slots[0].name
- [x] `use-character-import.ts` — Replace `.clothed`/`.topless` direct access with dynamic slot names from pipeline
- [x] `TrackBadge.tsx` — Replace hardcoded color map with deterministic hash-based color function that works for any track slug
- [x] `CharacterSeedDataModal.tsx` — Already accepts dynamic slots (verify it's used correctly)

---

## Phase 5: Queue, Delivery, Dashboard

### Task 5.1: [COMPLETE] Queue manager pipeline awareness [COMPLETE]
**Files:** Backend job/queue handlers, frontend queue components

**Acceptance Criteria:**
- [x] Job list query JOINs project → pipeline to return pipeline_code
- [x] Job list handler accepts optional pipeline_id filter
- [x] Queue UI shows pipeline badge per job
- [x] Pipeline workspace queue auto-filters to that pipeline
- [x] Admin queue shows all with pipeline filter dropdown

### Task 5.2: [COMPLETE] Pipeline-scoped naming rules page [COMPLETE]
**Files:** Frontend naming rules components

**Acceptance Criteria:**
- [x] In pipeline workspace: shows that pipeline's naming_rules
- [x] Edits save to pipeline's naming_rules JSONB via update API
- [x] In admin: pipeline selector dropdown
- [x] Preview uses pipeline's rules for example filenames

### Task 5.3: [COMPLETE] Dashboard pipeline scoping [COMPLETE]
**Files:** Backend dashboard handlers, frontend dashboard

**Acceptance Criteria:**
- [x] Dashboard handlers accept optional pipeline_id filter
- [x] Pipeline workspace dashboard shows pipeline-specific stats
- [x] Active tasks, project progress scoped by pipeline
- [x] Queue status shows pipeline-specific counts

### Task 5.4: [COMPLETE] Character ingest pipeline awareness [COMPLETE]
**Files:** Backend ingest handlers, frontend seed data components

**Acceptance Criteria:**
- [x] Ingest handler loads project's pipeline for seed slot validation
- [x] Image classification uses pipeline seed slot names
- [x] Validation rejects when required seed slots missing
- [x] Clear error messages naming missing slots

---

## Relevant Files

| File | Change |
|------|--------|
| `apps/frontend/src/app/pipeline-navigation.ts` | Full nav groups |
| `apps/frontend/src/app/Sidebar.tsx` | Dynamic pipelines + full workspace nav |
| `apps/frontend/src/app/router.tsx` | ~40 pipeline-scoped routes |
| `apps/backend/crates/db/src/repositories/track_repo.rs` | pipeline_id filter |
| `apps/backend/crates/db/src/repositories/scene_type_repo.rs` | pipeline_id filter + validation |
| `apps/backend/crates/db/src/repositories/workflow_repo.rs` | pipeline_id filter |
| `apps/backend/crates/core/src/naming_engine.rs` | Remove hardcoded "topless" |
| `apps/backend/crates/api/src/background/delivery_assembly.rs` | Dynamic track ordering |
| `apps/backend/crates/api/src/handlers/generation.rs` | Dynamic seed resolve |
| `apps/frontend/src/features/characters/tabs/matchDroppedVideos.ts` | Dynamic default track |
| `apps/frontend/src/features/projects/hooks/use-character-import.ts` | Dynamic slot access |
| `apps/frontend/src/features/scene-catalogue/TrackBadge.tsx` | Hash-based colors |
| Backend job/queue handlers | Pipeline join + filter |
| Frontend queue components | Pipeline badge |
| Backend dashboard handlers | Pipeline scoping |
| Backend ingest handlers | Seed slot validation |

---

## Implementation Order

### MVP
1. Phase 1: Sidebar & Navigation (Tasks 1.1-1.3)
2. Phase 2: Route Expansion (Task 2.1)
3. Phase 3: Backend Pipeline Filtering (Tasks 3.1-3.4)
4. Phase 4: Hardcoded Reference Removal (Tasks 4.1-4.2)
5. Phase 5: Queue, Delivery, Dashboard (Tasks 5.1-5.4)

**MVP Success Criteria:**
- Pipeline workspace has 100% feature parity with global nav
- Zero hardcoded "clothed"/"topless" in codebase
- All listings filtered by pipeline
- Queue shows pipeline per job
- Naming rules configurable per pipeline

---

## Notes

1. **Phase 2 is mechanical** — ~40 routes, all using existing lazy imports. Consider a helper to reduce repetition.
2. **Phase 3 is backward compatible** — pipeline_id filters are optional. Existing global calls still work.
3. **Phase 4 is the highest-risk** — Changing naming engine and delivery assembly affects output. Test with both x121 and y122 configs.
4. **Frontend hooks** — Most hooks just need `pipeline_id` added to query params. Use `usePipelineContextSafe()` to get it without requiring pipeline context (for pages accessible both globally and within pipeline).

---

## Version History

- **v1.0** (2026-03-22): Initial task list
- **v1.1** (2026-03-22): Expanded after comprehensive codebase audit — added 20+ areas of pipeline awareness
