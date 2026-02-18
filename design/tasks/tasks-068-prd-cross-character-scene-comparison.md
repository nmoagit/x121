# Task List: Cross-Character Scene Comparison

**PRD Reference:** `design/prds/068-prd-cross-character-scene-comparison.md`
**Scope:** Build a gallery view for comparing the same scene type across all characters in a project with synchronized playback, sort/filter, variant toggling, quick approval actions, and an inverse per-character view.

## Overview

When 10 characters each have a "dance" scene, reviewing them one by one misses consistency issues visible only in side-by-side comparison. This PRD provides a gallery view showing the same scene type across all characters, with synchronized playback (all cells play/seek together), sort/filter by QA score or approval status, variant toggling (switch entire gallery between clothed/topless), quick approve/reject from gallery cells, and an inverse view showing all scene types for a single character.

### What Already Exists
- PRD-023 Scene Types (scene type data)
- PRD-035 Review Interface (approval actions)
- PRD-036 Cinema Mode sync-play coordinator
- PRD-057 Batch Orchestrator (matrix data)
- PRD-083 Video playback engine
- No database changes needed (reads existing scene/segment tables)

### What We're Building
1. Scene type gallery layout (one cell per character)
2. Synchronized playback for N cells (extending PRD-036's sync-play)
3. Sort and filter controls (QA score, approval status, variant)
4. Quick approve/reject/flag from gallery cells
5. Variant toggle (switch all cells between variants)
6. Inverse view: all scene types for a single character
7. Backend API for comparison data retrieval

### Key Design Decisions
1. **Reuse PRD-036 sync-play** — Extend the 2x2 sync-play coordinator to handle N cells.
2. **Gallery as read view** — This is a comparison and approval view, not an editing view.
3. **No new database tables** — All data comes from existing scene/segment tables.
4. **Two API endpoints** — One for scene-type comparison, one for per-character all-scenes.

---

## Phase 1: Backend API

### Task 1.1: Scene Comparison API
**File:** `src/routes/comparison.rs`

```rust
pub fn comparison_routes() -> Router<AppState> {
    Router::new()
        .route("/projects/:id/scene-comparison", get(scene_comparison))
        .route("/projects/:id/characters/:char_id/all-scenes", get(character_all_scenes))
}

/// GET /projects/:id/scene-comparison?scene_type=dance&variant=clothed
/// Returns all characters' segments for a given scene type and variant
async fn scene_comparison(
    Path(project_id): Path<DbId>,
    Query(params): Query<ComparisonParams>,
) -> impl IntoResponse;

/// GET /projects/:id/characters/:char_id/all-scenes
/// Returns all scene types for a single character
async fn character_all_scenes(
    Path((project_id, char_id)): Path<(DbId, DbId)>,
) -> impl IntoResponse;
```

**Acceptance Criteria:**
- [ ] Scene comparison endpoint returns all characters' latest segments for a scene type
- [ ] Supports filtering by variant (clothed/topless) and approval status
- [ ] Per-character endpoint returns all scene types for one character
- [ ] Response includes: segment ID, character name, thumbnail, QA score, approval status
- [ ] Gallery loads all data within 3 seconds

---

## Phase 2: Gallery Layout

### Task 2.1: Scene Gallery Grid
**File:** `frontend/src/features/comparison/SceneGallery.tsx`

```typescript
interface SceneGalleryProps {
  projectId: number;
  sceneType: string;
  variant?: string;
}

export const SceneGallery: React.FC<SceneGalleryProps> = (props) => {
  // Grid of cells, one per character
  // Each cell: keyframe strip or playing video + character name
};
```

**Acceptance Criteria:**
- [ ] Grid layout: one cell per character showing keyframe strip or playing video
- [ ] Character name label on each cell
- [ ] Cells large enough for visual assessment but compact enough for 10+ characters
- [ ] Responsive grid adjusting to viewport size

### Task 2.2: Synchronized N-Cell Playback
**File:** `frontend/src/features/comparison/useNSyncPlay.ts`

```typescript
export function useNSyncPlay(playerRefs: RefObject<VideoPlayerAPI>[]) {
  // Extend PRD-036 sync-play for N cells (not just 4)
  // All cells maintain frame sync within 1 frame
}
```

**Acceptance Criteria:**
- [ ] Global play/pause/seek controls affect all cells
- [ ] All cells maintain frame synchronization within 1 frame
- [ ] Individual cell mute/unmute for audio isolation
- [ ] Handles 10+ simultaneous video playback cells

---

## Phase 3: Sort, Filter & Variant Toggle

### Task 3.1: Sort & Filter Controls
**File:** `frontend/src/features/comparison/GalleryFilters.tsx`

**Acceptance Criteria:**
- [ ] Sort by: QA score, generation date, approval status
- [ ] Filter to: unapproved only, specific variant, specific resolution tier
- [ ] Persistent sort/filter preferences per user
- [ ] Filter indicators showing active filters

### Task 3.2: Variant Toggle
**File:** `frontend/src/features/comparison/VariantToggle.tsx`

**Acceptance Criteria:**
- [ ] Toggle button switches all cells between clothed and topless variants
- [ ] Compare "all clothed dances" then "all topless dances" without re-navigating
- [ ] Toggle preserves playback position
- [ ] Prominent and clearly labeled

---

## Phase 4: Quick Actions

### Task 4.1: Gallery Quick Actions
**File:** `frontend/src/features/comparison/GalleryQuickActions.tsx`

**Acceptance Criteria:**
- [ ] Approve, reject, or flag individual scenes from gallery cells
- [ ] "Approve All Passing" one-click action for all scenes above QA threshold
- [ ] Action feedback visible on the cell (green/red border)
- [ ] Actions use PRD-035 approval API
- [ ] Actions process in <200ms per action

---

## Phase 5: Inverse View (Per-Character)

### Task 5.1: Character All-Scenes View
**File:** `frontend/src/features/comparison/CharacterAllScenes.tsx`

**Acceptance Criteria:**
- [ ] Select a character to see all their scene types in a row
- [ ] Same sort/filter and quick action capabilities as scene gallery
- [ ] Synchronized playback across all scene types
- [ ] Easy navigation between scene gallery and per-character view

---

## Phase 6: Testing

### Task 6.1: Comprehensive Tests
**File:** `frontend/src/features/comparison/__tests__/`

**Acceptance Criteria:**
- [ ] Gallery loads and displays all characters within 3 seconds
- [ ] Synchronized playback maintains frame-level sync across 10+ cells
- [ ] Quick approval actions process in <200ms
- [ ] Sort/filter produces correct results
- [ ] Variant toggle switches all cells correctly
- [ ] Per-character inverse view loads correctly

---

## Relevant Files
| File | Description |
|------|-------------|
| `src/routes/comparison.rs` | Comparison API endpoints |
| `frontend/src/features/comparison/SceneGallery.tsx` | Scene type gallery |
| `frontend/src/features/comparison/useNSyncPlay.ts` | N-cell sync playback |
| `frontend/src/features/comparison/GalleryFilters.tsx` | Sort/filter controls |
| `frontend/src/features/comparison/VariantToggle.tsx` | Variant toggle |
| `frontend/src/features/comparison/GalleryQuickActions.tsx` | Quick actions |
| `frontend/src/features/comparison/CharacterAllScenes.tsx` | Per-character view |

## Dependencies
- PRD-023: Scene Types (scene type data)
- PRD-035: Review Interface (approval actions)
- PRD-036: Cinema Mode (sync-play coordinator, extended to N cells)
- PRD-083: Video playback engine (player instances)

## Implementation Order
### MVP
1. Phase 1 (API) — comparison data endpoints
2. Phase 2 (Gallery) — grid layout with N-cell sync
3. Phase 3 (Filters) — sort, filter, variant toggle
4. Phase 4 (Actions) — quick approve/reject from gallery
5. Phase 5 (Inverse View) — per-character all-scenes

### Post-MVP Enhancements
- Comparison annotations: pin notes to specific gallery cells for team discussion

## Notes
- No new database tables needed — all data comes from existing tables.
- Performance is critical with 10+ simultaneous video playback cells.
- The sync-play coordinator from PRD-036 needs to scale beyond 4 cells.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
