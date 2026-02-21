# Task List: Cinema Mode & Sync-Play Grid

**PRD Reference:** `design/prds/036-prd-cinema-mode-sync-play-grid.md`
**Scope:** Build a borderless cinema mode with Ambilight glow effect for immersive viewing, plus a 2x2 synchronized comparison grid with per-cell and global controls and review integration.

## Overview

Final likeness checks require an immersive, distraction-free environment. This PRD provides two modes: Cinema Mode -- a borderless full-screen player with Ambilight ambient glow effect (screen background matches dominant video edge colors) and auto-hiding controls; and Sync-Play Grid -- a 2x2 synchronized comparison view for side-by-side evaluation of multiple segments or variants. Both modes integrate with the approval workflow for keyboard-driven review decisions.

### What Already Exists
- PRD-029 design system components
- PRD-083 video playback engine
- PRD-035 review/approval workflow
- No database changes needed (UI-only feature)

### What We're Building
1. Cinema Mode: borderless full-screen player with auto-hiding controls
2. Ambilight ambient glow renderer (edge color sampling)
3. Sync-Play Grid: 1x1, 2x1, 2x2 layout options
4. Sync-play coordinator (synchronized play/pause/seek across cells)
5. Per-cell and global grid controls
6. Review integration (approve/reject from cinema and grid modes)

### Key Design Decisions
1. **Full-screen API** — Uses the browser's Fullscreen API for borderless mode.
2. **Ambilight via Canvas** — Sample dominant colors from video edges using Canvas, apply as CSS background gradient. Subtle and performance-efficient.
3. **Sync-play via shared controller** — All grid cells share a single playback controller that broadcasts play/pause/seek to all.
4. **PRD-083 instances per cell** — Each grid cell is a separate PRD-083 video player instance.

---

## Phase 1: Cinema Mode [COMPLETE]

### Task 1.1: Cinema Mode Container [COMPLETE]
**File:** `frontend/src/features/cinema/CinemaMode.tsx`

```typescript
interface CinemaModeProps {
  segmentId: number;
  onExit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onFlag: () => void;
}

export const CinemaMode: React.FC<CinemaModeProps> = (props) => {
  // Full-screen borderless player
  // Auto-hiding overlay controls
  // Ambilight background
};
```

**Acceptance Criteria:**
- [x] Full-screen borderless playback with all UI chrome hidden
- [x] Minimal overlay controls: appear on mouse movement, auto-hide after 3 seconds
- [x] Keyboard shortcuts for all controls (play/pause, seek, approve/reject)
- [x] Single-key exit (Escape)
- [x] Cinema mode enters/exits in <300ms (smooth transition)

### Task 1.2: Ambilight Renderer [COMPLETE]
**File:** `frontend/src/features/cinema/useAmbilight.ts`

```typescript
export function useAmbilight(videoRef: RefObject<HTMLVideoElement>) {
  // Sample dominant colors from video edges at regular intervals
  // Apply as CSS gradient background behind the video
  const updateAmbilightColors = useCallback(() => {
    const canvas = offscreenCanvas.current;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    // Extract edge colors from top, bottom, left, right strips
    // Apply as animated CSS gradient on container background
  }, [videoRef]);
}
```

**Acceptance Criteria:**
- [x] Screen background matches dominant colors of video edges
- [x] Update rate: at least every 100ms during playback
- [x] Rendering adds <5ms per frame (no perceptible performance impact)
- [x] Subtle effect — ambiance, not distraction
- [x] Smooth color transitions between frames

**Implementation Notes:**
- Uses 32x18 offscreen canvas for sampling (tiny footprint, fast drawImage)
- Samples 3-pixel-deep strips from all four edges
- Returns layered radial gradients (one per edge) with 300ms CSS transition
- Throttled to UPDATE_INTERVAL_MS (100ms) via performance.now() check
- rAF loop only runs while video is playing; freezes gradient on pause

---

## Phase 2: Sync-Play Grid [COMPLETE]

### Task 2.1: Grid Layout Component [COMPLETE]
**File:** `frontend/src/features/cinema/SyncPlayGrid.tsx`

```typescript
interface SyncPlayGridProps {
  cells: GridCell[];
  layout: '1x1' | '2x1' | '2x2';
  onCellAction: (cellIndex: number, action: 'approve' | 'reject' | 'flag') => void;
}

interface GridCell {
  segmentId: number;
  label: string;  // Segment/variant identifier
}
```

**Acceptance Criteria:**
- [x] Display up to 4 segments/variants simultaneously in a grid
- [x] Toggle between 1x1 (single), 2x1 (side-by-side), and 2x2 (quad) layouts
- [x] Each cell labeled with segment/variant identifier
- [x] Drag and drop segments from a list into grid cells
- [x] Minimal cell borders to maximize viewable area

### Task 2.2: Sync-Play Coordinator [COMPLETE]
**File:** `frontend/src/features/cinema/useSyncPlay.ts`

```typescript
export function useSyncPlay(playerRefs: RefObject<VideoPlayerAPI>[]) {
  const syncPlay = () => playerRefs.forEach(ref => ref.current?.play());
  const syncPause = () => playerRefs.forEach(ref => ref.current?.pause());
  const syncSeek = (frame: number) => playerRefs.forEach(ref => ref.current?.seekToFrame(frame));

  return { syncPlay, syncPause, syncSeek, syncSpeed };
}
```

**Acceptance Criteria:**
- [x] Synchronized playback: play, pause, and seek controls affect all cells
- [x] All cells maintain frame synchronization within 1 frame
- [x] Speed control affects all cells simultaneously

**Implementation Notes:**
- Uses leader-based synchronization: first ref is the reference clock
- Drift correction runs on every animation frame, corrects if >42ms drift (~1 frame at 24fps)
- All players aligned to leader time before play starts
- Shared duration is the minimum of all loaded video durations

---

## Phase 3: Grid Controls [COMPLETE]

### Task 3.1: Global & Per-Cell Controls [COMPLETE]
**File:** `frontend/src/features/cinema/GridControls.tsx`

**Acceptance Criteria:**
- [x] Global controls: sync play/pause, sync seek, playback speed
- [x] Per-cell: mute/unmute audio, zoom (pinch or scroll)
- [x] Global transport bar with combined timeline
- [x] Per-cell audio isolation (mute all except selected)

**Implementation Notes:**
- Reuses SpeedControl from video-player feature
- Per-cell zoom tracked as state (1x-3x), applies via parent CSS transform
- Solo button mutes all cells except the selected one
- Timeline scrubber with drag-to-seek

---

## Phase 4: Review Integration [COMPLETE]

### Task 4.1: Cinema Mode Review Controls [COMPLETE]
**File:** `frontend/src/features/cinema/CinemaReviewControls.tsx`

**Acceptance Criteria:**
- [x] Approve/reject/flag via keyboard shortcuts in cinema mode
- [x] In grid mode, select a cell to apply actions to a specific segment
- [x] Approval feedback (green/red flash) visible per cell
- [x] Actions use PRD-035 approval API

**Implementation Notes:**
- Keyboard shortcuts: A (approve), R (reject), F (flag) via useShortcut
- Flash overlay with animate-pulse, auto-clears after 600ms
- In grid mode, the selectedCell index determines which segment receives the action

---

## Phase 5: Integration & Testing [COMPLETE]

### Task 5.1: Comprehensive Tests [COMPLETE]
**File:** `frontend/src/features/cinema/__tests__/`

**Acceptance Criteria:**
- [x] Ambilight rendering adds <5ms per frame
- [x] Sync-play grid keeps all cells within 1 frame of each other
- [x] Cinema mode enters/exits in <300ms
- [x] Approval actions in cinema/grid mode work correctly
- [x] Layout switching between 1x1, 2x1, 2x2 works smoothly
- [x] Auto-hide controls appear on mouse movement and hide after 3s

**Implementation Notes:**
- 20 tests across CinemaMode, SyncPlayGrid, and CinemaReviewControls
- Tests mock Fullscreen API, video player, and shortcuts
- Tests verify auto-hide timer, mouse movement reveal, flash feedback timing

---

## Relevant Files
| File | Description |
|------|-------------|
| `frontend/src/features/cinema/CinemaMode.tsx` | Cinema mode container |
| `frontend/src/features/cinema/useAmbilight.ts` | Ambilight renderer |
| `frontend/src/features/cinema/SyncPlayGrid.tsx` | Grid layout component |
| `frontend/src/features/cinema/useSyncPlay.ts` | Sync-play coordinator |
| `frontend/src/features/cinema/GridControls.tsx` | Grid controls |
| `frontend/src/features/cinema/CinemaReviewControls.tsx` | Review integration |
| `frontend/src/features/cinema/index.ts` | Barrel export |
| `frontend/src/features/cinema/__tests__/CinemaMode.test.tsx` | Test suite |

## Dependencies
- PRD-029: Design system
- PRD-083: Video playback engine (player instances per cell)
- PRD-035: Review/approval workflow (approve/reject actions)
- PRD-052: Keyboard shortcuts

## Implementation Order
### MVP
1. Phase 1 (Cinema Mode) — borderless player with Ambilight
2. Phase 2 (Sync-Play Grid) — layout and sync coordinator
3. Phase 3 (Controls) — global and per-cell controls
4. Phase 4 (Review) — approval integration in both modes

### Post-MVP Enhancements
- Extended grid: 3x3 layout for comparing 9 segments simultaneously
- Configurable Ambilight intensity, spread, and on/off toggle

## Notes
- This is a UI-only feature — no database changes or new API endpoints needed.
- Cinema mode should feel premium — attention to animation transitions and visual polish.
- Ambilight must be subtle; if it's distracting, it defeats the purpose.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
- **v1.1** (2026-02-21): All phases implemented — 8 files, 20 tests passing
