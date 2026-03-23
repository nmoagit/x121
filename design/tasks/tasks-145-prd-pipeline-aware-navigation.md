# Task List: Pipeline-Aware Navigation [COMPLETE]

**PRD Reference:** `design/prds/145-prd-pipeline-aware-navigation.md`
**Scope:** Replace all hardcoded project/avatar paths with pipeline-aware helper hooks so navigation stays within the pipeline workspace.

## Overview

All internal links to projects and avatars currently hardcode `/projects/${id}/avatars/${avatarId}`, dropping pipeline context. We replace these with `useAvatarPath()` and `useProjectPath()` hooks that prepend `/pipelines/{code}` when inside a pipeline workspace. The hooks already exist at `src/hooks/usePipelinePath.ts` — this task list is purely wiring them into all call sites.

### What Already Exists
- `usePipelinePath.ts` — `usePipelinePrefix()`, `useAvatarPath()`, `useProjectPath()` hooks (already created)
- `usePipelineContextSafe()` — pipeline context detection
- TanStack Router `<Link>` component — used throughout

### What We're Building
1. Wire `useAvatarPath()` into all avatar link sites (~15 call sites)
2. Wire `useProjectPath()` into all project link sites (~8 call sites)
3. Fix remaining breadcrumbs
4. Final audit to catch any missed hardcoded paths

### Key Design Decisions
1. Hooks return builder functions: `avatarPath(projectId, avatarId, extra?)` — called at render time with dynamic IDs
2. When pipeline context is null (global routes), prefix is empty — global paths still work
3. `navigate()` calls use the hook's output, `<Link to>` props use it too

---

## Phase 1: Avatar Links [COMPLETE]

### Task 1.1: Update AvatarCard navigation [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/AvatarCard.tsx`

Replace all `navigate({ to: \`/projects/${projectId}/avatars/${avatarId}\` })` calls with `useAvatarPath()`.

**Acceptance Criteria:**
- [x] Import `useAvatarPath` from `@/hooks/usePipelinePath`
- [x] Call `const avatarPath = useAvatarPath()` in `BlockingReasonIcon` component
- [x] Call `const avatarPath = useAvatarPath()` in `AvatarCard` component — N/A, AvatarCard gets `onClick` from parent
- [x] Replace all ~4 `navigate({ to: \`/projects/...\` })` with `navigate({ to: avatarPath(projectId, avatarId) })` — 2 in BlockingReasonIcon (onClick + onKeyDown)
- [x] Replace `onClick` link with `to: avatarPath(...)` and pass `search` params separately
- [x] TypeScript passes

**Implementation Note:** AvatarCard itself receives `onClick` as a prop (navigation handled by parent — ProjectAvatarsTab). Only `BlockingReasonIcon` subcomponent had hardcoded paths.

### Task 1.2: Update AvatarDeliverablesGrid links [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/AvatarDeliverablesGrid.tsx`

Replace all ~8 hardcoded avatar path references.

**Acceptance Criteria:**
- [x] Import `useAvatarPath` from `@/hooks/usePipelinePath`
- [x] Replace all `to: \`/projects/${projectId}/avatars/${row.id}\`` with `avatarPath(projectId, row.id)`
- [x] Replace all `to: "/projects/$projectId/avatars/$avatarId"` param-style links with dynamic `avatarPath()` calls
- [x] Handle links that include `?tab=` search params
- [x] TypeScript passes

**Implementation Note:** Updated DeliverableRow, ReadinessTab, MatrixTab (navigateToCell + model name button). All 3 sub-components got their own `useAvatarPath()` calls.

### Task 1.3: Update ReadinessIndicators links [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/ReadinessIndicators.tsx`

**Acceptance Criteria:**
- [x] Import and use `useAvatarPath`
- [x] Replace `to: \`/projects/${projectId}/avatars/${avatarId}\`` with `avatarPath(...)`
- [x] TypeScript passes

### Task 1.4: Update ActiveTasksWidget links [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/widgets/ActiveTasksWidget.tsx`

Already partially done — verify and fix if needed.

**Acceptance Criteria:**
- [x] Avatar links use pipeline-aware paths — N/A, no avatar/project navigation links exist in this widget
- [x] Pipeline code from task data used for prefix when available — N/A
- [x] TypeScript passes

**Implementation Note:** ActiveTasksWidget displays task rows with status but does not link to project/avatar detail pages. No changes needed.

---

## Phase 2: Project Links [COMPLETE]

### Task 2.1: Update ProjectCard links [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/ProjectCard.tsx`

**Acceptance Criteria:**
- [x] Import `useProjectPath` from `@/hooks/usePipelinePath` — N/A, navigation handled by parent
- [x] Replace hardcoded project path with `projectPath(project.id)` — N/A
- [x] TypeScript passes

**Implementation Note:** ProjectCard receives `onClick` as a prop from ProjectListPage. Navigation is handled in the parent, which was updated in Task 2.2.

### Task 2.2: Update ProjectListPage links [COMPLETE]
**File:** `apps/frontend/src/features/projects/ProjectListPage.tsx`

**Acceptance Criteria:**
- [x] Import `useProjectPath`
- [x] Replace project detail links with `projectPath(id)`
- [x] TypeScript passes

### Task 2.3: Update ProjectProgressWidget links [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/widgets/ProjectProgressWidget.tsx`

**Acceptance Criteria:**
- [x] Import `usePipelinePrefix`
- [x] Replace "Projects" header link with `withPrefix("/projects")`
- [x] TypeScript passes

**Implementation Note:** Widget only has a header "Projects" link, no per-project detail links. Used `usePipelinePrefix` instead of `useProjectPath`.

---

## Phase 3: Breadcrumbs & Audit [COMPLETE]

### Task 3.1: Fix AvatarDetailPage breadcrumb [COMPLETE]
**File:** `apps/frontend/src/features/avatars/AvatarDetailPage.tsx`

**Acceptance Criteria:**
- [x] Breadcrumb "Back to project" link uses `useProjectPath()`
- [x] Breadcrumb "Projects" link uses `usePipelinePrefix()`
- [x] No raw `<a href>` tags for internal navigation
- [x] TypeScript passes

**Implementation Note:** Also updated: setActiveTab, navigateToAvatar, handleDelete navigation, and the header group link — all used hardcoded paths.

### Task 3.2: Audit and fix remaining hardcoded paths [COMPLETE]
**Files:** Multiple — found via grep

Run `grep -rn '\/projects\/\${' src/` and `grep -rn 'to="/projects' src/` to find all remaining hardcoded paths.

**Acceptance Criteria:**
- [x] `grep -rn '\/projects\/\$\{' src/` returns zero navigation results outside `usePipelinePath.ts` (remaining are all API endpoint URLs)
- [x] `grep -rn 'to="/projects' src/` returns zero hardcoded Link destinations
- [x] All identified files updated to use helper hooks
- [x] Global route pages (outside pipeline workspace) still navigate correctly
- [x] TypeScript passes

**Additional files updated during audit:**
- `src/app/pages/AnnotationsPage.tsx` — avatar link in "Go to Scene" handler
- `src/features/queue/QueueTable.tsx` — avatar links in queue job navigation
- `src/features/projects/tabs/ProjectProductionTab.tsx` — avatar links in handleAvatarClick and handleCellClick
- `src/features/projects/tabs/ProjectAvatarsTab.tsx` — avatar card onClick in both grouped and ungrouped sections
- `src/features/dashboard/widgets/AvatarReadinessWidget.tsx` — project links and "Projects" header link
- `src/features/library/LibraryAvatarModal.tsx` — "Go to Model" link
- `src/app/pages/AssignmentDashboardPage.tsx` — "Back to Project" breadcrumb link

---

## Relevant Files

| File | Description |
|------|-------------|
| `src/hooks/usePipelinePath.ts` | Pipeline-aware path helpers (already created) |
| `src/features/projects/components/AvatarCard.tsx` | Avatar card navigate calls |
| `src/features/projects/components/AvatarDeliverablesGrid.tsx` | Avatar links in deliverables matrix |
| `src/features/projects/components/ReadinessIndicators.tsx` | Avatar readiness links |
| `src/features/projects/components/ProjectCard.tsx` | Project card link (N/A — uses parent onClick) |
| `src/features/projects/ProjectListPage.tsx` | Project list links |
| `src/features/dashboard/widgets/ActiveTasksWidget.tsx` | Task row links (N/A — no navigation links) |
| `src/features/dashboard/widgets/ProjectProgressWidget.tsx` | Project progress links |
| `src/features/dashboard/widgets/AvatarReadinessWidget.tsx` | Avatar readiness project links |
| `src/features/avatars/AvatarDetailPage.tsx` | Breadcrumb navigation |
| `src/app/pages/AnnotationsPage.tsx` | Annotation detail "Go to Scene" link |
| `src/features/queue/QueueTable.tsx` | Queue job navigation links |
| `src/features/projects/tabs/ProjectProductionTab.tsx` | Production matrix avatar links |
| `src/features/projects/tabs/ProjectAvatarsTab.tsx` | Avatar card onClick navigation |
| `src/features/library/LibraryAvatarModal.tsx` | Library "Go to Model" link |
| `src/app/pages/AssignmentDashboardPage.tsx` | "Back to Project" breadcrumb |

---

## Dependencies

### Existing Components to Reuse
- `usePipelinePrefix()`, `useAvatarPath()`, `useProjectPath()` from `src/hooks/usePipelinePath.ts`
- `usePipelineContextSafe()` from `@/features/pipelines`
- TanStack Router `<Link>` and `useNavigate()`

### No New Infrastructure Needed

---

## Implementation Order

### MVP
1. Phase 1: Avatar Links — Tasks 1.1-1.4
2. Phase 2: Project Links — Tasks 2.1-2.3
3. Phase 3: Breadcrumbs & Audit — Tasks 3.1-3.2

**MVP Success Criteria:**
- Navigating within a pipeline workspace never drops to global routes
- Zero hardcoded `/projects/${id}` path constructions outside helper hooks
- Global route navigation still works

---

## Notes

1. Some components use TanStack Router's `to="/projects/$projectId/avatars/$avatarId"` param syntax with separate `params` prop — these need conversion to dynamic string paths from the helper.
2. Components using `useNavigate()` need the hook called at the component level, not inside callbacks.
3. The `AvatarDeliverablesGrid` has the most link references (~8) and will be the most tedious to update.
4. The grep audit in Task 3.2 should also check `href=` attributes for any remaining `<a>` tags.

---

## Version History

- **v1.0** (2026-03-23): Initial task list creation from PRD-145
- **v1.1** (2026-03-23): All tasks complete — 13 files updated, 0 TypeScript errors
