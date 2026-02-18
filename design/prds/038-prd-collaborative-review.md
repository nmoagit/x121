# PRD-038: Collaborative Review (Notes, Memos, Issues)

## 1. Introduction/Overview
Review feedback needs to be precise, contextual, and actionable. This PRD provides timestamped review notes, voice memos for quick verbal feedback, and structured failure tagging (Face Melt, Jitter, etc.) — creating a rich review record that provides data for future model/audit-script training while enabling clear communication between reviewers and creators.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for real-time notification), PRD-11 (Real-time Collaboration for concurrent review)
- **Depended on by:** PRD-55 (Director's View for mobile review), PRD-70 (On-Frame Annotation)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Enable timestamped text notes attached to specific moments in a segment.
- Support voice memo recording for quick verbal feedback.
- Provide structured failure tags for systematic defect categorization.
- Create a review record usable for model and audit-script training data.

## 4. User Stories
- As a Reviewer, I want to attach a timestamped note to a specific frame so that the Creator knows exactly which moment has an issue.
- As a Reviewer, I want to record a voice memo instead of typing so that I can provide detailed feedback faster.
- As a Reviewer, I want failure tags (Face Melt, Jitter, Boundary Pop) so that common issues are categorized consistently across the team.
- As an Admin, I want structured failure data so that I can train models and audit scripts to detect these issues automatically.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Timestamped Notes
**Description:** Text notes anchored to specific timecodes.
**Acceptance Criteria:**
- [ ] Create notes attached to the current playback timecode
- [ ] Notes visible in a scrollable timeline alongside the video scrubber
- [ ] Click a note to jump to its timestamp
- [ ] @mention other users (triggers PRD-10 notification)

#### Requirement 1.2: Voice Memos
**Description:** Audio recording attached to review.
**Acceptance Criteria:**
- [ ] Hold-to-record voice memos attached to the current timestamp
- [ ] Playback inline in the note timeline
- [ ] Auto-transcription for searchability (optional, best-effort)
- [ ] Voice memos appear alongside text notes in the review thread

#### Requirement 1.3: Failure Tags
**Description:** Structured defect categorization.
**Acceptance Criteria:**
- [ ] Predefined failure tags: Face Melt, Jitter, Boundary Pop, Hand Artifact, Lighting Mismatch, Motion Stutter, Other
- [ ] Multiple tags per note
- [ ] Custom tags creatable by Admin
- [ ] Tag frequency statistics available for pattern analysis (feeds PRD-64)

#### Requirement 1.4: Review Thread
**Description:** Threaded conversation per segment.
**Acceptance Criteria:**
- [ ] All notes, memos, tags, and replies organized as a threaded conversation
- [ ] Sortable by timestamp or chronological order
- [ ] Resolution status per note: Open, Resolved, Won't Fix
- [ ] Notes persist across regeneration cycles for historical context

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Review Templates
**Description:** Pre-defined review checklists.
**Acceptance Criteria:**
- [ ] Admin creates checklist templates (e.g., "Face Quality Checklist": check symmetry, check expression, check identity match)
- [ ] Reviewers apply a template and check off items as they review

## 6. Non-Goals (Out of Scope)
- Visual annotation/drawing on frames (covered by PRD-70)
- Approval/rejection workflow (covered by PRD-35)
- Production notes and operational communications (covered by PRD-95)

## 7. Design Considerations
- Notes timeline should be compact to avoid taking too much space from the video player.
- Failure tags should use color-coded badges for quick visual identification.
- Voice memo recording should have a clear visual indicator (pulsing red dot).

## 8. Technical Considerations
- **Stack:** React for review UI, Web Audio API for voice memo recording, WebSocket (PRD-10/PRD-11) for real-time collaboration
- **Existing Code to Reuse:** PRD-10 event bus for notifications, PRD-11 collaboration layer for concurrent editing
- **New Infrastructure Needed:** Note/memo storage, failure tag taxonomy, review thread manager, optional transcription service
- **Database Changes:** `review_notes` table (segment_id, user_id, timecode, text, tags_json, voice_memo_path, status, created_at), `review_tags` table (id, name, color, category)
- **API Changes:** CRUD /segments/:id/notes, POST /segments/:id/notes/:note_id/memo, GET /segments/:id/notes/tags, PUT /segments/:id/notes/:note_id/resolve

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Notes attach to the correct timecode with frame-level accuracy
- Voice memo recording latency <200ms from button press to recording start
- Failure tag data provides >80% classification accuracy for common defect types
- Review threads are usable for training data extraction

## 11. Open Questions
- Should voice memos have a maximum duration limit?
- How should notes from multiple reviewers be merged when they reference the same issue?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
