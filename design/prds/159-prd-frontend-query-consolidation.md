# PRD-159: Frontend Query Consolidation & Bundle Optimization

**Document ID:** 159-prd-frontend-query-consolidation
**Status:** Not Started
**Author:** AI Product Manager
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

---

## 1. Introduction / Overview

The frontend performance audit (2026-03-30) identified three remaining optimization targets: an N+1 query waterfall on AvatarsPage that fires 3N HTTP requests (where N is the number of projects), a 962-line ClipPlaybackModal component with 14 useState hooks that needs sub-component extraction for render boundary isolation, and large barrel re-exports that may defeat Vite/Rollup tree-shaking.

These are lower-priority items (P4 in the audit) but still represent meaningful improvements for admin users with many projects and for long-term bundle maintainability.

Source: `design/progress/PERFORMANCE-AUDIT.md` — Findings 2, 11, 12.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-112** (Project Hub & Management) — AvatarsPage queries
- **PRD-138** (Multi-Pipeline Architecture) — pipeline scoping for the browse endpoint
- **PRD-70** (On-Frame Annotation & Markup) — annotation state in ClipPlaybackModal
- **PRD-156** (Frontend Re-render Optimization) — Zustand selector fix must land first

### Related
- **PRD-157** (Frontend Data Fetching Optimization) — complementary network optimization
- **PRD-109** (Scene Video Versioning) — ClipPlaybackModal component structure

## 3. Goals

### Primary Goals
1. Replace the AvatarsPage N+1 `useQueries` pattern with a single backend endpoint that returns aggregated avatar browse data.
2. Extract ClipPlaybackModal into focused sub-components to create proper render boundaries.
3. Audit barrel exports with `vite-bundle-visualizer` and fix any tree-shaking failures.

### Secondary Goals
1. Reduce AvatarsPage initial HTTP requests from 3N to 1 (where N = project count).
2. Reduce ClipPlaybackModal component size from 962 lines to < 300 for the parent.
3. Keep production bundle size flat or reduce it.

## 4. User Stories

- **US-1:** As an admin with 10+ projects, I want the Avatars page to load with a single API call instead of 30+ simultaneous requests, so the page loads faster and my browser doesn't stall.
- **US-2:** As a reviewer using ClipPlaybackModal, I want annotation toolbar state changes to not re-render the video player, so playback stays smooth during annotation.
- **US-3:** As a developer, I want to verify that barrel exports don't bloat lazy-loaded route chunks.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Consolidate AvatarsPage N+1 Queries into Single Endpoint

**Description:** AvatarsPage currently fires three separate `useQueries` calls that each map over `displayProjectIds`, creating 3N simultaneous HTTP requests. Replace with a single backend endpoint.

**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx:132-155`

**Current code:**
```tsx
const avatarQueries = useQueries({ queries: displayProjectIds.map(...) });
const groupQueries = useQueries({ queries: displayProjectIds.map(...) });
const speechLangQueries = useQueries({ queries: displayProjectIds.map(...) });
```

**Fix:**
1. Create a new backend endpoint: `GET /api/v1/avatars/browse?pipeline_id={id}`
2. The endpoint returns all avatars across all projects in the pipeline, with their group assignments and speech language counts included
3. Replace the three `useQueries` with a single `useQuery` calling the browse endpoint
4. Frontend transforms the response into the same data structures the page currently expects

**Backend endpoint response shape:**
```json
{
  "data": {
    "avatars": [
      {
        "id": 1,
        "uuid": "...",
        "name": "...",
        "project_id": 5,
        "group_id": 2,
        "group_name": "Group A",
        "thumbnail_url": "...",
        "speech_language_count": 3,
        "readiness": { "metadata": "complete", "images": "partial", ... }
      }
    ],
    "groups": [
      { "id": 2, "name": "Group A", "project_id": 5 }
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] New backend endpoint: `GET /api/v1/avatars/browse` with `pipeline_id` query parameter
- [ ] Endpoint returns avatars with embedded group and speech language data
- [ ] Endpoint uses JOINs or sub-queries — NOT N+1 queries internally
- [ ] Frontend `AvatarsPage` uses a single `useQuery` instead of three `useQueries`
- [ ] Page loads with 1 HTTP request instead of 3N (verify in Network tab with 5+ projects)
- [ ] All existing AvatarsPage features work: search, filter, group display, card interactions
- [ ] Response time for the browse endpoint: < 200ms for 200 avatars across 10 projects

**Technical Notes:** The backend should use a single SQL query with JOINs to `avatar_groups` and a lateral subquery or aggregate for speech language counts. The `pipeline_id` filter scopes to projects belonging to that pipeline. Follow the existing `browse` endpoint pattern from other resources.

---

#### Requirement 1.2: Extract ClipPlaybackModal Sub-Components

**Description:** ClipPlaybackModal is a 962-line component with 14 `useState` hooks and 3 Zustand subscriptions. Any state change triggers a full re-render of the video player, canvas, annotation list, toolbar, and metadata panel. Extract sub-components to create render boundaries.

**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` (962 lines)

**Proposed extraction:**
1. **`ClipVideoPlayer`** — video element, playback controls, canvas overlay. Owns: `isPlaying`, `currentFrame`, `duration` state.
2. **`ClipAnnotationToolbar`** — annotation mode toggle, drawing tools, undo/redo. Owns: `annotationMode`, `activeTool` state.
3. **`ClipAnnotationList`** — list of frame annotations with edit/delete. Reads from Zustand store.
4. **`ClipMetadataPanel`** — tags, notes, generation snapshot. Owns: `clipTags`, `notes` state.
5. **`ClipPlaybackModal`** (parent) — modal shell, clip navigation (prev/next), remaining shared state.

**Acceptance Criteria:**
- [ ] ClipPlaybackModal parent component is under 300 lines
- [ ] At least 3 sub-components extracted into separate files in `features/scenes/components/`
- [ ] Each sub-component manages its own local state (not lifted to parent)
- [ ] State changes in the annotation toolbar do NOT cause the video player to re-render
- [ ] State changes in the metadata panel do NOT cause the annotation list to re-render
- [ ] All 14 original `useState` hooks are distributed among sub-components (not all in parent)
- [ ] All existing functionality works identically: video playback, annotations, tags, notes, navigation, keyboard shortcuts
- [ ] React DevTools Profiler shows isolated re-render boundaries for each sub-component

**Technical Notes:** Use props for inter-component communication where needed (e.g., current frame from player to annotation list). For shared state like `clipId`, use the existing modal context or pass as props. Zustand subscriptions should live in the sub-component that uses the data.

---

#### Requirement 1.3: Audit Barrel Exports with Bundle Visualizer

**Description:** Large barrel re-export files may defeat Vite/Rollup tree-shaking, causing lazy-loaded route chunks to include unused code from feature modules.

**Files:**
- `apps/frontend/src/features/scene-catalogue/index.ts` — 98 lines, 22 components + 18 hooks
- `apps/frontend/src/features/image-catalogue/index.ts` — 82 lines
- `apps/frontend/src/features/delivery/index.ts` — 78 lines
- `apps/frontend/src/features/queue/index.ts` — 74 lines

**Fix:**
1. Run `vite-bundle-visualizer` (or `rollup-plugin-visualizer`) on the production build
2. Inspect each lazy-loaded route chunk for unexpected inclusions from barrel imports
3. If tree-shaking failures are found: switch affected imports from barrel to direct path imports
4. Document findings regardless of outcome

**Acceptance Criteria:**
- [ ] `vite-bundle-visualizer` (or equivalent) run on production build; output screenshot/report saved
- [ ] Each of the 4 barrel files analyzed for tree-shaking effectiveness
- [ ] If barrel imports cause chunk bloat: affected imports converted to direct path imports (e.g., `import { SceneCatalogueEditor } from '@/features/scene-catalogue/SceneCatalogueEditor'`)
- [ ] If tree-shaking works correctly: documented as "verified, no action needed"
- [ ] Production bundle size does not increase; ideally decreases if bloat was found
- [ ] Build still succeeds with no import errors

**Technical Notes:** Install `rollup-plugin-visualizer` as a dev dependency if not already present. Add a `build:analyze` script to `package.json`. The key indicator is whether a lazy route chunk (e.g., the queue page chunk) includes code from unrelated feature barrels (e.g., scene-catalogue components).

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: ClipPlaybackModal useReducer Migration
- Consolidate related annotation states into a `useReducer` for predictable state transitions
- Reduces the number of individual state setters that can cause re-renders

#### Requirement 2.2: Per-Route Code Splitting Audit
- Review all lazy routes for optimal chunk boundaries
- Ensure heavy libraries (video player, canvas) are only in chunks that use them

## 6. Non-Functional Requirements

### Performance
- AvatarsPage load: 1 HTTP request regardless of project count (down from 3N)
- AvatarsPage browse endpoint: < 200ms for 200 avatars
- ClipPlaybackModal: isolated re-render boundaries between player, toolbar, and annotation list
- Production bundle: no size increase; potential decrease from tree-shaking fixes

### Code Quality
- ClipPlaybackModal parent under 300 lines
- Each extracted sub-component under 250 lines
- Clear prop interfaces between sub-components

## 7. Non-Goals (Out of Scope)

- Rewriting ClipPlaybackModal from scratch — extract and organize, don't redesign
- Removing barrel exports entirely — they're convenient for developer ergonomics; just fix tree-shaking if needed
- Optimizing individual SQL queries on existing endpoints
- Adding new UI features to ClipPlaybackModal

## 8. Design Considerations

No visual changes. ClipPlaybackModal must look and behave identically after extraction.

## 9. Technical Considerations

### Existing Code to Reuse
- Existing avatar query hooks — keep them for use in non-browse contexts
- Existing ClipPlaybackModal keyboard shortcut bindings — preserve during extraction
- Existing barrel export files — modify only if tree-shaking audit shows problems

### Database Changes
None for frontend changes. The backend browse endpoint uses existing tables with a new JOIN query.

### API Changes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/avatars/browse?pipeline_id={id}` | New — aggregated avatar data with groups and speech counts |

### Backend Implementation Notes
The browse endpoint query should be roughly:
```sql
SELECT a.*, ag.name as group_name,
       (SELECT COUNT(DISTINCT cs.language_id) FROM character_speeches cs WHERE cs.character_id = a.id) as speech_language_count
FROM characters a
LEFT JOIN avatar_groups ag ON a.group_id = ag.id
JOIN projects p ON a.project_id = p.id
WHERE p.pipeline_id = $1 AND a.deleted_at IS NULL
ORDER BY p.name, ag.sort_order, a.name
```

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Browse endpoint with no projects in pipeline | Return empty arrays |
| Browse endpoint with 1000+ avatars | Paginate with cursor-based pagination (add `limit`/`after` params) |
| ClipPlaybackModal sub-component communication failure | Use TypeScript interfaces to enforce prop contracts at compile time |
| Tree-shaking audit shows no issues | Document as "verified clean" — no code changes needed for Requirement 1.3 |
| Barrel export removal breaks imports elsewhere | Search for all import sites before modifying; update in a single commit |

## 11. Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| AvatarsPage HTTP requests (10 projects) | 30 | 1 |
| AvatarsPage load time (10 projects) | ~2s (waterfall) | ~300ms |
| ClipPlaybackModal parent LOC | 962 | < 300 |
| ClipPlaybackModal useState hooks in parent | 14 | < 5 |
| Bundle size (lazy route chunks) | Baseline | Same or smaller |

## 12. Testing Requirements

- **Manual:** Open AvatarsPage with 5+ projects, verify Network tab shows 1 request
- **Manual:** Verify all avatar card features work: search, filter by scene type, group headers, click-to-navigate
- **Manual:** Open ClipPlaybackModal, use all features: play/pause, annotations, tags, notes, prev/next navigation
- **Manual:** In React DevTools Profiler, verify annotation toolbar interaction doesn't re-render video player
- **Manual:** Run `vite-bundle-visualizer`, save the output, review for barrel bloat
- **Automated:** Existing test suites pass without modification
- **Automated:** `npx tsc --noEmit` passes with zero errors

## 13. Open Questions

1. Should the browse endpoint support pagination for very large deployments (1000+ avatars), or is that a post-MVP concern?
2. Are there other consumers of the individual per-project avatar/group/speech query hooks that would break if removed?
3. For ClipPlaybackModal extraction: should `clipId` be passed as prop, or should a `ClipPlaybackContext` be created for sub-component communication?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from performance audit findings 2, 11, 12 |
