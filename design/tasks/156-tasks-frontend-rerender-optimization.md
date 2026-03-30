# Task List: Frontend Re-render Optimization

**PRD Reference:** `design/prds/156-prd-frontend-rerender-optimization.md`
**Scope:** Eliminate five identified re-render cascades: unmemoized PipelineProvider context, AppShell useLocation cascade, unwrapped Sidebar, SceneCard inline closures, and Zustand selector instability.

## Overview

Five isolated, low-risk fixes that together eliminate cascading re-renders affecting every pipeline page, every navigation event, and every SceneCard list. Each fix targets a specific finding from the performance audit and uses standard React patterns (useMemo, React.memo, useCallback, direct Zustand selectors). No visual or behavioral changes — purely invisible performance improvements.

### What Already Exists
- `PipelineProvider` at `features/pipelines/PipelineProvider.tsx` — context value created inline (line 73-77)
- `AppShell` at `app/AppShell.tsx` — calls `useLocation()` at line 11, passes `pathname` as key to `PageGuideBanner` at line 20
- `PageGuideBanner` at `app/PageGuideBanner.tsx` — already has its own `useLocation()` at line 7, session-scoped `dismissed` Set at line 91
- `PipelineSidebarContent` at `app/Sidebar.tsx:37` — unwrapped function component
- `SceneCard` at `features/avatars/tabs/AvatarScenesTab.tsx:1014` — unwrapped function component receiving inline closures at lines 758-764
- `useClipAnnotationsStore` at `features/scenes/stores/useClipAnnotationsStore.ts` — `EMPTY_ENTRIES` constant at line 13, `getForClip` method at line 40
- `ClipPlaybackModal` at `features/scenes/ClipPlaybackModal.tsx:90` — calls `s.getForClip(clipId)` in selector

### What We're Building
1. `useMemo` wrapper for PipelineProvider context value
2. Remove `useLocation` from AppShell, internalize reset in PageGuideBanner
3. `React.memo` wrapper for PipelineSidebarContent
4. `React.memo` wrapper for SceneCard + `useCallback` for parent handlers
5. Direct-index Zustand selector with `useCallback` in ClipPlaybackModal

### Key Design Decisions
1. All five fixes are independent and can be implemented/tested in any order
2. No new dependencies — all fixes use React built-in APIs
3. PageGuideBanner reset uses `useEffect` on pathname change instead of key-based remount
4. SceneCard callbacks use a single stable reference pattern (parent passes `useCallback`, child calls with its own ID)

---

## Phase 1: Context & Shell Optimizations

### Task 1.1: Memoize PipelineProvider Context Value
**File:** `apps/frontend/src/features/pipelines/PipelineProvider.tsx`

Wrap the context value object in `useMemo` so consumers only re-render when the pipeline data actually changes.

**Current code (lines 73-77):**
```tsx
const value: PipelineContextValue = {
  pipeline,
  pipelineId: pipeline.id,
  pipelineCode: pipeline.code,
};
```

**Change to:**
```tsx
const value = useMemo<PipelineContextValue>(() => ({
  pipeline,
  pipelineId: pipeline.id,
  pipelineCode: pipeline.code,
}), [pipeline]);
```

Also update the import on line 8 to include `useMemo`:
```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
```

**Acceptance Criteria:**
- [ ] `useMemo` imported from React (line 8)
- [ ] Context value wrapped in `useMemo(() => ({ ... }), [pipeline])`
- [ ] `usePipelineContext()` consumers do NOT re-render when PipelineProvider re-renders with the same pipeline object
- [ ] React DevTools Profiler confirms zero wasted renders on pipeline pages when navigating within the same pipeline
- [ ] `npx tsc --noEmit` passes

### Task 1.2: Remove useLocation from AppShell
**File:** `apps/frontend/src/app/AppShell.tsx`

Remove `useLocation()` from AppShell to stop the entire subtree (Sidebar, Header, StatusFooter, ActivityConsoleDrawer) from re-rendering on every navigation.

**Current code (line 1):**
```tsx
import { Outlet, useLocation } from "@tanstack/react-router";
```

**Change to:**
```tsx
import { Outlet } from "@tanstack/react-router";
```

**Current code (lines 10-20):**
```tsx
export function AppShell() {
  const { pathname } = useLocation();
  // ...
  <PageGuideBanner key={pathname} />
```

**Change to:**
```tsx
export function AppShell() {
  // ...
  <PageGuideBanner />
```

Remove the `useLocation` call entirely and the `key={pathname}` prop from PageGuideBanner.

**Acceptance Criteria:**
- [ ] `AppShell` does NOT import or call `useLocation`
- [ ] `PageGuideBanner` is rendered without `key={pathname}`
- [ ] Sidebar, Header, StatusFooter, and ActivityConsoleDrawer do NOT re-render on route navigation
- [ ] `npx tsc --noEmit` passes

### Task 1.3: Internalize PageGuideBanner Reset Logic
**File:** `apps/frontend/src/app/PageGuideBanner.tsx`
**Depends on:** Task 1.2

With the `key={pathname}` remount strategy removed from AppShell, PageGuideBanner must handle its own visibility reset when the route changes.

**Current code (lines 93-96):**
```tsx
export function PageGuideBanner() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(() => !dismissed.has(pathname));
```

**Change to:**
```tsx
export function PageGuideBanner() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(() => !dismissed.has(pathname));

  // Reset visibility when route changes (replaces key={pathname} remount in AppShell)
  useEffect(() => {
    setVisible(!dismissed.has(pathname));
  }, [pathname]);
```

Also update the import on line 6 to include `useEffect`:
```tsx
import { useCallback, useEffect, useState } from "react";
```

**Acceptance Criteria:**
- [ ] `useEffect` added to reset `visible` state when `pathname` changes
- [ ] PageGuideBanner shows the correct guide text for each page
- [ ] Dismissing the banner on page A, navigating to page B, shows page B's banner
- [ ] Dismissing the banner on page A, navigating away and back, does NOT show page A's banner (session dismiss preserved)
- [ ] `npx tsc --noEmit` passes

### Task 1.4: Wrap PipelineSidebarContent in React.memo
**File:** `apps/frontend/src/app/Sidebar.tsx`

Wrap `PipelineSidebarContent` in `React.memo` as a defense-in-depth measure against parent re-renders.

**Current code (line 37):**
```tsx
function PipelineSidebarContent({ collapsed, pipelineCode }: { collapsed: boolean; pipelineCode: string }) {
```

**Change to:**
```tsx
const PipelineSidebarContent = memo(function PipelineSidebarContent({ collapsed, pipelineCode }: { collapsed: boolean; pipelineCode: string }) {
  // ... existing body ...
});
```

Add `memo` to the React import at the top of the file (add to existing import or add new import):
```tsx
import { memo, useMemo } from "react";
```

**Acceptance Criteria:**
- [ ] `PipelineSidebarContent` is wrapped in `React.memo` (or `memo`)
- [ ] `memo` is imported from React
- [ ] Sidebar does not re-render when parent state changes that don't affect its props
- [ ] Navigation highlighting still works correctly after memo wrap
- [ ] `npx tsc --noEmit` passes

---

## Phase 2: SceneCard Optimization

### Task 2.1: Extract SceneCard Inline Closures to useCallback in AvatarScenesTab
**File:** `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx`

Replace inline closures in the `.map()` loop (lines 758-764) with stable callback references.

**Current code (lines 758-764):**
```tsx
onSchedule={(sceneId) => handleScheduleScenes([sceneId])}
onCancelSchedule={(sceneId) => setCancelScheduleSceneId(sceneId)}
onClickScene={(sceneId) => {
  const idx = navigableSlots.findIndex((s) => s.scene?.id === sceneId);
  if (idx >= 0) setDetailSlotIndex(idx);
}}
```

**Add stable callbacks before the JSX return (use `useCallback`):**
```tsx
const handleScheduleSingle = useCallback(
  (sceneId: number) => handleScheduleScenes([sceneId]),
  [handleScheduleScenes],
);

const handleCancelScheduleSingle = useCallback(
  (sceneId: number) => setCancelScheduleSceneId(sceneId),
  [setCancelScheduleSceneId],
);

const handleClickScene = useCallback(
  (sceneId: number) => {
    const idx = navigableSlots.findIndex((s) => s.scene?.id === sceneId);
    if (idx >= 0) setDetailSlotIndex(idx);
  },
  [navigableSlots, setDetailSlotIndex],
);
```

**Then update the JSX:**
```tsx
onSchedule={handleScheduleSingle}
onCancelSchedule={handleCancelScheduleSingle}
onClickScene={handleClickScene}
```

**Acceptance Criteria:**
- [ ] No inline closures per SceneCard in the `.map()` loop
- [ ] Three `useCallback` hooks created for `onSchedule`, `onCancelSchedule`, `onClickScene`
- [ ] Callback references are stable across renders (same identity when deps unchanged)
- [ ] All existing SceneCard functionality (schedule, cancel, click, select, video drop, disable) works identically
- [ ] `npx tsc --noEmit` passes

### Task 2.2: Wrap SceneCard in React.memo
**File:** `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx`
**Depends on:** Task 2.1

Wrap the `SceneCard` component (defined at line 1014) in `React.memo` so it only re-renders when its own props change.

**Current code (line 1014):**
```tsx
function SceneCard({ slot, isSelected, onToggleSelect, onGenerate, onSchedule, onCancelSchedule, isScheduled, onClickScene, onVideoDrop, onDisable, generating, playback, hasWorkflow, hasActiveGpu, hideTracks }: SceneCardProps) {
```

**Change to:**
```tsx
const SceneCard = memo(function SceneCard({ slot, isSelected, onToggleSelect, onGenerate, onSchedule, onCancelSchedule, isScheduled, onClickScene, onVideoDrop, onDisable, generating, playback, hasWorkflow, hasActiveGpu, hideTracks }: SceneCardProps) {
  // ... existing body ...
});
```

Ensure `memo` is imported from React at the top of the file.

**Acceptance Criteria:**
- [ ] SceneCard is wrapped in `React.memo`
- [ ] `memo` imported from React
- [ ] SceneCard only re-renders when its own props change (verify with React DevTools highlight)
- [ ] Combined with Task 2.1, interacting with one SceneCard does not re-render all others
- [ ] `npx tsc --noEmit` passes

---

## Phase 3: Zustand Selector Fix

### Task 3.1: Fix Zustand Selector Instability in ClipPlaybackModal
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Replace the method-call selector with a direct-index selector wrapped in `useCallback` to prevent re-renders from unrelated clip annotation changes.

**Current code (line 90):**
```tsx
const frameAnnotations = useClipAnnotationsStore((s) => s.getForClip(clipId));
```

**Change to:**
```tsx
const frameAnnotations = useClipAnnotationsStore(
  useCallback((s: { annotations: Record<number, FrameAnnotationEntry[]> }) => s.annotations[clipId] ?? EMPTY_ANNOTATIONS, [clipId]),
);
```

**Add a module-level constant** (near the top of the file, after imports):
```tsx
/** Stable empty array to avoid new references when clip has no annotations. */
const EMPTY_ANNOTATIONS: FrameAnnotationEntry[] = [];
```

Alternatively, export `EMPTY_ENTRIES` from `useClipAnnotationsStore.ts` and import it. The store already defines `const EMPTY_ENTRIES: FrameAnnotationEntry[] = []` at line 13 but it is not exported. Either approach works.

**Acceptance Criteria:**
- [ ] ClipPlaybackModal uses a direct-index selector (`s.annotations[clipId]`) instead of `s.getForClip(clipId)`
- [ ] The selector is wrapped in `useCallback` with `[clipId]` dependency
- [ ] Uses a stable empty array constant for the fallback (not `[]` inline)
- [ ] Changing annotations on clip A does NOT cause ClipPlaybackModal viewing clip B to re-render
- [ ] All annotation features (draw, save, load, navigate) work identically
- [ ] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/features/pipelines/PipelineProvider.tsx` | `useMemo` for context value (Task 1.1) |
| `apps/frontend/src/app/AppShell.tsx` | Remove `useLocation` (Task 1.2) |
| `apps/frontend/src/app/PageGuideBanner.tsx` | Internalize route reset (Task 1.3) |
| `apps/frontend/src/app/Sidebar.tsx` | `React.memo` on PipelineSidebarContent (Task 1.4) |
| `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx` | SceneCard closures + memo (Tasks 2.1, 2.2) |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Zustand selector fix (Task 3.1) |
| `apps/frontend/src/features/scenes/stores/useClipAnnotationsStore.ts` | Reference: `EMPTY_ENTRIES` at line 13 |

---

## Dependencies

### Existing Components to Reuse
- `EMPTY_ENTRIES` constant in `useClipAnnotationsStore.ts:13` (can export, or define local equivalent)
- `useLocation` already in `PageGuideBanner.tsx:7` (no new hook needed)
- `React.memo`, `useMemo`, `useCallback` — standard React APIs, no new dependencies

### New Infrastructure Needed
- None

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Context & Shell — Tasks 1.1–1.4
2. Phase 2: SceneCard — Tasks 2.1–2.2
3. Phase 3: Zustand Selector — Task 3.1

All tasks are independent and can be done in any order. The listed order groups them logically.

**MVP Success Criteria:**
- AppShell children (Sidebar, Header, StatusFooter) show zero wasted renders on navigation
- SceneCard lists only re-render the interacted card, not all N cards
- ClipPlaybackModal only re-renders when its own clip's annotations change
- `npx tsc --noEmit` passes with zero errors
- All existing tests pass without modification

### Post-MVP Enhancements
- None for this PRD — all fixes are in MVP scope

---

## Notes

1. **All fixes are invisible** — no visual or behavioral changes to any component.
2. **Task 1.2 and 1.3 are coupled** — removing `key={pathname}` from AppShell requires the `useEffect` in PageGuideBanner. Implement them together.
3. **Task 2.1 must precede Task 2.2** — `React.memo` is ineffective if parent still creates new callback references per render.
4. **Verification is manual** — use React DevTools Profiler to confirm re-render counts before/after.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-156
