# PRD-152: Annotation Playback Mode

## 1. Introduction / Overview

When reviewing annotated video clips, reviewers need to see annotation regions in detail without manually adjusting playback speed every time the playhead enters or exits an annotated frame range. **Annotation Playback Mode** is a toggle on the video player that automatically slows playback to a configurable speed (default 0.25x) whenever the playhead is inside a visible annotation range, and returns to the user's chosen base speed outside those ranges. This eliminates constant manual speed toggling and ensures every annotated region receives careful review.

## 2. Related PRDs & Dependencies

| Relationship | PRD | Title |
|---|---|---|
| **Depends on** | PRD-83 | Video Playback (core player infrastructure) |
| **Depends on** | PRD-109 | Video Player Controls (speed presets, A-B loop, transport) |
| **Depends on** | PRD-70 | On-Frame Annotation & Markup (annotation CRUD) |
| **Depends on** | PRD-149 | Frame Range Annotations & Text Presets (`frame_end`, timeline ranges) |
| **Extends** | PRD-109 | Adds annotation-mode toggle to transport controls |

## 3. Goals

1. Allow reviewers to toggle an "annotation playback mode" that automatically adjusts playback speed based on annotation proximity.
2. Reduce manual speed changes during clip review — the player handles transitions automatically.
3. Merge overlapping annotation ranges into contiguous slow zones so the speed doesn't oscillate.
4. Make the slow-motion speed configurable (0.1x, 0.25x, 0.5x) rather than hard-coded.
5. Provide subtle visual feedback on the timeline when the playhead is inside an annotation zone.

## 4. User Stories

- **US-1:** As a QA reviewer, I want the video to automatically slow down when it reaches annotated frames so I can inspect issues without manually adjusting speed.
- **US-2:** As a QA reviewer, I want the video to return to my chosen base speed after passing the last annotated frame so I don't waste time on unannotated sections.
- **US-3:** As a QA reviewer, I want to choose the slow-motion speed (0.1x / 0.25x / 0.5x) to match the level of detail I need.
- **US-4:** As a QA reviewer, I want a visual cue on the timeline so I can see at a glance when annotation mode is actively slowing playback.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Annotation Mode Toggle

**Description:** A toggle button in the transport controls bar (next to the speed selector) that enables/disables annotation playback mode. The toggle is only visible when the `VideoPlayer` receives non-empty `annotationRanges`.

**Acceptance Criteria:**
- [ ] Toggle button appears in `TransportControls` between the speed presets and the A-B loop controls
- [ ] Toggle is hidden when `annotationRanges` is empty or undefined
- [ ] Toggle uses a distinctive icon (e.g. `ScanEye` or `Crosshair`) with an active-state highlight matching the amber annotation color
- [ ] Toggling on stores the current user speed as the "base speed" and begins annotation-aware playback
- [ ] Toggling off restores the base speed immediately and disables automatic speed switching
- [ ] State persists across play/pause cycles but resets when the player unmounts

#### Requirement 1.2: Automatic Speed Switching

**Description:** While annotation mode is active, a hook monitors the current frame and adjusts `playbackRate` based on whether the playhead is inside any visible annotation range.

**Acceptance Criteria:**
- [ ] When the playhead enters the first frame of any merged annotation zone, speed switches to the configured slow speed (default 0.25x)
- [ ] When the playhead exits the last frame of the merged annotation zone, speed returns to the stored base speed
- [ ] Overlapping annotation ranges are merged into contiguous spans before comparison (e.g. F10-F30 + F20-F50 → F10-F50)
- [ ] Single-frame annotations (no `frame_end`) are treated as 1-frame ranges (F_n to F_n)
- [ ] Speed transitions happen within a single `requestAnimationFrame` tick — no perceptible delay
- [ ] If the user manually changes speed while in a slow zone, that new speed becomes the slow speed; if outside a zone, it becomes the base speed
- [ ] Seeking (scrubbing) while annotation mode is on immediately evaluates the new position and sets the correct speed

#### Requirement 1.3: Configurable Slow Speed

**Description:** A small dropdown or segmented control adjacent to the annotation-mode toggle that lets the user pick the slow-motion speed from a fixed set of presets.

**Acceptance Criteria:**
- [ ] Presets available: 0.1x, 0.25x, 0.5x
- [ ] Default selection is 0.25x
- [ ] Dropdown is only visible/enabled when annotation mode is active
- [ ] Changing the slow speed immediately applies if the playhead is currently inside an annotation zone
- [ ] Selection persists for the lifetime of the player instance

#### Requirement 1.4: Timeline Visual Feedback

**Description:** When annotation mode is active and the playhead is inside an annotation zone, the corresponding annotation range bar(s) on the timeline scrubber pulse with a subtle glow animation to indicate the speed reduction is in effect.

**Acceptance Criteria:**
- [ ] Existing amber annotation range bars on `TimelineScrubber` gain a pulsing glow animation when the playhead is within their bounds AND annotation mode is active
- [ ] Ranges that the playhead is NOT currently inside remain static (no pulse)
- [ ] The pulse animation uses CSS `@keyframes` — no JS animation loops
- [ ] When annotation mode is toggled off, all range bars return to static appearance immediately

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Transition Easing

**Description:** Instead of instant speed jumps, ramp the speed smoothly over ~200ms when entering/exiting annotation zones for a less jarring experience.

**Acceptance Criteria:**
- [ ] Speed transitions use a linear ramp over 200ms (configurable)
- [ ] Ramp is interruptible — if a new zone boundary is crossed mid-ramp, the ramp retargets

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Pre-roll / Post-roll Padding

**Description:** Optionally slow down N frames before the annotation start and stay slow N frames after the annotation end, giving the reviewer lead-in/lead-out context.

**Acceptance Criteria:**
- [ ] Configurable padding (0, 5, 10, 15 frames) via a setting in the annotation mode dropdown
- [ ] Padding is applied after range merging to avoid double-padding overlapping ranges

## 6. Non-Goals (Out of Scope)

- **No auto-pause:** The mode does not pause at annotation boundaries, only adjusts speed.
- **No per-annotation speed:** All annotation zones use the same slow speed — no per-annotation customization.
- **No backend changes:** This is a purely frontend playback feature. No new API endpoints or DB schema changes.
- **No keyboard shortcut (MVP):** A hotkey for toggling annotation mode may be added later.
- **No integration with annotation editing mode:** This feature is for playback review, not for the annotation drawing/editing workflow.

## 7. Design Considerations

### UI Placement

The annotation-mode toggle sits in the `TransportControls` bar, between the `SpeedControl` presets and the A-B loop section, separated by dividers:

```
[SkipBack] [◀] [▶/‖] [▶] [↺5s]  |  [0.25x] [0.5x] [1x] [2x] [4x]  |  [🔍 Ann.Mode ▾]  |  [A] [B] [🔁]   ...  [🔊] [Quality]
```

- **Toggle icon:** `ScanEye` from Lucide (or similar review-oriented icon)
- **Active state:** Amber background matching annotation range color (`bg-amber-500`)
- **Slow speed dropdown:** Appears as a small chevron-down next to the toggle, only when active
- **Timeline pulse:** CSS `animate-pulse` variant using `amber-500/30` glow

### Existing Components to Match

- Toggle button style: matches the A-B loop `A`/`B` button active states (colored background + inverse text)
- Dropdown style: matches `QualitySelector` dropdown pattern
- Timeline bar glow: extends the existing `bg-amber-500/20` annotation range rendering in `TimelineScrubber`

## 8. Technical Considerations

### Existing Code to Reuse

| What | Where | How |
|---|---|---|
| `useVideoPlayer` hook | `features/video-player/hooks/use-video-player.ts` | Use `setSpeed()` to change playback rate; read `currentFrame` and `speed` |
| `SpeedControl` component | `features/video-player/components/SpeedControl.tsx` | Reference for button styling; annotation speed selector follows same pattern |
| `TransportControls` component | `features/video-player/components/TransportControls.tsx` | Add toggle + dropdown in this component |
| `TimelineScrubber` + `TimelineAnnotationRange` | `features/video-player/components/TimelineScrubber.tsx` | Add `activeRangeIndex` prop for glow state |
| `frameToSeconds` / `secondsToFrame` | `features/video-player/frame-utils.ts` | Frame ↔ time conversion for zone boundary checks |
| Annotation range computation | `features/scenes/ClipPlaybackModal.tsx` | Already computes `annotationRanges` from Zustand store |

### New Code to Create

| What | Where | Purpose |
|---|---|---|
| `useAnnotationPlayback` hook | `features/video-player/hooks/use-annotation-playback.ts` | Core logic: merge ranges, track zone entry/exit, call `setSpeed()` |
| Annotation mode toggle + speed dropdown | Inline in `TransportControls.tsx` | UI elements |
| Timeline glow animation | CSS class in `TimelineScrubber.tsx` | Pulsing active-zone indicator |

### Hook Design: `useAnnotationPlayback`

```typescript
interface UseAnnotationPlaybackOptions {
  currentFrame: number;
  annotationRanges: TimelineAnnotationRange[] | undefined;
  setSpeed: (speed: number) => void;
  currentSpeed: number;
}

interface AnnotationPlaybackControls {
  /** Whether annotation mode is enabled. */
  isEnabled: boolean;
  /** Toggle annotation mode on/off. */
  toggle: () => void;
  /** The slow speed preset (0.1, 0.25, 0.5). */
  slowSpeed: number;
  /** Change the slow speed preset. */
  setSlowSpeed: (speed: number) => void;
  /** Whether the playhead is currently inside an annotation zone. */
  isInZone: boolean;
  /** Merged annotation zones (for timeline glow). */
  mergedZones: { start: number; end: number }[];
}
```

**Range merging algorithm:**
1. Collect all `annotationRanges`, treating single-frame annotations as `{ start: n, end: n }`
2. Sort by `start` ascending
3. Merge overlapping/adjacent ranges (if `next.start <= current.end + 1`, extend `current.end`)
4. Memoize result — only recompute when `annotationRanges` reference changes

**Zone detection:**
- On each frame change, binary search merged zones to determine if `currentFrame` is inside any zone
- Compare against previous zone state to avoid redundant `setSpeed()` calls

### Database Changes

None — this is a frontend-only feature.

### API Changes

None — no new endpoints required.

## 9. Success Metrics

- Reviewers can play through an annotated clip end-to-end without manually touching the speed controls.
- Speed transitions are imperceptible in latency (< 1 frame of delay).
- No performance regression in the `requestAnimationFrame` loop — zone checking adds negligible overhead.

## 10. Open Questions

1. Should the annotation mode toggle state persist in `localStorage` so it survives page reloads / modal re-opens?
2. Should the feature interact with A-B loop? (e.g., if looping an annotated region, annotation mode still applies within the loop?)

## 11. Version History

- **v1.0** (2026-03-26): Initial PRD creation
