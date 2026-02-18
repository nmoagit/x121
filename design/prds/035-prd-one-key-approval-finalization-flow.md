# PRD-035: One-Key Approval & Finalization Flow

## 1. Introduction/Overview
Maximizing review speed for lead editors requires minimizing the friction between watching a segment and making an approval decision. This PRD provides a single-hotkey (`Enter`) asset finalization workflow that streamlines the approve/reject/flag cycle, enabling rapid throughput when reviewing large volumes of generated content.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-03 (RBAC for approval permissions)
- **Depended on by:** PRD-49 (Automated Quality Gates integration), PRD-55 (Director's View), PRD-57 (Batch Orchestrator), PRD-68 (Cross-Character Comparison)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Provide single-key approval for rapid segment review.
- Support approve, reject, and flag-for-discussion workflows.
- Enforce RBAC: only authorized roles can finalize decisions.
- Track approval metadata (who, when, which version).

## 4. User Stories
- As a Reviewer, I want to press `Enter` to approve a segment so that I can review dozens of segments without mouse interaction.
- As a Reviewer, I want single-key reject with optional rejection reason so that I can flag problems quickly.
- As a Creator, I want final approval rights (as configured in RBAC) so that only authorized users can make binding decisions.
- As a Reviewer, I want the next segment to auto-load after approval so that the review flow is continuous.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Single-Key Approval
**Description:** One-key finalization of segments.
**Acceptance Criteria:**
- [ ] `Enter` to approve the currently displayed segment
- [ ] `Backspace`/`Delete` to reject
- [ ] `F` to flag for discussion
- [ ] Key bindings configurable via PRD-52

#### Requirement 1.2: Rejection Workflow
**Description:** Structured rejection with optional reason.
**Acceptance Criteria:**
- [ ] Quick rejection categories: face artifact, motion artifact, lighting mismatch, other
- [ ] Optional text comment for specific feedback
- [ ] Rejected segments automatically eligible for re-generation queue

#### Requirement 1.3: Auto-Advance
**Description:** Next segment loads automatically after action.
**Acceptance Criteria:**
- [ ] After approve/reject/flag, the next unreviewed segment auto-loads
- [ ] Configurable delay before auto-advance (default: 0.5 seconds)
- [ ] "End of queue" message when all segments in the batch are reviewed

#### Requirement 1.4: Approval Metadata
**Description:** Track approval decisions with full context.
**Acceptance Criteria:**
- [ ] Record: who approved/rejected, when, which version of the segment
- [ ] RBAC enforcement: only users with appropriate role can approve
- [ ] Creator role has final approval authority (configurable per studio)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Approval Confidence Level
**Description:** Rate confidence alongside approval.
**Acceptance Criteria:**
- [ ] Optional confidence slider (1-5) attached to approval decisions
- [ ] Low-confidence approvals flagged for secondary review

## 6. Non-Goals (Out of Scope)
- Batch approval workflows (covered by PRD-92)
- Video playback engine (covered by PRD-83)
- Collaborative review notes (covered by PRD-38)

## 7. Design Considerations
- Approval/rejection feedback should be immediate and visually distinct (green flash for approve, red for reject).
- Auto-advance animation should be smooth to maintain review rhythm.
- The review interface should minimize visual clutter during rapid review mode.

## 8. Technical Considerations
- **Stack:** React with keyboard event handling, PRD-52 shortcut registry
- **Existing Code to Reuse:** PRD-03 RBAC for permission checks, PRD-83 video player for segment playback
- **New Infrastructure Needed:** Approval state machine, auto-advance controller, rejection category system
- **Database Changes:** `segment_approvals` table (segment_id, user_id, decision, reason_category, comment, version, decided_at)
- **API Changes:** POST /segments/:id/approve, POST /segments/:id/reject, POST /segments/:id/flag, GET /segments/review-queue

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Approval action completes in <100ms (instant feedback)
- Average review throughput >20 segments per minute in rapid review mode
- Zero unauthorized approvals (RBAC enforcement 100% effective)

## 11. Open Questions
- Should approval decisions be reversible within a grace period (e.g., 10-second undo window)?
- Should the system support multi-level approval workflows (Reviewer approves, then Creator confirms)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
