# PRD-157: Frontend Data Fetching Optimization

**Document ID:** 157-prd-frontend-data-fetching-optimization
**Status:** Not Started
**Author:** AI Product Manager
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

---

## 1. Introduction / Overview

The frontend performance audit (2026-03-30) identified excessive and wasteful network activity stemming from four patterns: inline `api.get` calls that bypass TanStack Query's cache and deduplication, unconditional `refetchInterval` polling on hooks that don't need it, a dashboard polling storm where 7+ queries fire every 30 seconds, and continued polling when the browser tab is hidden.

This PRD addresses all four data fetching findings as a cohesive optimization pass. The goal is to reduce idle network requests by 80%+ without sacrificing data freshness where it matters.

Source: `design/progress/PERFORMANCE-AUDIT.md` — Findings 5, 6, 8, 12 (quick win).

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-109** (Scene Video Versioning) — ClipPlaybackModal tag fetching
- **PRD-117** (System Status Footer Bar) — footer polling
- **PRD-112** (Project Hub & Management) — project avatar hooks

### Related
- **PRD-156** (Frontend Re-render Optimization) — complementary performance work
- **PRD-159** (Frontend Query Consolidation) — dashboard endpoint consolidation builds on this

## 3. Goals

### Primary Goals
1. Convert all inline `api.get`/`api.put` calls in ClipPlaybackModal to TanStack Query hooks for caching and deduplication.
2. Remove unconditional `refetchInterval` from project/avatar hooks that don't need real-time updates.
3. Consolidate dashboard widget polling into a single backend endpoint.
4. Pause all polling when the browser tab is hidden.

### Secondary Goals
1. Reduce background network traffic on idle pages by 80%+.
2. Improve perceived performance when navigating between clips (cached tags load instantly).

## 4. User Stories

- **US-1:** As a user navigating between clips in ClipPlaybackModal, I want previously-viewed clip tags to load instantly from cache instead of refetching every time.
- **US-2:** As a user viewing a project detail page with no active generation, I want the app to stop polling every 15 seconds, reducing battery drain and network noise.
- **US-3:** As a user with the app open in a background tab, I want all polling to pause automatically and resume when I return to the tab.
- **US-4:** As a user on the dashboard, I want a single consolidated status update every 30 seconds instead of 7+ separate requests.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Convert ClipPlaybackModal Inline API Calls to TanStack Query

**Description:** Replace raw `api.get` and `api.put` calls inside `useEffect` with proper TanStack Query hooks. This enables caching, deduplication, and automatic refetching.

**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx:66-72, 368`

**Current code (tags fetch):**
```tsx
useEffect(() => {
  api.get<TagInfo[]>(`/entities/scene_video_version/${clip.id}/tags`)
    .then(setClipTags)
    .catch(() => setClipTags([]));
}, [clip?.id]);
```

**Current code (notes save):**
```tsx
api.put(`/scenes/${sceneId}/versions/${clipId}`, { notes: value })
```

**Fix:**
1. Create `useClipTags(clipId: number)` query hook returning `{ data, isLoading }`
2. Create `useUpdateClipNotes()` mutation hook with optimistic update
3. Replace the `useEffect` + `useState` pattern with the query hook
4. Replace the inline `api.put` with the mutation hook

**Acceptance Criteria:**
- [ ] New hook file: `features/scenes/hooks/use-clip-tags.ts` with `useClipTags(clipId)` query
- [ ] New hook or addition to existing hooks: `useUpdateClipNotes()` mutation
- [ ] ClipPlaybackModal uses `useClipTags` instead of `useEffect` + `api.get` + `useState`
- [ ] ClipPlaybackModal uses `useUpdateClipNotes` instead of inline `api.put`
- [ ] Navigating prev/next between clips loads tags from cache for previously-viewed clips (verify in Network tab)
- [ ] Query key follows project convention: `["clip-tags", clipId]`
- [ ] Tags still load correctly for new clips not yet in cache
- [ ] Notes save correctly with the mutation hook

**Technical Notes:** Follow the existing hook pattern in `features/scenes/hooks/`. The tags endpoint is `GET /entities/scene_video_version/{id}/tags`. The notes endpoint is `PUT /scenes/{scene_id}/versions/{clip_id}` with `{ notes }` body.

---

#### Requirement 1.2: Make Unconditional Polling Conditional

**Description:** Remove `refetchInterval` from hooks that poll every 15-30 seconds regardless of whether active generation is happening. Existing `invalidateQueries` calls in mutation hooks already handle data freshness after user actions.

**Files:**
- `apps/frontend/src/features/projects/hooks/use-project-avatars.ts:35` — `refetchInterval: 15_000`
- `apps/frontend/src/features/projects/hooks/use-projects.ts:56` — `refetchInterval: 15_000`
- `apps/frontend/src/features/projects/hooks/use-avatar-deliverables.ts:18,45,66` — `refetchInterval: 15_000` and `refetchInterval: 30_000`

**Fix:**
1. Remove all `refetchInterval` from these hooks
2. Add an optional `poll?: boolean` parameter (default `false`) to each hook for callers that genuinely need real-time updates (e.g., during active generation)
3. When `poll` is true, set `refetchInterval: 15_000` (or appropriate interval)
4. Verify that existing mutation hooks (`useCreateProject`, `useUpdateAvatar`, etc.) already call `queryClient.invalidateQueries` for these query keys

**Acceptance Criteria:**
- [ ] `use-project-avatars.ts` — `refetchInterval` removed; optional `poll` parameter added
- [ ] `use-projects.ts` — `refetchInterval` removed; optional `poll` parameter added
- [ ] `use-avatar-deliverables.ts` — all three `refetchInterval` removed; optional `poll` parameter added
- [ ] Default behavior (no `poll` argument) does NOT poll
- [ ] Data still updates immediately after mutations (via `invalidateQueries`)
- [ ] Network tab shows zero periodic requests on idle project detail pages
- [ ] Pages that need polling (e.g., during generation) can opt in with `poll: true`

**Technical Notes:** Search for `invalidateQueries` calls that target `["projects"]`, `["project-avatars"]`, and `["deliverables"]` query keys to confirm mutations already handle freshness.

---

#### Requirement 1.3: Consolidate Dashboard Polling into Single Endpoint

**Description:** The dashboard currently fires 7 separate polling queries every 30 seconds. Consolidate into a single backend endpoint that returns all dashboard widget data in one response.

**File:** `apps/frontend/src/features/dashboard/hooks/use-dashboard.ts:129-231`

**Current polling queries (7 at 30s each):**
1. Queue counts
2. Recent jobs
3. Worker status
4. Active generations
5. Disk usage
6. System health
7. Cloud GPU status

**Fix:**
1. Create a new backend endpoint: `GET /api/v1/dashboard/status`
2. The endpoint aggregates all 7 data sources into a single response
3. Replace the 7 individual `useQuery` hooks with a single `useQuery` hook polling at 30s
4. Destructure the response into the same data shapes the dashboard widgets expect

**Acceptance Criteria:**
- [ ] New backend endpoint: `GET /api/v1/dashboard/status` returns all dashboard widget data
- [ ] Response shape includes all 7 data categories with their existing type structures
- [ ] Frontend `use-dashboard.ts` uses a single `useQuery` with `refetchInterval: 30_000`
- [ ] Network tab shows 1 request per 30s on the dashboard instead of 7
- [ ] All dashboard widgets render identical data as before
- [ ] Individual widget query hooks remain available for use on non-dashboard pages
- [ ] Backend endpoint completes within 200ms (parallel DB queries internally)

**Technical Notes:** The backend endpoint should execute all queries in parallel using `tokio::join!` or `futures::join_all`. Keep the individual query hooks — they are used on non-dashboard pages. The dashboard hook switches to the consolidated endpoint.

---

#### Requirement 1.4: Add Visibility-Based Polling Pause

**Description:** When the browser tab is hidden (user switched to another tab or minimized the window), all `refetchInterval` polling should pause automatically and resume when the tab becomes visible again.

**Fix:**
1. Create a shared utility: `features/shared/hooks/use-visible-polling.ts` (or similar)
2. Use `document.visibilityState` and the `visibilitychange` event
3. Expose a hook or configure the TanStack Query `queryClient` default to set `refetchInterval` to `false` when hidden
4. Alternative: TanStack Query v5 already supports `refetchIntervalInBackground: false` — verify this is set as a default in the QueryClient configuration

**Acceptance Criteria:**
- [ ] When the browser tab is hidden, zero polling requests fire (verify in Network tab)
- [ ] When the tab becomes visible again, an immediate refetch fires, then polling resumes at the normal interval
- [ ] This applies to ALL hooks with `refetchInterval` across the entire app
- [ ] Implementation uses either `refetchIntervalInBackground: false` on QueryClient defaults, or a custom hook wrapping `document.visibilityState`
- [ ] No regressions in data freshness when the tab is visible

**Technical Notes:** TanStack Query v5 `refetchIntervalInBackground` defaults to `false` in some configurations. Check the QueryClient setup in `apps/frontend/src/lib/query-client.ts` (or wherever it's configured). If it's already false, this requirement is just verification. If not, add `refetchIntervalInBackground: false` to the default query options.

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Smart Polling Based on Generation State
- Only enable polling on project pages when there are active generations for that project
- Use WebSocket events or a lightweight "has active jobs" check to toggle polling

## 6. Non-Functional Requirements

### Performance
- Idle project detail pages: zero periodic network requests (down from ~4 every 15s)
- Dashboard: 1 request per 30s (down from 7 per 30s)
- Background tabs: zero polling requests
- ClipPlaybackModal tag navigation: instant from cache (down from ~100-200ms network round trip)

### Backwards Compatibility
- All existing mutation-based invalidation must continue working
- Dashboard widgets must render identical data
- No changes to API response shapes for existing endpoints

## 7. Non-Goals (Out of Scope)

- Re-render optimization (covered by PRD-156)
- N+1 query consolidation for AvatarsPage (covered by PRD-159)
- WebSocket-based real-time updates replacing polling entirely (post-MVP)
- Reducing polling intervals for generation-active pages (those are already well-tuned at 2-3s)

## 8. Design Considerations

No visual changes. Network tab and Performance monitor are the verification tools.

## 9. Technical Considerations

### Existing Code to Reuse
- TanStack Query `queryClient` configuration — check for `refetchIntervalInBackground` default
- Existing hook patterns in `features/scenes/hooks/` for new clip tags/notes hooks
- Existing dashboard backend handlers for the consolidated endpoint

### Database Changes
None.

### API Changes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard/status` | New — consolidated dashboard widget data |

The new endpoint aggregates data from existing internal queries. No new database tables or columns.

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Dashboard endpoint partial failure | Return available data with null for failed sections; frontend renders available widgets |
| Tab hidden during active generation | Polling pauses; on tab focus, immediate refetch catches up |
| ClipPlaybackModal opened for a clip with no tags | `useClipTags` returns empty array (same as current behavior) |
| Notes save fails | Mutation hook triggers error toast; optimistic update rolls back |
| Polling removed but mutation invalidation missing | Audit all mutation hooks before removing refetchInterval to confirm invalidation exists |

## 11. Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Network requests on idle project page (per minute) | ~16 (4 hooks x 4/min) | 0 |
| Network requests on dashboard (per minute) | ~14 (7 hooks x 2/min) | 2 (1 hook x 2/min) |
| Network requests in background tab (per minute) | Same as foreground | 0 |
| ClipPlaybackModal tag load time (cached clip) | 100-200ms | 0ms (cache hit) |

## 12. Testing Requirements

- **Manual:** Open project detail page, observe Network tab for 2 minutes — should show zero periodic requests
- **Manual:** Open dashboard, observe Network tab — should show 1 request per 30s cycle
- **Manual:** Switch to another tab for 1 minute, check Network tab — zero requests while hidden
- **Manual:** Navigate prev/next between clips in ClipPlaybackModal — second visit to a clip shows no tag request
- **Automated:** Existing test suites pass without modification

## 13. Open Questions

1. Does the current QueryClient configuration already set `refetchIntervalInBackground: false`? If so, Requirement 1.4 reduces to verification only.
2. Are there any pages besides the dashboard that depend on the individual widget query hooks' polling behavior?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from performance audit findings 5, 6, 8, 12 |
