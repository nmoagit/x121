# PRD-068: Cross-Character Scene Comparison

## 1. Introduction/Overview
When 10 characters are all doing a "dance" scene, you want to see them all at once to spot the one that looks off — not review 10 separate videos sequentially. This PRD provides a gallery view for comparing the same scene type across all characters in a project, with synchronized playback, sort/filter capabilities, variant toggling, and quick approval actions — enabling consistency and quality assessment at the project level.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23 (Scene Types), PRD-35 (Review Interface), PRD-36 (Cinema Mode for comparison grid), PRD-57 (Batch Orchestrator for matrix data), PRD-62 (Storyboard View)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Display the same scene type across all characters in a side-by-side gallery.
- Enable synchronized playback for consistency spotting.
- Support sort/filter by QA score, approval status, and variant.
- Provide quick approval actions directly from the gallery.

## 4. User Stories
- As a Reviewer, I want to see all characters' dance scenes side by side so that I can spot the one that looks inconsistent.
- As a Reviewer, I want synchronized playback across all characters so that I can compare timing, motion quality, and style simultaneously.
- As a Reviewer, I want to approve or reject scenes directly from the gallery so that I don't need to open each individually.
- As a Reviewer, I want to toggle between clothed and topless variants for the entire gallery so that I can compare consistency within each variant.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Scene Type Gallery
**Description:** Grid of the same scene type across all characters.
**Acceptance Criteria:**
- [ ] Select a scene type (e.g., "dance") to see thumbnails/previews for every character
- [ ] Grid layout: one cell per character showing keyframe strip or playing video
- [ ] Character name label on each cell

#### Requirement 1.2: Synchronized Playback
**Description:** Play all character versions simultaneously.
**Acceptance Criteria:**
- [ ] Global play/pause/seek controls affect all cells
- [ ] All cells maintain frame synchronization within 1 frame
- [ ] Individual cell mute/unmute for audio isolation

#### Requirement 1.3: Sort & Filter
**Description:** Organize the gallery by various criteria.
**Acceptance Criteria:**
- [ ] Sort by: QA score, generation date, approval status
- [ ] Filter to: unapproved only, specific variant (clothed/topless), specific resolution tier
- [ ] Persistent sort/filter preferences per user

#### Requirement 1.4: Quick Actions
**Description:** Approve/reject from the gallery.
**Acceptance Criteria:**
- [ ] Approve, reject, or flag individual scenes directly from gallery cells
- [ ] "Approve All Passing" one-click action for all scenes above QA threshold
- [ ] Action feedback visible on the cell (green/red border)

#### Requirement 1.5: Variant Toggle
**Description:** Switch the entire gallery between variants.
**Acceptance Criteria:**
- [ ] Toggle button switches all cells between clothed and topless variants
- [ ] Compare "all clothed dances" then "all topless dances" without re-navigating

#### Requirement 1.6: Per-Character Comparison (Inverse View)
**Description:** View all scene types for a single character.
**Acceptance Criteria:**
- [ ] Select a character to see all their scene types in a row
- [ ] "How does Jane look across dance, idle, bj, feet?"
- [ ] Same sort/filter and quick action capabilities

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Comparison Annotations
**Description:** Mark specific characters or scenes for follow-up.
**Acceptance Criteria:**
- [ ] Pin notes to specific gallery cells for team discussion
- [ ] Notes visible in the gallery without opening individual reviews

## 6. Non-Goals (Out of Scope)
- Per-character cross-scene consistency analysis (covered by PRD-94)
- Face contact sheet (covered by PRD-103)
- Storyboard view per scene (covered by PRD-62)

## 7. Design Considerations
- Gallery cells should be large enough for visual assessment but compact enough to fit 10+ characters on screen.
- Synchronized playback indicator should be clearly visible.
- Variant toggle should be prominent and clearly labeled.

## 8. Technical Considerations
- **Stack:** React grid with PRD-83 video player instances, sync controller
- **Existing Code to Reuse:** PRD-83 video playback engine, PRD-36 sync-play coordinator, PRD-57 matrix data
- **New Infrastructure Needed:** Gallery layout engine, sync-play manager for N cells, variant toggle controller
- **Database Changes:** None (reads from existing scene/segment tables)
- **API Changes:** GET /projects/:id/scene-comparison?scene_type=dance&variant=clothed, GET /projects/:id/characters/:id/all-scenes

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Gallery loads and displays all characters within 3 seconds
- Synchronized playback maintains frame-level sync across 10+ cells
- Quick approval actions process in <200ms per action

## 11. Open Questions
- What is the maximum number of simultaneous video playback cells before performance degrades?
- Should the gallery support custom grid arrangements (e.g., drag characters to rearrange)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
