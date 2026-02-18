# PRD-070: On-Frame Annotation & Markup

## 1. Introduction/Overview
"The hand is wrong" is vague. A circle drawn on the exact frame where the hand artifact occurs is unambiguous. Professional review tools (Frame.io, SyncSketch) have proven that visual annotation dramatically reduces review cycles by eliminating back-and-forth about which issue is being discussed. This PRD provides drawing and annotation tools for marking up specific frames during review, enabling precise visual communication of issues.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-38 (Collaborative Review for note integration), PRD-29 (Design System)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Provide drawing tools (pen, circle, rectangle, arrow, highlight) directly on paused video frames.
- Anchor annotations to specific frame numbers and timecodes.
- Support multi-reviewer annotation layers with toggleable visibility.
- Enable annotation export as PNG images for external sharing.

## 4. User Stories
- As a Reviewer, I want to draw a circle on the exact frame where a hand artifact occurs so that the Creator knows precisely what needs fixing.
- As a Reviewer, I want text labels on annotations so that I can describe the issue alongside the visual markup.
- As a Creator, I want to toggle individual reviewers' annotations on/off so that I can focus on specific feedback.
- As a Reviewer, I want to export annotated frames as PNG images so that I can share them via email or Slack.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Drawing Tools
**Description:** Visual markup tools on video frames.
**Acceptance Criteria:**
- [ ] Freehand pen, circle, rectangle, arrow, and highlight overlays
- [ ] Color picker for annotation color
- [ ] Adjustable stroke width
- [ ] Undo/redo within the annotation session

#### Requirement 1.2: Text Labels
**Description:** Text callouts on frame locations.
**Acceptance Criteria:**
- [ ] Add text labels anchored to specific frame locations
- [ ] Examples: "Hand artifact here," "Face drift starting," "Lighting mismatch"
- [ ] Resizable and repositionable text boxes

#### Requirement 1.3: Frame Pinning
**Description:** Annotations attached to specific frames.
**Acceptance Criteria:**
- [ ] Annotations pinned to a specific frame number and timecode
- [ ] When scrubbing through the video, annotations appear/disappear at their pinned frame
- [ ] Multiple annotations on different frames within the same segment

#### Requirement 1.4: Annotation Layers
**Description:** Per-reviewer annotation layers.
**Acceptance Criteria:**
- [ ] Each reviewer's annotations appear as a separate layer
- [ ] Layers toggleable on/off individually
- [ ] Reviewer attribution (name/avatar) visible on their layer
- [ ] "Show All" / "Show Mine Only" quick toggles

#### Requirement 1.5: Annotation Summary
**Description:** List view of all annotations.
**Acceptance Criteria:**
- [ ] List view of all annotations on a segment, sortable by frame number
- [ ] Click an annotation entry to jump to that frame with the markup visible
- [ ] Shows annotation count per reviewer

#### Requirement 1.6: Export
**Description:** Export annotated frames as images.
**Acceptance Criteria:**
- [ ] Export annotated frames as PNG images
- [ ] Export includes the video frame + all visible annotation layers composited
- [ ] Suitable for sharing outside the platform (email, Slack, print)

#### Requirement 1.7: PRD-38 Integration
**Description:** Annotations stored as part of the review thread.
**Acceptance Criteria:**
- [ ] Annotations appear in the review thread alongside text notes and voice memos
- [ ] When a reviewer flags a segment with a drawing, the annotation appears in the review notes
- [ ] Annotations are searchable and filterable as review content

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Video Range Annotations
**Description:** Annotations spanning multiple frames.
**Acceptance Criteria:**
- [ ] Define annotation that persists across a frame range (e.g., "this artifact persists from frame 45 to frame 72")
- [ ] Visual indicator on the timeline showing the annotation's frame range

## 6. Non-Goals (Out of Scope)
- Collaborative review notes and voice memos (covered by PRD-38)
- Approval/rejection workflow (covered by PRD-35)
- Video playback engine (covered by PRD-83)

## 7. Design Considerations
- Drawing tools should feel responsive with zero perceptible latency.
- Annotation toolbar should be compact and accessible without obscuring the video.
- Export should produce clean, high-resolution images suitable for professional communication.

## 8. Technical Considerations
- **Stack:** Canvas API or SVG overlay for drawing, React for tool UI, PRD-83 frame access for frame capture
- **Existing Code to Reuse:** PRD-38 review notes storage, PRD-83 frame-accurate display
- **New Infrastructure Needed:** Drawing engine, annotation serializer, layer manager, PNG exporter
- **Database Changes:** `frame_annotations` table (segment_id, frame_number, user_id, annotations_json, created_at)
- **API Changes:** CRUD /segments/:id/annotations, GET /segments/:id/annotations/export/:frame, GET /segments/:id/annotations/summary

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Drawing latency <10ms (real-time feel for pen tool)
- Annotations accurately pin to the correct frame 100% of the time
- Exported PNGs render at full video frame resolution with clean annotation compositing

## 11. Open Questions
- Should annotations support color-coded severity levels (e.g., red = critical, yellow = minor)?
- How should annotations from deleted or regenerated segments be handled?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
