# PRD-094: Character Consistency Report

## 1. Introduction/Overview
PRD-49 evaluates individual segments and PRD-68 compares the same scene type across characters. But neither answers: "Does this character look like the same person across all their scenes?" This is the most common creative director question during final review. This PRD provides post-generation cross-scene consistency analysis with a face consistency matrix, color/lighting analysis, motion quality distribution, outlier flagging, and exportable reports.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-49 (Quality Gates), PRD-68 (Cross-Character Comparison), PRD-76 (Identity Embedding), PRD-91 (Custom QA Rulesets)
- **Depended on by:** PRD-72 (Project Lifecycle as pre-delivery check)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Compute face similarity across all scenes for a character (consistency matrix).
- Analyze color, lighting, and motion quality consistency across scenes.
- Flag outlier scenes that deviate from the character's average.
- Track consistency improvement across re-generation iterations.

## 4. User Stories
- As a Reviewer, I want a consistency heatmap showing face similarity between all scene pairs so that I spot the one scene that looks different.
- As a Creator, I want automatic outlier flagging so that I know which scenes to re-generate.
- As a Creator, I want to track consistency improvement after re-generation so that I verify my fixes worked.
- As an Admin, I want batch consistency reports for all characters so that I have a project-wide quality overview.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Face Consistency Matrix
**Description:** Pairwise face similarity across all scenes.
**Acceptance Criteria:**
- [ ] Compute face similarity between representative frames of all scene pairs
- [ ] Visualize as a heatmap (green=consistent, red=outlier)
- [ ] Highlight specific outlier pairs

#### Requirement 1.2: Color & Lighting Analysis
**Description:** Cross-scene visual consistency check.
**Acceptance Criteria:**
- [ ] Compare average color temperature, brightness, saturation across scenes
- [ ] Flag scenes that are visually inconsistent

#### Requirement 1.3: Outlier Flagging
**Description:** Automatic detection of deviant scenes.
**Acceptance Criteria:**
- [ ] Flag scenes deviating from character average by configurable threshold
- [ ] One-click: "Re-queue flagged scenes for regeneration"

#### Requirement 1.4: Report Export
**Description:** Exportable consistency reports.
**Acceptance Criteria:**
- [ ] Export as PDF or JSON with representative keyframes and scores
- [ ] Batch report for all characters in a project
- [ ] Overview: "8 of 12 characters fully consistent. 4 have outliers."

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Trend Tracking
**Description:** Track consistency improvement over iterations.
**Acceptance Criteria:**
- [ ] "After re-doing 3 flagged scenes, consistency improved from 82% to 96%"

## 6. Non-Goals (Out of Scope)
- Individual segment quality assessment (covered by PRD-49)
- Cross-character comparison (covered by PRD-68)
- Face contact sheet (covered by PRD-103)

## 7. Design Considerations
- Heatmap should be interactive: click a cell to see the two scenes side by side.
- Reports should be suitable for sharing with non-technical stakeholders.

## 8. Technical Considerations
- **Stack:** Python for face/color analysis, React for heatmap visualization
- **Existing Code to Reuse:** PRD-76 embeddings, PRD-49 quality scores
- **New Infrastructure Needed:** Consistency analyzer, heatmap generator, report builder
- **Database Changes:** `consistency_reports` table (character_id, scores_json, created_at)
- **API Changes:** POST /characters/:id/consistency-report, GET /projects/:id/consistency-overview

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Consistency report generates in <30 seconds per character
- Outlier flagging correctly identifies inconsistent scenes in >90% of cases
- Reports are useful for non-technical stakeholders (validated by user feedback)

## 11. Open Questions
- What similarity threshold constitutes "consistent" vs. "outlier"?
- Should the report include audio consistency analysis if applicable?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
