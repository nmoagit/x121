# PRD-036: Cinema Mode & Sync-Play Grid

## 1. Introduction/Overview
Final likeness checks require an immersive, distraction-free environment where the viewer can focus entirely on the content. This PRD provides a borderless video player with an "Ambilight" glow effect for immersive viewing, plus a 2x2 synchronized comparison grid for side-by-side evaluation of multiple segments or variants simultaneously.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System), PRD-83 (Video Playback Engine)
- **Depended on by:** PRD-50 (Content Branching), PRD-55 (Director's View), PRD-58 (Scene Preview), PRD-62 (Storyboard View), PRD-65 (Regression Testing), PRD-68 (Cross-Character Comparison)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Provide a borderless, distraction-free playback mode for final review.
- Enable synchronized playback of up to 4 segments in a comparison grid.
- Support the Ambilight ambient glow effect for immersive viewing.
- Integrate with the review and approval workflow.

## 4. User Stories
- As a Reviewer, I want cinema mode with a borderless player so that I can focus entirely on content quality without UI distractions.
- As a Reviewer, I want a 2x2 sync-play grid so that I can compare variants or iterations of the same scene side by side.
- As a Creator, I want the Ambilight glow effect so that I get an immersive viewing experience during final checks.
- As a Reviewer, I want synchronized playback controls so that all grid cells play, pause, and seek together.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Cinema Mode
**Description:** Borderless, full-screen video player.
**Acceptance Criteria:**
- [ ] Full-screen borderless playback with all UI chrome hidden
- [ ] Ambilight ambient glow: the screen background matches the dominant colors of the video edges
- [ ] Minimal overlay controls: appear on mouse movement, auto-hide after 3 seconds
- [ ] Keyboard shortcuts for all controls (play/pause, seek, approve/reject)
- [ ] Single-key exit from cinema mode (Escape)

#### Requirement 1.2: Sync-Play Grid
**Description:** 2x2 synchronized comparison view.
**Acceptance Criteria:**
- [ ] Display up to 4 segments/variants simultaneously in a grid
- [ ] Synchronized playback: play, pause, and seek controls affect all cells
- [ ] Each cell labeled with segment/variant identifier
- [ ] Drag and drop segments from a list into grid cells

#### Requirement 1.3: Grid Controls
**Description:** Per-cell and global grid controls.
**Acceptance Criteria:**
- [ ] Global controls: sync play/pause, sync seek, playback speed
- [ ] Per-cell: mute/unmute audio, zoom (pinch or scroll)
- [ ] Toggle between 1x1 (single), 2x1 (side-by-side), and 2x2 (quad) grid layouts

#### Requirement 1.4: Review Integration
**Description:** Approval actions available in cinema and grid modes.
**Acceptance Criteria:**
- [ ] Approve/reject/flag actions accessible via keyboard shortcuts in cinema mode
- [ ] In grid mode, select a cell to apply actions to a specific segment
- [ ] Approval feedback (green/red flash) visible per cell

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Extended Grid
**Description:** Support for larger comparison grids.
**Acceptance Criteria:**
- [ ] 3x3 grid layout for comparing 9 segments simultaneously
- [ ] Configurable grid size up to the display's practical limit

## 6. Non-Goals (Out of Scope)
- Video playback engine and codec support (covered by PRD-83)
- QA visual aids and ghosting overlays (covered by PRD-37)
- Approval workflow logic (covered by PRD-35)

## 7. Design Considerations
- Ambilight effect should be subtle and performance-efficient — it's an ambiance feature, not a distraction.
- Grid cell borders should be minimal to maximize the viewable area per cell.
- Cinema mode should feel premium — attention to animation transitions and visual polish.

## 8. Technical Considerations
- **Stack:** React with full-screen API, Canvas/WebGL for Ambilight glow effect, PRD-83 player instances per grid cell
- **Existing Code to Reuse:** PRD-83 video playback engine, PRD-29 design system
- **New Infrastructure Needed:** Ambilight renderer (edge color sampling), sync-play coordinator, grid layout manager
- **Database Changes:** None (UI-only feature)
- **API Changes:** None (consumes existing video streaming APIs from PRD-83)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Ambilight rendering adds <5ms per frame (no perceptible performance impact)
- Sync-play grid keeps all cells within 1 frame of each other
- Cinema mode enters/exits in <300ms (smooth transition)

## 11. Open Questions
- Should the Ambilight effect be configurable (intensity, spread, on/off)?
- Should sync-play support different playback speeds per cell for specific comparison workflows?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
