# PRD-091: Custom QA Rulesets per Scene Type

## 1. Introduction/Overview
A single global QA threshold produces false positives for high-motion scenes and false negatives for static scenes. Dance scenes need different expectations than idle scenes. This PRD provides configurable per-scene-type quality gate thresholds, preset QA profiles, a visual threshold editor with historical score histograms, and A/B threshold testing against historical data.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23 (Scene Types), PRD-49 (Quality Gates), PRD-77 (Pipeline Hooks for custom metrics)
- **Depended on by:** PRD-92, PRD-94
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Allow per-scene-type QA threshold overrides for every metric.
- Provide preset QA profiles (High Motion, Portrait, Transition).
- Enable visual threshold editing with historical score distributions.
- Support A/B threshold testing before applying changes.

## 4. User Stories
- As a Creator, I want relaxed face consistency thresholds for dance scenes so that acceptable motion-induced variations don't get flagged.
- As a Creator, I want strict face consistency for portrait scenes so that subtle artifacts are caught.
- As an Admin, I want to test new thresholds against historical data before deploying so that I understand the impact.
- As a Creator, I want custom metrics per scene type so that dance scenes check motion energy while portraits check symmetry.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Per-Scene-Type Thresholds
**Description:** Override QA thresholds per scene type.
**Acceptance Criteria:**
- [ ] Each scene type can override: face confidence min, motion score range, boundary SSIM min, likeness drift tolerance
- [ ] Unoverridden metrics fall back to studio defaults

#### Requirement 1.2: Preset Profiles
**Description:** Reusable QA threshold bundles.
**Acceptance Criteria:**
- [ ] "High Motion": relaxed face, strict motion continuity
- [ ] "Portrait": strict face, relaxed motion
- [ ] "Transition": relaxed overall, strict boundary SSIM
- [ ] Custom profiles creatable

#### Requirement 1.3: Threshold Editor
**Description:** Visual slider-based threshold editor.
**Acceptance Criteria:**
- [ ] Sliders per metric with histogram of actual historical scores
- [ ] Shows pass/fail ratio at proposed threshold
- [ ] "If you raise face confidence to 0.8, 15% more segments would have been flagged"

#### Requirement 1.4: A/B Threshold Testing
**Description:** Test new thresholds against historical segments.
**Acceptance Criteria:**
- [ ] Run proposed thresholds against last week's batch
- [ ] Compare: how many would pass vs. current thresholds
- [ ] No actual data changes (read-only analysis)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scene-Type-Specific Custom Metrics
**Description:** Custom QA metrics implemented as hook scripts.
**Acceptance Criteria:**
- [ ] Define custom metrics per scene type (e.g., motion energy for dance)
- [ ] Custom metrics implemented via PRD-77 hooks returning a score

## 6. Non-Goals (Out of Scope)
- Quality gate execution logic (covered by PRD-49)
- Failure pattern tracking (covered by PRD-64)

## 7. Design Considerations
- Threshold editor should be visual and interactive, not a form with number inputs.
- Histograms should be color-coded to show the pass/fail split.

## 8. Technical Considerations
- **Stack:** React for threshold editor, Rust for A/B analysis
- **Existing Code to Reuse:** PRD-49 quality scores, PRD-23 scene type data
- **New Infrastructure Needed:** Threshold override storage, A/B analyzer, histogram generator
- **Database Changes:** `qa_profiles` table, `scene_type_qa_overrides` table
- **API Changes:** CRUD /qa-profiles, PUT /scene-types/:id/qa-overrides, POST /qa-profiles/ab-test

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Per-scene-type thresholds reduce false positive rate by >30% compared to global thresholds
- A/B testing correctly predicts the impact of threshold changes within 5%

## 11. Open Questions
- Should thresholds be adjustable per character within a scene type?
- How many historical segments are needed for reliable A/B testing?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
