# Task List: QA Visual Aids (Ghosting, ROI, Jog Dial)

**PRD Reference:** `design/prds/037-prd-qa-visual-aids.md`
**Scope:** Build professional QA inspection tools: ghosting overlays for temporal inconsistency detection, zoomed ROI windows for micro-artifact inspection, a jog dial for frame-stepping, and audio scrubbing in vinyl mode.

## Overview

Detecting micro-artifacts like jitter, pops, face drift, and boundary inconsistencies requires professional-grade tools beyond standard video playback. This PRD provides: 50% opacity ghosting overlays that superimpose the previous (or next) frame on the current frame to reveal temporal inconsistencies; zoomed ROI (Region of Interest) windows for inspecting fine details at 2x-8x magnification; a virtual jog dial for precise frame-by-frame stepping; and audio scrubbing in vinyl mode during frame stepping. These tools are all client-side, operating on frame data from PRD-083.

### What Already Exists
- PRD-083 video playback engine (frame-accurate frame access)
- PRD-029 design system (control styling)
- PRD-052 keyboard shortcuts
- No database changes needed (UI-only tools)

### What We're Building
1. Ghosting overlay compositor (previous/next frame at adjustable opacity)
2. ROI zoom window with magnification controls
3. Virtual jog dial widget with rotation physics
4. Audio scrubbing synthesizer (vinyl mode)
5. QA toolbar component aggregating all tools

### Key Design Decisions
1. **Canvas/WebGL compositing** — Ghosting overlay rendered via Canvas or WebGL, not CSS opacity (needs pixel-level control).
2. **ROI tracks across frames** — The region of interest follows the same area across frames during playback.
3. **Jog dial is virtual** — A mouse-draggable circular widget; rotation speed maps to step speed.
4. **All client-side** — No API calls needed; all tools operate on frame data from the player.

---

## Phase 1: Ghosting Overlay

### Task 1.1: Frame Compositor
**File:** `frontend/src/features/qa-aids/FrameCompositor.ts`

```typescript
export class FrameCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(width: number, height: number);

  /// Composite two frames with adjustable opacity
  composite(
    baseFrame: ImageData | VideoFrame,
    overlayFrame: ImageData | VideoFrame,
    opacity: number   // 0.0 to 1.0
  ): ImageData;
}
```

**Acceptance Criteria:**
- [ ] Composite current frame with previous or next frame
- [ ] Adjustable opacity: 25%, 50%, 75%
- [ ] Temporal inconsistencies appear as visible "doubled" edges
- [ ] Rendering <5ms per frame (no visible lag during playback)

### Task 1.2: Ghosting Overlay Component
**File:** `frontend/src/features/qa-aids/GhostingOverlay.tsx`

```typescript
interface GhostingOverlayProps {
  enabled: boolean;
  mode: 'previous' | 'next';
  opacity: number;
}
```

**Acceptance Criteria:**
- [ ] Toggle overlay on/off with keyboard shortcut (registered with PRD-052)
- [ ] Option to overlay previous frame or next frame
- [ ] Opacity adjustable (25%, 50%, 75%)
- [ ] Overlay rendered in real-time during playback

---

## Phase 2: ROI Zoom Window

### Task 2.1: ROI Selection
**File:** `frontend/src/features/qa-aids/ROISelector.tsx`

```typescript
interface ROISelection {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

**Acceptance Criteria:**
- [ ] Click/drag to define a region of interest on the video frame
- [ ] Visual rectangle overlay showing the selected region
- [ ] Resizable and repositionable after initial selection
- [ ] Clear ROI with keyboard shortcut

### Task 2.2: ROI Zoom Panel
**File:** `frontend/src/features/qa-aids/ROIZoomPanel.tsx`

**Acceptance Criteria:**
- [ ] Floating panel showing the zoomed view of the selected ROI
- [ ] Configurable magnification: 2x, 4x, 8x
- [ ] ROI follows playback — same region tracked across frames
- [ ] Loop playback within the ROI for repeated inspection
- [ ] Panel is draggable and resizable
- [ ] Real-time zoom updates during playback at all magnification levels

---

## Phase 3: Jog Dial

### Task 3.1: Virtual Jog Dial Widget
**File:** `frontend/src/features/qa-aids/JogDial.tsx`

```typescript
interface JogDialProps {
  onStep: (direction: 'forward' | 'backward', frames: number) => void;
}
```

**Acceptance Criteria:**
- [ ] Circular dial widget for frame-by-frame navigation
- [ ] Clockwise rotation = forward, counter-clockwise = backward
- [ ] Speed proportional to rotation rate (slow rotation = single frames, fast = multi-frame jumps)
- [ ] Keyboard shortcuts: arrow keys for single-frame step, Shift+arrow for 10-frame jump
- [ ] Responsive feel with smooth rotation physics
- [ ] Exact frame accuracy 100% of the time

### Task 3.2: Jog Dial Physics Engine
**File:** `frontend/src/features/qa-aids/jogDialPhysics.ts`

**Acceptance Criteria:**
- [ ] Smooth rotation physics (momentum, deceleration)
- [ ] Touch support for tablet use
- [ ] Mouse drag for desktop use
- [ ] Configurable sensitivity

---

## Phase 4: Audio Scrubbing

### Task 4.1: Audio Scrub Synthesizer
**File:** `frontend/src/features/qa-aids/audioScrub.ts`

```typescript
export class AudioScrubber {
  private audioContext: AudioContext;

  constructor();

  /// Play audio in vinyl scratch mode following frame stepping
  scrub(direction: 'forward' | 'backward', speed: number): void;
  stop(): void;
  setEnabled(enabled: boolean): void;
}
```

**Acceptance Criteria:**
- [ ] Audio plays in "vinyl scratch" mode during jog dial operation
- [ ] Speed and pitch follow frame-stepping direction and speed
- [ ] Toggleable on/off via keyboard shortcut
- [ ] Uses Web Audio API for real-time audio manipulation

---

## Phase 5: QA Toolbar

### Task 5.1: QA Toolbar Component
**File:** `frontend/src/features/qa-aids/QAToolbar.tsx`

**Acceptance Criteria:**
- [ ] Floating toolbar aggregating all QA tools
- [ ] Toggle buttons: Ghosting, ROI, Jog Dial, Audio Scrub
- [ ] Opacity slider for ghosting
- [ ] Magnification selector for ROI
- [ ] Toolbar position configurable (top/bottom/floating)
- [ ] Doesn't obstruct the video when not in use

---

## Phase 6: Testing

### Task 6.1: Comprehensive Tests
**File:** `frontend/src/features/qa-aids/__tests__/`

**Acceptance Criteria:**
- [ ] Ghosting overlay renders in <5ms per frame
- [ ] ROI zoom updates in real-time at all magnification levels
- [ ] Jog dial frame stepping achieves exact frame accuracy 100% of the time
- [ ] Audio scrubbing follows frame step direction correctly
- [ ] All tools work concurrently without performance degradation

---

## Relevant Files
| File | Description |
|------|-------------|
| `frontend/src/features/qa-aids/FrameCompositor.ts` | Frame compositing engine |
| `frontend/src/features/qa-aids/GhostingOverlay.tsx` | Ghosting overlay |
| `frontend/src/features/qa-aids/ROISelector.tsx` | ROI selection |
| `frontend/src/features/qa-aids/ROIZoomPanel.tsx` | Zoomed ROI panel |
| `frontend/src/features/qa-aids/JogDial.tsx` | Virtual jog dial |
| `frontend/src/features/qa-aids/audioScrub.ts` | Audio scrub synthesizer |
| `frontend/src/features/qa-aids/QAToolbar.tsx` | QA toolbar |

## Dependencies
- PRD-083: Video playback engine (frame-accurate frame access)
- PRD-029: Design system (control styling)
- PRD-052: Keyboard shortcuts (toggle shortcuts)

## Implementation Order
### MVP
1. Phase 1 (Ghosting) — frame compositor and overlay
2. Phase 2 (ROI) — selection, zoom panel
3. Phase 3 (Jog Dial) — dial widget with physics
4. Phase 4 (Audio Scrub) — vinyl mode synthesizer
5. Phase 5 (Toolbar) — aggregated QA toolbar

### Post-MVP Enhancements
- Difference map: pixel-level difference visualization between frames (blue=no change, red=max change)

## Notes
- All tools are client-side only — no database changes or API endpoints.
- Performance is critical — these tools are used during real-time playback.
- Ghosting overlay is the most impactful tool for temporal QA.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
