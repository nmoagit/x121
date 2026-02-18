# PRD-071: Smart Auto-Retry

## 1. Introduction/Overview
Many QA failures are stochastic (a bad seed) not systematic (a broken workflow). Varying the seed fixes ~60-70% of one-off failures without human intervention. This PRD provides opt-in, transparent, bounded automatic retry of segments that fail quality gates, using varied parameters (seeds, CFG jitter) with best-of-N selection. This is explicitly NOT silent retrying — it's transparent, configurable, and respects the project budget.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23, PRD-49, PRD-61, PRD-64, PRD-69
- **Depended on by:** None
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Provide opt-in auto-retry with configurable max attempts and parameter variation.
- Use varied seeds and optional parameter jitter to escape bad local minima.
- Select the best result from multiple attempts (best-of-N).
- Report all retry attempts transparently to the user.

## 4. User Stories
- As a Creator, I want auto-retry with different seeds when a segment fails QA so that stochastic failures are fixed automatically.
- As a Creator, I want to see all retry attempts and why each passed or failed so that the process is transparent.
- As a Creator, I want the best-of-N selection so that if multiple retries pass, I get the highest quality result.
- As an Admin, I want retries to count against the project budget so that auto-retry doesn't cause runaway GPU consumption.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Auto-Retry Policy
**Description:** Configurable retry settings per scene type or project.
**Acceptance Criteria:**
- [ ] Max retry attempts (default: 3)
- [ ] Which parameters to vary (seed, CFG +/- 0.5)
- [ ] Which QA failures trigger retry (face-melt yes, motion score no)
- [ ] Policy is opt-in (default: disabled)

#### Requirement 1.2: Varied Seeds
**Description:** Each retry uses a different random seed.
**Acceptance Criteria:**
- [ ] Different seed per retry attempt
- [ ] Seeds are recorded for reproducibility

#### Requirement 1.3: Parameter Jitter
**Description:** Small random adjustments to numeric parameters.
**Acceptance Criteria:**
- [ ] CFG scale, denoise strength jittered within configured range
- [ ] Jitter amount configurable per parameter
- [ ] Original values recorded alongside jittered values

#### Requirement 1.4: Best-of-N Selection
**Description:** If multiple retries pass, select the highest quality.
**Acceptance Criteria:**
- [ ] All passing attempts compared by quality score
- [ ] Best result selected automatically
- [ ] All attempts available for manual comparison

#### Requirement 1.5: Transparent Reporting
**Description:** Full visibility into retry attempts and outcomes.
**Acceptance Criteria:**
- [ ] User sees: "Segment 5: failed attempt 1 (face 0.42), passed attempt 3 (face 0.87)"
- [ ] All attempts viewable with their scores
- [ ] Retry count and GPU time recorded

#### Requirement 1.6: Escalation
**Description:** Flag for human review when all retries fail.
**Acceptance Criteria:**
- [ ] If all attempts fail, segment flagged for manual review
- [ ] All attempts attached for comparison
- [ ] Creator can adjust parameters more significantly

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Adaptive Retry Strategy
**Description:** Learn which parameter variations are most effective.
**Acceptance Criteria:**
- [ ] Track which variations most often fix failures
- [ ] Prioritize effective variations in future retries

## 6. Non-Goals (Out of Scope)
- Quality gate logic (covered by PRD-49)
- Failure pattern analysis (covered by PRD-64)
- Pipeline error recovery (covered by PRD-28)

## 7. Design Considerations
- Retry status should be visible in the segment detail view as an expandable section.
- Retry policy configuration should be accessible from the scene type settings.

## 8. Technical Considerations
- **Stack:** Rust retry orchestrator, integrates with existing generation pipeline
- **Existing Code to Reuse:** PRD-24 pipeline, PRD-49 QA, PRD-61 cost tracking
- **New Infrastructure Needed:** Retry orchestrator, parameter jitter engine, best-of-N selector
- **Database Changes:** `retry_attempts` table (segment_id, attempt_number, parameters, scores, status)
- **API Changes:** PUT /scene-types/:id/retry-policy, GET /segments/:id/retry-history

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Auto-retry resolves >60% of stochastic QA failures without human intervention
- Best-of-N selection picks a higher-quality result than the first passing attempt >50% of the time
- Zero silent retries (100% of retry activity visible in logs and UI)

## 11. Open Questions
- Should retry attempts use the same worker or try a different worker?
- What is the cost-effectiveness threshold for auto-retry (at what failure rate does it waste more than it saves)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
