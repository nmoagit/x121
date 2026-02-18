# PRD-078: Segment Trimming & Frame-Level Editing

## 1. Introduction/Overview
Regenerating a 5-second segment because the last 0.3 seconds has a motion artifact wastes 30+ seconds of GPU time plus queue wait time. Trimming costs zero GPU time and takes 5 seconds. This PRD provides lightweight in-platform video trimming for making minor adjustments to generated segments — non-destructive in/out point trimming, quick trim presets, batch trim, and concatenation-aware trimming that integrates with the scene assembly pipeline.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-24 (Recursive Video Generation for segment structure), PRD-35 (Review Interface for trim point UI)
- **Depended on by:** PRD-39 (Scene Assembler uses trimmed versions)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Enable frame-accurate in/out point trimming of generated segments.
- Preserve original segments (non-destructive editing).
- Provide quick trim presets for common use cases (first/last N frames).
- Ensure trimmed versions integrate with the concatenation pipeline.

## 4. User Stories
- As a Creator, I want to trim the last 0.3 seconds from a segment so that I remove a motion artifact without regenerating.
- As a Creator, I want non-destructive trimming so that I can revert to the original at any time.
- As a Creator, I want quick trim presets ("Trim first 5 frames") so that I can fix common issues with one click.
- As a Creator, I want batch trim so that I can apply the same trim to multiple segments that share a common issue.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: In/Out Point Trimming
**Description:** Set trim points on segments.
**Acceptance Criteria:**
- [ ] Set in-point and out-point on a segment timeline
- [ ] Frame-accurate scrubbing with timecode display
- [ ] Preview the trimmed result before committing
- [ ] Trim points adjustable after initial setting

#### Requirement 1.2: Non-Destructive
**Description:** Preserve originals.
**Acceptance Criteria:**
- [ ] Trimming creates a new trimmed version; original segment preserved
- [ ] User can revert to the original at any time
- [ ] Trim metadata stored separately from the video file

#### Requirement 1.3: Seed Frame Update
**Description:** Maintain pipeline continuity after trimming.
**Acceptance Criteria:**
- [ ] When a segment's end is trimmed, the last frame of the trimmed version becomes the new seed for the next segment
- [ ] System warns if this would invalidate an already-generated next segment
- [ ] Option to re-queue affected downstream segments automatically

#### Requirement 1.4: Quick Trim Presets
**Description:** One-click trim for common cases.
**Acceptance Criteria:**
- [ ] "Trim first 5 frames" one-click action
- [ ] "Trim last 5 frames" one-click action
- [ ] Configurable preset values (e.g., 3, 5, 10 frames)

#### Requirement 1.5: Batch Trim
**Description:** Apply the same trim to multiple segments.
**Acceptance Criteria:**
- [ ] Select multiple segments and apply a uniform trim (e.g., remove first 3 frames from all)
- [ ] Useful when a workflow consistently produces a bad first frame
- [ ] Preview showing affected segments before applying

#### Requirement 1.6: Concatenation Awareness
**Description:** Integration with scene assembly pipeline.
**Acceptance Criteria:**
- [ ] PRD-39 (Scene Assembler) uses trimmed versions when available
- [ ] Trim points are respected during concatenation without requiring re-export
- [ ] Concatenation preview reflects trim points

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Split Segment
**Description:** Split a segment into two at a specific frame.
**Acceptance Criteria:**
- [ ] Split at a specific frame, creating two independent segments
- [ ] Both segments independently trimmable and reviewable

## 6. Non-Goals (Out of Scope)
- Full video editing (beyond trim) — not an NLE
- Video effects or filters — post-processing only
- Regeneration of segments (covered by PRD-24, PRD-71)

## 7. Design Considerations
- Trim handles should be intuitive (drag handles on a timeline, similar to video editing tools).
- Preview should show the exact trimmed output before committing.
- Warning about seed frame impact should be clear and actionable.

## 8. Technical Considerations
- **Stack:** React timeline component, FFmpeg for lossless trim operations, PRD-83 player for preview
- **Existing Code to Reuse:** PRD-83 frame-accurate seeking, PRD-35 review interface for trim UI integration
- **New Infrastructure Needed:** Trim engine (FFmpeg wrapper), trim metadata storage, batch trim processor, seed frame updater
- **Database Changes:** `segment_trims` table (segment_id, original_path, trimmed_path, in_frame, out_frame, created_at)
- **API Changes:** POST /segments/:id/trim, DELETE /segments/:id/trim (revert), POST /segments/batch-trim, GET /segments/:id/trim-preview

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Trim operation completes in <2 seconds per segment
- Lossless trim: no re-encoding artifacts introduced by the trim
- Batch trim of 20 segments completes in <30 seconds
- Trimmed versions correctly integrate with concatenation pipeline

## 11. Open Questions
- What is the minimum segment length after trimming (prevent trimming to 0 frames)?
- Should trim points be adjustable after the Scene Assembler has already used the trimmed version?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
