# PRD-139: Pipeline Workspace Completeness

## 1. Introduction / Overview

PRD-138 established pipelines as a top-level entity with isolated workspaces. However, the pipeline workspace sidebar only contains a minimal subset of navigation items (7 items). The full platform navigation has ~60 items across Content, Production, Review, Tools, and Admin sections. This PRD completes the pipeline workspace by:

1. Replicating the full navigation structure inside each pipeline workspace
2. Adding a dynamic pipeline list in the global sidebar
3. Making pipeline-crossing features (queue manager, naming rules) pipeline-aware
4. Ensuring the Content section is fully pipeline-scoped

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-138** (Multi-Pipeline Architecture) — Pipeline entity, routing, PipelineProvider

### Extends
- **PRD-116** (Dynamic Naming Engine) — Naming rules become pipeline-scoped
- **PRD-07/08** (Job Queue) — Queue shows pipeline context per job

## 3. Goals

1. Pipeline workspace sidebar contains ALL navigation sections (Content, Production, Review, Tools, Admin) with paths scoped to the pipeline
2. Global sidebar shows a dynamic list of pipelines under a "Pipelines" group
3. Queue manager displays which pipeline each job belongs to and supports pipeline filtering
4. Naming rules admin page is pipeline-scoped (different rules per pipeline)
5. Content section (characters, scene types, library) is fully pipeline-scoped

## 4. User Stories

- **As an operator**, when I enter a pipeline workspace, I want to see ALL the tools I had before (queue, workflows, prompts, review, etc.) — not a stripped-down version.
- **As an admin**, I want to see all pipelines listed in the sidebar so I can quickly switch between them.
- **As a production manager**, I want the queue manager to show which pipeline each job belongs to, so I can track work across pipelines.
- **As an admin**, I want to configure naming rules per pipeline, so x121 and y122 deliverables use different naming conventions.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Dynamic Pipeline List in Global Sidebar

**Description:** The global sidebar (outside pipeline workspace) shows a "Pipelines" group with dynamically loaded pipeline entries.

**Acceptance Criteria:**
- [ ] "Pipelines" section in global sidebar fetches active pipelines via API
- [ ] Each pipeline shown as an indented nav item with pipeline name
- [ ] Clicking a pipeline navigates to `/pipelines/:code/dashboard`
- [ ] "All Pipelines" link at the top navigates to the pipeline selector page

#### Requirement 1.2: Full Navigation in Pipeline Workspace

**Description:** The pipeline workspace sidebar replicates ALL sections from the global navigation (Content, Production, Review, Tools) with paths scoped to `/pipelines/:code/`.

**Acceptance Criteria:**
- [ ] Content section: Projects, Characters, Scene Catalogue, Library, Images, Scenes, Models, Storyboard, Model Dashboard, Contact Sheet, Duplicates
- [ ] Production section: Queue, Generation, Test Shots, Batch, Delivery, Checkpoints, Debugger, Render Timeline
- [ ] Review section: Annotations, Reviews, Notes, Production Notes, QA Gates, Cinema, Temporal
- [ ] Tools section: Workflows, Prompts, Config, Presets, Search, Branching, Activity Console, Model Ingest, Batch Metadata, Pipeline Hooks, Import Workflow, Undo Tree
- [ ] Admin section available within pipeline (Naming Rules, Output Profiles, Settings — pipeline-scoped)
- [ ] All paths prefixed with `/pipelines/:code/`
- [ ] Pipeline name and "Switch Pipeline" link shown at top of sidebar

#### Requirement 1.3: Pipeline-Scoped Routing for All Sections

**Description:** Add routes under `/pipelines/:code/` for all sections that were previously at the root level.

**Acceptance Criteria:**
- [ ] All Content routes available under `/pipelines/:code/content/...`
- [ ] All Production routes available under `/pipelines/:code/production/...`
- [ ] All Review routes available under `/pipelines/:code/review/...`
- [ ] All Tools routes available under `/pipelines/:code/tools/...`
- [ ] Pipeline-scoped admin routes: `/pipelines/:code/admin/naming`, `/pipelines/:code/admin/output-profiles`
- [ ] Existing root-level routes remain for backward compatibility

#### Requirement 1.4: Queue Manager Pipeline Awareness

**Description:** The queue manager and job list show which pipeline each job belongs to and support filtering by pipeline.

**Acceptance Criteria:**
- [ ] Job list API returns `pipeline_id` and `pipeline_code` for each job
- [ ] Queue manager UI shows a pipeline badge/tag on each job card
- [ ] Queue manager supports filtering by pipeline (dropdown or tabs)
- [ ] When viewed within a pipeline workspace, auto-filters to that pipeline
- [ ] Cross-pipeline queue view available in admin area

#### Requirement 1.5: Pipeline-Scoped Naming Rules

**Description:** The naming rules admin page operates per-pipeline when accessed from within a pipeline workspace.

**Acceptance Criteria:**
- [ ] Naming rules page within a pipeline shows that pipeline's naming templates
- [ ] Changes to naming rules are saved to the pipeline's `naming_rules` JSONB column
- [ ] Admin-level naming rules page shows a pipeline selector for cross-pipeline management
- [ ] Different pipelines can have completely different naming templates

## 6. Non-Goals (Out of Scope)

- Pipeline-specific worker pools (future enhancement)
- Pipeline-specific user permissions (future enhancement)
- Cross-pipeline analytics dashboard (future enhancement)

## 7. Design Considerations

### Pipeline Workspace Sidebar
The sidebar inside a pipeline workspace should look identical to the current global sidebar in terms of sections and items — the only difference is that all paths are prefixed with `/pipelines/:code/` and pipeline-scoped API calls filter by `pipeline_id`.

### Queue Manager
When accessed from `/pipelines/x121/production/queue`, the queue auto-filters to x121 jobs. When accessed from `/admin/queue`, it shows all jobs with a pipeline column/badge.

## 8. Technical Considerations

### Existing Code to Reuse
- `navigation.ts` — Full nav group definitions, reuse for pipeline workspace
- `buildPipelineNavItems()` — Extend to include all sections
- `PipelineProvider` / `usePipelineContext()` — Already provides pipeline data
- Existing page components — Wrapped with pipeline context, no changes needed to most pages

### New Infrastructure Needed
- Extended `pipeline-navigation.ts` with ALL nav groups
- Pipeline-scoped route tree for all sections
- Job model gains pipeline fields for queue display
- Naming rules page pipeline-aware mode

### Database Changes
- Jobs table may need `pipeline_id` if not already present (check via project → pipeline chain)

### API Changes
- Job list endpoint returns pipeline info (join through project)
- Naming rules endpoint supports pipeline-scoped operations

## 9. Success Metrics

- Pipeline workspace has feature parity with the global navigation
- Queue manager clearly shows pipeline context for every job
- Naming rules are independently configurable per pipeline

## 10. Open Questions

None — requirements are clear from user feedback.

## 11. Version History

- **v1.0** (2026-03-22): Initial PRD creation based on user feedback on PRD-138 implementation
