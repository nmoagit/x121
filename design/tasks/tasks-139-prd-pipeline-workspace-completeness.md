# Task List: Pipeline Workspace Completeness

**PRD Reference:** `design/prds/139-prd-pipeline-workspace-completeness.md`
**Scope:** Complete the pipeline workspace with full navigation, dynamic pipeline list, queue pipeline awareness, and pipeline-scoped naming rules.

## Overview

PRD-138 established the pipeline architecture but the workspace sidebar was too minimal. This task list completes the workspace by replicating the full navigation structure (Content, Production, Review, Tools, Admin) inside each pipeline, adding a dynamic pipeline list to the global sidebar, making the queue manager pipeline-aware, and scoping naming rules per pipeline.

### What Already Exists
- `navigation.ts` — Full nav config with ~60 items across 6 groups
- `pipeline-navigation.ts` — Minimal 7-item pipeline nav (needs expansion)
- `PipelineProvider` / `usePipelineContext()` — Pipeline context for workspace
- `PipelineWorkspaceLayout` — Layout wrapper for pipeline routes
- All existing page components — Can be reused within pipeline routes
- Pipeline CRUD API and sidebar with global/pipeline mode switching

### What We're Building
1. Expanded pipeline-navigation.ts with ALL nav groups from navigation.ts
2. Dynamic pipeline list in global sidebar
3. Full route tree under `/pipelines/:code/` for all sections
4. Queue manager pipeline badge and filtering
5. Pipeline-scoped naming rules page

### Key Design Decisions
1. Pipeline nav is derived from the global nav — same sections, paths prefixed with `/pipelines/:code/`
2. Existing page components are reused as-is (they read pipeline context where needed)
3. Queue shows pipeline via project → pipeline join (no new DB column needed)
4. Naming rules page has dual mode: pipeline-scoped (in workspace) and cross-pipeline (in admin)

---

## Phase 1: Sidebar & Navigation

### Task 1.1: Expand pipeline-navigation.ts with full nav structure
**File:** `apps/frontend/src/app/pipeline-navigation.ts`

Replace the minimal 7-item pipeline nav with a function that generates ALL nav groups (Content, Production, Review, Tools, Admin subset) with paths prefixed by `/pipelines/:code/`.

```typescript
export function buildPipelineNavGroups(pipelineCode: string): NavGroupDef[] {
  const base = `/pipelines/${pipelineCode}`;
  return [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", path: `${base}/dashboard`, icon: BarChart3, prominent: true },
      ],
    },
    {
      label: "Content",
      items: [
        { label: "Projects", path: `${base}/projects`, icon: FolderKanban, prominent: true },
        { label: "Characters", path: `${base}/characters`, icon: User, prominent: true },
        { label: "Scene Catalogue", path: `${base}/content/scene-catalogue`, icon: List, prominent: true },
        { label: "Library", path: `${base}/content/library`, icon: Folder, prominent: true },
        // ... all Content items from navigation.ts
      ],
    },
    {
      label: "Production",
      items: [
        { label: "Queue", path: `${base}/production/queue`, icon: Zap, prominent: true },
        // ... all Production items
      ],
    },
    // ... Review, Tools sections
    {
      label: "Pipeline Admin",
      items: [
        { label: "Naming Rules", path: `${base}/admin/naming`, icon: FileText, prominent: true },
        { label: "Output Profiles", path: `${base}/admin/output-profiles`, icon: Film, prominent: true },
        { label: "Settings", path: `${base}/settings`, icon: Settings },
      ],
    },
  ];
}
```

**Acceptance Criteria:**
- [ ] `buildPipelineNavGroups(code)` returns NavGroupDef[] with ALL sections
- [ ] Content section: all 9+ items from global nav, paths prefixed
- [ ] Production section: all 8 items, paths prefixed
- [ ] Review section: all 7 items, paths prefixed
- [ ] Tools section: all 12 items, paths prefixed
- [ ] Pipeline Admin section: Naming Rules, Output Profiles, Settings
- [ ] Old `buildPipelineNavItems()` removed or redirects to new function

### Task 1.2: Dynamic pipeline list in global sidebar
**File:** `apps/frontend/src/app/Sidebar.tsx`

In the global sidebar (outside pipeline workspace), the "Pipelines" group should dynamically fetch and list all active pipelines as indented nav items.

**Acceptance Criteria:**
- [ ] "Pipelines" group fetches active pipelines via `usePipelines()` hook
- [ ] Each pipeline rendered as an indented item with pipeline name
- [ ] Clicking navigates to `/pipelines/:code/dashboard`
- [ ] "All Pipelines" link shown as first (non-indented) item
- [ ] Loading state handled (skeleton or spinner)

### Task 1.3: Update pipeline workspace sidebar to use full nav groups
**File:** `apps/frontend/src/app/Sidebar.tsx`

The `PipelineSidebarContent` component should render `buildPipelineNavGroups()` instead of the minimal flat list.

**Acceptance Criteria:**
- [ ] Pipeline sidebar renders full nav groups (Content, Production, Review, Tools, Pipeline Admin)
- [ ] Each group collapsible/expandable (matching global sidebar behavior)
- [ ] Pipeline name and code shown at top
- [ ] "Switch Pipeline" or back arrow navigates to pipeline selector
- [ ] Active item highlighting works with prefixed paths

---

## Phase 2: Route Expansion

### Task 2.1: Add all pipeline-scoped routes
**File:** `apps/frontend/src/app/router.tsx`

Add route definitions under `/pipelines/$pipelineCode/` for ALL sections that currently exist at root level. Reuse existing lazy page imports.

**Acceptance Criteria:**
- [ ] Content routes: `/pipelines/:code/content/scene-catalogue`, `/pipelines/:code/content/library`, `/pipelines/:code/content/images`, `/pipelines/:code/content/scenes`, `/pipelines/:code/content/models`, `/pipelines/:code/content/storyboard`, `/pipelines/:code/content/model-dashboard`, `/pipelines/:code/content/contact-sheet`, `/pipelines/:code/content/duplicates`
- [ ] Production routes: `/pipelines/:code/production/queue`, `/pipelines/:code/production/generation`, `/pipelines/:code/production/test-shots`, `/pipelines/:code/production/batch`, `/pipelines/:code/production/delivery`, `/pipelines/:code/production/checkpoints`, `/pipelines/:code/production/debugger`, `/pipelines/:code/production/render-timeline`
- [ ] Review routes: `/pipelines/:code/review/annotations`, `/pipelines/:code/reviews`, `/pipelines/:code/review/notes`, `/pipelines/:code/review/production-notes`, `/pipelines/:code/review/qa-gates`, `/pipelines/:code/review/cinema`, `/pipelines/:code/review/temporal`
- [ ] Tools routes: `/pipelines/:code/tools/workflows`, `/pipelines/:code/tools/prompts`, `/pipelines/:code/tools/config`, `/pipelines/:code/tools/presets`, `/pipelines/:code/tools/search`, `/pipelines/:code/tools/branching`, `/pipelines/:code/tools/activity-console`, `/pipelines/:code/tools/model-ingest`, `/pipelines/:code/tools/batch-metadata`, `/pipelines/:code/tools/pipeline-hooks`, `/pipelines/:code/tools/workflow-import`, `/pipelines/:code/tools/undo`
- [ ] Pipeline admin routes: `/pipelines/:code/admin/naming`, `/pipelines/:code/admin/output-profiles`
- [ ] All routes use PipelineWorkspaceLayout as parent
- [ ] Existing root-level routes remain for backward compatibility

---

## Phase 3: Queue Pipeline Awareness

### Task 3.1: Add pipeline info to job API responses
**File:** `apps/backend/crates/api/src/handlers/` (job/queue handlers)

Modify job list queries to JOIN through project to get pipeline_id and pipeline_code.

**Acceptance Criteria:**
- [ ] Job list API response includes `pipeline_id` and `pipeline_code` fields
- [ ] Job list supports optional `pipeline_id` query parameter for filtering
- [ ] When filtered by pipeline_id, only jobs from that pipeline's projects are returned

### Task 3.2: Queue manager UI pipeline display
**Files:** `apps/frontend/src/features/` (queue/job components)

Add pipeline badge/tag to job cards in the queue manager.

**Acceptance Criteria:**
- [ ] Each job card shows a pipeline code badge (e.g., "x121", "y122")
- [ ] Pipeline badge uses a distinct color per pipeline
- [ ] Queue page within pipeline workspace auto-filters to that pipeline
- [ ] Admin queue page shows all pipelines with filter dropdown

---

## Phase 4: Pipeline-Scoped Naming Rules

### Task 4.1: Pipeline-aware naming rules page
**Files:** `apps/frontend/src/features/` (naming/admin components)

When the naming rules page is accessed from within a pipeline workspace, it shows and edits that pipeline's naming templates from `pipeline.naming_rules`.

**Acceptance Criteria:**
- [ ] Naming rules page detects pipeline context via `usePipelineContextSafe()`
- [ ] In pipeline context: shows/edits that pipeline's `naming_rules` from the pipeline record
- [ ] In admin context: shows pipeline selector to choose which pipeline to edit
- [ ] Save updates the pipeline's `naming_rules` JSONB via pipeline update API
- [ ] Preview shows example filenames using the pipeline's rules

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/app/pipeline-navigation.ts` | Pipeline workspace nav groups |
| `apps/frontend/src/app/Sidebar.tsx` | Sidebar with pipeline/global modes |
| `apps/frontend/src/app/navigation.ts` | Global nav config (source of truth) |
| `apps/frontend/src/app/router.tsx` | Route definitions |
| `apps/frontend/src/features/pipelines/PipelineProvider.tsx` | Pipeline context |
| Backend job handlers | Pipeline info in job responses |
| Frontend queue components | Pipeline badge display |
| Frontend naming components | Pipeline-scoped naming rules |

---

## Dependencies

### Existing Components to Reuse
- `navigation.ts` nav groups — Mirror structure in pipeline-navigation.ts
- All existing page components — Reuse via lazy imports in pipeline routes
- `usePipelineContext()` / `usePipelineContextSafe()` — Read pipeline in feature components
- `PipelineWorkspaceLayout` — Wraps all pipeline routes
- Design system Badge component — For pipeline badges in queue

### New Infrastructure Needed
- `buildPipelineNavGroups()` function generating full nav
- Pipeline-scoped routes for ~40 pages
- Job API pipeline join
- Naming rules pipeline-aware mode

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Sidebar & Navigation — Tasks 1.1-1.3
2. Phase 2: Route Expansion — Task 2.1
3. Phase 3: Queue Pipeline Awareness — Tasks 3.1-3.2
4. Phase 4: Pipeline-Scoped Naming Rules — Task 4.1

**MVP Success Criteria:**
- Pipeline workspace has complete nav matching global sidebar
- Global sidebar shows dynamic pipeline list
- Queue manager shows pipeline per job
- Naming rules configurable per pipeline

---

## Notes

1. **Route expansion is mechanical** — Task 2.1 is large but simple: duplicate existing lazy imports under pipeline-prefixed routes. Consider a helper function to reduce repetition.
2. **Page components mostly don't change** — They just need to read pipeline_id from context for API calls. Most pages that list data already accept query parameters.
3. **Queue pipeline info** — Jobs are linked to projects which have pipeline_id. The JOIN is straightforward: `jobs → scenes → projects → pipelines`.
4. **Naming rules dual mode** — Same component, different data source: pipeline's `naming_rules` JSONB vs global naming config.

---

## Version History

- **v1.0** (2026-03-22): Initial task list creation from PRD-139
