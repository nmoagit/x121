# PRD-025: Incremental Re-stitching & Smoothing

## 1. Introduction/Overview
Regenerating an entire scene because one segment is flawed wastes massive GPU time. This PRD enables targeted regeneration of individual segments with automatic boundary "auto-healing" to maintain visual continuity. By regenerating only the problematic segment and smoothing its boundaries with adjacent segments, the system preserves all approved work while fixing specific issues.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-24 (Generation Loop), PRD-28 (Checkpointing)
- **Depended on by:** None directly
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Enable single-segment regeneration without re-rendering the entire scene.
- Automatically smooth boundaries between the regenerated segment and its neighbors.
- Preserve all other approved segments in the scene.
- Reduce GPU time from O(scene) to O(segment) for targeted fixes.

## 4. User Stories
- As a Creator, I want to regenerate just segment 5 of a 10-segment scene so that I don't waste GPU time re-rendering the 9 good segments.
- As a Creator, I want automatic boundary smoothing so that the regenerated segment blends seamlessly with its neighbors.
- As a Reviewer, I want to compare the old and new versions of the regenerated segment so that I can verify the fix improved quality.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Single-Segment Regeneration
**Description:** Regenerate one segment using its original seed frame.
**Acceptance Criteria:**
- [ ] Regenerate any segment using the seed frame from the previous segment's last frame
- [ ] New segment replaces the old one (old version preserved for comparison)
- [ ] Quality checks (PRD-49) run on the new segment automatically
- [ ] Downstream segments are flagged if their seed frame changes

#### Requirement 1.2: Boundary Smoothing
**Description:** Auto-heal transitions between regenerated and adjacent segments.
**Acceptance Criteria:**
- [ ] SSIM/visual consistency check at boundaries
- [ ] If boundary discontinuity exceeds threshold, attempt smoothing
- [ ] Smoothing options: frame blending, re-extraction of boundary frame
- [ ] Manual override to accept the boundary as-is

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Cascade Regeneration
**Description:** Optionally regenerate downstream segments if seed frame changed.
**Acceptance Criteria:**
- [ ] Option to regenerate all segments after the fixed one
- [ ] Preview the cascade impact before committing

## 6. Non-Goals (Out of Scope)
- Full scene regeneration (covered by PRD-24)
- Segment trimming (covered by PRD-78)
- Quality assessment (covered by PRD-49)

## 7. Design Considerations
- The regeneration action should be available directly on the segment in the review view.
- Boundary quality indicators should show SSIM scores at segment transitions.

## 8. Technical Considerations
- **Stack:** Rust orchestrator, FFmpeg for frame manipulation
- **Existing Code to Reuse:** PRD-24 generation pipeline, PRD-28 checkpointing
- **New Infrastructure Needed:** Single-segment regeneration service, boundary smoother
- **Database Changes:** Version tracking on segments (old_segment_id reference)
- **API Changes:** POST /segments/:id/regenerate, GET /segments/:id/boundary-check

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Single-segment regeneration uses 1/N of the GPU time of a full scene regeneration
- Boundary smoothing produces acceptable transitions in >80% of cases
- Old segment versions are preserved for 100% of regenerations

## 11. Open Questions
- Should boundary smoothing happen automatically or require user approval?
- How many regeneration versions should be retained per segment?
- What SSIM threshold should trigger the boundary smoothing step?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
