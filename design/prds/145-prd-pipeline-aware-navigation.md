# PRD-145: Pipeline-Aware Navigation

## 1. Introduction/Overview

When navigating within a pipeline workspace (e.g. `/pipelines/y122/...`), internal links to projects, avatars, and other entities should maintain the pipeline prefix. Currently, many components hardcode paths like `/projects/${id}/avatars/${avatarId}` which drops the pipeline context and redirects to the global route. This causes:

1. Loss of pipeline sidebar navigation (switches to global nav)
2. Potential cross-pipeline data leakage (hooks that use `usePipelineContextSafe()` get null)
3. Confusing UX — user clicks within y122 workspace but lands on a global page

This PRD ensures all internal navigation links respect the current pipeline context by using pipeline-aware path helpers.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-138 (Multi-Pipeline Architecture) — pipeline routes exist
  - PRD-139 (Pipeline Workspace Completeness) — pipeline-scoped routes registered

- **Extends:**
  - PRD-142 (Pipeline-Scoped Avatars) — avatar paths need pipeline prefix

## 3. Goals

1. All internal links within pipeline workspaces use pipeline-prefixed paths
2. Links from global routes continue to work (no pipeline prefix when outside a pipeline)
3. Shared helper hooks eliminate hardcoded path construction
4. Breadcrumbs maintain pipeline context

## 4. User Stories

- **As a user working in y122**, I want to click an avatar card and stay within the y122 workspace, so I don't lose my pipeline context.
- **As a user on the global dashboard**, I want avatar links to work without a pipeline prefix, so global views still function.
- **As a developer**, I want a single helper to build pipeline-aware paths, so I don't have to manually construct URLs everywhere.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Pipeline Path Helper Hooks
**Description:** Shared hooks that build pipeline-aware paths based on current context.

**Acceptance Criteria:**
- [ ] `usePipelinePrefix()` — returns a function that prepends `/pipelines/{code}` when in pipeline context, or empty string when global
- [ ] `useAvatarPath()` — builds `/[pipelines/{code}/]projects/{pid}/avatars/{aid}[extra]`
- [ ] `useProjectPath()` — builds `/[pipelines/{code}/]projects/{pid}[extra]`
- [ ] All hooks fall back gracefully when pipeline context is unavailable
- [ ] Hooks are in `src/hooks/usePipelinePath.ts` (already created)

#### Requirement 1.2: Update Avatar Links
**Description:** All links to avatar detail pages must use `useAvatarPath()`.

**Acceptance Criteria:**
- [ ] `AvatarCard.tsx` — navigate calls use pipeline-aware path
- [ ] `AvatarDeliverablesGrid.tsx` — all avatar links (~6 occurrences) use pipeline-aware path
- [ ] `ReadinessIndicators.tsx` — avatar links use pipeline-aware path
- [ ] `BlockingReasonIcon` in `AvatarCard.tsx` — navigate calls use pipeline-aware path
- [ ] `ActiveTasksWidget.tsx` — task row links use pipeline-aware path (already partially done)
- [ ] `ProjectProgressWidget.tsx` — project links use pipeline-aware path

#### Requirement 1.3: Update Project Links
**Description:** All links to project detail pages must use `useProjectPath()`.

**Acceptance Criteria:**
- [ ] `ProjectCard.tsx` — link uses pipeline-aware path
- [ ] `ProjectListPage.tsx` — project row/card links use pipeline-aware path
- [ ] Breadcrumbs in `ProjectDetailPage.tsx` — already fixed with `rawPath` approach
- [ ] Dashboard widget links to projects use pipeline-aware path

#### Requirement 1.4: Update Breadcrumbs
**Description:** All breadcrumb navigation must maintain pipeline context.

**Acceptance Criteria:**
- [ ] `ProjectDetailPage.tsx` breadcrumb — already fixed
- [ ] `AvatarDetailPage.tsx` breadcrumb — uses pipeline-aware project path
- [ ] Any other page with breadcrumb "trail" links uses pipeline-aware paths

#### Requirement 1.5: Audit Remaining Hardcoded Paths
**Description:** Systematic audit of all hardcoded `/projects/` and `/avatars/` paths in the frontend.

**Acceptance Criteria:**
- [ ] `grep -r '\/projects\/\$\{' src/` finds zero results outside the helper hooks
- [ ] `grep -r 'to="/projects' src/` finds zero hardcoded Link destinations to project routes
- [ ] All navigation to entity detail pages goes through the pipeline-aware helpers
- [ ] Links from global pages (outside pipeline workspace) still work correctly

## 6. Non-Goals (Out of Scope)

- Changing the router route definitions (pipeline routes already exist)
- Redirecting global routes to pipeline routes automatically
- Deep-linking from external URLs (those use whatever path is provided)
- Changing API URLs (backend routes are not affected)

## 7. Design Considerations

- The helpers detect pipeline context via `usePipelineContextSafe()` which returns null on global routes
- Components that don't have React context (e.g., utility functions) should receive the pipeline code as a parameter
- The `useAvatarPath()` and `useProjectPath()` hooks return builder functions, not static paths, since the IDs are dynamic

## 8. Technical Considerations

### Existing Code to Reuse
- `usePipelineContextSafe()` — pipeline context detection
- `usePipelinePrefix()`, `useAvatarPath()`, `useProjectPath()` — already created in `src/hooks/usePipelinePath.ts`
- TanStack Router's `<Link to>` component

### Files to Modify
| File | Change |
|------|--------|
| `src/features/projects/components/AvatarCard.tsx` | ~4 navigate calls → useAvatarPath |
| `src/features/projects/components/AvatarDeliverablesGrid.tsx` | ~8 link references → useAvatarPath |
| `src/features/projects/components/ReadinessIndicators.tsx` | ~1 link → useAvatarPath |
| `src/features/projects/components/ProjectCard.tsx` | Link → useProjectPath |
| `src/features/projects/ProjectListPage.tsx` | Project links → useProjectPath |
| `src/features/dashboard/widgets/ActiveTasksWidget.tsx` | Already partially done |
| `src/features/dashboard/widgets/ProjectProgressWidget.tsx` | Project links → useProjectPath |
| `src/features/avatars/AvatarDetailPage.tsx` | Breadcrumb → useProjectPath |
| Any other files found during audit | As needed |

### No Backend Changes Required

## 9. Success Metrics

- Navigating within a pipeline workspace never drops to global routes
- Zero hardcoded `/projects/${id}` path constructions outside helper hooks
- All pipeline-context-dependent hooks receive correct context after navigation

## 10. Open Questions

None.

## 11. Version History

- **v1.0** (2026-03-23): Initial PRD creation
