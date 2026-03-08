# PRD-129: Character Review Allocation

## 1. Introduction/Overview

When a production run produces dozens of characters — each with multiple scenes, segments, and deliverables — there is no systematic way to assign characters to reviewers for holistic sign-off. The existing review system (PRD-035, 092) operates at the segment level: individual video clips are approved or rejected. But there is no character-level review gate that says "this character, across all its scenes and deliverables, is complete and approved."

This PRD introduces a character review allocation system that enables:
- **Manual assignment** by admins to specific reviewers
- **Automated allocation** via round-robin with load balancing
- **Full audit trail** with time tracking for every review action
- **Rejection-rework cycle** that sends characters back to creators and re-queues them for review

## 2. Related PRDs & Dependencies

- **Depends on:** PRD-003 (User Identity & RBAC — roles: admin, creator, reviewer), PRD-035 (One-Key Approval — segment-level review), PRD-092 (Batch Review — `review_assignments` table, `review_sessions` table)
- **Extends:** PRD-092 (adds character-level granularity to the existing assignment model)
- **Related:** PRD-038 (Collaborative Review — notes/comments reusable at character level), PRD-091 (Custom QA Rulesets), PRD-128 (Character Readiness Indicators — readiness data feeds review eligibility)

## 3. Goals

1. Provide a character-level review gate so that entire characters can be formally approved or rejected as a unit.
2. Enable admins to manually assign characters to reviewers or use automated round-robin allocation with load balancing.
3. Maintain a complete audit trail of every assignment, reassignment, review action, and decision with timestamps and durations.
4. Support a rejection-rework cycle where rejected characters return to the creator, are fixed, and automatically re-enter the review queue.
5. Extend the existing `review_assignments` infrastructure (PRD-092) rather than building a parallel system.

## 4. User Stories

- As an **Admin**, I want to manually assign a character to a specific reviewer so that I can control who reviews what.
- As an **Admin**, I want to auto-allocate all unassigned characters using round-robin so that review work is distributed evenly.
- As an **Admin**, I want to see each reviewer's current workload (count of assigned, unfinished characters) so that I can make informed assignment decisions.
- As an **Admin**, I want to reassign a character to a different reviewer at any time, with the original assignment logged.
- As a **Reviewer**, I want to see my assigned characters in a queue so that I know what to review next.
- As a **Reviewer**, I want to approve or reject a character with comments so that my decision is recorded.
- As a **Creator**, I want to see when my character has been rejected with the reviewer's feedback so that I know what to fix.
- As a **Creator**, I want rejected characters to automatically re-enter the review queue after I mark them as fixed so that I don't have to chase an admin.
- As an **Admin**, I want to see a full audit log of all review activity (assignments, decisions, time spent) so that I can track accountability and performance.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Character Review Status

**Description:** Each character has a review status that tracks its position in the review lifecycle.

**Acceptance Criteria:**
- [ ] New `character_review_statuses` lookup table with states: `unassigned`, `assigned`, `in_review`, `approved`, `rejected`, `rework`, `re_queued`
- [ ] Characters start as `unassigned`
- [ ] Status transitions are enforced: `unassigned` → `assigned` → `in_review` → `approved` | `rejected` → `rework` → `re_queued` → `assigned`
- [ ] Review status is visible on the character card and character detail page
- [ ] Review status is filterable/sortable in character lists

#### Requirement 1.2: Manual Assignment

**Description:** Admins can manually assign one or more characters to a reviewer.

**Acceptance Criteria:**
- [ ] Admin selects characters from a project's character list and assigns them to a reviewer via a dropdown
- [ ] Bulk assignment supported: select multiple characters, assign to one reviewer
- [ ] Assignment creates a `character_review_assignments` record with `assigned_by`, `assigned_at`, `reviewer_user_id`
- [ ] Reviewer receives the character in their review queue
- [ ] Character status transitions from `unassigned` (or `re_queued`) to `assigned`

#### Requirement 1.3: Round-Robin Allocation with Load Balancing

**Description:** Automated allocation distributes unassigned characters evenly across available reviewers, weighted by current workload.

**Acceptance Criteria:**
- [ ] "Auto-allocate" action available to admins at the project level
- [ ] Algorithm: sort eligible reviewers by ascending count of currently assigned (unfinished) characters, assign next character to the reviewer with the fewest
- [ ] Ties broken by: least recently assigned (reviewer who hasn't received work longest gets priority)
- [ ] Admin can preview the allocation before confirming (shows proposed assignments)
- [ ] Admin can exclude specific reviewers from auto-allocation
- [ ] Only characters in `unassigned` or `re_queued` status are eligible for allocation

#### Requirement 1.4: Auto-Allocation Trigger

**Description:** Characters can be automatically queued for review when they reach a certain readiness threshold.

**Acceptance Criteria:**
- [ ] When a character's status changes to a configurable "ready for review" state (e.g., all scenes generated, readiness >= threshold), it enters the `unassigned` review pool
- [ ] Admin can configure `review_trigger_threshold` per project (stored on the `projects` table); set to `null` to disable auto-trigger for manual-only workflow
- [ ] Auto-triggered characters appear in the unassigned pool for manual or round-robin allocation
- [ ] Notification sent to admins when new characters enter the unassigned pool

#### Requirement 1.5: Reviewer Queue

**Description:** Reviewers see a dedicated queue of characters assigned to them.

**Acceptance Criteria:**
- [ ] "My Reviews" page/tab showing all characters assigned to the current reviewer
- [ ] Sortable by: assignment date, character name, project, deadline (if set)
- [ ] Filterable by: project, review status (assigned, in_review)
- [ ] Character card in queue shows: character name, project, scene count, assignment date, deadline (if any)
- [ ] Clicking a character opens the character detail page with review controls
- [ ] Review session tracking starts when reviewer opens a character (records `started_at`)

#### Requirement 1.6: Review Decision

**Description:** Reviewers can approve or reject a character with comments.

**Acceptance Criteria:**
- [ ] "Approve" and "Reject" actions on the character detail page (visible only to assigned reviewer and admins)
- [ ] Rejection requires a comment explaining what needs to be fixed
- [ ] Approval optionally accepts a comment
- [ ] Decision creates a `character_review_decisions` record with: reviewer_user_id, decision (approved/rejected), comment, decided_at, review_duration_seconds
- [ ] Review duration is calculated from session start (`in_review` timestamp) to decision
- [ ] Character status transitions to `approved` or `rejected`

#### Requirement 1.7: Rejection-Rework Cycle

**Description:** Rejected characters return to the creator for fixes and automatically re-enter the review queue.

**Acceptance Criteria:**
- [ ] When rejected, character status moves to `rework`
- [ ] Creator sees the rejection comment on the character detail page
- [ ] Creator has a "Submit for Re-review" action that moves status to `re_queued`
- [ ] Re-queued characters are automatically re-assigned to the same reviewer who rejected them (they have context on the rejection)
- [ ] Admin can override and reassign to a different reviewer
- [ ] Review round number is tracked (1st review, 2nd review, etc.)

#### Requirement 1.8: Reassignment

**Description:** Admins can reassign a character to a different reviewer at any time.

**Acceptance Criteria:**
- [ ] Admin can change the assigned reviewer from the character detail page or assignment dashboard
- [ ] Original assignment is preserved in the audit log (not overwritten)
- [ ] New assignment record is created with `reassigned_from` reference
- [ ] If the original reviewer had started a session, it is closed with status `reassigned`
- [ ] Character status remains `assigned` (or reverts from `in_review` to `assigned`)

#### Requirement 1.9: Assignment Dashboard

**Description:** Admin dashboard showing reviewer workload and assignment status.

**Acceptance Criteria:**
- [ ] Overview panel showing all reviewers with: assigned count, in-review count, completed count, approval rate
- [ ] Per-project view: which characters are assigned to whom, status of each
- [ ] Unassigned characters pool with count
- [ ] Quick-assign action from the dashboard (drag-and-drop or dropdown)
- [ ] Workload distribution chart (bar chart of assignments per reviewer)

#### Requirement 1.10: Audit Log

**Description:** Complete activity trail for all review-related actions.

**Acceptance Criteria:**
- [ ] `character_review_audit_log` table recording every state change with: character_id, action (assigned, reassigned, review_started, approved, rejected, rework_submitted, re_queued), actor_user_id, target_user_id (for assignments), comment, timestamp
- [ ] Audit log viewable on the character detail page (review history tab)
- [ ] Audit log viewable on the assignment dashboard (filterable by reviewer, project, date range)
- [ ] Time tracking: total time in review per character, per review round
- [ ] Export audit log as CSV

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Review SLA & Deadline Management

**Description:** Set deadlines on character review assignments with escalation.

**Acceptance Criteria:**
- [ ] Admin can set a deadline when assigning a character
- [ ] Warning notification at configurable threshold (e.g., 24h before deadline)
- [ ] Overdue assignments highlighted in the dashboard
- [ ] Auto-reassignment option for overdue items

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Review Performance Analytics

**Description:** Historical metrics for review performance.

**Acceptance Criteria:**
- [ ] Average review duration per reviewer
- [ ] Approval/rejection rate per reviewer
- [ ] Rework rate (how often characters need re-review)
- [ ] Review throughput over time (characters reviewed per day/week)
- [ ] Comparison across reviewers

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Skill-Based Allocation

**Description:** Match reviewers to characters based on expertise.

**Acceptance Criteria:**
- [ ] Reviewers can be tagged with expertise areas (e.g., scene types, character types)
- [ ] Allocation algorithm considers expertise match as a weighting factor
- [ ] Admin can override skill-based suggestions

#### **[OPTIONAL - Post-MVP]** Requirement 2.4: Review Checklists

**Description:** Configurable checklists that reviewers must complete before approving.

**Acceptance Criteria:**
- [ ] Admin defines a review checklist per project or scene type
- [ ] Reviewer must check all items before the "Approve" button is enabled
- [ ] Checklist completion is recorded in the audit log

## 6. Non-Goals (Out of Scope)

- **Segment-level review changes** — the existing segment QA workflow (PRD-035, 092) is untouched; this operates at the character level.
- **Automated approval** — characters are never auto-approved; a human reviewer must always make the decision.
- **Multi-stage pipelines** — MVP is single-stage (one reviewer decides). Multi-stage workflows (creative → technical → final) are a potential future enhancement.
- **Notification delivery system** — this PRD defines when notifications should fire but does not implement email/push infrastructure.
- **Separation of duties enforcement** — MVP does not block a creator from reviewing their own character, but the audit log records who created vs who reviewed for governance purposes.

## 7. Design Considerations

- **Assignment dashboard** should follow the existing admin panel patterns. Reviewer workload as a simple horizontal bar chart.
- **Character card** should show a review status badge (colour-coded: grey=unassigned, blue=assigned, yellow=in_review, green=approved, red=rejected, orange=rework).
- **Review controls** (Approve/Reject) on the character detail page should be prominent but not intrusive — a sticky footer bar similar to the segment QA actions (PRD-035).
- **Reviewer queue** ("My Reviews") should be accessible from the main navigation for users with the `reviewer` role.
- **Audit log** should use a timeline/activity-feed pattern with icons per action type.

## 8. Technical Considerations

### Existing Code to Reuse
- **`review_assignments` table** (PRD-092) — extend with character-specific fields or create a parallel `character_review_assignments` table that follows the same schema pattern
- **`review_sessions` table** (PRD-092) — reuse for tracking review duration at the character level
- **`AuthUser` extractor** — role checking for admin-only endpoints
- **`ClipQAActions` component** — pattern for approve/reject UI (adapt for character-level)
- **Character readiness data** (PRD-128) — `CharacterDeliverableRow` fields feed review eligibility
- **`PaginationParams`** from `crate::query` — for paginated reviewer queue and audit log

### New Infrastructure Needed
- Round-robin allocation engine (backend service in `core` crate)
- Character review state machine (enforced status transitions)
- Audit log writer (reusable pattern for future audit needs)

### Database Changes

```sql
-- New lookup table
CREATE TABLE character_review_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);
INSERT INTO character_review_statuses (name, label) VALUES
    ('unassigned', 'Unassigned'),
    ('assigned', 'Assigned'),
    ('in_review', 'In Review'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('rework', 'Rework'),
    ('re_queued', 'Re-queued');

-- Add review status to characters
ALTER TABLE characters ADD COLUMN review_status_id SMALLINT
    REFERENCES character_review_statuses(id) DEFAULT 1;

-- Assignment tracking
CREATE TABLE character_review_assignments (
    id                  BIGSERIAL PRIMARY KEY,
    character_id        BIGINT NOT NULL REFERENCES characters(id),
    reviewer_user_id    BIGINT NOT NULL REFERENCES users(id),
    assigned_by         BIGINT NOT NULL REFERENCES users(id),
    reassigned_from     BIGINT REFERENCES character_review_assignments(id),
    review_round        INT NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'active',  -- active, completed, reassigned
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    deadline            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Review decisions
CREATE TABLE character_review_decisions (
    id                  BIGSERIAL PRIMARY KEY,
    assignment_id       BIGINT NOT NULL REFERENCES character_review_assignments(id),
    character_id        BIGINT NOT NULL REFERENCES characters(id),
    reviewer_user_id    BIGINT NOT NULL REFERENCES users(id),
    decision            TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    comment             TEXT,
    review_round        INT NOT NULL DEFAULT 1,
    review_duration_sec INT,
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE character_review_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    character_id        BIGINT NOT NULL REFERENCES characters(id),
    action              TEXT NOT NULL,  -- assigned, reassigned, review_started, approved, rejected, rework_submitted, re_queued
    actor_user_id       BIGINT NOT NULL REFERENCES users(id),
    target_user_id      BIGINT REFERENCES users(id),
    comment             TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### API Changes

```
-- Assignment management (admin only)
POST   /api/v1/projects/{id}/review/assignments           -- manual assign
POST   /api/v1/projects/{id}/review/auto-allocate         -- round-robin allocate
GET    /api/v1/projects/{id}/review/assignments            -- list assignments
PATCH  /api/v1/projects/{id}/review/assignments/{id}       -- reassign
GET    /api/v1/projects/{id}/review/workload               -- reviewer workload summary

-- Reviewer actions
GET    /api/v1/review/my-queue                             -- current user's assigned characters
POST   /api/v1/review/assignments/{id}/start               -- start review session
POST   /api/v1/review/assignments/{id}/decide              -- approve or reject

-- Creator actions
POST   /api/v1/characters/{id}/submit-for-rereview         -- creator submits reworked character

-- Audit
GET    /api/v1/characters/{id}/review-history              -- audit log for a character
GET    /api/v1/projects/{id}/review/audit-log              -- project-wide audit log
GET    /api/v1/projects/{id}/review/audit-log/export       -- CSV export
```

## 9. Success Metrics

- All characters in a project can be allocated to reviewers within 30 seconds (manual or auto).
- Audit log captures 100% of review actions with accurate timestamps and durations.
- Round-robin allocation produces assignments within 1 of the optimal even distribution.
- Rejection-rework-requeue cycle completes without manual admin intervention.
- Reviewer queue loads in under 2 seconds with up to 100 assigned characters.

## 10. Open Questions

All resolved:

1. ~~Should the auto-allocation trigger threshold be configurable per project, or is a global "all scenes generated" status sufficient for MVP?~~ **Resolved:** Per-project configurable. A `review_trigger_threshold` column on `projects` with a sensible default.
2. ~~Should the reviewer queue be a standalone page or a tab within an existing page?~~ **Resolved:** Standalone page in the main nav for `reviewer` role users. Spans all projects.
3. ~~When a character is rejected and reworked, should it be re-assigned to the same reviewer by default, or always go back to the unassigned pool?~~ **Resolved:** Same reviewer by default (they have context on the rejection). Admin can override and reassign to someone else.

## 11. Version History

- **v1.0** (2026-03-08): Initial PRD creation
- **v1.1** (2026-03-08): Resolved all open questions — per-project threshold, standalone reviewer queue page, re-assign to same reviewer by default
