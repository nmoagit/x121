# Task List: Annotation Playback Mode

**PRD Reference:** `design/prds/152-prd-annotation-playback-mode.md`
**Scope:** Frontend-only feature adding automatic speed switching during video playback based on annotation frame ranges.

## Overview

This feature adds an "annotation playback mode" toggle to the video player transport controls. When active, a hook monitors the current frame and automatically switches between a user-configurable slow speed (default 0.25x) inside annotation zones and the user's base speed outside them. Overlapping annotation ranges are merged into contiguous zones. The timeline provides visual feedback via a pulsing glow on active ranges.

No backend or database changes are required — this is entirely within the `features/video-player/` frontend module.

### What Already Exists
- `useVideoPlayer` hook (`features/video-player/hooks/use-video-player.ts`) — exposes `setSpeed()`, `currentFrame`, `speed`
- `useABLoop` hook (`features/video-player/hooks/use-ab-loop.ts`) — pattern to follow for a companion player hook
- `TransportControls` component (`features/video-player/components/TransportControls.tsx`) — where the toggle will live
- `SpeedControl` component (`features/video-player/components/SpeedControl.tsx`) — styling reference for speed preset buttons
- `TimelineScrubber` component (`features/video-player/components/TimelineScrubber.tsx`) — renders annotation ranges as amber bars
- `VideoPlayer` component (`features/video-player/VideoPlayer.tsx`) — orchestrates all sub-components
- `frameToSeconds` / `secondsToFrame` utilities (`features/video-player/frame-utils.ts`)
- `ScanSearch` icon already exported in `tokens/icons.ts` (alternative: add `ScanEye`)

### What We're Building
1. `useAnnotationPlayback` hook — core logic (merge ranges, detect zone, switch speed)
2. Annotation mode toggle + slow-speed selector in `TransportControls`
3. Pulsing glow animation on active annotation ranges in `TimelineScrubber`
4. Prop threading through `VideoPlayer` to connect everything

### Key Design Decisions
1. **Range merging happens in the hook** via `useMemo` — sorted + merged once per `annotationRanges` change, not on every frame
2. **Zone detection uses linear scan** of merged zones (typically < 10 zones) — no need for binary search at this scale
3. **Base speed is captured on toggle-on** and restored on toggle-off, matching user choice 3b from the PRD
4. **The hook is a peer to `useABLoop`** — consumed in `VideoPlayer` alongside the existing player + loop hooks

---

## Phase 1: Core Hook

### Task 1.1: Create `useAnnotationPlayback` hook
**File:** `apps/frontend/src/features/video-player/hooks/use-annotation-playback.ts`

Create the core hook that manages annotation playback mode state and automatic speed switching.

**Implementation details:**

```typescript
// Inputs
interface UseAnnotationPlaybackOptions {
  currentFrame: number;
  annotationRanges: TimelineAnnotationRange[] | undefined;
  setSpeed: (speed: number) => void;
  currentSpeed: number;
}

// Outputs
interface AnnotationPlaybackControls {
  isEnabled: boolean;
  toggle: () => void;
  slowSpeed: number;
  setSlowSpeed: (speed: number) => void;
  isInZone: boolean;
  mergedZones: { start: number; end: number }[];
}
```

**Logic:**
1. `mergedZones` — `useMemo` that sorts `annotationRanges` by `start`, then merges overlapping/adjacent ranges. Single-frame annotations (no `end` or `end === start`) are treated as `{ start: n, end: n }`.
2. `isInZone` — derived from `currentFrame` by scanning `mergedZones` (linear scan, typically < 10 items).
3. `useEffect` watches `isInZone` changes while `isEnabled`:
   - Entering zone → call `setSpeed(slowSpeed)`
   - Exiting zone → call `setSpeed(baseSpeedRef.current)`
4. `toggle()` — on enable: store `currentSpeed` into `baseSpeedRef`, evaluate current zone immediately. On disable: restore `baseSpeedRef.current` via `setSpeed()`.
5. `setSlowSpeed()` — updates slow speed state; if currently in zone, immediately applies the new slow speed.
6. A `useRef` for `baseSpeed` (not state) to avoid re-render loops when the parent's `speed` prop changes due to our own `setSpeed` calls.

**Acceptance Criteria:**
- [ ] Hook exports `AnnotationPlaybackControls` interface
- [ ] `mergedZones` correctly merges overlapping ranges (e.g. `[{10,30},{20,50}]` → `[{10,50}]`)
- [ ] `mergedZones` treats single-frame annotations as 1-frame ranges
- [ ] `isInZone` is `true` when `currentFrame` is within any merged zone, `false` otherwise
- [ ] Toggling on captures the current speed as base speed
- [ ] Toggling off restores the base speed
- [ ] Speed switches to `slowSpeed` when entering a zone
- [ ] Speed switches to base speed when exiting a zone
- [ ] Changing `slowSpeed` while in a zone immediately applies the new slow speed
- [ ] No redundant `setSpeed()` calls when zone state hasn't changed
- [ ] Hook is a no-op when `annotationRanges` is empty/undefined (returns `isEnabled: false` disabled state)

---

## Phase 2: Transport Controls UI

### Task 2.1: Add `ScanEye` to icon exports
**File:** `apps/frontend/src/tokens/icons.ts`

Add the `ScanEye` icon from `lucide-react` to the barrel export. This icon represents the annotation review mode toggle.

**Acceptance Criteria:**
- [ ] `ScanEye` is exported from `tokens/icons.ts`
- [ ] Existing icon exports are unchanged
- [ ] TypeScript compiles cleanly

### Task 2.2: Add annotation mode toggle and slow-speed selector to `TransportControls`
**File:** `apps/frontend/src/features/video-player/components/TransportControls.tsx`

Add two new UI elements between the `SpeedControl` and the A-B loop section:

1. **Toggle button** — `ScanEye` icon, styled like the A-B loop `A`/`B` buttons. Active state uses `bg-amber-500 text-[var(--color-text-inverse)]`. Hidden when `annotationPlayback` prop is `null` (no annotation ranges).

2. **Slow-speed selector** — three small buttons `0.1x`, `0.25x`, `0.5x` (same styling as `SpeedControl` presets but smaller). Only visible when annotation mode is active. Active preset gets `bg-amber-500` highlight.

**Props to add to `TransportControlsProps`:**
```typescript
annotationPlayback: AnnotationPlaybackControls | null;
```

When `annotationPlayback` is `null`, both elements are hidden (no annotation ranges available).

**Layout:**
```
[SpeedControl]  |  [ScanEye toggle] [0.1x] [0.25x] [0.5x]  |  [A-B loop]
```

The slow-speed buttons appear inline next to the toggle, separated by a small gap. They fade in/out with a transition when annotation mode is toggled.

**Acceptance Criteria:**
- [ ] Toggle button renders between speed presets and A-B loop controls
- [ ] Toggle is hidden when `annotationPlayback` is `null`
- [ ] Toggle shows amber active state when `isEnabled` is `true`
- [ ] Clicking toggle calls `annotationPlayback.toggle()`
- [ ] Slow-speed buttons (0.1x, 0.25x, 0.5x) only appear when `isEnabled` is `true`
- [ ] Active slow-speed preset is highlighted with amber background
- [ ] Clicking a slow-speed button calls `annotationPlayback.setSlowSpeed()`
- [ ] Button styling matches existing `SpeedControl` and A-B loop patterns
- [ ] Tooltip on toggle reads "Annotation playback mode"
- [ ] TypeScript compiles cleanly

---

## Phase 3: Timeline Visual Feedback

### Task 3.1: Add pulsing glow animation to active annotation ranges
**File:** `apps/frontend/src/features/video-player/components/TimelineScrubber.tsx`

When annotation playback mode is active and the playhead is inside an annotation range, that range's bar on the timeline should pulse with a subtle amber glow.

**Props to add to `TimelineScrubberProps`:**
```typescript
/** Whether annotation playback mode is active. */
annotationModeActive?: boolean;
/** Current frame number, used to determine which range is "active". */
currentFrame?: number;
```

**Implementation:**
1. For each annotation range bar, check if `annotationModeActive` is `true` AND `currentFrame` is within the range's `start..end` bounds.
2. If active, add a CSS class with a `@keyframes` pulse animation:
   ```css
   @keyframes annotation-pulse {
     0%, 100% { opacity: 0.2; }
     50% { opacity: 0.45; }
   }
   ```
3. Use Tailwind's arbitrary animation: `animate-[annotation-pulse_1.5s_ease-in-out_infinite]` or define in the component with inline style.
4. Non-active ranges keep the existing static `bg-amber-500/20`.

**Acceptance Criteria:**
- [ ] Active range bar pulses when `annotationModeActive` is `true` and `currentFrame` is within bounds
- [ ] Non-active range bars remain static `bg-amber-500/20`
- [ ] Pulse animation uses CSS `@keyframes` — no JS animation loops
- [ ] When annotation mode is toggled off, all bars return to static immediately
- [ ] Pulse is subtle — opacity cycles between 0.2 and 0.45
- [ ] No visual regression on existing timeline behavior (A-B loop, progress bar, playhead)
- [ ] TypeScript compiles cleanly

---

## Phase 4: VideoPlayer Integration

### Task 4.1: Wire `useAnnotationPlayback` into `VideoPlayer`
**File:** `apps/frontend/src/features/video-player/VideoPlayer.tsx`

Instantiate the `useAnnotationPlayback` hook in `VideoPlayer` and pass its controls down to `TransportControls` and `TimelineScrubber`.

**Changes:**
1. Import and call `useAnnotationPlayback` with `currentFrame`, `annotationRanges`, `setSpeed`, and `speed` from the existing `player` controls.
2. Compute `annotationPlayback` — if `annotationRanges` is non-empty, pass the hook's controls; otherwise pass `null`.
3. Pass `annotationPlayback` to `TransportControls`.
4. Pass `annotationModeActive={annotationPlayback?.isEnabled && annotationPlayback?.isInZone}` and `currentFrame={player.currentFrame}` to `TimelineScrubber`.

```typescript
const annPlayback = useAnnotationPlayback({
  currentFrame: player.currentFrame,
  annotationRanges,
  setSpeed: player.setSpeed,
  currentSpeed: player.speed,
});

const annotationPlayback = annotationRanges?.length ? annPlayback : null;
```

**Acceptance Criteria:**
- [ ] `useAnnotationPlayback` is called in `VideoPlayer`
- [ ] `annotationPlayback` is `null` when no annotation ranges are provided
- [ ] `TransportControls` receives `annotationPlayback` prop
- [ ] `TimelineScrubber` receives `annotationModeActive` and `currentFrame` props
- [ ] End-to-end: toggling annotation mode in transport controls causes speed switching during playback
- [ ] End-to-end: timeline ranges pulse when playhead enters an annotation zone with mode active
- [ ] Existing player behavior (play/pause, seek, A-B loop, manual speed change) is unaffected when annotation mode is off
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit` passes)

---

## Phase 5: Icon Export

### Task 5.1: Verify `ScanEye` availability in `lucide-react`
**File:** `apps/frontend/src/tokens/icons.ts`

Before Task 2.1, verify that `ScanEye` exists in the installed `lucide-react` version. If not available, fall back to `ScanSearch` (already exported) or `Crosshair`.

**Acceptance Criteria:**
- [ ] Confirmed which icon name to use (`ScanEye` preferred, `ScanSearch` fallback)
- [ ] Icon is exported and importable
- [ ] No build errors

> **Note:** This task can be done in parallel with Phase 1. If `ScanEye` is unavailable, Task 2.2 should use `ScanSearch` instead.

---

## Relevant Files

| File | Action | Description |
|------|--------|-------------|
| `apps/frontend/src/features/video-player/hooks/use-annotation-playback.ts` | **Create** | Core hook: range merging, zone detection, speed switching |
| `apps/frontend/src/features/video-player/components/TransportControls.tsx` | **Modify** | Add annotation mode toggle + slow-speed selector |
| `apps/frontend/src/features/video-player/components/TimelineScrubber.tsx` | **Modify** | Add pulsing glow on active annotation ranges |
| `apps/frontend/src/features/video-player/VideoPlayer.tsx` | **Modify** | Wire hook, pass props to children |
| `apps/frontend/src/tokens/icons.ts` | **Modify** | Add `ScanEye` icon export |

---

## Dependencies

### Existing Components to Reuse
- `useVideoPlayer` hook from `features/video-player/hooks/use-video-player.ts` — `setSpeed()`, `currentFrame`, `speed`
- `useABLoop` pattern from `features/video-player/hooks/use-ab-loop.ts` — hook structure reference
- `SpeedControl` from `features/video-player/components/SpeedControl.tsx` — button styling reference
- `TimelineAnnotationRange` type from `features/video-player/components/TimelineScrubber.tsx`
- `frameToSeconds` from `features/video-player/frame-utils.ts`
- `cn` utility from `lib/cn.ts`

### New Infrastructure Needed
- `useAnnotationPlayback` hook (Task 1.1)
- `ScanEye` icon export (Task 2.1 / 5.1)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 5: Icon Export — Task 5.1 (verify icon availability)
2. Phase 1: Core Hook — Task 1.1 (create `useAnnotationPlayback`)
3. Phase 2: Transport Controls UI — Tasks 2.1, 2.2 (icon + toggle/selector)
4. Phase 3: Timeline Visual Feedback — Task 3.1 (pulsing glow)
5. Phase 4: VideoPlayer Integration — Task 4.1 (wire everything together)

**MVP Success Criteria:**
- Annotation mode toggle appears in transport controls when annotation ranges exist
- Playback auto-slows to configurable speed inside annotation zones
- Playback returns to base speed outside annotation zones
- Timeline range bars pulse when playhead is in an active zone
- `npx tsc --noEmit` passes with zero errors

### Post-MVP Enhancements
- Transition easing (PRD Req 2.1) — smooth speed ramp over ~200ms
- Pre-roll / post-roll padding (PRD Req 2.2) — configurable frame padding around zones

---

## Notes

1. **No backend changes** — this is entirely frontend. No migrations, no API endpoints.
2. **Hook isolation** — `useAnnotationPlayback` has no side effects beyond calling the provided `setSpeed()`. It does not touch the `<video>` element directly.
3. **Performance** — zone detection runs on every frame change (via `onFrameChange` callback in `useVideoPlayer`). With merged zones typically < 10 items, a linear scan is negligible. If profiling shows issues, switch to binary search.
4. **A-B loop interaction** — annotation mode works independently of A-B loop. Both can be active simultaneously. The A-B loop handles seek-back; annotation mode handles speed. No conflict.

---

## Version History

- **v1.0** (2026-03-26): Initial task list creation from PRD-152
