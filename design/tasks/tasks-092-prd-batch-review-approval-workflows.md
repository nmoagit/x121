# Task List: Batch Review & Approval Workflows

**PRD Reference:** `design/prds/092-prd-batch-review-approval-workflows.md`
**Scope:** Build batch review capabilities extending PRD-035 with multi-select approval, auto-QA filter actions, sorted review queues, quick review mode, review assignment, and deadline tracking.

## Overview

A production run of 10 characters x 8 scene types can produce 400+ items to review. Without batch workflows, every segment is reviewed individually. This PRD extends PRD-035 with: multi-select approve/reject, "approve all above QA threshold" auto-filtering, configurable sorted review queues, keyboard-only Quick Review Mode for maximum throughput, review assignment to distribute workload, and deadline tracking with escalation notifications. These batch capabilities can increase review throughput 3-5x.

### What Already Exists
- PRD-035 Review Interface (single-segment approval logic and API)
- PRD-049 Automated Quality Gates (auto-QA scores)
- PRD-052 Keyboard shortcuts
- PRD-091 Custom QA Rulesets (threshold configuration)
- PRD-010 Event Bus (real-time progress updates)
- PRD-000 database infrastructure

### What We're Building
1. Multi-select review with bulk actions
2. Auto-QA filter actions (approve all above threshold)
3. Configurable sorted review queue
4. Quick Review Mode (keyboard-only, maximum throughput)
5. Review assignment engine (assign batches to reviewers)
6. Deadline tracking with notification escalation
7. Review progress counter and session statistics
8. Database tables and API for assignments and sessions

### Key Design Decisions
1. **Extends PRD-035** — Individual approval API from PRD-035 is reused; batch endpoints wrap multiple individual actions.
2. **Auto-QA threshold is per-batch** — Each batch operation specifies its own threshold, not a global setting.
3. **Quick Review Mode strips UI** — Minimum UI: video + action buttons + progress counter. Nothing else.
4. **Assignment is not locking** — Assigned segments are in a shared pool; assignment is guidance, not exclusive lock.

---

## Phase 1: Database & API

### Task 1.1: Create Review Assignment & Session Tables
**File:** `migrations/YYYYMMDD_create_review_assignments.sql`

```sql
-- Review batch assignments
CREATE TABLE review_assignments (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL,          -- Links to a batch/project context
    reviewer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filter_criteria_json JSONB NOT NULL DEFAULT '{}',  -- { "scene_type": "dance", "character_id": 5 }
    deadline TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'overdue'
    assigned_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_assignments_reviewer ON review_assignments(reviewer_user_id);
CREATE INDEX idx_review_assignments_batch ON review_assignments(batch_id);
CREATE INDEX idx_review_assignments_assigned_by ON review_assignments(assigned_by);
CREATE INDEX idx_review_assignments_status ON review_assignments(status);
CREATE INDEX idx_review_assignments_deadline ON review_assignments(deadline);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON review_assignments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Review session tracking
CREATE TABLE review_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    segments_reviewed INTEGER NOT NULL DEFAULT 0,
    segments_approved INTEGER NOT NULL DEFAULT 0,
    segments_rejected INTEGER NOT NULL DEFAULT 0,
    avg_pace_seconds REAL,            -- Average seconds per segment
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_sessions_user_id ON review_sessions(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON review_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `review_assignments` tracks batch assignments with filter criteria and deadlines
- [ ] `review_sessions` tracks per-user review session statistics
- [ ] All FK columns indexed, `updated_at` triggers applied

### Task 1.2: Batch Review Models & Repository
**File:** `src/models/batch_review.rs`, `src/repositories/batch_review_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReviewAssignment {
    pub id: DbId,
    pub batch_id: DbId,
    pub reviewer_user_id: DbId,
    pub filter_criteria_json: serde_json::Value,
    pub deadline: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,
    pub assigned_by: DbId,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Models for assignments and sessions
- [ ] Repository: CRUD for assignments, session tracking, progress queries
- [ ] Deadline check query for escalation notifications
- [ ] Unit tests

### Task 1.3: Batch Review API
**File:** `src/routes/batch_review.rs`

```rust
pub fn batch_review_routes() -> Router<AppState> {
    Router::new()
        .route("/review/batch-approve", post(batch_approve))
        .route("/review/batch-reject", post(batch_reject))
        .route("/review/auto-approve", post(auto_approve))
        .route("/review/assignments", get(list_assignments).post(create_assignment))
        .route("/review/assignments/:id", put(update_assignment).delete(delete_assignment))
        .route("/review/progress", get(review_progress))
}
```

**Acceptance Criteria:**
- [ ] `POST /review/batch-approve` approves multiple segments at once
- [ ] `POST /review/batch-reject` rejects multiple segments with shared reason
- [ ] `POST /review/auto-approve?threshold=X` approves all segments above QA threshold
- [ ] CRUD for assignments
- [ ] `GET /review/progress` returns session statistics and queue progress
- [ ] Batch actions complete in <5 seconds for up to 100 segments

---

## Phase 2: Multi-Select Review

### Task 2.1: Multi-Select UI
**File:** `frontend/src/features/batch-review/MultiSelectReview.tsx`

**Acceptance Criteria:**
- [ ] Checkboxes on segment cards for selection
- [ ] Shift+Click for range selection
- [ ] Ctrl+A for select all visible
- [ ] Actions toolbar: Approve All, Reject All, Reject & Re-queue All
- [ ] Visual feedback for selected items
- [ ] Selection count indicator

---

## Phase 3: Auto-QA Filter

### Task 3.1: Auto-Approve by Threshold
**File:** `frontend/src/features/batch-review/AutoApproveAction.tsx`

**Acceptance Criteria:**
- [ ] "Approve all segments with QA score above X" one-click action
- [ ] Configurable threshold per batch (uses PRD-091 rulesets when available)
- [ ] Preview showing how many segments would be approved at selected threshold
- [ ] Threshold slider with real-time count update
- [ ] Confirmation dialog before execution

---

## Phase 4: Sorted Review Queue

### Task 4.1: Queue Sort & Filter Controls
**File:** `frontend/src/features/batch-review/SortedQueue.tsx`

**Acceptance Criteria:**
- [ ] Sort options: worst QA score first, oldest first (FIFO), by scene type, by character, random
- [ ] Saved sort preferences per user
- [ ] Filter to specific characters, scene types, or variants
- [ ] Filter combinations (e.g., "unapproved dance scenes for Character A")

---

## Phase 5: Quick Review Mode

### Task 5.1: Quick Review Mode Component
**File:** `frontend/src/features/batch-review/QuickReviewMode.tsx`

```typescript
export const QuickReviewMode: React.FC<{ queueId: number }> = ({ queueId }) => {
  // Stripped UI: video + action buttons + progress counter
  // Video auto-plays on load
  // Keyboard-only operation
};
```

**Acceptance Criteria:**
- [ ] Video auto-plays on load
- [ ] `1` = Approve, `2` = Reject, `3` = Flag, `Space` = Skip (via PRD-052)
- [ ] No mouse interaction needed
- [ ] Next segment loads automatically after action
- [ ] Optimized for maximum throughput (>20 segments/minute)
- [ ] UI stripped to absolute minimum

### Task 5.2: Review Progress Counter
**File:** `frontend/src/features/batch-review/ReviewProgress.tsx`

**Acceptance Criteria:**
- [ ] "23 of 47 reviewed" with progress bar
- [ ] Estimated time remaining based on average review pace
- [ ] Session statistics: review rate, approval ratio

---

## Phase 6: Review Assignment

### Task 6.1: Assignment Manager UI
**File:** `frontend/src/features/batch-review/AssignmentManager.tsx`

**Acceptance Criteria:**
- [ ] Assign batches to reviewers with filter criteria
- [ ] Example: "Jane reviews all dance scenes, Bob reviews all idle scenes"
- [ ] Assignment dashboard showing who has what and their progress
- [ ] Unassigned segments visible in shared pool

### Task 6.2: Deadline Tracker
**File:** `frontend/src/features/batch-review/DeadlineTracker.tsx`, `src/services/deadline_checker.rs`

**Acceptance Criteria:**
- [ ] Set deadline on review batches
- [ ] Notification escalation as deadline approaches with unreviewed items
- [ ] "12 segments unreviewed -- deadline in 2 hours" alert
- [ ] Overdue batches highlighted in the assignment dashboard
- [ ] Backend deadline checker service for scheduled notifications

---

## Phase 7: Testing

### Task 7.1: Comprehensive Tests
**File:** `tests/batch_review_test.rs`, `frontend/src/features/batch-review/__tests__/`

**Acceptance Criteria:**
- [ ] Quick Review Mode achieves >20 segments/minute throughput
- [ ] Auto-QA filter correctly processes all qualifying segments
- [ ] Batch actions complete in <5 seconds for up to 100 segments
- [ ] Review deadline notifications delivered accurately
- [ ] Assignment filtering correctly scopes segments to reviewers
- [ ] Session statistics accurately track review pace

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_review_assignments.sql` | Assignment and session tables |
| `src/models/batch_review.rs` | Rust model structs |
| `src/repositories/batch_review_repo.rs` | Batch review repository |
| `src/routes/batch_review.rs` | Axum API endpoints |
| `src/services/deadline_checker.rs` | Deadline check service |
| `frontend/src/features/batch-review/MultiSelectReview.tsx` | Multi-select UI |
| `frontend/src/features/batch-review/AutoApproveAction.tsx` | Auto-QA filter |
| `frontend/src/features/batch-review/QuickReviewMode.tsx` | Quick review mode |
| `frontend/src/features/batch-review/AssignmentManager.tsx` | Assignment UI |
| `frontend/src/features/batch-review/DeadlineTracker.tsx` | Deadline tracking |

## Dependencies
- PRD-035: Review Interface (single-segment approval API)
- PRD-049: Automated Quality Gates (QA scores)
- PRD-052: Keyboard shortcuts (Quick Review Mode keys)
- PRD-091: Custom QA Rulesets (threshold configuration)
- PRD-010: Event Bus (real-time progress updates, deadline notifications)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — assignments, sessions, batch endpoints
2. Phase 2 (Multi-Select) — bulk selection and actions
3. Phase 3 (Auto-QA) — threshold-based auto-approve
4. Phase 4 (Queue) — sorted/filtered review queue
5. Phase 5 (Quick Review) — keyboard-only rapid review
6. Phase 6 (Assignment) — reviewer assignment and deadlines

### Post-MVP Enhancements
- Review SLA reporting: turnaround time, deadline compliance, review quality metrics

## Notes
- Quick Review Mode is the flagship feature — throughput >20 segments/minute is the target.
- Auto-approved segments should be distinguishable from manually approved ones in the audit trail.
- Assignment is guidance, not exclusive lock — segments remain accessible to all reviewers.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
