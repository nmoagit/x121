# PRD-049: Automated Quality Gates

## 1. Introduction/Overview
Human review is the final authority, but reviewers shouldn't waste time on obviously broken segments. This PRD provides machine-driven quality assessment that runs automatically after each segment generation, checking face detection confidence, boundary stability (SSIM/pHash), motion score, resolution/artifact detection, and likeness drift. Results are attached as structured metadata with pass/warn/fail per check, and failed segments are flagged in the review queue.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-24 (Generation Loop), PRD-28 (Checkpointing), PRD-10 (Event Bus)
- **Depended on by:** PRD-35, PRD-41, PRD-64, PRD-65, PRD-71
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Automatically assess segment quality post-generation using objective metrics.
- Flag likely failures before they reach human reviewers.
- Provide configurable thresholds per project for strictness tuning.
- Feed quality data into downstream analytics and failure tracking.

## 4. User Stories
- As a Reviewer, I want obviously broken segments (black frames, face-melt) auto-flagged so that I focus my time on genuinely ambiguous cases.
- As a Creator, I want to see quality scores per check so that I understand why a segment was flagged.
- As an Admin, I want configurable thresholds so that I can be strict for final delivery and relaxed for exploration.
- As a Creator, I want auto-QA summary statistics so that I know the overall quality of a batch run.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Face Detection Confidence
**Description:** Verify the subject's face survived generation.
**Acceptance Criteria:**
- [ ] Face detection score compared against source embedding (PRD-76)
- [ ] Flag segments where score drops below configurable threshold
- [ ] Score recorded as numeric value per segment

#### Requirement 1.2: Boundary Stability (SSIM/pHash)
**Description:** Measure visual continuity between adjacent segments.
**Acceptance Criteria:**
- [ ] SSIM score between last frame of segment N and first frame of N+1
- [ ] Flag discontinuities exceeding smoothing tolerance
- [ ] Score recorded per segment boundary

#### Requirement 1.3: Motion Score
**Description:** Detect frozen frames, excessive jitter, or unnatural motion.
**Acceptance Criteria:**
- [ ] Detect zero-motion (frozen) frames
- [ ] Detect excessive jitter or acceleration
- [ ] Flag segments outside the expected motion envelope
- [ ] Configurable motion score thresholds

#### Requirement 1.4: Resolution & Artifact Detection
**Description:** Check for technical quality issues.
**Acceptance Criteria:**
- [ ] Detect unexpected resolution changes
- [ ] Detect black frames and NaN pixel values
- [ ] Detect encoding artifacts
- [ ] Technical checks are non-configurable (always fail on these)

#### Requirement 1.5: Likeness Drift Score
**Description:** Compare segment frames against the source image.
**Acceptance Criteria:**
- [ ] Representative frame compared against Seed A using embedding similarity
- [ ] Gradual face-drift over long sequences detected
- [ ] Drift score trend visible across all segments in a scene
- [ ] Threshold configurable per project

#### Requirement 1.6: Integration & Reporting
**Description:** Integration with review queue and analytics.
**Acceptance Criteria:**
- [ ] Results attached to each segment: pass/warn/fail per check with numeric scores
- [ ] Failed segments flagged in review queue (PRD-35) with failure reasons
- [ ] Summary statistics: "3 of 12 segments auto-flagged"
- [ ] Events published to PRD-10 for notifications

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom QA Checks
**Description:** User-defined quality checks via hook scripts.
**Acceptance Criteria:**
- [ ] Custom checks run alongside built-in checks
- [ ] Results integrated into the same pass/warn/fail framework

## 6. Non-Goals (Out of Scope)
- Custom QA rulesets per scene type (covered by PRD-91)
- Smart auto-retry of failed segments (covered by PRD-71)
- Failure pattern tracking (covered by PRD-64)

## 7. Design Considerations
- QA results should be shown as a compact scorecard on the segment detail view.
- Traffic-light colors: green (pass), yellow (warn), red (fail).
- Failed checks should link to explanatory documentation.

## 8. Technical Considerations
- **Stack:** Python (OpenCV, scikit-image for SSIM) via PRD-09, Rust orchestration
- **Existing Code to Reuse:** PRD-76 embeddings, PRD-28 checkpoint integration
- **New Infrastructure Needed:** QA runner service, metric calculators, threshold engine
- **Database Changes:** `quality_scores` table (segment_id, check_type, score, status, details)
- **API Changes:** GET /segments/:id/qa-scores, POST /projects/:id/qa-thresholds

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Auto-QA completes in <30 seconds per segment
- Catches >95% of technically broken segments (black frames, NaN, face-melt)
- False positive rate <10% at default thresholds
- Quality scores are reproducible (same segment produces same scores)

## 11. Open Questions
- Should QA run synchronously (blocking) or asynchronously (non-blocking) after generation?
- What is the right balance between sensitivity and false positive rate for default thresholds?
- Should QA scores be weighted or treated equally?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
