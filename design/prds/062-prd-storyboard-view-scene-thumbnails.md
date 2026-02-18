# PRD-062: Storyboard View & Scene Thumbnails

## 1. Introduction/Overview
Video playback is the bottleneck in review workflows — you have to watch each scene in real time. Storyboard strips give 80% of the visual information in 2 seconds of scanning. For a producer reviewing 160 scenes, the difference between "play each one" and "scan the thumbnail strips" is hours vs. minutes. This PRD provides keyframe-based scene overviews with thumbnail strips, hover scrub, matrix thumbnails, and comparison strips.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-24 (Generation Loop), PRD-36 (Sync-Play), PRD-57 (Batch Orchestrator)
- **Depended on by:** PRD-68 (Cross-Character Comparison)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Display keyframe-based thumbnail strips per scene for rapid visual scanning.
- Enable hover-scrub for quick preview without opening the full player.
- Integrate thumbnails into the batch matrix view.
- Support comparison strips and exportable storyboards.

## 4. User Stories
- As a Reviewer, I want thumbnail strips per scene so that I can scan visual quality without watching every video.
- As a Creator, I want hover-scrub on scene cards so that I preview content without leaving the list view.
- As a Creator, I want matrix thumbnails in the batch orchestrator so that I see visual status alongside completion status.
- As a Reviewer, I want comparison strips to compare two scenes' visual content side by side.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Scene Thumbnail Strip
**Description:** Filmstrip summary per scene.
**Acceptance Criteria:**
- [ ] Shows: seed image, first segment thumbnail, keyframes at intervals, final frame
- [ ] Configurable keyframe interval (default: every 2 seconds)
- [ ] Lightweight thumbnails for fast loading

#### Requirement 1.2: Hover Scrub
**Description:** Preview keyframes on hover without opening player.
**Acceptance Criteria:**
- [ ] Hover over a scene card scrubs through keyframe strip
- [ ] Smooth transition between keyframes
- [ ] Works in list views and grid views

#### Requirement 1.3: Keyframe Extraction
**Description:** Automated keyframe extraction from segments.
**Acceptance Criteria:**
- [ ] Extract representative keyframes at configurable intervals
- [ ] Stored as lightweight thumbnails
- [ ] Extraction runs as a post-generation step

#### Requirement 1.4: Matrix Thumbnails
**Description:** Thumbnail previews in the batch matrix view.
**Acceptance Criteria:**
- [ ] PRD-57 matrix cells can show thumbnail preview instead of just status
- [ ] Thumbnails are the scene's poster frame or first keyframe
- [ ] Toggleable between thumbnail mode and status-only mode

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Print-Ready Storyboard
**Description:** Export keyframe strip as PDF/image.
**Acceptance Criteria:**
- [ ] Export as PDF for offline review or physical pinboard

## 6. Non-Goals (Out of Scope)
- Full video playback (covered by PRD-83)
- Poster frame selection (covered by PRD-96)

## 7. Design Considerations
- Thumbnail strips should be compact but legible (minimum 80px height per thumbnail).
- Hover scrub should feel smooth and responsive.

## 8. Technical Considerations
- **Stack:** React for strip rendering, FFmpeg for keyframe extraction
- **Existing Code to Reuse:** PRD-83 thumbnail generation capabilities
- **New Infrastructure Needed:** Keyframe extractor, thumbnail storage, strip renderer
- **Database Changes:** `keyframes` table (segment_id, frame_number, thumbnail_path, timestamp)
- **API Changes:** GET /scenes/:id/storyboard, GET /segments/:id/keyframes

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Keyframe extraction completes within 5 seconds per segment
- Thumbnail strips load in <1 second for scenes with 10+ segments
- Hover scrub has <100ms latency between mouse movement and thumbnail change

## 11. Open Questions
- What is the optimal keyframe interval for different scene types?
- Should keyframes be stored as individual files or as a sprite sheet?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
