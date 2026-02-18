# PRD-065: Workflow Regression Testing

## 1. Introduction/Overview
Workflow and model updates are necessary for quality improvement, but they risk breaking scenes that currently work. This PRD provides automated regression testing: designate reference scenes, trigger re-generation at Draft resolution when a workflow/LoRA is updated, and compare new vs. old output with objective metrics. This is the equivalent of automated tests for the generation pipeline.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23, PRD-27, PRD-36, PRD-49, PRD-59, PRD-63, PRD-08
- **Depended on by:** None
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Designate reference scenes as quality benchmarks.
- Auto-run regression tests when workflows or assets are updated.
- Compare old vs. new with SSIM, face similarity, motion, and QA metrics.
- Provide pass/fail reports with rollback support.

## 4. User Stories
- As a Creator, I want automated regression tests when I update a LoRA so that I know immediately if quality degraded.
- As a Creator, I want visual side-by-side comparison of old vs. new output so that I can spot regressions visually.
- As a Creator, I want to rollback to the previous workflow version if regressions are detected.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Reference Scenes
**Description:** Designate benchmark scenes for regression testing.
**Acceptance Criteria:**
- [ ] Mark character + scene type combinations as reference benchmarks
- [ ] Reference scenes have known-good output for comparison

#### Requirement 1.2: Regression Run
**Description:** Re-generate references with updated configurations.
**Acceptance Criteria:**
- [ ] Trigger on workflow/LoRA update
- [ ] Runs at Draft resolution (PRD-59) for speed
- [ ] Uses the same seeds and parameters as the reference

#### Requirement 1.3: Automated Comparison
**Description:** Objective metrics comparison.
**Acceptance Criteria:**
- [ ] SSIM, face similarity, motion consistency, and auto-QA metrics (PRD-49)
- [ ] Side-by-side playback via PRD-36

#### Requirement 1.4: Pass/Fail Report
**Description:** Summary of regression results.
**Acceptance Criteria:**
- [ ] Which references improved, degraded, or stayed the same
- [ ] Configurable thresholds for pass/fail
- [ ] Rollback to previous version available on failure

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scheduled Regression Runs
**Description:** Periodic automated regression testing.
**Acceptance Criteria:**
- [ ] Configure recurring regression runs (daily, weekly)

## 6. Non-Goals (Out of Scope)
- Individual segment quality assessment (covered by PRD-49)
- Workflow import/validation (covered by PRD-75)

## 7. Design Considerations
- Regression reports should use clear visual indicators (improved/same/degraded per reference).

## 8. Technical Considerations
- **Stack:** Same as generation pipeline, with comparison metrics
- **Existing Code to Reuse:** PRD-24 pipeline, PRD-49 QA, PRD-36 comparison, PRD-59 resolution tiers
- **New Infrastructure Needed:** Regression orchestrator, comparison engine, report generator
- **Database Changes:** `regression_references` table, `regression_runs` table, `regression_results` table
- **API Changes:** POST /regression/run, GET /regression/runs/:id/report, CRUD /regression/references

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Regression tests complete in <10 minutes at Draft resolution
- Detects >90% of quality regressions compared to human review
- Rollback restores the previous working configuration

## 11. Open Questions
- How many reference scenes are needed for meaningful regression coverage?
- Should regression failures block the workflow update?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
