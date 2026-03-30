# Task List: Frontend Query Consolidation & Bundle Optimization

**PRD Reference:** `design/prds/159-prd-frontend-query-consolidation.md`
**Scope:** Replace AvatarsPage N+1 query pattern with a single browse endpoint, extract ClipPlaybackModal into focused sub-components, and audit barrel exports for tree-shaking effectiveness.

## Overview

Three lower-priority but high-impact optimizations. AvatarsPage currently fires 3N HTTP requests (where N = project count) via three `useQueries` calls that map over `displayProjectIds`. A new backend browse endpoint consolidates this to 1 request. ClipPlaybackModal is a 962-line component with 14 `useState` hooks — any state change re-renders the entire video player, canvas, and annotation list. Extracting sub-components creates proper render boundaries. Finally, large barrel re-exports may defeat Vite/Rollup tree-shaking, inflating lazy-loaded route chunks.

### What Already Exists
- `AvatarsPage` at `app/pages/AvatarsPage.tsx` (1394 lines) — three `useQueries` at lines 132-155 mapping over `displayProjectIds`
- `ClipPlaybackModal` at `features/scenes/ClipPlaybackModal.tsx` (962 lines) — 14 `useState` hooks at lines 52-80, 3 Zustand subscriptions
- Barrel exports: `features/scene-catalogue/index.ts` (98 lines, 22 components + 18 hooks), `features/image-catalogue/index.ts` (82 lines), `features/delivery/index.ts` (78 lines), `features/queue/index.ts` (74 lines)
- Existing avatar query hooks (`useProjectAvatars`, `useProjects`) — keep for non-browse contexts
- `characters` table in DB (avatars), `avatar_groups` table, `character_speeches` table

### What We're Building
1. Backend `GET /api/v1/avatars/browse?pipeline_id={id}` endpoint
2. Frontend `useAvatarsBrowse(pipelineId)` hook replacing 3 `useQueries`
3. ClipPlaybackModal sub-components: `ClipVideoPlayer`, `ClipAnnotationToolbar`, `ClipAnnotationList`, `ClipMetadataPanel`
4. Bundle analysis report from `vite-bundle-visualizer`

### Key Design Decisions
1. Browse endpoint uses JOINs and lateral subqueries — no N+1 internally
2. Individual per-project hooks preserved for non-browse contexts (project detail page)
3. ClipPlaybackModal extraction preserves all functionality — no redesign
4. Sub-components own their local state — not lifted to parent
5. Barrel export audit is investigative — code changes only if tree-shaking failures confirmed

---

## Phase 1: Backend — Avatars Browse Endpoint

### Task 1.1: Create Avatars Browse Handler
**File:** `apps/backend/crates/api/src/handlers/avatar_browse.rs` (new file)

Create a new endpoint that returns all avatars for a pipeline with embedded group and speech language data.

**SQL query:**
```sql
SELECT
  c.id, c.uuid, c.name, c.slug, c.project_id, c.group_id,
  c.is_enabled, c.created_at, c.updated_at,
  ag.name AS group_name,
  ag.sort_order AS group_sort_order,
  p.name AS project_name,
  (SELECT COUNT(DISTINCT cs.language_id)
   FROM character_speeches cs
   WHERE cs.character_id = c.id) AS speech_language_count
FROM characters c
LEFT JOIN avatar_groups ag ON c.group_id = ag.id
JOIN projects p ON c.project_id = p.id
WHERE p.pipeline_id = $1
  AND c.deleted_at IS NULL
ORDER BY p.name, ag.sort_order NULLS LAST, c.name
```

**Response shape:**
```rust
#[derive(Serialize)]
pub struct AvatarBrowseResponse {
    pub avatars: Vec<AvatarBrowseItem>,
    pub groups: Vec<AvatarGroupItem>,
}

#[derive(Serialize)]
pub struct AvatarBrowseItem {
    pub id: DbId,
    pub uuid: String,
    pub name: String,
    pub slug: String,
    pub project_id: DbId,
    pub project_name: String,
    pub group_id: Option<DbId>,
    pub group_name: Option<String>,
    pub is_enabled: bool,
    pub speech_language_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct AvatarGroupItem {
    pub id: DbId,
    pub name: String,
    pub project_id: DbId,
    pub sort_order: Option<i32>,
}
```

**Acceptance Criteria:**
- [ ] New handler file `handlers/avatar_browse.rs` created
- [ ] Endpoint accepts `pipeline_id` query parameter (required)
- [ ] Uses JOINs — NOT N+1 queries internally
- [ ] Returns avatars with embedded group_name and speech_language_count
- [ ] Returns separate `groups` array for group metadata
- [ ] Results ordered by project name, group sort order, avatar name
- [ ] Filters out soft-deleted avatars (`deleted_at IS NULL`)
- [ ] Response time < 200ms for 200 avatars across 10 projects
- [ ] `cargo check` passes

### Task 1.2: Wire Browse Endpoint Route
**Files:**
- `apps/backend/crates/api/src/handlers/mod.rs`
- `apps/backend/crates/api/src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] `GET /api/v1/avatars/browse` wired to handler
- [ ] Auth required
- [ ] Handler module declared in `handlers/mod.rs`
- [ ] `cargo check` passes

### Task 1.3: Create useAvatarsBrowse Hook
**File:** `apps/frontend/src/features/avatars/hooks/use-avatars-browse.ts` (new file)

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AvatarBrowseItem {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  project_id: number;
  project_name: string;
  group_id: number | null;
  group_name: string | null;
  is_enabled: boolean;
  speech_language_count: number;
  created_at: string;
  updated_at: string;
}

export interface AvatarGroupItem {
  id: number;
  name: string;
  project_id: number;
  sort_order: number | null;
}

export interface AvatarBrowseResponse {
  avatars: AvatarBrowseItem[];
  groups: AvatarGroupItem[];
}

export const avatarBrowseKeys = {
  all: ["avatars-browse"] as const,
  list: (pipelineId: number) => [...avatarBrowseKeys.all, pipelineId] as const,
};

export function useAvatarsBrowse(pipelineId: number) {
  return useQuery({
    queryKey: avatarBrowseKeys.list(pipelineId),
    queryFn: () =>
      api.get<AvatarBrowseResponse>(`/avatars/browse?pipeline_id=${pipelineId}`),
    enabled: pipelineId > 0,
  });
}
```

**Acceptance Criteria:**
- [ ] New file `features/avatars/hooks/use-avatars-browse.ts` created
- [ ] Types match backend response shape
- [ ] Query key: `["avatars-browse", pipelineId]`
- [ ] `enabled: pipelineId > 0` prevents fetch without pipeline context
- [ ] `npx tsc --noEmit` passes

### Task 1.4: Replace AvatarsPage N+1 Queries with Browse Hook
**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx`
**Depends on:** Tasks 1.1, 1.2, 1.3

Replace the three `useQueries` calls (lines 132-155) with a single `useAvatarsBrowse(pipelineId)` call.

**Current code (lines 132-155):**
```tsx
const avatarQueries = useQueries({
  queries: displayProjectIds.map((pid) => ({
    queryKey: ["projects", pid, "avatars", "list"] as const,
    queryFn: () => api.get<Avatar[]>(`/projects/${pid}/avatars`),
    enabled: pid > 0,
  })),
});

const groupQueries = useQueries({
  queries: displayProjectIds.map((pid) => ({
    queryKey: ["projects", pid, "groups"] as const,
    queryFn: () => api.get<AvatarGroup[]>(`/projects/${pid}/groups`),
    enabled: pid > 0,
  })),
});

const speechLangQueries = useQueries({
  queries: displayProjectIds.map((pid) => ({
    queryKey: ["deliverables", "speechLanguageCounts", pid] as const,
    queryFn: () => api.get<ProjectLanguageCount[]>(`/projects/${pid}/speech-language-counts`),
    enabled: pid > 0,
    staleTime: 5 * 60 * 1000,
  })),
});
```

**Replace with:**
```tsx
const pipelineId = pipelineCtx?.pipelineId ?? 0;
const { data: browseData, isLoading: charsLoading } = useAvatarsBrowse(pipelineId);
```

Then transform `browseData` into the same data structures the rest of the page expects (grouped avatars by project, group lookup map, speech language map).

**Acceptance Criteria:**
- [ ] Three `useQueries` calls removed
- [ ] Single `useAvatarsBrowse(pipelineId)` call replaces them
- [ ] Page loads with 1 HTTP request instead of 3N (verify in Network tab with 5+ projects)
- [ ] All existing AvatarsPage features work: search, filter by scene type, group headers, card interactions, avatar selection, project filter
- [ ] Speech language flags render on avatar cards (data from browse endpoint)
- [ ] Group headers display correctly with group name
- [ ] Mutation hooks that previously invalidated per-project queries should also invalidate `avatarBrowseKeys.all`
- [ ] `npx tsc --noEmit` passes

### Task 1.5: Update Mutation Invalidation for Browse Cache
**Files:** Mutation hooks that affect avatar data:
- `features/projects/hooks/use-project-avatars.ts` — `useCreateAvatar`, `useUpdateAvatar`, `useDeleteAvatar`, `useToggleAvatarEnabled`
- Any other mutation hooks that modify avatars or groups

Add `queryClient.invalidateQueries({ queryKey: avatarBrowseKeys.all })` to the `onSuccess` callbacks.

**Acceptance Criteria:**
- [ ] Creating/updating/deleting an avatar invalidates the browse cache
- [ ] Updating avatar group assignment invalidates the browse cache
- [ ] AvatarsPage reflects changes immediately after mutations
- [ ] `npx tsc --noEmit` passes

---

## Phase 2: ClipPlaybackModal Sub-Component Extraction

### Task 2.1: Extract ClipVideoPlayer Sub-Component
**File:** `apps/frontend/src/features/scenes/components/ClipVideoPlayer.tsx` (new file)
**Source:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Extract the video player section into a standalone component. This sub-component owns:
- `isPlaying` state (if applicable)
- `currentFrame` and `duration` state
- Video element and playback controls
- Canvas overlay for annotation rendering

**Props interface:**
```tsx
interface ClipVideoPlayerProps {
  clip: SceneVideoVersion;
  expanded: boolean;
  annotating: boolean;
  containerWidth: number;
  onFrameChange: (frame: number) => void;
  frameAnnotations: FrameAnnotationEntry[];
  hiddenAnnotationFrames: Set<number>;
  // ... other necessary props
}
```

**Acceptance Criteria:**
- [ ] New file `features/scenes/components/ClipVideoPlayer.tsx` created
- [ ] Video playback works identically: play, pause, seek, frame navigation
- [ ] Canvas overlay renders annotations correctly
- [ ] Expanded/collapsed mode works
- [ ] Component under 250 lines
- [ ] `npx tsc --noEmit` passes

### Task 2.2: Extract ClipAnnotationToolbar Sub-Component
**File:** `apps/frontend/src/features/scenes/components/ClipAnnotationToolbar.tsx` (new file)
**Source:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Extract the annotation toolbar. This sub-component owns:
- `annotating` toggle state
- `canvasInitialTool` state ("pen" | "text")
- `presetManagerOpen` state
- Annotation mode toggle button and drawing tool selector

**Props interface:**
```tsx
interface ClipAnnotationToolbarProps {
  annotating: boolean;
  onToggleAnnotating: () => void;
  onSelectTool: (tool: "pen" | "text") => void;
  onOpenPresetManager: () => void;
  canUndoRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}
```

**Acceptance Criteria:**
- [ ] New file `features/scenes/components/ClipAnnotationToolbar.tsx` created
- [ ] Annotation mode toggle works
- [ ] Drawing tool selection works
- [ ] Preset manager opens correctly
- [ ] State changes do NOT cause video player to re-render (verify with React DevTools)
- [ ] Component under 150 lines
- [ ] `npx tsc --noEmit` passes

### Task 2.3: Extract ClipAnnotationList Sub-Component
**File:** `apps/frontend/src/features/scenes/components/ClipAnnotationList.tsx` (new file)
**Source:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

Extract the annotation list panel. This sub-component:
- Reads from Zustand store directly (owns its own subscription)
- Handles edit/delete/visibility toggle for individual annotations

**Props interface:**
```tsx
interface ClipAnnotationListProps {
  clipId: number;
  sceneId: number;
  currentFrame: number;
  onNavigateToFrame: (frame: number) => void;
  hiddenAnnotationFrames: Set<number>;
  onToggleFrameVisibility: (frame: number) => void;
}
```

**Acceptance Criteria:**
- [ ] New file `features/scenes/components/ClipAnnotationList.tsx` created
- [ ] Annotation list renders all frame annotations for the clip
- [ ] Edit/delete/visibility toggle work correctly
- [ ] Zustand subscription lives in this component (not parent)
- [ ] State changes do NOT cause video player to re-render
- [ ] Component under 200 lines
- [ ] `npx tsc --noEmit` passes

### Task 2.4: Extract ClipMetadataPanel Sub-Component
**File:** `apps/frontend/src/features/scenes/components/ClipMetadataPanel.tsx` (new file)
**Source:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`
**Depends on:** PRD-157 Tasks 1.1-1.3 (clip tags/notes hooks)

Extract the metadata sidebar panel. This sub-component owns:
- `clipTags` and `clipNotes` state (or uses hooks from PRD-157)
- Tag editing UI
- Notes editing UI
- Generation snapshot display

**Props interface:**
```tsx
interface ClipMetadataPanelProps {
  clip: SceneVideoVersion;
  pipelineId?: number;
  meta?: { projectName: string; avatarName: string; sceneTypeName: string; trackName: string };
}
```

**Acceptance Criteria:**
- [ ] New file `features/scenes/components/ClipMetadataPanel.tsx` created
- [ ] Tags load and display correctly
- [ ] Tag add/remove works
- [ ] Notes edit and save works
- [ ] Generation snapshot displays correctly
- [ ] State changes do NOT cause video player or annotation list to re-render
- [ ] Component under 250 lines
- [ ] `npx tsc --noEmit` passes

### Task 2.5: Slim Down ClipPlaybackModal Parent
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`
**Depends on:** Tasks 2.1–2.4

Rewrite ClipPlaybackModal to compose the four sub-components. The parent retains:
- Modal shell (open/close)
- Clip navigation (prev/next)
- Keyboard shortcuts
- Shared state that's needed by multiple sub-components

**Acceptance Criteria:**
- [ ] ClipPlaybackModal parent is under 300 lines
- [ ] At least 3 sub-components used from `features/scenes/components/`
- [ ] All 14 original `useState` hooks distributed among sub-components (parent has < 5)
- [ ] All existing functionality works: video playback, annotations, tags, notes, navigation, keyboard shortcuts, approve/reject
- [ ] React DevTools Profiler shows isolated re-render boundaries
- [ ] State changes in annotation toolbar do NOT re-render video player
- [ ] State changes in metadata panel do NOT re-render annotation list
- [ ] `npx tsc --noEmit` passes

---

## Phase 3: Bundle Audit

### Task 3.1: Install Bundle Visualizer
**File:** `apps/frontend/package.json`

Install `rollup-plugin-visualizer` as a dev dependency and add an analysis script.

```bash
cd apps/frontend && npm install -D rollup-plugin-visualizer
```

Add to `package.json` scripts:
```json
"build:analyze": "ANALYZE=true vite build"
```

Add conditional plugin to `vite.config.ts`:
```tsx
import { visualizer } from "rollup-plugin-visualizer";

// In plugins array:
process.env.ANALYZE && visualizer({
  open: true,
  filename: "dist/bundle-report.html",
  gzipSize: true,
})
```

**Acceptance Criteria:**
- [ ] `rollup-plugin-visualizer` in devDependencies
- [ ] `npm run build:analyze` script works and produces `dist/bundle-report.html`
- [ ] Regular build (`npm run build`) is unaffected
- [ ] `npx tsc --noEmit` passes

### Task 3.2: Audit Barrel Exports for Tree-Shaking
**Files:**
- `apps/frontend/src/features/scene-catalogue/index.ts` (98 lines)
- `apps/frontend/src/features/image-catalogue/index.ts` (82 lines)
- `apps/frontend/src/features/delivery/index.ts` (78 lines)
- `apps/frontend/src/features/queue/index.ts` (74 lines)

Run `npm run build:analyze` and inspect the bundle report.

**Analysis steps:**
1. Open `dist/bundle-report.html`
2. Find each lazy-loaded route chunk
3. Check if any chunk contains modules from unrelated feature barrels
4. Document findings

**Acceptance Criteria:**
- [ ] Bundle analysis run and report generated
- [ ] Each of the 4 barrel files analyzed for tree-shaking effectiveness
- [ ] Findings documented (either "verified clean" or specific bloat identified)
- [ ] If barrel imports cause chunk bloat: affected imports converted to direct path imports
- [ ] If tree-shaking works correctly: documented as "verified, no action needed"
- [ ] Production bundle size does not increase
- [ ] Build succeeds with no import errors
- [ ] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/api/src/handlers/avatar_browse.rs` | New — avatars browse endpoint |
| `apps/backend/crates/api/src/routes/mod.rs` | Route wiring for browse endpoint |
| `apps/frontend/src/features/avatars/hooks/use-avatars-browse.ts` | New — browse query hook |
| `apps/frontend/src/app/pages/AvatarsPage.tsx` | Replace N+1 queries with browse |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Slim down to parent shell |
| `apps/frontend/src/features/scenes/components/ClipVideoPlayer.tsx` | New — video player sub-component |
| `apps/frontend/src/features/scenes/components/ClipAnnotationToolbar.tsx` | New — annotation toolbar |
| `apps/frontend/src/features/scenes/components/ClipAnnotationList.tsx` | New — annotation list |
| `apps/frontend/src/features/scenes/components/ClipMetadataPanel.tsx` | New — metadata panel |
| `apps/frontend/src/features/scene-catalogue/index.ts` | Barrel export audit target |
| `apps/frontend/src/features/image-catalogue/index.ts` | Barrel export audit target |
| `apps/frontend/src/features/delivery/index.ts` | Barrel export audit target |
| `apps/frontend/src/features/queue/index.ts` | Barrel export audit target |

---

## Dependencies

### Existing Components to Reuse
- `VideoPlayer` from `features/video-player/VideoPlayer` — used inside ClipVideoPlayer
- `DrawingCanvas` from `features/annotations/DrawingCanvas` — used inside ClipVideoPlayer
- `AnnotationPresetManager` from `features/annotations/AnnotationPresetManager` — used by toolbar
- `TagInput` from `components/domain/TagInput` — used inside ClipMetadataPanel
- `GenerationSnapshotPanel` from `features/scenes/GenerationSnapshotPanel` — used inside ClipMetadataPanel
- `NotesModal` from `components/domain/NotesModal` — used inside ClipMetadataPanel
- `useClipTags` / `useUpdateClipNotes` from PRD-157 — used by ClipMetadataPanel
- Existing avatar mutation hooks — updated for browse cache invalidation

### New Infrastructure Needed
- `avatar_browse.rs` backend handler
- `use-avatars-browse.ts` frontend hook
- 4 ClipPlaybackModal sub-component files
- `rollup-plugin-visualizer` dev dependency

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Avatar browse endpoint — Tasks 1.1–1.5
2. Phase 2: ClipPlaybackModal extraction — Tasks 2.1–2.5
3. Phase 3: Bundle audit — Tasks 3.1–3.2

Phases 1, 2, and 3 are independent and can be done in parallel by different developers.

**MVP Success Criteria:**
- AvatarsPage loads with 1 HTTP request regardless of project count
- AvatarsPage load time < 300ms for 200 avatars
- ClipPlaybackModal parent under 300 lines
- Annotation toolbar interaction doesn't re-render video player (React DevTools)
- Bundle analysis report generated and documented
- `npx tsc --noEmit` passes with zero errors
- `cargo check` passes

### Post-MVP Enhancements
- ClipPlaybackModal `useReducer` migration for annotation state
- Per-route code splitting audit
- Browse endpoint pagination for 1000+ avatars

---

## Notes

1. **Phase 1 preserves individual hooks**: The per-project `useProjectAvatars` and `useProjects` hooks remain — they are used on project detail pages and other non-browse contexts. The browse endpoint is specifically for the AvatarsPage grid view.
2. **Phase 2 preserves all functionality**: ClipPlaybackModal extraction is purely structural. No features are added, removed, or changed. The goal is render boundary isolation.
3. **Phase 2 depends on PRD-157**: The `ClipMetadataPanel` uses `useClipTags` and `useUpdateClipNotes` hooks from PRD-157. If PRD-157 hasn't landed, keep the inline API pattern in ClipMetadataPanel temporarily.
4. **Phase 3 may require no code changes**: If `vite-bundle-visualizer` confirms tree-shaking works correctly, the outcome is documentation only.
5. **Mutation cache invalidation (Task 1.5)**: This is critical for correctness. After switching to the browse endpoint, any mutation that changes avatar data must invalidate both the old per-project keys (for backward compat) and the new browse key.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-159
