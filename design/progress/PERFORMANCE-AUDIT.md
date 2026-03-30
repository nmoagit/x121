# Performance Audit — Frontend

**Date**: 2026-03-30

## Executive Summary

The frontend is architecturally sound in key areas: all routes use lazy loading, TanStack Query is used consistently with a 60s global staleTime, and the component library is well-structured. However, 12 performance findings were identified ranging from high to low impact, concentrated in these areas:

1. **Aggressive polling** — 30+ queries with `refetchInterval`, many active simultaneously on dashboard pages
2. **Missing list virtualization** — large lists rendered without windowing
3. **Inline closures in render loops** — new functions per item in `.map()` for heavy components
4. **Zustand selector instability** — method references creating new closures on every render
5. **N+1 query waterfalls** — `useQueries` per-project data fetching pattern in AvatarsPage

---

## Findings

### 1. Zustand Store Selector Instability — `useClipAnnotationsStore`

**File**: `features/scenes/ClipPlaybackModal.tsx:90`
**Severity**: High

```tsx
const frameAnnotations = useClipAnnotationsStore((s) => s.getForClip(clipId));
```

The selector calls a method on each render. The `annotations` object spreads on every `setForClip` call (line 43 of `useClipAnnotationsStore.ts`), changing the top-level reference, causing the selector to re-run and return a new result for *unrelated* clips.

**Fix**: Use a direct-index selector:
```tsx
const frameAnnotations = useClipAnnotationsStore(
  useCallback((s) => s.annotations[clipId] ?? EMPTY_ENTRIES, [clipId])
);
```

**Effort**: Small

---

### 2. N+1 Query Waterfall in AvatarsPage

**File**: `app/pages/AvatarsPage.tsx:132-155`
**Severity**: High

Three separate `useQueries` calls each map over `displayProjectIds`:
```tsx
const avatarQueries = useQueries({ queries: displayProjectIds.map(...) });
const groupQueries = useQueries({ queries: displayProjectIds.map(...) });
const speechLangQueries = useQueries({ queries: displayProjectIds.map(...) });
```

For an admin with 10 projects, this fires **30 simultaneous HTTP requests** on page load.

**Fix**: Create a single backend endpoint `/api/v1/avatars/browse?pipeline_id=X` that returns aggregated data for all projects in one response.

**Effort**: Large (requires backend endpoint)

---

### 3. Missing List Virtualization

**Files**:
- `features/avatars/tabs/AvatarScenesTab.tsx:750-773` — Grid of SceneCards
- `app/pages/ScenesPage.tsx:219+` — Browse clip list
- `app/pages/AvatarsPage.tsx` — Avatar card grid

**Severity**: High

All items rendered to DOM even if off-screen. AvatarScenesTab can render 100+ SceneCards simultaneously, each containing video thumbnails, buttons, and conditional logic. Zero usage of virtualization anywhere in the codebase.

**Fix**: Add `@tanstack/react-virtual` for lists/grids exceeding ~50 items. Priority targets:
1. AvatarScenesTab scene grid (100+ cards)
2. AvatarsPage avatar cards (100+ avatars)

**Effort**: Medium per component

---

### 4. Inline Closures in Render Loops

**File**: `features/avatars/tabs/AvatarScenesTab.tsx:751-773`
**Severity**: Medium

```tsx
{slots.map((slot) => (
  <SceneCard
    onSchedule={(sceneId) => handleScheduleScenes([sceneId])}
    onCancelSchedule={(sceneId) => setCancelScheduleSceneId(sceneId)}
    onClickScene={(sceneId) => { /* ... */ }}
  />
))}
```

New function objects created per SceneCard on every render, defeating any potential memoization.

**Fix**: Wrap SceneCard in `React.memo` and have it accept `sceneId` as a prop and call parent callbacks itself, avoiding per-item closures.

**Effort**: Small

---

### 5. Dashboard Widget Polling Storm

**File**: `features/dashboard/hooks/use-dashboard.ts:119-231`
**Severity**: Medium

When the dashboard is mounted, **7 queries poll every 30 seconds simultaneously**, plus footer status (30s) and GPU availability (30s) = **9 polling requests per 30-second cycle**.

Individual feature pages add more:
- Queue status: 10s
- Generation progress: 2-3s
- Worker status: 10s
- Production: 10s

**Fix**:
1. Consolidate dashboard widgets into a single `/dashboard/status` endpoint polled at 30s
2. Use `document.visibilityState` to pause polling when tab is hidden
3. Generation polling (2-3s) is already conditional on active generation — good

**Effort**: Medium (backend consolidation), Small (visibility check)

---

### 6. Inline `api.get` in useEffect Bypasses TanStack Query Cache

**File**: `features/scenes/ClipPlaybackModal.tsx:66-72`
**Severity**: Medium

```tsx
useEffect(() => {
  api.get<TagInfo[]>(`/entities/scene_video_version/${clip.id}/tags`)
    .then(setClipTags)
    .catch(() => setClipTags([]));
}, [clip?.id]);
```

Tags fetched via raw `api.get` in useEffect — no caching, no deduplication. Navigating prev/next between clips refetches every time.

**Fix**: Convert to `useQuery` hook. Create `useClipTags(clipId)` and `useUpdateClipNotes()` mutation hook.

**Effort**: Small

---

### 7. PipelineProvider Creates New Context Value Every Render

**File**: `features/pipelines/PipelineProvider.tsx:73-77`
**Severity**: Medium

```tsx
const value: PipelineContextValue = {
  pipeline,
  pipelineId: pipeline.id,
  pipelineCode: pipeline.code,
};
```

New object every render. All `usePipelineContext()` consumers re-render on every route change.

**Fix**: `useMemo(() => ({ pipeline, pipelineId: pipeline.id, pipelineCode: pipeline.code }), [pipeline])`

**Effort**: Small (one line)

---

### 8. `useProjectAvatars` Polls Every 15s Unconditionally

**Files**:
- `features/projects/hooks/use-project-avatars.ts:35`
- `features/projects/hooks/use-projects.ts:56`
- `features/projects/hooks/use-avatar-deliverables.ts:18,45,66`

**Severity**: Medium

```tsx
refetchInterval: 15_000,
```

Fires every 15 seconds even when simply viewing project details with no active generation.

**Fix**: Remove `refetchInterval`. Existing `invalidateQueries` in mutation hooks already handles data freshness. Add optional `poll` parameter defaulting to `false` for cases that need it.

**Effort**: Small

---

### 9. AppShell Re-renders All Children on Route Change

**File**: `app/AppShell.tsx:11`
**Severity**: Low-Medium

```tsx
const { pathname } = useLocation();
// Used only for:
<PageGuideBanner key={pathname} />
```

`useLocation()` causes AppShell to re-render on every navigation, cascading to Sidebar, Header, StatusFooter.

**Fix**: Remove `useLocation` from AppShell. Have PageGuideBanner manage its own reset internally using its existing `useLocation` call.

**Effort**: Small

---

### 10. Sidebar Refetches Data on Every Navigation

**File**: `app/Sidebar.tsx:38-39`
**Severity**: Low

Re-renders on every route change (due to AppShell re-render from Finding 9). TanStack Query cache prevents network requests, but hook execution and render cycle still run.

**Fix**: Becomes a non-issue once Finding 9 is fixed. Additionally wrap `PipelineSidebarContent` in `React.memo`.

**Effort**: Small

---

### 11. Barrel Exports May Defeat Tree-Shaking

**Files**:
- `features/scene-catalogue/index.ts` — 98 lines, 22 components + 18 hooks
- `features/image-catalogue/index.ts` — 82 lines
- `features/delivery/index.ts` — 78 lines
- `features/queue/index.ts` — 74 lines

**Severity**: Low

Large barrel re-exports can sometimes defeat Vite/Rollup tree-shaking.

**Fix**: Verify with `vite-bundle-visualizer`. If needed, switch to direct path imports in lazy-loaded routes.

**Effort**: Small (audit), Medium (if fixes needed)

---

### 12. ClipPlaybackModal Has 14 useState Hooks

**File**: `features/scenes/ClipPlaybackModal.tsx:52-80`
**Severity**: Low

962-line component with 14 state hooks + 3 Zustand subscriptions. Any state change triggers full re-render of video player + canvas + annotation list.

**Fix**: Extract sub-components (annotation list, toolbar, video container) to isolate state. Consider `useReducer` for related annotation states.

**Effort**: Medium

---

## Prioritized Task List

| # | Task | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | Memoize PipelineProvider context value | P1 | Small | Eliminates cascade re-renders across all pipeline pages |
| 2 | Fix AppShell `useLocation` re-render cascade | P1 | Small | Stops Sidebar/Header/Footer re-rendering on every nav |
| 3 | Convert ClipPlaybackModal inline API calls to TanStack Query | P2 | Small | Enables tag caching, reduces duplicate requests |
| 4 | Make unconditional polling conditional | P2 | Small | Eliminates ~4 requests/15s on idle project pages |
| 5 | Fix Zustand selector instability in ClipPlaybackModal | P2 | Small | Prevents re-renders from unrelated clip annotation changes |
| 6 | Add virtualization to AvatarScenesTab | P3 | Medium | Reduces DOM nodes from 100+ to ~20 visible cards |
| 7 | Consolidate dashboard polling into single endpoint | P3 | Medium | Reduces 7 polls/30s to 1 poll/30s |
| 8 | Extract SceneCard inline closures + React.memo | P3 | Small | Prevents 100+ function allocations per render |
| 9 | Consolidate AvatarsPage N+1 queries | P4 | Large | Reduces 3N requests to 1 on page load |
| 10 | Audit barrel exports with bundle visualizer | P4 | Small | Verify tree-shaking works; fix if needed |
| 11 | Extract ClipPlaybackModal sub-components | P4 | Medium | Isolates re-render boundaries in 962-line component |
| 12 | Add visibility-based polling pause | P4 | Small | Stops all polling when browser tab is hidden |

## Quick Wins (< 1 hour each)

1. `useMemo` on PipelineProvider value — 1 line change
2. Remove `useLocation` from AppShell — move reset logic into PageGuideBanner
3. Remove unconditional `refetchInterval` from 4 hooks
4. Fix Zustand selector in ClipPlaybackModal — `useCallback` wrapper
