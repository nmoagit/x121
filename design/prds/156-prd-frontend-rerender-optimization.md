# PRD-156: Frontend Re-render Optimization

**Document ID:** 156-prd-frontend-rerender-optimization
**Status:** Not Started
**Author:** AI Product Manager
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

---

## 1. Introduction / Overview

The frontend performance audit (2026-03-30) identified several re-render cascades that cause unnecessary React reconciliation work across the application. These stem from five root causes: an unmemoized context value in PipelineProvider, a `useLocation` call in AppShell that triggers full subtree re-renders on every navigation, an unwrapped Sidebar component, inline closures in SceneCard render loops, and a Zustand selector that returns new references for unrelated clip annotation changes.

This PRD addresses all five findings as a cohesive "re-render optimization" pass. Each fix is small and isolated, but together they eliminate cascading renders that affect every pipeline page, every navigation event, and every SceneCard list.

Source: `design/progress/PERFORMANCE-AUDIT.md` — Findings 1, 4, 7, 9, 10.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-138** (Multi-Pipeline Architecture) — PipelineProvider was introduced here
- **PRD-112** (Project Hub & Management) — AvatarScenesTab SceneCard loops
- **PRD-70** (On-Frame Annotation & Markup) — ClipAnnotationsStore

### Related
- **PRD-157** (Frontend Data Fetching Optimization) — complementary performance work
- **PRD-158** (Frontend List Virtualization) — SceneCard memoization enables virtualization gains
- **PRD-117** (System Status Footer Bar) — StatusFooter re-renders from AppShell cascade

## 3. Goals

### Primary Goals
1. Eliminate unnecessary re-renders of all pipeline-scoped components on every render cycle.
2. Stop AppShell from re-rendering Sidebar, Header, StatusFooter, and ActivityConsoleDrawer on every route navigation.
3. Prevent SceneCard lists from creating 100+ new function objects per render cycle.
4. Fix Zustand selector instability so ClipPlaybackModal only re-renders when its own clip's annotations change.

### Secondary Goals
1. Establish memoization patterns that future components can follow.
2. Reduce React DevTools Profiler "wasted renders" for pipeline pages to near-zero.

## 4. User Stories

- **US-1:** As a user navigating between pages, I want the sidebar, header, and footer to not re-render on every navigation, so the app feels snappy.
- **US-2:** As a user viewing an avatar's scenes tab with 100+ SceneCards, I want only changed cards to re-render, so scrolling and interactions remain smooth.
- **US-3:** As a user annotating clips in ClipPlaybackModal, I want annotations on other clips to not trigger re-renders of my current view.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Memoize PipelineProvider Context Value

**Description:** Wrap the PipelineProvider context value object in `useMemo` so consumers only re-render when the pipeline data actually changes.

**File:** `apps/frontend/src/features/pipelines/PipelineProvider.tsx:73-77`

**Current code:**
```tsx
const value: PipelineContextValue = {
  pipeline,
  pipelineId: pipeline.id,
  pipelineCode: pipeline.code,
};
```

**Fix:** Wrap in `useMemo` with `[pipeline]` dependency.

**Acceptance Criteria:**
- [ ] `PipelineProvider` context value is wrapped in `useMemo(() => ({ ... }), [pipeline])`
- [ ] `usePipelineContext()` consumers do NOT re-render when PipelineProvider re-renders with the same pipeline object
- [ ] React DevTools Profiler confirms zero wasted renders on pipeline pages when navigating within the same pipeline

**Technical Notes:** One-line change. Import `useMemo` (already available in React).

---

#### Requirement 1.2: Fix AppShell useLocation Re-render Cascade

**Description:** Remove `useLocation()` from AppShell. Currently it is used only to pass `pathname` as a `key` prop to `PageGuideBanner`, causing the entire AppShell subtree (Sidebar, Header, StatusFooter, ActivityConsoleDrawer, Outlet) to re-render on every navigation.

**File:** `apps/frontend/src/app/AppShell.tsx:11`

**Current code:**
```tsx
const { pathname } = useLocation();
// ...
<PageGuideBanner key={pathname} />
```

**Fix:** Remove `useLocation` from AppShell. PageGuideBanner already has its own `useLocation` call (`apps/frontend/src/app/PageGuideBanner.tsx:7`). Have PageGuideBanner manage its own reset internally — use `pathname` from its existing `useLocation` as a key for its internal state, or use a `useEffect` to reset dismiss state when pathname changes.

**Acceptance Criteria:**
- [ ] `AppShell` does NOT import or call `useLocation`
- [ ] `PageGuideBanner` resets its dismiss state when the route changes, using its own `useLocation` hook
- [ ] Sidebar, Header, StatusFooter, and ActivityConsoleDrawer do NOT re-render on route navigation (verify with React DevTools Profiler)
- [ ] PageGuideBanner still shows the correct guide text for each page and resets dismiss state on navigation

**Technical Notes:** PageGuideBanner already calls `useLocation()` at line 7. Add a `useEffect` that resets the `dismissed` state when `pathname` changes, replacing the `key={pathname}` remount strategy.

---

#### Requirement 1.3: Wrap Sidebar Content in React.memo

**Description:** Wrap `PipelineSidebarContent` in `React.memo` to prevent re-renders when parent state changes that don't affect sidebar props.

**File:** `apps/frontend/src/app/Sidebar.tsx:37`

**Acceptance Criteria:**
- [ ] `PipelineSidebarContent` is wrapped in `React.memo`
- [ ] Sidebar does not re-render when AppShell re-renders (after Requirement 1.2, this becomes a defense-in-depth measure)
- [ ] Navigation highlighting still works correctly after memo wrap

**Technical Notes:** This becomes a secondary defense after fixing AppShell (Requirement 1.2). The memo prevents re-renders from any other parent state changes.

---

#### Requirement 1.4: Extract SceneCard Inline Closures + React.memo

**Description:** SceneCard receives new inline closures on every render of AvatarScenesTab, defeating memoization. Extract closures and wrap SceneCard in `React.memo`.

**File:** `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx:751-773`

**Current code:**
```tsx
{slots.map((slot) => (
  <SceneCard
    onSchedule={(sceneId) => handleScheduleScenes([sceneId])}
    onCancelSchedule={(sceneId) => setCancelScheduleSceneId(sceneId)}
    onClickScene={(sceneId) => { /* ... */ }}
  />
))}
```

**Fix:**
1. Change SceneCard to accept `sceneId` as a required prop
2. Have SceneCard call parent callbacks with its own `sceneId` internally
3. Parent passes stable callback references (via `useCallback`) that accept a `sceneId` parameter
4. Wrap SceneCard in `React.memo`

**Acceptance Criteria:**
- [ ] SceneCard is wrapped in `React.memo`
- [ ] AvatarScenesTab does NOT create inline closures per SceneCard in the `.map()` loop
- [ ] Parent callbacks (`onSchedule`, `onCancelSchedule`, `onClickScene`) are stable references created with `useCallback`
- [ ] SceneCard only re-renders when its own props change (verify with React DevTools highlight)
- [ ] All existing SceneCard functionality (schedule, cancel, click, selection) works identically

**Technical Notes:** The SceneCard component file needs to be located — check `features/avatars/` or `features/scenes/` for the component definition. The key change is moving from `(sceneId) => handler(sceneId)` per-item closures to a single `handler` that SceneCard calls with its own ID.

---

#### Requirement 1.5: Fix Zustand Selector Instability in ClipPlaybackModal

**Description:** The `useClipAnnotationsStore` selector calls `s.getForClip(clipId)` which executes on every store change. Because `setForClip` spreads the `annotations` object (creating a new top-level reference), the selector re-runs for ALL clips whenever ANY clip's annotations change.

**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx:90`

**Current code:**
```tsx
const frameAnnotations = useClipAnnotationsStore((s) => s.getForClip(clipId));
```

**Fix:** Use a direct-index selector with `useCallback` to avoid method call overhead and ensure stable references:
```tsx
const frameAnnotations = useClipAnnotationsStore(
  useCallback((s) => s.annotations[clipId] ?? EMPTY_ENTRIES, [clipId])
);
```

**Acceptance Criteria:**
- [ ] ClipPlaybackModal uses a direct-index selector (`s.annotations[clipId]`) instead of calling `s.getForClip(clipId)`
- [ ] The selector is wrapped in `useCallback` with `[clipId]` dependency
- [ ] Uses the existing `EMPTY_ENTRIES` constant from the store file (import it, or define a module-level constant)
- [ ] Changing annotations on clip A does NOT cause ClipPlaybackModal viewing clip B to re-render
- [ ] All annotation features (draw, save, load, navigate) work identically

**Technical Notes:** The store already defines `const EMPTY_ENTRIES: FrameAnnotationEntry[] = []` at line 13 of `useClipAnnotationsStore.ts`. Export it, or define an identical constant in ClipPlaybackModal.

## 6. Non-Functional Requirements

### Performance
- Navigating between pipeline pages should show zero "wasted renders" for Sidebar, Header, StatusFooter in React DevTools Profiler
- AvatarScenesTab with 100+ SceneCards: only the affected card re-renders on interaction (not all 100+)
- ClipPlaybackModal annotation selector: O(1) lookup instead of method call per store change

### Regression
- All existing tests must pass without modification
- No visual or behavioral changes to any component

## 7. Non-Goals (Out of Scope)

- List virtualization (covered by PRD-158)
- Data fetching / polling optimization (covered by PRD-157)
- ClipPlaybackModal component extraction (covered by PRD-159)
- Memoizing every component in the app — only the high-impact targets identified in the audit

## 8. Design Considerations

No visual changes. All fixes are invisible performance improvements.

## 9. Technical Considerations

### Existing Code to Reuse
- `EMPTY_ENTRIES` constant in `useClipAnnotationsStore.ts:13`
- `useLocation` already in `PageGuideBanner.tsx:7`
- `React.memo` — standard React API, no new dependencies

### Database Changes
None.

### API Changes
None.

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| PageGuideBanner dismiss state after navigation | Must reset when pathname changes (replaces key-based remount) |
| SceneCard memo with complex props (objects/arrays) | Ensure non-callback props are stable or use shallow comparison |
| Zustand selector with undefined clipId | Fall back to `EMPTY_ENTRIES` (existing behavior preserved) |
| PipelineProvider re-render with same pipeline data | `useMemo` with `[pipeline]` — reference equality from TanStack Query cache |

## 11. Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| AppShell children re-renders per navigation | 5+ components | 1 (Outlet only) |
| SceneCard re-renders per AvatarScenesTab interaction | All N cards | 1 card |
| ClipPlaybackModal re-renders from unrelated annotations | Every store change | Only own clip changes |
| PipelineProvider consumer re-renders per parent render | All consumers | 0 (when pipeline unchanged) |

## 12. Testing Requirements

- **Manual:** Use React DevTools Profiler to verify re-render counts before and after each fix
- **Manual:** Navigate between 5+ pages and confirm Sidebar/Header/Footer show zero highlight flashes
- **Manual:** Open AvatarScenesTab with 50+ scenes, interact with one card, confirm others don't re-render
- **Automated:** Existing test suites pass without modification (no behavioral changes)

## 13. Open Questions

None — all fixes are well-understood patterns with clear implementation paths.

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from performance audit findings 1, 4, 7, 9, 10 |
