# PRD-061: Cost & Resource Estimation

## 1. Introduction/Overview
Submitting 160 scenes without knowing the time/cost impact leads to "the GPUs are busy for 3 days and nobody knew." This PRD provides pre-submission estimation of GPU time, wall-clock time, and disk space based on historical performance data, turning job submission from a blind action into an informed decision. Estimates improve over time as the system learns your specific hardware and workflows.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-08 (Queue Management), PRD-41 (Performance Dashboard), PRD-46 (Worker Pool), PRD-57 (Batch Orchestrator)
- **Depended on by:** PRD-67, PRD-71
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Provide per-scene and batch-level cost/time/disk estimates before submission.
- Factor in current worker pool size and queue depth for wall-clock estimates.
- Calibrate estimates from historical generation performance data.
- Show estimation breakdowns by scene type, character, and resource type.

## 4. User Stories
- As a Creator, I want to see estimated GPU time before submitting so that I make informed decisions about batch size.
- As a Creator, I want wall-clock estimates that factor in queue depth so that I know when my batch will actually finish.
- As an Admin, I want per-scene-type cost breakdowns so that I identify the most expensive scene types.
- As a Creator, I want estimates to improve over time so that they become more accurate as we accumulate production data.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Per-Scene Estimate
**Description:** Estimated resources for a single scene before submission.
**Acceptance Criteria:**
- [ ] Segments needed (target duration / segment duration)
- [ ] GPU time per segment (historical average for this workflow)
- [ ] Total GPU time and disk space
- [ ] Displayed on submission screen

#### Requirement 1.2: Batch Estimate
**Description:** Aggregate estimates for PRD-57 batch submissions.
**Acceptance Criteria:**
- [ ] Total: scenes, GPU-hours, wall-clock hours, disk space
- [ ] Worker-aware: factors in pool size and queue depth
- [ ] Example: "160 scenes, ~48 GPU-hours, ~12 hours wall-clock with 4 workers"

#### Requirement 1.3: Historical Calibration
**Description:** Estimates improve from actual generation data.
**Acceptance Criteria:**
- [ ] System records actual generation times per workflow per resolution tier
- [ ] New workflows show "No estimate available" instead of guessing
- [ ] Estimate accuracy improves as more data is collected
- [ ] Calibration data viewable by Admin

#### Requirement 1.4: Estimation Breakdown
**Description:** Drill-down into estimate components.
**Acceptance Criteria:**
- [ ] Which scene types are most expensive
- [ ] Which characters have historically slow generation
- [ ] Where the bottleneck is (GPU compute vs. disk I/O)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Budget Alerts
**Description:** Warn when submission would exceed remaining budget.
**Acceptance Criteria:**
- [ ] Integrates with PRD-93 budget tracking
- [ ] Warning shown before submission if budget would be exceeded

## 6. Non-Goals (Out of Scope)
- Budget enforcement (covered by PRD-93)
- Performance benchmarking (covered by PRD-41)
- Queue scheduling (covered by PRD-08)

## 7. Design Considerations
- Estimates should appear as a summary card on the submission screen.
- Confidence levels should be shown (high/medium/low based on historical data availability).

## 8. Technical Considerations
- **Stack:** Rust estimation service, PostgreSQL for historical data
- **Existing Code to Reuse:** PRD-41 performance data, PRD-46 worker data
- **New Infrastructure Needed:** Estimation engine, historical data aggregator
- **Database Changes:** `generation_metrics` table for historical averages
- **API Changes:** POST /estimates (body: scene list), GET /estimates/history

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Estimates within 30% of actual for workflows with 10+ historical runs
- Estimates within 50% for workflows with 3-9 historical runs
- Estimation response time <1 second for batches up to 200 scenes

## 11. Open Questions
- Should disk space estimates account for intermediate files or only final outputs?
- How should estimates handle workflows that have been updated since historical data was collected?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
