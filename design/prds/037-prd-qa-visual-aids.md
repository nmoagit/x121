# PRD-037: QA Visual Aids (Ghosting, ROI, Jog Dial)

## 1. Introduction/Overview
Detecting micro-artifacts like jitter, pops, face drift, and boundary inconsistencies requires professional-grade inspection tools beyond standard video playback. This PRD provides 50% opacity ghosting overlays, zoomed looping ROI (Region of Interest) windows, and a frame-stepping jog dial — the tools that distinguish professional QA from casual viewing.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System), PRD-83 (Video Playback Engine for frame-accurate control)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Provide ghosting overlays for detecting temporal inconsistencies.
- Enable ROI zoom windows for inspecting micro-artifacts.
- Deliver a jog dial for precise frame-by-frame stepping.
- Support audio scrubbing/vinyl mode for audio QA.

## 4. User Stories
- As a Reviewer, I want a 50% opacity ghost overlay of the previous frame so that I can spot temporal jitter and pops instantly.
- As a Reviewer, I want a zoomed looping window on a region of interest so that I can inspect fine details (fingers, face features) without affecting the main view.
- As a Reviewer, I want a jog dial for frame-by-frame stepping so that I can precisely navigate through subtle artifacts.
- As a Reviewer, I want audio scrubbing (vinyl mode) so that I can assess audio quality while stepping through frames.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Ghosting Overlay
**Description:** Semi-transparent previous/next frame overlay.
**Acceptance Criteria:**
- [ ] Toggle 50% opacity overlay of the previous frame on the current frame
- [ ] Option to overlay the next frame instead
- [ ] Adjustable opacity (25%, 50%, 75%)
- [ ] Keyboard shortcut to toggle (registered with PRD-52)
- [ ] Temporal inconsistencies appear as visible "doubled" edges

#### Requirement 1.2: ROI Zoom Window
**Description:** Magnified view of a selected region.
**Acceptance Criteria:**
- [ ] Click/drag to define a region of interest on the video frame
- [ ] Zoomed view appears in a floating panel (configurable magnification: 2x, 4x, 8x)
- [ ] ROI follows playback — same region tracked across frames
- [ ] Loop playback within the ROI for repeated inspection of the same area

#### Requirement 1.3: Jog Dial
**Description:** Precision frame-stepping control.
**Acceptance Criteria:**
- [ ] Virtual jog dial widget for frame-by-frame navigation
- [ ] Clockwise = forward, counter-clockwise = backward
- [ ] Speed proportional to dial rotation rate
- [ ] Keyboard shortcuts: arrow keys for single-frame step, Shift+arrow for 10-frame jump

#### Requirement 1.4: Audio Scrubbing
**Description:** Vinyl-mode audio during frame stepping.
**Acceptance Criteria:**
- [ ] Audio plays in "vinyl scratch" mode during jog dial operation
- [ ] Speed and pitch follow frame-stepping direction and speed
- [ ] Toggleable: on/off via keyboard shortcut

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Difference Map
**Description:** Pixel-level difference visualization between frames.
**Acceptance Criteria:**
- [ ] Compute and display a difference map between consecutive frames
- [ ] Color-coded: blue = no change, red = maximum change
- [ ] Useful for detecting subtle face drift over time

## 6. Non-Goals (Out of Scope)
- Video playback engine (covered by PRD-83)
- Cinema mode and comparison grids (covered by PRD-36)
- On-frame annotation and markup (covered by PRD-70)

## 7. Design Considerations
- Overlay controls should be accessible via a floating toolbar that doesn't obstruct the video.
- ROI zoom window should be draggable and resizable.
- Jog dial should feel responsive and natural (smooth rotation physics).

## 8. Technical Considerations
- **Stack:** Canvas/WebGL for overlay compositing, React for control widgets, PRD-83 frame-accurate API
- **Existing Code to Reuse:** PRD-83 video playback engine for frame access, PRD-29 design system for control styling
- **New Infrastructure Needed:** Frame compositor (ghosting), ROI tracker, jog dial physics engine, audio scrub synthesizer
- **Database Changes:** None (UI-only tool)
- **API Changes:** None (operates on client-side frame data from PRD-83)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Ghosting overlay renders in <5ms per frame (no visible lag during playback)
- ROI zoom updates in real-time during playback at all magnification levels
- Jog dial frame stepping achieves exact frame accuracy 100% of the time

## 11. Open Questions
- Should the ghosting overlay support comparison with frames N steps apart (not just adjacent frames)?
- What is the optimal default magnification level for ROI zoom?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
