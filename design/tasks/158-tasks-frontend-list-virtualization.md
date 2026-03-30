# Task List: Frontend List Virtualization

**PRD Reference:** `design/prds/158-prd-frontend-list-virtualization.md`
**Scope:** Add `@tanstack/react-virtual` and virtualize the three highest-impact list/grid views: AvatarScenesTab scene grid, AvatarsPage avatar card grid, and ScenesPage browse clip list.

## Overview

All list and grid views currently render every item to the DOM regardless of visibility. This causes significant initial render time, high memory consumption, and sluggish scrolling for large datasets (100+ scenes, 200+ avatars, 500+ clips). We introduce `@tanstack/react-virtual` as a lightweight virtualization library and apply it to three priority targets. PRD-156's `React.memo` on SceneCard must land first for virtualization to be fully effective.

### What Already Exists
- `AvatarScenesTab` at `features/avatars/tabs/AvatarScenesTab.tsx` — scene grid at lines 750-773, using `<Grid>` component with responsive columns: `cols={2} sm:grid-cols-3 lg:grid-cols-4 min-[1500px]:grid-cols-5 min-[1700px]:grid-cols-6`
- `AvatarsPage` at `app/pages/AvatarsPage.tsx` — avatar card grid (1394 lines), `useQueries` per project at lines 132-155
- `ScenesPage` at `app/pages/ScenesPage.tsx` — browse clip list at lines 467-489, renders `BrowseClipItem` in a flex column; uses server-side pagination (`page`/`pageSize` state)
- `SceneCard` at `AvatarScenesTab.tsx:1014` — will be wrapped in `React.memo` by PRD-156
- `Grid` component from design system — used for layout

### What We're Building
1. Install `@tanstack/react-virtual` dependency
2. Virtualized scene card grid in AvatarScenesTab
3. Virtualized avatar card grid in AvatarsPage
4. Virtualized browse clip list in ScenesPage

### Key Design Decisions
1. Use `@tanstack/react-virtual` v3.x — lightweight, hooks-based, compatible with React 19 and existing TanStack ecosystem
2. Grid virtualization: calculate rows from column count and container width, virtualize rows (not individual cells)
3. Preserve existing CSS grid classes and gap values — virtualization is invisible to the user
4. Overscan of 5 rows minimum to prevent blank flash during moderate scrolling
5. ScenesPage already uses server-side pagination — virtualization applies within each loaded page

---

## Phase 1: Dependency Installation

### Task 1.1: Install @tanstack/react-virtual
**File:** `apps/frontend/package.json`

Install `@tanstack/react-virtual` as a frontend dependency.

```bash
cd apps/frontend && npm install @tanstack/react-virtual
```

**Acceptance Criteria:**
- [ ] `@tanstack/react-virtual` added to `apps/frontend/package.json` dependencies (v3.x)
- [ ] No dependency conflicts
- [ ] Import works: `import { useVirtualizer } from '@tanstack/react-virtual'`
- [ ] `npx tsc --noEmit` passes
- [ ] Build succeeds: `npm run build`

---

## Phase 2: AvatarScenesTab Scene Grid Virtualization

### Task 2.1: Create useGridVirtualizer Helper
**File:** `apps/frontend/src/hooks/use-grid-virtualizer.ts` (new file)

Create a reusable hook that wraps `useVirtualizer` for grid layouts with responsive column counts. This will be shared across all three virtualized views.

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface UseGridVirtualizerOptions {
  /** Total number of items to virtualize. */
  count: number;
  /** Minimum width of each item in pixels (used to calculate column count). */
  minItemWidth: number;
  /** Estimated height of each row in pixels. */
  estimatedRowHeight: number;
  /** Gap between items in pixels. */
  gap?: number;
  /** Number of rows to render beyond the visible area. */
  overscan?: number;
}

export function useGridVirtualizer(options: UseGridVirtualizerOptions) {
  const { count, minItemWidth, estimatedRowHeight, gap = 16, overscan = 5 } = options;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  // Observe container width and recalculate column count
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const cols = Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
      setColumnCount(cols);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minItemWidth, gap]);

  const rowCount = Math.ceil(count / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight + gap,
    overscan,
  });

  /** Get the item indices for a given virtual row. */
  const getRowItems = useCallback(
    (rowIndex: number) => {
      const start = rowIndex * columnCount;
      const end = Math.min(start + columnCount, count);
      return Array.from({ length: end - start }, (_, i) => start + i);
    },
    [columnCount, count],
  );

  return { scrollRef, virtualizer, columnCount, rowCount, getRowItems };
}
```

**Acceptance Criteria:**
- [ ] Hook accepts item count, min item width, estimated row height, gap, overscan
- [ ] Uses `ResizeObserver` to detect container width and calculate column count
- [ ] Returns scroll ref, virtualizer instance, column count, and `getRowItems` helper
- [ ] Responsive: column count updates on window resize
- [ ] `npx tsc --noEmit` passes

### Task 2.2: Virtualize AvatarScenesTab Scene Grid
**File:** `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx`
**Depends on:** Task 2.1, PRD-156 Tasks 2.1-2.2 (SceneCard memo)

Replace the current `<Grid>` + `.map()` rendering (lines 750-774) with a virtualized grid using `useGridVirtualizer`.

**Current code (lines 750-774):**
```tsx
<Grid cols={2} gap={4} className="sm:grid-cols-3 lg:grid-cols-4 min-[1500px]:grid-cols-5 min-[1700px]:grid-cols-6">
  {slots.filter(...).map((slot) => (
    <SceneCard key={...} slot={slot} ... />
  ))}
</Grid>
```

**Replace with virtualized grid:**
```tsx
const filteredSlots = slots.filter((slot) => !hideEmpty || (slot.scene && slot.scene.version_count > 0));

const { scrollRef, virtualizer, columnCount, getRowItems } = useGridVirtualizer({
  count: filteredSlots.length,
  minItemWidth: 200,       // approximate min card width
  estimatedRowHeight: 280, // approximate card height
  gap: 16,
  overscan: 5,
});

// In JSX:
<div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
  <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
    {virtualizer.getVirtualItems().map((virtualRow) => (
      <div
        key={virtualRow.key}
        style={{
          position: "absolute",
          top: virtualRow.start,
          left: 0,
          right: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gap: "var(--spacing-4)",
        }}
      >
        {getRowItems(virtualRow.index).map((itemIndex) => {
          const slot = filteredSlots[itemIndex];
          return (
            <SceneCard key={...} slot={slot} ... />
          );
        })}
      </div>
    ))}
  </div>
</div>
```

**Acceptance Criteria:**
- [ ] AvatarScenesTab uses `useGridVirtualizer` for the SceneCard grid
- [ ] Only visible cards (plus ~5 rows overscan) are in the DOM at any time
- [ ] DOM node count with 100 scenes: ~25 cards instead of 100
- [ ] Scrolling is smooth at 60fps with 200+ scenes
- [ ] Grid layout (responsive columns, gaps) looks identical to current implementation
- [ ] All SceneCard interactions work: click, schedule, cancel, select, context menu, video drop
- [ ] Empty state still renders when no scenes exist (bypass virtualizer for 0 items)
- [ ] Filter changes reset scroll position
- [ ] `npx tsc --noEmit` passes

---

## Phase 3: AvatarsPage Avatar Card Grid Virtualization

### Task 3.1: Virtualize AvatarsPage Avatar Card Grid
**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx`
**Depends on:** Task 2.1

AvatarsPage renders avatar cards grouped by project. Virtualize using a flat virtual list where some items are group headers and some are card rows.

**Approach:**
1. Flatten the grouped data into a list of `{ type: "header", project }` and `{ type: "row", avatars: Avatar[] }` items
2. Use `useVirtualizer` (list mode, not grid) with variable row heights:
   - Headers: ~40px
   - Card rows: ~280px (estimated)
3. Use `measureElement` for dynamic height measurement

**Acceptance Criteria:**
- [ ] AvatarsPage uses `useVirtualizer` for the avatar card grid
- [ ] Project group headers are rendered as virtual rows (variable height)
- [ ] Only visible cards (plus overscan) are in the DOM
- [ ] Filter changes (search, scene type filter) correctly update the virtual list
- [ ] Scroll position resets when filters change
- [ ] All avatar card interactions work: click to navigate, hover effects, drop zone
- [ ] Loading skeletons still show during data fetch
- [ ] `npx tsc --noEmit` passes

---

## Phase 4: ScenesPage Browse Clip List Virtualization

### Task 4.1: Virtualize ScenesPage Browse Clip List
**File:** `apps/frontend/src/app/pages/ScenesPage.tsx`
**Depends on:** Task 1.1

ScenesPage renders `BrowseClipItem` components in a flex column (lines 467-489). The page already uses server-side pagination with `page`/`pageSize` state, so virtualization applies within each page.

**Current code (lines 467-489):**
```tsx
<div className="flex flex-col gap-2">
  {filteredClips.map((clip) => (
    <BrowseClipItem key={clip.id} clip={clip} ... />
  ))}
</div>
```

**Replace with virtualized list:**
```tsx
const listScrollRef = useRef<HTMLDivElement>(null);
const listVirtualizer = useVirtualizer({
  count: filteredClips.length,
  getScrollElement: () => listScrollRef.current,
  estimateSize: () => 72, // approximate clip row height
  overscan: 10,
});

// In JSX:
<div ref={listScrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 350px)" }}>
  <div style={{ height: listVirtualizer.getTotalSize(), position: "relative" }}>
    {listVirtualizer.getVirtualItems().map((virtualItem) => {
      const clip = filteredClips[virtualItem.index];
      return (
        <div
          key={clip.id}
          ref={listVirtualizer.measureElement}
          data-index={virtualItem.index}
          style={{
            position: "absolute",
            top: virtualItem.start,
            left: 0,
            right: 0,
          }}
        >
          <BrowseClipItem clip={clip} ... />
        </div>
      );
    })}
  </div>
</div>
```

Also apply virtualization to the grid view mode (when `viewMode === "grid"`) using the same `useGridVirtualizer` pattern from Task 2.1.

**Acceptance Criteria:**
- [ ] ScenesPage list view uses `useVirtualizer`
- [ ] ScenesPage grid view uses `useGridVirtualizer`
- [ ] Only visible clips (plus overscan) are in the DOM
- [ ] Filter/sort changes correctly update the virtual list
- [ ] Scroll position resets when filters change or page changes
- [ ] All clip interactions work: click to open ClipPlaybackModal, select, bulk actions
- [ ] Pagination integrates correctly (virtualizer count updates when page data changes)
- [ ] View mode switch (list/grid) works correctly
- [ ] `npx tsc --noEmit` passes

---

## Phase 5: Accessibility & Polish

### Task 5.1: Add ARIA Attributes for Virtual Lists
**Files:** All three virtualized views

Add `aria-rowcount` and `aria-rowindex` to virtual list containers for screen reader compatibility.

**Acceptance Criteria:**
- [ ] Virtual list containers have `role="list"` or `role="grid"` as appropriate
- [ ] `aria-rowcount` set to total item count
- [ ] Each virtual item has `aria-rowindex` set to its true index
- [ ] Screen readers can announce "item X of Y" for virtualized items
- [ ] Keyboard navigation (Tab, arrow keys) works within virtual lists

### Task 5.2: Reset Scroll Position on Filter Changes
**Files:** All three virtualized views

Ensure scroll position resets to top when filters, search, or sort change.

```tsx
useEffect(() => {
  virtualizer.scrollToOffset(0);
}, [filterDependency1, filterDependency2, /* ... */]);
```

**Acceptance Criteria:**
- [ ] AvatarScenesTab: scroll resets when scene type filter or sort changes
- [ ] AvatarsPage: scroll resets when search, project filter, or scene type filter changes
- [ ] ScenesPage: scroll resets when any filter, search, or sort changes
- [ ] Page change on ScenesPage resets scroll to top

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/package.json` | `@tanstack/react-virtual` dependency |
| `apps/frontend/src/hooks/use-grid-virtualizer.ts` | New — reusable grid virtualizer hook |
| `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx` | Virtualized scene grid (Phase 2) |
| `apps/frontend/src/app/pages/AvatarsPage.tsx` | Virtualized avatar grid (Phase 3) |
| `apps/frontend/src/app/pages/ScenesPage.tsx` | Virtualized clip list/grid (Phase 4) |

---

## Dependencies

### Existing Components to Reuse
- `SceneCard` with `React.memo` from PRD-156 — ensures virtualized items skip unnecessary renders
- `BrowseClipItem` from ScenesPage — existing clip row component
- Existing CSS grid layout classes — `grid-cols-*` and `gap-*` values preserved
- Existing filter/sort state in each page

### New Infrastructure Needed
- `@tanstack/react-virtual` v3.x — single new dependency (~5KB gzipped)
- `use-grid-virtualizer.ts` — reusable hook for grid virtualization

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Install dependency — Task 1.1
2. Phase 2: AvatarScenesTab — Tasks 2.1–2.2 (highest impact, 100+ cards)
3. Phase 3: AvatarsPage — Task 3.1
4. Phase 4: ScenesPage — Task 4.1
5. Phase 5: Accessibility & polish — Tasks 5.1–5.2

**MVP Success Criteria:**
- AvatarScenesTab with 100+ scenes: DOM contains ~25 cards, 60fps scrolling
- AvatarsPage with 200+ avatars: DOM contains ~25 cards, fast initial render
- ScenesPage with 500+ clips: DOM contains ~20 items, smooth scrolling
- Grid layouts look identical to current implementation
- All interactions work correctly
- `npx tsc --noEmit` passes with zero errors

### Post-MVP Enhancements
- Extract shared `<VirtualizedGrid>` component to `components/composite/`
- DerivedClipsPage virtualization
- Infinite scroll with `useInfiniteQuery` + `useVirtualizer`

---

## Notes

1. **PRD-156 dependency**: SceneCard `React.memo` (PRD-156, Tasks 2.1-2.2) should land before this work. Without memo, virtualization still helps by reducing DOM nodes, but memo prevents unnecessary re-renders of visible items.
2. **Scroll container**: Each virtualized view needs a scrollable container with a fixed height. Use `calc(100vh - Npx)` where N accounts for header, toolbar, and footer heights. Exact values depend on the page layout.
3. **Grid column calculation**: Use `ResizeObserver` on the container to dynamically calculate column count from container width and minimum card width. This preserves the responsive behavior of the existing CSS grid.
4. **Server-side pagination (ScenesPage)**: The page already paginates server-side. Virtualization is a secondary safeguard within each page (25 items default). The real benefit comes if page sizes increase or pagination is replaced with infinite scroll.
5. **Dynamic item heights**: If any cards have dynamic heights (expanded states), use `measureElement` from `@tanstack/react-virtual` instead of `estimateSize` alone.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-158
