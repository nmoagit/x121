# PRD-092: Batch Review & Approval Workflows

## 1. Introduction/Overview
A 10-character x 8-scene-type production run produces 80+ scenes, each with multiple segments — potentially 400+ items to review. Without batch workflows, every segment is reviewed one at a time with full mouse interaction. This PRD provides bulk review actions, auto-QA filter actions, sorted review queues, quick review mode, review assignment, and review deadlines — extending PRD-35 with batch capabilities that can increase review throughput 3-5x.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-35 (Review Interface), PRD-49 (Automated Quality Gates for auto-QA scores), PRD-52 (Keyboard Shortcuts for quick review mode), PRD-91 (Custom QA Rulesets)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Enable multi-select approval/rejection of segments and scenes.
- Auto-approve segments that pass auto-QA above a configurable threshold.
- Provide keyboard-only quick review mode for maximum throughput.
- Support review assignment and deadline tracking.

## 4. User Stories
- As a Reviewer, I want to select multiple segments and approve them all at once so that I can process obvious passes quickly.
- As a Reviewer, I want "Approve all above QA threshold" so that auto-QA handles the easy cases and I focus on borderline segments.
- As a Reviewer, I want Quick Review Mode with keyboard-only controls so that I can review at maximum speed.
- As an Admin, I want to assign review batches to specific reviewers so that workload is distributed fairly.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Multi-Select Review
**Description:** Bulk selection and action.
**Acceptance Criteria:**
- [ ] Select multiple segments or scenes in the review queue
- [ ] Actions: Approve All, Reject All, Reject & Re-queue All
- [ ] Keyboard-accelerated: Shift+Click for range, Ctrl+A for all visible

#### Requirement 1.2: Auto-QA Filter Actions
**Description:** Bulk approve based on QA scores.
**Acceptance Criteria:**
- [ ] "Approve all segments with auto-QA score above X" one-click action
- [ ] Configurable threshold per batch (uses PRD-91 rulesets when available)
- [ ] Preview showing how many segments would be approved at the selected threshold

#### Requirement 1.3: Sorted Review Queue
**Description:** Configurable sort order for review.
**Acceptance Criteria:**
- [ ] Sort options: worst QA score first, oldest first (FIFO), by scene type, by character, random
- [ ] Saved sort preferences per user
- [ ] Filter to specific characters, scene types, or variants

#### Requirement 1.4: Review Progress Counter
**Description:** Progress tracking during review sessions.
**Acceptance Criteria:**
- [ ] "23 of 47 reviewed" with a progress bar
- [ ] Estimated time remaining based on average review pace
- [ ] Session statistics: review rate, approval ratio

#### Requirement 1.5: Quick Review Mode
**Description:** Streamlined keyboard-only workflow.
**Acceptance Criteria:**
- [ ] Video auto-plays on load
- [ ] `1` = Approve, `2` = Reject, `3` = Flag for discussion, `Space` = Skip
- [ ] No mouse interaction needed
- [ ] Next segment loads automatically after action
- [ ] Optimized for maximum throughput

#### Requirement 1.6: Review Assignment
**Description:** Assign review batches to specific reviewers.
**Acceptance Criteria:**
- [ ] Assign batches to reviewers: "Jane reviews all dance scenes, Bob reviews all idle scenes"
- [ ] Assignment dashboard showing who has what and their progress
- [ ] Unassigned segments visible in a shared pool

#### Requirement 1.7: Review Deadline
**Description:** Time-bound review batches.
**Acceptance Criteria:**
- [ ] Set deadline on review batches
- [ ] Notification escalation as deadline approaches with unreviewed items
- [ ] "12 segments unreviewed — deadline in 2 hours" alert
- [ ] Overdue batches highlighted in the assignment dashboard

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Review SLA Reporting
**Description:** Historical review performance metrics.
**Acceptance Criteria:**
- [ ] Average review turnaround time per reviewer
- [ ] Deadline compliance rate
- [ ] Review quality metrics (re-review rate after approval)

## 6. Non-Goals (Out of Scope)
- Individual segment review interface (covered by PRD-35)
- Auto-QA rule configuration (covered by PRD-91)
- Collaborative review notes (covered by PRD-38)

## 7. Design Considerations
- Multi-select should feel natural: checkboxes, range selection, and visual feedback for selected items.
- Quick Review Mode should strip the UI to absolute minimum: video + action buttons + progress counter.
- Assignment dashboard should provide at-a-glance workload distribution.

## 8. Technical Considerations
- **Stack:** React for review UI, PRD-49 QA scores for auto-filter, WebSocket (PRD-10) for real-time progress updates
- **Existing Code to Reuse:** PRD-35 approval logic, PRD-49 QA score data, PRD-91 threshold configuration
- **New Infrastructure Needed:** Batch action processor, review assignment engine, deadline tracker, progress calculator
- **Database Changes:** `review_assignments` table (batch_id, reviewer_user_id, filter_criteria_json, deadline, status), `review_sessions` table (user_id, started_at, segments_reviewed, avg_pace)
- **API Changes:** POST /review/batch-approve, POST /review/batch-reject, POST /review/auto-approve?threshold=X, CRUD /review/assignments, GET /review/progress

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Quick Review Mode achieves >20 segments per minute throughput
- Auto-QA filter correctly processes all qualifying segments without false approvals
- Batch actions complete in <5 seconds for batches of up to 100 segments
- Review deadline notifications delivered with >95% accuracy

## 11. Open Questions
- Should auto-approved segments be flagged differently from manually approved ones?
- What happens to assigned segments when a reviewer is removed from the team?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
