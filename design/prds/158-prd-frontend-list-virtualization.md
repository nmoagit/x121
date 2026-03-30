# PRD-158: Frontend List Virtualization

**Document ID:** 158-prd-frontend-list-virtualization
**Status:** Not Started
**Author:** AI Product Manager
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

---

## 1. Introduction / Overview

The frontend performance audit (2026-03-30) found that all list and grid views render every item to the DOM regardless of visibility. AvatarScenesTab can render 100+ SceneCards (each with video thumbnails, buttons, and conditional logic), AvatarsPage renders all avatar cards, and ScenesPage renders the full browse clip list. With zero virtualization anywhere in the codebase, large lists cause significant initial render time, high memory consumption, and sluggish scrolling.

This PRD introduces `@tanstack/react-virtual` as the virtualization library and applies it to the three highest-impact list/grid views.

Source: `design/progress/PERFORMANCE-AUDIT.md` — Finding 3.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-156** (Frontend Re-render Optimization) — SceneCard `React.memo` wrap (Requirement 1.4) must be done first for virtualization to be effective
- **PRD-112** (Project Hub & Management) — AvatarsPage avatar card grid
- **PRD-109** (Scene Video Versioning) — ScenesPage browse clip list

### Related
- **PRD-153** (Derived Clip Import) — DerivedClipsPage may benefit from virtualization post-MVP
- **PRD-29** (Design System) — grid layout patterns

## 3. Goals

### Primary Goals
1. Add `@tanstack/react-virtual` as a project dependency.
2. Virtualize the AvatarScenesTab scene card grid (highest impact — 100+ cards).
3. Virtualize the AvatarsPage avatar card grid.
4. Virtualize the ScenesPage browse clip list.

### Secondary Goals
1. Reduce DOM node count on large lists from N items to ~20 visible items.
2. Establish a reusable virtualized grid/list pattern for future components.
3. Maintain smooth scrolling at 60fps even with 500+ items.

## 4. User Stories

- **US-1:** As a user viewing an avatar with 100+ scenes, I want the scenes tab to load quickly and scroll smoothly instead of freezing while rendering all cards.
- **US-2:** As an admin browsing 200+ avatars across projects, I want the avatars page to remain responsive.
- **US-3:** As a reviewer browsing 500+ clips on the scenes page, I want instant page load and smooth scrolling.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Add @tanstack/react-virtual Dependency

**Description:** Install `@tanstack/react-virtual` as a frontend dependency. This library provides lightweight hooks for virtualizing lists and grids with full control over rendering.

**Acceptance Criteria:**
- [ ] `@tanstack/react-virtual` is added to `apps/frontend/package.json` dependencies
- [ ] Library version is compatible with React 19 and the existing TanStack ecosystem (v3.x)
- [ ] No conflicts with existing dependencies
- [ ] Import works: `import { useVirtualizer } from '@tanstack/react-virtual'`

**Technical Notes:** `@tanstack/react-virtual` v3.x is the current stable release and is compatible with React 19. It provides `useVirtualizer` for lists and `useWindowVirtualizer` for window-based scrolling.

---

#### Requirement 1.2: AvatarScenesTab Scene Grid Virtualization

**Description:** The AvatarScenesTab renders all SceneCards in a grid. Virtualize this grid so only visible cards (plus an overscan buffer) are rendered to the DOM.

**File:** `apps/frontend/src/features/avatars/tabs/AvatarScenesTab.tsx:750-773`

**Current pattern:**
```tsx
{slots.map((slot) => (
  <SceneCard ... />
))}
```

**Fix:**
1. Wrap the grid container in a scrollable div with a ref
2. Use `useVirtualizer` with the container ref, item count, and estimated item size
3. Render only the virtual items with absolute positioning (or transform) within the grid
4. Handle responsive column count (the grid is CSS grid with responsive columns)

**Acceptance Criteria:**
- [ ] AvatarScenesTab uses `useVirtualizer` for the SceneCard grid
- [ ] Only visible cards (plus ~5 overscan) are in the DOM at any time
- [ ] DOM node count with 100 scenes: ~25 cards instead of 100
- [ ] Scrolling is smooth at 60fps with 200+ scenes
- [ ] Grid layout (responsive columns, gaps) looks identical to current implementation
- [ ] All SceneCard interactions work: click, schedule, cancel, select, context menu
- [ ] Keyboard navigation (if any) still works within the virtualized grid
- [ ] Empty state still renders when no scenes exist

**Technical Notes:** For grid virtualization, use `useVirtualizer` in "grid" mode by calculating rows based on column count. Measure column count from the container width and card min-width. The overscan should be at least 2 rows to prevent flash of empty content during fast scrolling.

---

#### Requirement 1.3: AvatarsPage Avatar Card Grid Virtualization

**Description:** AvatarsPage renders all avatar cards in a grid grouped by project. Virtualize the avatar card list while preserving project group headers.

**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx:219+`

**Acceptance Criteria:**
- [ ] AvatarsPage uses `useVirtualizer` for the avatar card grid
- [ ] Project group headers are rendered as non-card rows within the virtual list
- [ ] Only visible cards (plus overscan) are in the DOM
- [ ] Filter changes (search, scene type filter) correctly update the virtual list
- [ ] Scroll position resets when filters change
- [ ] All avatar card interactions work: click to navigate, drag-drop (if applicable), hover effects
- [ ] Loading skeletons still show during data fetch

**Technical Notes:** Since avatars are grouped by project, treat each group header as a virtual row of height ~40px, and each row of cards as another virtual row. Use a flat virtual list where some items are headers and some are card rows. This avoids nested virtualizers.

---

#### Requirement 1.4: ScenesPage Browse Clip List Virtualization

**Description:** ScenesPage renders a list of browse clips that can grow large. Virtualize this list.

**File:** `apps/frontend/src/app/pages/ScenesPage.tsx:219+`

**Acceptance Criteria:**
- [ ] ScenesPage clip list uses `useVirtualizer`
- [ ] Only visible clips (plus overscan) are in the DOM
- [ ] Filter/sort changes correctly update the virtual list
- [ ] Scroll position resets when filters change
- [ ] All clip interactions work: click to open ClipPlaybackModal, select, bulk actions
- [ ] Pagination (if server-side) integrates with virtualization (fetch more as user scrolls)

**Technical Notes:** If ScenesPage uses server-side pagination, virtualization applies within each loaded page. If it loads all clips at once, virtualization becomes the primary performance safeguard.

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Shared Virtualized Grid Component
- Extract a reusable `<VirtualizedGrid>` component to `@/components/composite/`
- Props: `items`, `renderItem`, `estimatedItemSize`, `columns`, `gap`
- Used across all grid views for consistency

#### Requirement 2.2: DerivedClipsPage Virtualization
- Apply the same pattern to the derived clips browse page

#### Requirement 2.3: Infinite Scroll with Virtualization
- Combine `useInfiniteQuery` with `useVirtualizer` for seamless scroll-to-load-more

## 6. Non-Functional Requirements

### Performance
- Initial render time for 100+ items: under 100ms (down from 500ms+)
- DOM node count: proportional to viewport, not data size (~20-30 nodes regardless of list size)
- Scroll performance: 60fps with 500+ items
- Memory: proportional to visible items, not total items

### Bundle Size
- `@tanstack/react-virtual` adds ~5KB gzipped — acceptable

### Accessibility
- Virtual items must be navigable via keyboard (arrow keys, tab)
- Screen readers must be able to access all items (use `aria-rowcount`, `aria-rowindex`)

## 7. Non-Goals (Out of Scope)

- Infinite scrolling / cursor-based pagination (post-MVP)
- Virtualizing small lists (< 50 items) — the overhead is not justified
- Virtual scrolling for the Sidebar navigation
- Window-based virtualization (all targets use container-based scrolling)

## 8. Design Considerations

- Virtualized grids must look identical to current CSS grid layouts
- No visual indicators that virtualization is active (no scroll jump, no flash of empty content)
- Overscan buffer must be large enough to prevent visible blank areas during moderate scrolling speed

## 9. Technical Considerations

### Existing Code to Reuse
- Current CSS grid layout classes — preserve `grid-cols-*` and `gap-*` values
- SceneCard `React.memo` from PRD-156 — ensures virtualized items skip unnecessary renders
- Existing filter/sort state management in each page

### New Dependencies
- `@tanstack/react-virtual` v3.x — single new dependency

### Database Changes
None.

### API Changes
None.

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Window resize changes column count | Recalculate virtualizer lanes on resize (use `ResizeObserver` or recalculate on container width change) |
| Filter results in 0 items | Render existing EmptyState component (no virtualizer needed) |
| Filter results in < 20 items | Still use virtualizer (negligible overhead) for code consistency |
| Very fast scrolling | Overscan of 5+ rows prevents blank flash; consider increasing to 10 for very fast scroll |
| Dynamic item height (e.g., expanded card) | Use `measureElement` from `@tanstack/react-virtual` for dynamic height measurement |
| Browser back button | Scroll position may need to be restored — use `scrollRestoration` or save position in session state |

## 11. Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| AvatarScenesTab DOM nodes (100 scenes) | ~5000+ | ~500 |
| AvatarsPage initial render (200 avatars) | ~800ms | ~100ms |
| ScenesPage DOM nodes (500 clips) | ~15000+ | ~500 |
| Memory usage (500 item list) | ~50MB | ~10MB |
| Scroll FPS (fast scrolling, 200 items) | ~30fps | 60fps |

## 12. Testing Requirements

- **Manual:** Open AvatarScenesTab with 100+ scenes — verify smooth scrolling, correct rendering at all scroll positions
- **Manual:** Scroll to bottom and back up — all cards render correctly with no gaps or duplicates
- **Manual:** Apply filter while scrolled down — list resets to top, correct items shown
- **Manual:** Resize browser window — grid columns adjust, virtualization recalculates
- **Performance:** Use Chrome DevTools Performance tab to measure FPS during scrolling
- **Performance:** Use Chrome DevTools Elements tab to count DOM nodes (should be ~20-30 list items regardless of total)
- **Automated:** Existing test suites pass without modification

## 13. Open Questions

1. Does AvatarScenesTab use dynamic card heights (e.g., expanded details), or are all cards the same height? Dynamic heights require `measureElement`.
2. Does ScenesPage use server-side pagination or load all clips? This affects the virtualization strategy.
3. Should we extract a shared `<VirtualizedGrid>` component in MVP or keep it per-page initially?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from performance audit finding 3 |
