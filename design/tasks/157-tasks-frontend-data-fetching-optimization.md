# Task List: Frontend Data Fetching Optimization

**PRD Reference:** `design/prds/157-prd-frontend-data-fetching-optimization.md`
**Scope:** Convert inline API calls to TanStack Query hooks, remove unconditional polling, consolidate dashboard polling into a single endpoint, and add visibility-based polling pause.

## Overview

Four data fetching fixes that together reduce idle network requests by 80%+. The ClipPlaybackModal's inline `api.get` calls are replaced with proper TanStack Query hooks for caching. Unconditional `refetchInterval` is removed from project/avatar hooks. Dashboard widget polling is consolidated from 7 requests per 30s into 1. All polling pauses when the browser tab is hidden.

### What Already Exists
- `ClipPlaybackModal` at `features/scenes/ClipPlaybackModal.tsx` — inline `api.get` for tags at line 69, inline `api.put` for notes at line 368
- `use-project-avatars.ts` — `refetchInterval: 15_000` at line 35
- `use-projects.ts` — `refetchInterval: 15_000` on `useProjectStats` at line 56
- `use-avatar-deliverables.ts` — `refetchInterval: 15_000` at line 18, `refetchInterval: 30_000` at lines 45 and 66
- `use-dashboard.ts` — 7 hooks polling at `WIDGET_POLL_MS` (30s): `useActiveTasks` (line 125), `useProjectProgress` (line 140), `useDiskHealth` (line 148), `useActivityFeed` (line 170), `useReadinessSummaryWidget` (line 203), `useScheduledGenerationsWidget` (line 212), `useInfraStatusWidget` (line 221)
- QueryClient in `main.tsx:47-55` — `staleTime: 60_000`, no `refetchIntervalInBackground` set

### What We're Building
1. `useClipTags(clipId)` query hook + `useUpdateClipNotes()` mutation hook
2. Optional `poll` parameter on project/avatar hooks
3. Backend `GET /api/v1/dashboard/status` consolidated endpoint
4. Frontend `useDashboardStatus()` single polling hook
5. `refetchIntervalInBackground: false` on QueryClient defaults

### Key Design Decisions
1. Individual dashboard widget hooks are preserved — used on non-dashboard pages
2. The consolidated dashboard endpoint executes all queries in parallel server-side
3. `refetchIntervalInBackground: false` is the simplest visibility fix — one-line QueryClient change
4. Existing mutation hooks already call `invalidateQueries`, so removing polling is safe

---

## Phase 1: ClipPlaybackModal Query Hooks

### Task 1.1: Create useClipTags Query Hook
**File:** `apps/frontend/src/features/scenes/hooks/use-clip-tags.ts` (new file)

Create a TanStack Query hook for fetching clip tags, replacing the inline `api.get` in ClipPlaybackModal.

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TagInfo } from "@/components/domain/TagChip";

export const clipTagKeys = {
  all: ["clip-tags"] as const,
  detail: (clipId: number) => [...clipTagKeys.all, clipId] as const,
};

export function useClipTags(clipId: number) {
  return useQuery({
    queryKey: clipTagKeys.detail(clipId),
    queryFn: () => api.get<TagInfo[]>(`/entities/scene_video_version/${clipId}/tags`),
    enabled: clipId > 0,
  });
}
```

**Acceptance Criteria:**
- [ ] New file `features/scenes/hooks/use-clip-tags.ts` created
- [ ] Query key follows project convention: `["clip-tags", clipId]`
- [ ] `enabled: clipId > 0` prevents unnecessary fetch
- [ ] Tags cached by TanStack Query — second visit to same clip reads from cache
- [ ] `npx tsc --noEmit` passes

### Task 1.2: Create useUpdateClipNotes Mutation Hook
**File:** `apps/frontend/src/features/scenes/hooks/use-clip-tags.ts` (same file as Task 1.1)

Add a mutation hook for saving clip notes, replacing the inline `api.put` in ClipPlaybackModal.

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useUpdateClipNotes(sceneId: number, clipId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notes: string) =>
      api.put(`/scenes/${sceneId}/versions/${clipId}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
    },
  });
}
```

**Acceptance Criteria:**
- [ ] `useUpdateClipNotes(sceneId, clipId)` mutation hook exported
- [ ] Calls `PUT /scenes/{sceneId}/versions/{clipId}` with `{ notes }` body
- [ ] Invalidates scene queries on success
- [ ] `npx tsc --noEmit` passes

### Task 1.3: Replace Inline API Calls in ClipPlaybackModal
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`
**Depends on:** Tasks 1.1, 1.2

Replace the `useEffect` + `api.get` pattern (lines 66-72) and the inline `api.put` call with the new hooks.

**Current code (lines 54, 66-72):**
```tsx
const [clipTags, setClipTags] = useState<TagInfo[]>([]);
// ...
useEffect(() => {
  if (!clip) { setClipTags([]); setClipNotes(""); return; }
  setClipNotes(clip.notes ?? "");
  api.get<TagInfo[]>(`/entities/scene_video_version/${clip.id}/tags`)
    .then(setClipTags)
    .catch(() => setClipTags([]));
}, [clip?.id]);
```

**Replace with:**
```tsx
const { data: clipTags = [] } = useClipTags(clipId);
// ...
// In the useEffect, only handle clipNotes:
useEffect(() => {
  if (!clip) { setClipNotes(""); return; }
  setClipNotes(clip.notes ?? "");
}, [clip?.id]);
```

For the notes save, find the inline `api.put` call and replace with:
```tsx
const updateNotes = useUpdateClipNotes(sceneId, clipId);
// Then where notes are saved:
updateNotes.mutate(value);
```

Remove the `clipTags` useState and `clipNotesSaving` state that managed loading (the mutation hook handles that).

**Acceptance Criteria:**
- [ ] `useState<TagInfo[]>` for clipTags removed — uses `useClipTags` instead
- [ ] Inline `api.get` for tags removed from `useEffect`
- [ ] Inline `api.put` for notes replaced with `useUpdateClipNotes` mutation
- [ ] Navigating prev/next between clips loads tags from cache for previously-viewed clips (verify in Network tab)
- [ ] Tags still load correctly for new clips not yet in cache
- [ ] Notes save correctly with the mutation hook
- [ ] `npx tsc --noEmit` passes

---

## Phase 2: Remove Unconditional Polling

### Task 2.1: Make useProjectAvatars Polling Conditional
**File:** `apps/frontend/src/features/projects/hooks/use-project-avatars.ts`

Remove the unconditional `refetchInterval: 15_000` and add an optional `poll` parameter.

**Current code (lines 29-36):**
```tsx
export function useProjectAvatars(projectId: number) {
  return useQuery({
    queryKey: projectAvatarKeys.lists(projectId),
    queryFn: () =>
      api.get<Avatar[]>(`/projects/${projectId}/avatars`),
    enabled: projectId > 0,
    refetchInterval: 15_000,
  });
}
```

**Change to:**
```tsx
export function useProjectAvatars(projectId: number, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: projectAvatarKeys.lists(projectId),
    queryFn: () =>
      api.get<Avatar[]>(`/projects/${projectId}/avatars`),
    enabled: projectId > 0,
    ...(opts?.poll && { refetchInterval: 15_000 }),
  });
}
```

**Acceptance Criteria:**
- [ ] `refetchInterval: 15_000` removed from default behavior
- [ ] Optional `opts?.poll` parameter added (default: no polling)
- [ ] When `poll: true`, refetch interval is 15s
- [ ] Existing mutation hooks (`useCreateAvatar`, `useUpdateAvatar`, etc.) already call `invalidateQueries` for `projectAvatarKeys` — verify this
- [ ] `npx tsc --noEmit` passes

### Task 2.2: Make useProjectStats Polling Conditional
**File:** `apps/frontend/src/features/projects/hooks/use-projects.ts`

Remove the unconditional `refetchInterval: 15_000` from `useProjectStats` and add optional `poll` parameter.

**Current code (lines 51-58):**
```tsx
export function useProjectStats(id: number) {
  return useQuery({
    queryKey: projectKeys.stats(id),
    queryFn: () => api.get<ProjectStats>(`/projects/${id}/stats`),
    enabled: id > 0,
    refetchInterval: 15_000,
  });
}
```

**Change to:**
```tsx
export function useProjectStats(id: number, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: projectKeys.stats(id),
    queryFn: () => api.get<ProjectStats>(`/projects/${id}/stats`),
    enabled: id > 0,
    ...(opts?.poll && { refetchInterval: 15_000 }),
  });
}
```

**Acceptance Criteria:**
- [ ] `refetchInterval` removed from `useProjectStats` default behavior
- [ ] Optional `poll` parameter works when explicitly set
- [ ] `npx tsc --noEmit` passes

### Task 2.3: Make useAvatarDeliverables Polling Conditional
**File:** `apps/frontend/src/features/projects/hooks/use-avatar-deliverables.ts`

Remove unconditional `refetchInterval` from all three hooks: `useAvatarDeliverables` (line 18), `useBatchSceneAssignments` (line 45), `useBatchVariantStatuses` (line 66).

**Current code:**
```tsx
// Line 18
refetchInterval: 15_000,
// Line 45
refetchInterval: 30_000,
// Line 66
refetchInterval: 30_000,
```

**Change all three to use optional `poll` parameter:**
```tsx
export function useAvatarDeliverables(projectId: number, opts?: { poll?: boolean }) {
  return useQuery({
    // ...
    ...(opts?.poll && { refetchInterval: 15_000 }),
  });
}

export function useBatchSceneAssignments(projectId: number, opts?: { poll?: boolean }) {
  return useQuery({
    // ...
    ...(opts?.poll && { refetchInterval: 30_000 }),
  });
}

export function useBatchVariantStatuses(projectId: number, opts?: { poll?: boolean }) {
  return useQuery({
    // ...
    ...(opts?.poll && { refetchInterval: 30_000 }),
  });
}
```

**Acceptance Criteria:**
- [ ] All three `refetchInterval` lines removed from default behavior
- [ ] Optional `poll` parameter added to each hook
- [ ] Network tab shows zero periodic requests on idle project detail pages
- [ ] Data still updates immediately after mutations (via existing `invalidateQueries`)
- [ ] `npx tsc --noEmit` passes

### Task 2.4: Verify No Callers Break from Removed Polling
**Files:** All consumers of the modified hooks

Search all call sites for `useProjectAvatars`, `useProjectStats`, `useAvatarDeliverables`, `useBatchSceneAssignments`, `useBatchVariantStatuses`. Verify they don't rely on polling for correctness — only for "nice-to-have" background refresh.

If any callers genuinely need polling (e.g., during active generation), update them to pass `{ poll: true }`.

**Acceptance Criteria:**
- [ ] All call sites identified via grep
- [ ] Call sites that need polling updated to pass `{ poll: true }`
- [ ] Call sites that don't need polling left unchanged (get default no-poll behavior)
- [ ] Application works correctly for idle browsing and for active generation scenarios

---

## Phase 3: Dashboard Polling Consolidation

### Task 3.1: Create Backend Dashboard Status Endpoint
**File:** `apps/backend/crates/api/src/handlers/dashboard.rs`

Create a new endpoint `GET /api/v1/dashboard/status` that aggregates all dashboard widget data into a single response.

The endpoint should execute all widget queries in parallel using `tokio::join!` and return a combined response:

```rust
#[derive(Serialize)]
pub struct DashboardStatus {
    pub active_tasks: Vec<ActiveTaskItem>,
    pub project_progress: Vec<ProjectProgressItem>,
    pub disk_health: DiskHealthData,
    pub activity_feed: Vec<ActivityFeedItem>,
    pub readiness_summary: Option<ReadinessSummary>,
    pub scheduled_generations: Vec<Schedule>,
    pub infra_status: Option<FooterStatusData>,
}
```

**Acceptance Criteria:**
- [ ] New endpoint `GET /api/v1/dashboard/status` with optional `pipeline_id` query param
- [ ] Executes all widget queries in parallel (`tokio::join!`)
- [ ] Returns combined response with all 7 data categories
- [ ] Endpoint completes within 200ms for typical data volumes
- [ ] `infra_status` only populated for admin users (check auth role)
- [ ] Partial failure: if one sub-query fails, return `null` for that section, not 500
- [ ] Route wired in `routes/mod.rs` with auth required
- [ ] `cargo check` passes

### Task 3.2: Create useDashboardStatus Hook
**File:** `apps/frontend/src/features/dashboard/hooks/use-dashboard.ts`

Add a new consolidated hook that replaces the 7 individual polling hooks when used from the dashboard page.

```tsx
export interface DashboardStatus {
  active_tasks: ActiveTaskItem[];
  project_progress: ProjectProgressItem[];
  disk_health: DiskHealthData | null;
  activity_feed: ActivityFeedItem[];
  readiness_summary: ReadinessSummary | null;
  scheduled_generations: Schedule[];
  infra_status: FooterStatusData | null;
}

export function useDashboardStatus(pipelineId?: number) {
  const params = new URLSearchParams();
  if (pipelineId != null) params.set("pipeline_id", String(pipelineId));
  const qs = params.toString();
  const path = `/dashboard/status${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...dashboardKeys.all, "status", { pipelineId }],
    queryFn: () => api.get<DashboardStatus>(path),
    refetchInterval: WIDGET_POLL_MS,
  });
}
```

**Acceptance Criteria:**
- [ ] `useDashboardStatus` hook exported from `use-dashboard.ts`
- [ ] Calls `GET /api/v1/dashboard/status` with optional `pipeline_id`
- [ ] Polls at 30s interval
- [ ] Response type matches backend `DashboardStatus` shape
- [ ] Individual widget hooks (`useActiveTasks`, `useProjectProgress`, etc.) remain available for non-dashboard pages
- [ ] `npx tsc --noEmit` passes

### Task 3.3: Update Dashboard Page to Use Consolidated Hook
**Files:** Dashboard page component(s) that consume the 7 individual hooks

Replace the 7 individual `useQuery` hook calls on the dashboard page with `useDashboardStatus()`, destructuring the response into the same data shapes widgets expect.

**Acceptance Criteria:**
- [ ] Dashboard page uses `useDashboardStatus()` instead of 7 individual hooks
- [ ] Each widget receives its data from the destructured response
- [ ] Network tab shows 1 request per 30s on the dashboard instead of 7
- [ ] All dashboard widgets render identical data as before
- [ ] `npx tsc --noEmit` passes

---

## Phase 4: Visibility-Based Polling Pause

### Task 4.1: Add refetchIntervalInBackground to QueryClient Defaults
**File:** `apps/frontend/src/main.tsx`

Add `refetchIntervalInBackground: false` to the QueryClient default query options to pause all polling when the browser tab is hidden.

**Current code (lines 47-55):**
```tsx
const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
```

**Change to:**
```tsx
const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchIntervalInBackground: false,
    },
  },
});
```

**Acceptance Criteria:**
- [ ] `refetchIntervalInBackground: false` added to QueryClient default options
- [ ] When browser tab is hidden, zero polling requests fire (verify in Network tab)
- [ ] When tab becomes visible again, TanStack Query triggers immediate refetch, then resumes polling
- [ ] This applies to ALL hooks with `refetchInterval` across the entire app
- [ ] No regressions in data freshness when tab is visible
- [ ] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/features/scenes/hooks/use-clip-tags.ts` | New — clip tags query + notes mutation hooks |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Replace inline API calls with hooks |
| `apps/frontend/src/features/projects/hooks/use-project-avatars.ts` | Remove unconditional polling |
| `apps/frontend/src/features/projects/hooks/use-projects.ts` | Remove unconditional polling from `useProjectStats` |
| `apps/frontend/src/features/projects/hooks/use-avatar-deliverables.ts` | Remove unconditional polling from 3 hooks |
| `apps/backend/crates/api/src/handlers/dashboard.rs` | New — consolidated dashboard status endpoint |
| `apps/backend/crates/api/src/routes/mod.rs` | Wire dashboard/status route |
| `apps/frontend/src/features/dashboard/hooks/use-dashboard.ts` | New `useDashboardStatus` hook |
| `apps/frontend/src/main.tsx` | `refetchIntervalInBackground: false` |

---

## Dependencies

### Existing Components to Reuse
- `api.get` / `api.put` from `lib/api` — used by new hooks
- `TagInfo` type from `components/domain/TagChip` — clip tags type
- Existing dashboard handler functions — reused internally by consolidated endpoint
- TanStack Query `invalidateQueries` in existing mutation hooks — already handles freshness

### New Infrastructure Needed
- `use-clip-tags.ts` — new hook file for clip tags/notes
- `GET /api/v1/dashboard/status` — new backend endpoint
- `useDashboardStatus` — new frontend hook

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: ClipPlaybackModal hooks — Tasks 1.1–1.3
2. Phase 2: Remove polling — Tasks 2.1–2.4
3. Phase 4: Visibility pause — Task 4.1

These three phases are independent and can be done in parallel. Phase 3 (dashboard consolidation) requires both backend and frontend work.

4. Phase 3: Dashboard consolidation — Tasks 3.1–3.3

**MVP Success Criteria:**
- ClipPlaybackModal tag navigation uses cache (zero network for revisited clips)
- Idle project pages show zero periodic network requests
- Background tabs produce zero polling requests
- Dashboard fires 1 request per 30s instead of 7
- `npx tsc --noEmit` passes with zero errors
- `cargo check` passes

### Post-MVP Enhancements
- Smart polling based on generation state (poll only when active jobs exist)
- WebSocket events replacing polling entirely

---

## Notes

1. **Phase 2 safety check**: Before removing `refetchInterval`, grep all mutation hooks that target the affected query keys to confirm `invalidateQueries` is already in place. Keys to check: `projectAvatarKeys`, `projectKeys.stats`, `deliverableKeys`.
2. **Dashboard endpoint partial failure**: If one sub-query fails, the endpoint should return null for that section rather than a 500 error. Frontend widgets should handle null data gracefully.
3. **Individual widget hooks preserved**: The consolidated endpoint is only used from the dashboard page. Individual hooks remain for use on non-dashboard pages (queue page, production page, etc.).
4. **`refetchIntervalInBackground: false`** is TanStack Query v5's built-in way to pause polling in background tabs. No custom hook needed.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-157
