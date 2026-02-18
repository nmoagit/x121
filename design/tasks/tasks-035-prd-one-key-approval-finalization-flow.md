# Task List: One-Key Approval & Finalization Flow

**PRD Reference:** `design/prds/035-prd-one-key-approval-finalization-flow.md`
**Scope:** Build a single-hotkey segment approval workflow with approve/reject/flag actions, structured rejection categories, auto-advance to next segment, RBAC-enforced approval permissions, and full approval metadata tracking.

## Overview

Maximizing review speed requires minimizing friction between watching a segment and making a decision. This PRD provides single-key approval: Enter to approve, Backspace to reject, F to flag. After each action, the next unreviewed segment auto-loads. Rejection includes structured categories (face artifact, motion artifact, etc.) and optional text comments. RBAC enforcement ensures only authorized roles can finalize decisions, and full metadata (who, when, which version) is recorded.

### What Already Exists
- PRD-003 RBAC (approval permissions)
- PRD-052 Keyboard shortcut registry
- PRD-083 Video playback engine
- PRD-000 database infrastructure

### What We're Building
1. Segment approval state machine (approve/reject/flag)
2. Structured rejection category system
3. Auto-advance controller
4. Approval metadata tracking
5. Review queue API
6. Database tables for approvals and rejection categories

### Key Design Decisions
1. **Single-key by default** — Enter=approve, Backspace=reject, F=flag. Configurable via PRD-052.
2. **Rejection categories are structured** — Common defect types are predefined for consistency; custom text is optional.
3. **Auto-advance with delay** — Brief delay (default 0.5s) after action before loading next segment, so user sees feedback.
4. **RBAC-enforced** — Approval is a permission, not just a UI action. Backend validates authorization.

---

## Phase 1: Database & API

### Task 1.1: Create Segment Approvals Table
**File:** `migrations/YYYYMMDD_create_segment_approvals.sql`

```sql
-- Rejection reason categories
CREATE TABLE rejection_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rejection_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO rejection_categories (name, description) VALUES
    ('face_artifact', 'Face deformation, melting, or identity loss'),
    ('motion_artifact', 'Unnatural movement, jitter, or pops'),
    ('lighting_mismatch', 'Inconsistent lighting or color'),
    ('hand_artifact', 'Hand deformation or extra fingers'),
    ('boundary_pop', 'Visible boundary or transition artifact'),
    ('other', 'Other issue not categorized');

-- Segment approval decisions
CREATE TABLE segment_approvals (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision TEXT NOT NULL,            -- 'approved' | 'rejected' | 'flagged'
    reason_category_id BIGINT NULL REFERENCES rejection_categories(id) ON DELETE SET NULL,
    comment TEXT,
    segment_version INTEGER NOT NULL DEFAULT 1,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_approvals_segment_id ON segment_approvals(segment_id);
CREATE INDEX idx_segment_approvals_user_id ON segment_approvals(user_id);
CREATE INDEX idx_segment_approvals_decision ON segment_approvals(decision);
CREATE INDEX idx_segment_approvals_reason_category_id ON segment_approvals(reason_category_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_approvals
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `rejection_categories` lookup table with predefined defect types
- [ ] `segment_approvals` records each approval decision with full metadata
- [ ] Records: who (user_id), what decision, reason category, comment, which version, when
- [ ] All FK columns indexed, `updated_at` triggers applied

### Task 1.2: Approval Models & Repository
**File:** `src/models/approval.rs`, `src/repositories/approval_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SegmentApproval {
    pub id: DbId,
    pub segment_id: DbId,
    pub user_id: DbId,
    pub decision: String,
    pub reason_category_id: Option<DbId>,
    pub comment: Option<String>,
    pub segment_version: i32,
    pub decided_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveRequest {
    pub segment_version: i32,
}

#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason_category_id: Option<DbId>,
    pub comment: Option<String>,
    pub segment_version: i32,
}
```

**Acceptance Criteria:**
- [ ] Models for approval, rejection categories
- [ ] Repository: create approval, list approvals for segment, get review queue
- [ ] Review queue query: unreviewed segments ordered by creation date
- [ ] Unit tests for repository operations

### Task 1.3: Approval API Endpoints
**File:** `src/routes/approval.rs`

```rust
pub fn approval_routes() -> Router<AppState> {
    Router::new()
        .route("/segments/:id/approve", post(approve_segment))
        .route("/segments/:id/reject", post(reject_segment))
        .route("/segments/:id/flag", post(flag_segment))
        .route("/segments/review-queue", get(get_review_queue))
        .route("/rejection-categories", get(list_rejection_categories))
}
```

**Acceptance Criteria:**
- [ ] `POST /segments/:id/approve` records approval (RBAC-enforced)
- [ ] `POST /segments/:id/reject` records rejection with optional category and comment
- [ ] `POST /segments/:id/flag` flags for discussion
- [ ] `GET /segments/review-queue` returns unreviewed segments
- [ ] `GET /rejection-categories` returns available rejection categories
- [ ] All mutation endpoints enforce RBAC permissions

---

## Phase 2: Review Interface

### Task 2.1: Review Player Component
**File:** `frontend/src/features/review/ReviewPlayer.tsx`

```typescript
interface ReviewPlayerProps {
  segmentId: number;
  onApprove: () => void;
  onReject: (category?: number, comment?: string) => void;
  onFlag: () => void;
  onNext: () => void;
}
```

**Acceptance Criteria:**
- [ ] Video player (PRD-083) displaying the current segment
- [ ] Approval/rejection/flag buttons clearly visible
- [ ] Visual feedback on action: green flash for approve, red for reject, yellow for flag
- [ ] Minimal UI clutter during rapid review mode

### Task 2.2: Keyboard Shortcut Registration
**File:** `frontend/src/features/review/reviewShortcuts.ts`

**Acceptance Criteria:**
- [ ] `Enter` to approve (registered with PRD-052)
- [ ] `Backspace`/`Delete` to reject
- [ ] `F` to flag for discussion
- [ ] All bindings configurable via PRD-052 keymap system

---

## Phase 3: Rejection Workflow

### Task 3.1: Quick Rejection Dialog
**File:** `frontend/src/features/review/RejectionDialog.tsx`

**Acceptance Criteria:**
- [ ] Quick rejection categories: face artifact, motion artifact, lighting mismatch, hand artifact, boundary pop, other
- [ ] Single-click category selection (no text required for speed)
- [ ] Optional text comment for specific feedback
- [ ] Dialog appears on reject key press, dismissable with Escape
- [ ] Rejected segments automatically eligible for re-generation queue

---

## Phase 4: Auto-Advance

### Task 4.1: Auto-Advance Controller
**File:** `frontend/src/features/review/useAutoAdvance.ts`

```typescript
export function useAutoAdvance(options: {
  delay: number;          // ms, default 500
  onAdvance: () => void;  // Load next segment
}) {
  // After approve/reject/flag, wait delay then advance
}
```

**Acceptance Criteria:**
- [ ] After approve/reject/flag, next unreviewed segment auto-loads
- [ ] Configurable delay before auto-advance (default: 0.5 seconds)
- [ ] "End of queue" message when all segments in the batch are reviewed
- [ ] Auto-advance can be disabled in preferences

---

## Phase 5: Review Queue Management

### Task 5.1: Review Queue Component
**File:** `frontend/src/features/review/ReviewQueue.tsx`

**Acceptance Criteria:**
- [ ] List of unreviewed segments with thumbnails
- [ ] Current segment highlighted
- [ ] Progress counter: "5 of 23 reviewed"
- [ ] Click any segment to jump to it
- [ ] Queue refreshes when new segments become available

---

## Phase 6: Integration & Testing

### Task 6.1: RBAC Integration
**File:** integration with PRD-003

**Acceptance Criteria:**
- [ ] Approval endpoint validates user has approval permission
- [ ] Unauthorized users see read-only review mode (can view, cannot approve)
- [ ] Final approval authority configurable per studio

### Task 6.2: Comprehensive Tests
**File:** `tests/approval_test.rs`, `frontend/src/features/review/__tests__/`

**Acceptance Criteria:**
- [ ] Approval completes in <100ms (instant feedback)
- [ ] RBAC correctly blocks unauthorized approvals
- [ ] Auto-advance loads correct next segment
- [ ] Rejection categories saved correctly
- [ ] Review queue returns correct unreviewed segments
- [ ] Keyboard shortcuts trigger correct actions

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_segment_approvals.sql` | Approval tables |
| `src/models/approval.rs` | Rust model structs |
| `src/repositories/approval_repo.rs` | Approval repository |
| `src/routes/approval.rs` | Axum API endpoints |
| `frontend/src/features/review/ReviewPlayer.tsx` | Review player |
| `frontend/src/features/review/RejectionDialog.tsx` | Rejection workflow |
| `frontend/src/features/review/useAutoAdvance.ts` | Auto-advance controller |
| `frontend/src/features/review/ReviewQueue.tsx` | Review queue component |

## Dependencies
- PRD-003: RBAC (approval permissions)
- PRD-052: Keyboard shortcut system (key bindings)
- PRD-083: Video playback engine (segment playback)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — approval tables, rejection categories, review queue
2. Phase 2 (Review Interface) — player with keyboard shortcuts
3. Phase 3 (Rejection) — structured rejection workflow
4. Phase 4 (Auto-Advance) — automatic next-segment loading
5. Phase 5 (Review Queue) — queue management UI

### Post-MVP Enhancements
- Approval confidence level: optional 1-5 slider attached to decisions
- Multi-level approval workflow (Reviewer approves, then Creator confirms)

## Notes
- Review throughput target: >20 segments per minute in rapid review mode.
- RBAC enforcement is backend-validated, not just a UI check.
- Visual feedback (green/red flash) is critical for maintaining review rhythm.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
