# Task List: Character Review Allocation

**PRD Reference:** `design/prds/129-prd-character-review-allocation.md`
**Scope:** Character-level review allocation system with manual assignment, round-robin with load balancing, reviewer queue, approve/reject workflow, rejection-rework cycle, and full audit trail.

## Overview

This implementation adds a character-level review gate on top of the existing segment-level QA system (PRD-092). Characters flow through a lifecycle: `unassigned` → `assigned` → `in_review` → `approved`/`rejected` → `rework` → `re_queued`. Admins assign characters to reviewers manually or via load-balanced round-robin. Every action is logged in an audit trail with time tracking.

We extend the existing review infrastructure (PRD-092's `review_assignments` and `review_sessions` patterns) rather than building a parallel system. The round-robin allocation engine lives in the `core` crate (zero deps). The reviewer queue is a standalone page in the main nav.

### What Already Exists
- `ReviewAssignment` / `ReviewSession` models in `batch_review.rs` — pattern to follow for schema and repo
- `BatchReviewRepo` with `list_assignments_by_reviewer`, workload counting — pattern for reviewer queue queries
- `StatusBadge` component — reuse for review status visualization
- `ClipQAActions` component — pattern for approve/reject UI
- Review layout route in `router.tsx` — parent route for new "My Reviews" page
- `AuthUser` extractor with `role` field — for admin-only endpoint guards
- `PaginationParams` from `crate::query` — for paginated lists
- `CharacterDeliverableRow` (PRD-128) — readiness data feeds review eligibility trigger

### What We're Building
1. 4 new database tables + 2 column additions
2. 4 new Rust model files + 3 new repository files
3. 2 new handler files + route registration
4. Round-robin allocation engine in `core` crate
5. "My Reviews" standalone page (reviewer role)
6. Assignment dashboard (admin role)
7. Review controls on character detail page
8. Audit log timeline component

### Key Design Decisions
1. **Separate tables from PRD-092** — character review assignments are a distinct domain from segment batch review; separate tables avoid schema conflicts while following the same patterns.
2. **Allocation engine in `core` crate** — pure logic with no DB deps; takes a list of reviewers + workloads + characters and returns proposed assignments.
3. **Same-reviewer re-assignment on rework** — rejected characters auto-assign back to the reviewer who rejected them (they have context).
4. **Per-project trigger threshold** — `review_trigger_threshold` on `projects` table, nullable to disable auto-trigger.

---

## Phase 1: Database — Schema & Migrations

### Task 1.1: Create character review status lookup table
**File:** `apps/db/migrations/20260308000001_create_character_review_tables.sql`

Create the lookup table and all three character review tables in a single migration.

```sql
-- Lookup table
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

-- Add review status to characters (default = 1 = unassigned)
ALTER TABLE characters ADD COLUMN review_status_id SMALLINT
    NOT NULL DEFAULT 1 REFERENCES character_review_statuses(id);
CREATE INDEX idx_characters_review_status_id ON characters(review_status_id);

-- Assignment tracking
CREATE TABLE character_review_assignments (
    id                  BIGSERIAL PRIMARY KEY,
    character_id        BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    reviewer_user_id    BIGINT NOT NULL REFERENCES users(id),
    assigned_by         BIGINT NOT NULL REFERENCES users(id),
    reassigned_from     BIGINT REFERENCES character_review_assignments(id),
    review_round        INT NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'reassigned')),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    deadline            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_char_review_assign_character ON character_review_assignments(character_id);
CREATE INDEX idx_char_review_assign_reviewer ON character_review_assignments(reviewer_user_id);
CREATE INDEX idx_char_review_assign_status ON character_review_assignments(status);
CREATE TRIGGER trg_character_review_assignments_updated_at
    BEFORE UPDATE ON character_review_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

CREATE INDEX idx_char_review_decisions_character ON character_review_decisions(character_id);
CREATE INDEX idx_char_review_decisions_assignment ON character_review_decisions(assignment_id);

-- Audit log
CREATE TABLE character_review_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    character_id        BIGINT NOT NULL REFERENCES characters(id),
    action              TEXT NOT NULL CHECK (action IN (
        'assigned', 'reassigned', 'review_started',
        'approved', 'rejected', 'rework_submitted', 're_queued'
    )),
    actor_user_id       BIGINT NOT NULL REFERENCES users(id),
    target_user_id      BIGINT REFERENCES users(id),
    comment             TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_char_review_audit_character ON character_review_audit_log(character_id);
CREATE INDEX idx_char_review_audit_actor ON character_review_audit_log(actor_user_id);
CREATE INDEX idx_char_review_audit_action ON character_review_audit_log(action);
CREATE INDEX idx_char_review_audit_created ON character_review_audit_log(created_at);
```

**Acceptance Criteria:**
- [x] Migration runs without errors on a clean database
- [x] `character_review_statuses` seeded with 7 statuses
- [x] `characters.review_status_id` defaults to 1 (unassigned)
- [x] All FK constraints, indexes, and triggers created
- [x] CHECK constraints enforce valid `status` and `decision` values

### Task 1.2: Add review_trigger_threshold to projects
**File:** `apps/db/migrations/20260308000002_add_review_trigger_threshold_to_projects.sql`

Add the per-project configurable threshold for auto-triggering review eligibility.

```sql
ALTER TABLE projects ADD COLUMN review_trigger_threshold SMALLINT;
-- NULL means auto-trigger disabled (manual-only workflow)
-- Value 0-100 represents readiness percentage threshold
```

**Acceptance Criteria:**
- [x] Migration runs without errors
- [x] Column is nullable (NULL = disabled)
- [x] Existing projects default to NULL (no auto-trigger)

---

## Phase 2: Backend Models — Rust Structs & DTOs

### Task 2.1: Create character review status model
**File:** `apps/backend/crates/db/src/models/character_review.rs`

Define the core models for the character review system. Follow the pattern from `batch_review.rs`.

```rust
use serde::{Deserialize, Serialize};
use x121_core::types::{DbId, Timestamp};

// -- Lookup --

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CharacterReviewStatus {
    pub id: i16,
    pub name: String,
    pub label: String,
}

// -- Assignment --

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CharacterReviewAssignment {
    pub id: DbId,
    pub character_id: DbId,
    pub reviewer_user_id: DbId,
    pub assigned_by: DbId,
    pub reassigned_from: Option<DbId>,
    pub review_round: i32,
    pub status: String,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub deadline: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Deserialize)]
pub struct CreateCharacterAssignment {
    pub character_ids: Vec<DbId>,
    pub reviewer_user_id: DbId,
    pub deadline: Option<Timestamp>,
}

#[derive(Debug, Deserialize)]
pub struct ReassignCharacterReview {
    pub new_reviewer_user_id: DbId,
}

// -- Decision --

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CharacterReviewDecision {
    pub id: DbId,
    pub assignment_id: DbId,
    pub character_id: DbId,
    pub reviewer_user_id: DbId,
    pub decision: String,
    pub comment: Option<String>,
    pub review_round: i32,
    pub review_duration_sec: Option<i32>,
    pub decided_at: Timestamp,
    pub created_at: Timestamp,
}

#[derive(Debug, Deserialize)]
pub struct ReviewDecisionRequest {
    pub decision: String,  // "approved" or "rejected"
    pub comment: Option<String>,
}

// -- Audit Log --

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CharacterReviewAuditEntry {
    pub id: DbId,
    pub character_id: DbId,
    pub action: String,
    pub actor_user_id: DbId,
    pub target_user_id: Option<DbId>,
    pub comment: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
}

// -- Reviewer Queue Item (joined view) --

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ReviewQueueCharacter {
    pub assignment_id: DbId,
    pub character_id: DbId,
    pub character_name: String,
    pub project_id: DbId,
    pub project_name: String,
    pub review_round: i32,
    pub scene_count: i64,
    pub assigned_at: Timestamp,
    pub deadline: Option<Timestamp>,
    pub status: String,
}

// -- Workload Summary --

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ReviewerWorkload {
    pub reviewer_user_id: DbId,
    pub reviewer_username: String,
    pub assigned_count: i64,
    pub in_review_count: i64,
    pub completed_count: i64,
    pub approved_count: i64,
    pub rejected_count: i64,
}

// -- Auto-Allocate --

#[derive(Debug, Deserialize)]
pub struct AutoAllocateRequest {
    pub exclude_reviewer_ids: Option<Vec<DbId>>,
}

#[derive(Debug, Serialize)]
pub struct AutoAllocatePreview {
    pub proposed_assignments: Vec<ProposedAssignment>,
    pub unassigned_count: i64,
    pub reviewer_count: i64,
}

#[derive(Debug, Serialize)]
pub struct ProposedAssignment {
    pub character_id: DbId,
    pub character_name: String,
    pub reviewer_user_id: DbId,
    pub reviewer_username: String,
}
```

**Acceptance Criteria:**
- [x] All structs derive `sqlx::FromRow` where needed for DB queries
- [x] All request DTOs derive `Deserialize`
- [x] All response types derive `Serialize`
- [x] Follows naming and import patterns from `batch_review.rs`

### Task 2.2: Register character review model in mod.rs
**File:** `apps/backend/crates/db/src/models/mod.rs`

Add `pub mod character_review;` to the models module.

**Acceptance Criteria:**
- [x] Module is publicly exported
- [x] `cargo check` passes

### Task 2.3: Add review_status_id to Character model
**File:** `apps/backend/crates/db/src/models/character.rs`

Add `review_status_id` field to the `Character` struct and update `CharacterWithAvatar` if it uses the same query.

**Acceptance Criteria:**
- [x] `review_status_id: i16` added to `Character` struct
- [x] Field added to `CharacterWithAvatar` if applicable
- [x] Column included in relevant SQL column constants
- [x] `cargo check` passes

### Task 2.4: Add review_trigger_threshold to Project model
**File:** `apps/backend/crates/db/src/models/project.rs`

Add `review_trigger_threshold: Option<i16>` to the `Project` struct.

**Acceptance Criteria:**
- [x] Field added to `Project` struct
- [x] Included in create/update DTOs if they exist
- [x] `cargo check` passes

---

## Phase 3: Backend Repositories — Data Access Layer

### Task 3.1: Create character review assignment repository
**File:** `apps/backend/crates/db/src/repositories/character_review_assignment_repo.rs`

Implement the data access layer for character review assignments. Follow the pattern from `batch_review_repo.rs`.

**Methods:**
- `create(pool, character_id, reviewer_user_id, assigned_by, review_round, deadline) -> Assignment`
- `find_active_by_character(pool, character_id) -> Option<Assignment>`
- `list_by_reviewer(pool, reviewer_user_id, pagination) -> Vec<ReviewQueueCharacter>` — joined query with characters + projects + scene count
- `list_by_project(pool, project_id, pagination) -> Vec<Assignment>`
- `start_review(pool, assignment_id) -> Assignment` — sets `started_at = now()`
- `complete(pool, assignment_id, status) -> Assignment` — sets `completed_at = now()`
- `reassign(pool, assignment_id) -> Assignment` — sets status = 'reassigned'
- `count_active_by_reviewer(pool, reviewer_user_id) -> i64` — for load balancing
- `reviewer_workload_summary(pool, project_id) -> Vec<ReviewerWorkload>` — aggregated stats per reviewer

**Acceptance Criteria:**
- [x] All methods use parameterized queries (no SQL injection)
- [x] `list_by_reviewer` joins characters, projects, counts scenes
- [x] `count_active_by_reviewer` only counts `status = 'active'` assignments
- [x] `reviewer_workload_summary` aggregates across all assignment statuses
- [x] `cargo check` passes

### Task 3.2: Create character review decision repository
**File:** `apps/backend/crates/db/src/repositories/character_review_decision_repo.rs`

**Methods:**
- `create(pool, assignment_id, character_id, reviewer_user_id, decision, comment, review_round, review_duration_sec) -> Decision`
- `list_by_character(pool, character_id) -> Vec<Decision>` — all decisions for a character (history)
- `latest_by_character(pool, character_id) -> Option<Decision>`

**Acceptance Criteria:**
- [x] Duration calculated by handler, passed as parameter
- [x] `list_by_character` ordered by `decided_at DESC`
- [x] `cargo check` passes

### Task 3.3: Create character review audit log repository
**File:** `apps/backend/crates/db/src/repositories/character_review_audit_repo.rs`

**Methods:**
- `log(pool, character_id, action, actor_user_id, target_user_id, comment, metadata) -> AuditEntry`
- `list_by_character(pool, character_id, pagination) -> Vec<AuditEntry>`
- `list_by_project(pool, project_id, pagination, filters) -> Vec<AuditEntry>` — filterable by reviewer, date range, action type
- `export_csv_rows(pool, project_id, filters) -> Vec<AuditEntry>` — unpaginated for CSV export

**Acceptance Criteria:**
- [x] `log` is a simple insert (append-only)
- [x] `list_by_project` supports optional filters: `reviewer_user_id`, `action`, `from_date`, `to_date`
- [x] `export_csv_rows` returns all matching rows without pagination
- [x] `cargo check` passes

### Task 3.4: Register repositories in mod.rs
**File:** `apps/backend/crates/db/src/repositories/mod.rs`

Add the three new repository modules.

**Acceptance Criteria:**
- [x] `pub mod character_review_assignment_repo;`
- [x] `pub mod character_review_decision_repo;`
- [x] `pub mod character_review_audit_repo;`
- [x] `cargo check` passes

### Task 3.5: Add unassigned character query to character_repo
**File:** `apps/backend/crates/db/src/repositories/character_repo.rs`

Add a method to list characters eligible for review allocation (status = `unassigned` or `re_queued`).

**Methods:**
- `list_unassigned_for_review(pool, project_id) -> Vec<Character>` — where `review_status_id IN (1, 7)` (unassigned, re_queued)

**Acceptance Criteria:**
- [x] Only returns characters with `review_status_id` = 1 (unassigned) or 7 (re_queued)
- [x] Only returns non-deleted characters
- [x] `cargo check` passes

---

## Phase 4: Backend Core — Allocation Engine

### Task 4.1: Implement round-robin allocation engine
**File:** `apps/backend/crates/core/src/review_allocation.rs`

Pure logic function (no DB deps) that takes reviewers with current workloads and unassigned characters, and returns proposed assignments using load-balanced round-robin.

```rust
pub struct ReviewerLoad {
    pub user_id: DbId,
    pub username: String,
    pub active_count: i64,
    pub last_assigned_at: Option<Timestamp>,
}

pub struct UnassignedCharacter {
    pub id: DbId,
    pub name: String,
}

pub struct ProposedAssignment {
    pub character_id: DbId,
    pub character_name: String,
    pub reviewer_user_id: DbId,
    pub reviewer_username: String,
}

/// Round-robin with load balancing.
/// Sorts reviewers by (active_count ASC, last_assigned_at ASC NULLS FIRST).
/// Assigns each character to the reviewer with the fewest active assignments,
/// incrementing their count after each assignment.
pub fn allocate_round_robin(
    reviewers: &mut [ReviewerLoad],
    characters: &[UnassignedCharacter],
) -> Vec<ProposedAssignment> { ... }
```

**Acceptance Criteria:**
- [x] Characters distributed evenly (max difference of 1 between any two reviewers)
- [x] Ties broken by `last_assigned_at` (least recently assigned wins, NULL = never assigned = highest priority)
- [x] Empty reviewer list returns empty assignments
- [x] Empty character list returns empty assignments
- [x] Single reviewer gets all characters
- [x] Unit tests cover all edge cases
- [x] `cargo check` passes

### Task 4.2: Register allocation engine in core mod
**File:** `apps/backend/crates/core/src/lib.rs` (or `mod.rs`)

Add `pub mod review_allocation;`

**Acceptance Criteria:**
- [x] Module exported
- [x] `cargo check` passes

---

## Phase 5: Backend API — Handlers & Routes

### Task 5.1: Create character review handler
**File:** `apps/backend/crates/api/src/handlers/character_review.rs`

Implement all handler functions. Each handler logs to the audit trail via the audit repo.

**Handlers:**

1. `assign_characters` — POST `/projects/{id}/review/assignments`
   - Admin only. Creates assignments for each character_id in the request.
   - Updates character `review_status_id` to `assigned` (2).
   - Logs `assigned` audit entry per character.

2. `auto_allocate_preview` — POST `/projects/{id}/review/auto-allocate?preview=true`
   - Admin only. Fetches unassigned characters + reviewer workloads.
   - Calls `allocate_round_robin` from core. Returns `AutoAllocatePreview`.

3. `auto_allocate_confirm` — POST `/projects/{id}/review/auto-allocate`
   - Admin only. Executes the allocation (creates assignments, updates statuses).
   - Logs `assigned` audit entry per character.

4. `list_assignments` — GET `/projects/{id}/review/assignments`
   - Admin only. Paginated list of all assignments for the project.

5. `reassign` — PATCH `/projects/{id}/review/assignments/{assignment_id}`
   - Admin only. Closes old assignment (status=reassigned), creates new one with `reassigned_from`.
   - Logs `reassigned` audit entry.

6. `get_workload` — GET `/projects/{id}/review/workload`
   - Admin only. Returns `Vec<ReviewerWorkload>`.

7. `my_queue` — GET `/review/my-queue`
   - Any authenticated user. Returns `Vec<ReviewQueueCharacter>` for the current user.

8. `start_review` — POST `/review/assignments/{assignment_id}/start`
   - Reviewer only (must be the assigned reviewer). Sets `started_at`, updates character status to `in_review` (3).
   - Logs `review_started` audit entry.

9. `submit_decision` — POST `/review/assignments/{assignment_id}/decide`
   - Reviewer only. Creates decision record. Calculates duration from `started_at`.
   - On approve: character status → `approved` (4), assignment status → `completed`.
   - On reject: character status → `rejected` (5), assignment status → `completed`.
   - Logs `approved` or `rejected` audit entry.

10. `submit_for_rereview` — POST `/characters/{id}/submit-for-rereview`
    - Creator/admin. Moves character from `rework` to `re_queued` (7).
    - Auto-creates new assignment for the same reviewer who rejected (bumps `review_round`).
    - Logs `rework_submitted` then `re_queued` then `assigned` audit entries.

11. `get_review_history` — GET `/characters/{id}/review-history`
    - Any authenticated user. Returns paginated audit log for a character.

12. `get_project_audit_log` — GET `/projects/{id}/review/audit-log`
    - Admin only. Paginated, filterable audit log for the project.

13. `export_audit_log` — GET `/projects/{id}/review/audit-log/export`
    - Admin only. Returns CSV file download of audit log.

**Acceptance Criteria:**
- [x] All admin-only endpoints check `auth.role == "admin"`
- [x] Reviewer endpoints validate the authenticated user matches the assigned reviewer
- [x] Every state-changing action writes to the audit log
- [x] Status transitions are validated (e.g., can't approve a character that isn't `in_review`)
- [x] CSV export sets `Content-Type: text/csv` and `Content-Disposition: attachment`
- [x] `cargo check` passes

### Task 5.2: Create character review routes
**File:** `apps/backend/crates/api/src/routes/character_review.rs`

Mount all character review endpoints.

```rust
use axum::{routing::{get, post, patch}, Router};
use crate::handlers::character_review;

/// Routes mounted under /api/v1/projects/:project_id/review
pub fn project_review_routes() -> Router<AppState> {
    Router::new()
        .route("/assignments", post(character_review::assign_characters))
        .route("/assignments", get(character_review::list_assignments))
        .route("/assignments/:assignment_id", patch(character_review::reassign))
        .route("/auto-allocate", post(character_review::auto_allocate))
        .route("/workload", get(character_review::get_workload))
        .route("/audit-log", get(character_review::get_project_audit_log))
        .route("/audit-log/export", get(character_review::export_audit_log))
}

/// Routes mounted under /api/v1/review
pub fn reviewer_routes() -> Router<AppState> {
    Router::new()
        .route("/my-queue", get(character_review::my_queue))
        .route("/assignments/:assignment_id/start", post(character_review::start_review))
        .route("/assignments/:assignment_id/decide", post(character_review::submit_decision))
}
```

**Acceptance Criteria:**
- [x] Project-scoped routes nested under `/api/v1/projects/{id}/review`
- [x] Global review routes at `/api/v1/review`
- [x] Character-scoped routes: `/api/v1/characters/{id}/submit-for-rereview` and `/api/v1/characters/{id}/review-history`
- [x] All routes require authentication middleware
- [x] `cargo check` passes

### Task 5.3: Register handler and routes in mod.rs
**Files:** `apps/backend/crates/api/src/handlers/mod.rs`, `apps/backend/crates/api/src/routes/mod.rs`, `apps/backend/crates/api/src/router.rs`

Add `pub mod character_review;` to both handlers and routes mod files. Mount the route groups in the main router.

**Acceptance Criteria:**
- [x] Handler module registered
- [x] Route module registered
- [x] Routes mounted in the main router at correct paths
- [x] `cargo check` passes

---

## Phase 6: Frontend — Types, Hooks & API Layer

### Task 6.1: Define TypeScript types for character review
**File:** `apps/frontend/src/features/character-review/types.ts`

```typescript
export type CharacterReviewStatus =
  | "unassigned" | "assigned" | "in_review"
  | "approved" | "rejected" | "rework" | "re_queued";

export interface CharacterReviewAssignment {
  id: number;
  character_id: number;
  reviewer_user_id: number;
  assigned_by: number;
  reassigned_from: number | null;
  review_round: number;
  status: "active" | "completed" | "reassigned";
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewQueueCharacter {
  assignment_id: number;
  character_id: number;
  character_name: string;
  project_id: number;
  project_name: string;
  review_round: number;
  scene_count: number;
  assigned_at: string;
  deadline: string | null;
  status: string;
}

export interface ReviewerWorkload {
  reviewer_user_id: number;
  reviewer_username: string;
  assigned_count: number;
  in_review_count: number;
  completed_count: number;
  approved_count: number;
  rejected_count: number;
}

export interface CharacterReviewDecision {
  id: number;
  assignment_id: number;
  character_id: number;
  reviewer_user_id: number;
  decision: "approved" | "rejected";
  comment: string | null;
  review_round: number;
  review_duration_sec: number | null;
  decided_at: string;
}

export interface ReviewAuditEntry {
  id: number;
  character_id: number;
  action: string;
  actor_user_id: number;
  target_user_id: number | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AutoAllocatePreview {
  proposed_assignments: ProposedAssignment[];
  unassigned_count: number;
  reviewer_count: number;
}

export interface ProposedAssignment {
  character_id: number;
  character_name: string;
  reviewer_user_id: number;
  reviewer_username: string;
}

export interface CreateAssignmentRequest {
  character_ids: number[];
  reviewer_user_id: number;
  deadline?: string;
}

export interface ReviewDecisionRequest {
  decision: "approved" | "rejected";
  comment?: string;
}

export interface AutoAllocateRequest {
  exclude_reviewer_ids?: number[];
}

export interface AuditLogFilters {
  reviewer_user_id?: number;
  action?: string;
  from_date?: string;
  to_date?: string;
}
```

**Acceptance Criteria:**
- [x] All types match the backend Rust structs
- [x] Named exports only (no `export default`)
- [x] `npx tsc --noEmit` passes

### Task 6.2: Create TanStack Query hooks for character review
**File:** `apps/frontend/src/features/character-review/hooks/use-character-review.ts`

Implement all data fetching and mutation hooks.

**Hooks:**
- `useMyReviewQueue()` — GET `/review/my-queue`
- `useProjectAssignments(projectId)` — GET `/projects/{id}/review/assignments`
- `useReviewerWorkload(projectId)` — GET `/projects/{id}/review/workload`
- `useCharacterReviewHistory(characterId)` — GET `/characters/{id}/review-history`
- `useProjectAuditLog(projectId, filters)` — GET `/projects/{id}/review/audit-log`
- `useAssignCharacters(projectId)` — POST mutation
- `useAutoAllocate(projectId)` — POST mutation (supports `?preview=true` query param)
- `useReassign(projectId)` — PATCH mutation
- `useStartReview()` — POST mutation
- `useSubmitDecision()` — POST mutation
- `useSubmitForRereview()` — POST mutation
- `useExportAuditLog(projectId)` — triggers CSV download

**Acceptance Criteria:**
- [x] All queries use appropriate query keys: `['character-review', ...]`
- [x] Mutations invalidate relevant query keys on success
- [x] `useExportAuditLog` triggers file download via blob URL
- [x] `npx tsc --noEmit` passes

### Task 6.3: Create feature module index
**File:** `apps/frontend/src/features/character-review/index.ts`

Export all public types and hooks.

**Acceptance Criteria:**
- [x] Re-exports types and hooks
- [x] `npx tsc --noEmit` passes

---

## Phase 7: Frontend — Reviewer Queue & Review Controls

### Task 7.1: Create ReviewStatusBadge component
**File:** `apps/frontend/src/features/character-review/ReviewStatusBadge.tsx`

A badge component that maps character review status to colour-coded display. Reuses the existing `Badge` primitive.

**Status → Variant Mapping:**
- `unassigned` → `"default"` (grey)
- `assigned` → `"info"` (blue)
- `in_review` → `"warning"` (yellow)
- `approved` → `"success"` (green)
- `rejected` → `"danger"` (red)
- `rework` → `"warning"` (orange)
- `re_queued` → `"info"` (blue)

**Acceptance Criteria:**
- [x] Renders `<Badge>` with correct variant and label text
- [x] Accepts `size` prop (passes through to Badge)
- [x] Named export, no default export
- [x] `npx tsc --noEmit` passes

### Task 7.2: Create MyReviewsPage
**File:** `apps/frontend/src/features/character-review/MyReviewsPage.tsx`

Standalone page showing the current reviewer's assigned characters as a queue.

**Features:**
- Uses `useMyReviewQueue()` hook
- Renders a table/card list of assigned characters
- Each row shows: character name, project name, scene count, review round, assignment date, deadline, status
- Sort controls: assignment date, character name, project
- Filter by project, status (assigned, in_review)
- Click navigates to character detail page
- Empty state when no assignments

**Acceptance Criteria:**
- [x] Fetches and displays the reviewer's queue
- [x] Sort and filter controls work
- [x] Clicking a character navigates to the character detail page
- [x] Loading and empty states handled
- [x] `npx tsc --noEmit` passes

### Task 7.3: Create CharacterReviewControls component
**File:** `apps/frontend/src/features/character-review/CharacterReviewControls.tsx`

Approve/Reject controls displayed on the character detail page. Only visible to the assigned reviewer and admins.

**Features:**
- Sticky footer bar (similar to `ClipQAActions` pattern)
- "Start Review" button (if status = `assigned`, transitions to `in_review`)
- "Approve" button (green) — optional comment modal
- "Reject" button (red) — required comment modal
- "Submit for Re-review" button (visible to creators when status = `rework`)
- Shows current review status badge
- Shows rejection comment when status = `rejected` or `rework`

**Acceptance Criteria:**
- [x] Only renders when user is the assigned reviewer or an admin
- [x] "Start Review" calls `useStartReview` mutation
- [x] "Approve"/"Reject" opens a modal with comment field (required for reject)
- [x] "Submit for Re-review" visible only for creators when status = `rework`
- [x] Correct status transitions reflected in UI after mutation
- [x] `npx tsc --noEmit` passes

### Task 7.4: Integrate review status into CharacterDetailPage
**File:** `apps/frontend/src/features/characters/CharacterDetailPage.tsx`

Add the `ReviewStatusBadge` to the character header and render `CharacterReviewControls` as a sticky footer. Add a "Review History" tab showing the audit log.

**Acceptance Criteria:**
- [x] Review status badge visible next to character name
- [x] `CharacterReviewControls` rendered as sticky footer
- [x] "Review History" tab shows `CharacterReviewAuditLog` component
- [x] `npx tsc --noEmit` passes

### Task 7.5: Create CharacterReviewAuditLog component
**File:** `apps/frontend/src/features/character-review/CharacterReviewAuditLog.tsx`

Timeline/activity-feed component showing all audit entries for a character.

**Features:**
- Uses `useCharacterReviewHistory(characterId)` hook
- Each entry shows: icon per action type, actor name, action description, timestamp, comment (if any)
- Duration info displayed for approve/reject actions

**Acceptance Criteria:**
- [x] Renders a vertical timeline with icons per action type
- [x] Shows actor username and relative timestamp
- [x] Comments displayed inline
- [x] Loading and empty states handled
- [x] `npx tsc --noEmit` passes

---

## Phase 8: Frontend — Assignment Dashboard

### Task 8.1: Create AssignmentDashboard component
**File:** `apps/frontend/src/features/character-review/AssignmentDashboard.tsx`

Admin-only dashboard showing reviewer workload and assignment management.

**Features:**
- Reviewer workload summary cards (assigned, in-review, completed, approval rate per reviewer)
- Horizontal bar chart showing assignment distribution
- Unassigned characters pool with count
- Character assignment table: character name, assigned reviewer, status, review round
- Quick-assign: select characters + reviewer from dropdown, click assign
- "Auto-Allocate" button with preview modal

**Acceptance Criteria:**
- [x] Uses `useReviewerWorkload(projectId)` and `useProjectAssignments(projectId)` hooks
- [x] Workload bar chart renders correctly
- [x] Quick-assign creates assignments via `useAssignCharacters` mutation
- [x] Auto-allocate preview shows proposed assignments before confirming
- [x] Admin-only (checks user role)
- [x] `npx tsc --noEmit` passes

### Task 8.2: Create AutoAllocatePreviewModal component
**File:** `apps/frontend/src/features/character-review/AutoAllocatePreviewModal.tsx`

Modal that shows proposed round-robin assignments before the admin confirms.

**Features:**
- Fetches preview via `useAutoAllocate` with `preview=true`
- Shows table: character → proposed reviewer
- Checkbox to exclude specific reviewers
- "Confirm" button executes the allocation
- "Cancel" dismisses

**Acceptance Criteria:**
- [x] Displays proposed assignments clearly
- [x] Reviewer exclusion works
- [x] Confirm triggers actual allocation and invalidates queries
- [x] Uses `Modal` composite component
- [x] `npx tsc --noEmit` passes

### Task 8.3: Create ProjectAuditLogPanel component
**File:** `apps/frontend/src/features/character-review/ProjectAuditLogPanel.tsx`

Project-wide audit log view with filters and CSV export.

**Features:**
- Uses `useProjectAuditLog(projectId, filters)` hook
- Filter controls: reviewer dropdown, action type dropdown, date range picker
- Timeline view of audit entries
- "Export CSV" button triggers download

**Acceptance Criteria:**
- [x] Filters update query params and refetch data
- [x] CSV export downloads file with correct name
- [x] Paginated with load-more or pagination controls
- [x] `npx tsc --noEmit` passes

---

## Phase 9: Frontend — Routing & Navigation

### Task 9.1: Add "My Reviews" route and navigation entry
**Files:** `apps/frontend/src/app/router.tsx`, `apps/frontend/src/app/navigation.ts`

Add "My Reviews" as a standalone page under the review layout route. Add navigation entry visible to `reviewer` and `admin` roles.

**Acceptance Criteria:**
- [x] Route `/review/my-reviews` lazy-loads `MyReviewsPage`
- [x] Navigation entry added to the Review group with appropriate icon
- [x] Visible to users with `reviewer` or `admin` role
- [x] `npx tsc --noEmit` passes

### Task 9.2: Add assignment dashboard route
**Files:** `apps/frontend/src/app/router.tsx`, `apps/frontend/src/app/navigation.ts`

Add the assignment dashboard as a project-level route for admins.

**Acceptance Criteria:**
- [x] Route `/projects/{id}/review/assignments` lazy-loads `AssignmentDashboard`
- [x] Page wrapper extracts `projectId` from URL params
- [x] Only accessible to admin role
- [x] `npx tsc --noEmit` passes

### Task 9.3: Create page wrappers
**Files:** `apps/frontend/src/app/pages/MyReviewsPage.tsx`, `apps/frontend/src/app/pages/AssignmentDashboardPage.tsx`

Create thin page wrappers that extract URL params and render feature components.

**Acceptance Criteria:**
- [x] `MyReviewsPage` wrapper renders the feature component (no params needed)
- [x] `AssignmentDashboardPage` extracts `projectId` from URL params and passes as prop
- [x] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260308000001_create_character_review_tables.sql` | Migration for review status lookup, assignments, decisions, audit log |
| `apps/db/migrations/20260308000002_add_review_trigger_threshold_to_projects.sql` | Add threshold column to projects |
| `apps/backend/crates/db/src/models/character_review.rs` | Rust models and DTOs |
| `apps/backend/crates/db/src/models/character.rs` | Add `review_status_id` field |
| `apps/backend/crates/db/src/models/project.rs` | Add `review_trigger_threshold` field |
| `apps/backend/crates/db/src/repositories/character_review_assignment_repo.rs` | Assignment CRUD + workload queries |
| `apps/backend/crates/db/src/repositories/character_review_decision_repo.rs` | Decision CRUD |
| `apps/backend/crates/db/src/repositories/character_review_audit_repo.rs` | Audit log CRUD + CSV export |
| `apps/backend/crates/db/src/repositories/character_repo.rs` | Add `list_unassigned_for_review` |
| `apps/backend/crates/core/src/review_allocation.rs` | Round-robin allocation engine |
| `apps/backend/crates/api/src/handlers/character_review.rs` | 13 handler functions |
| `apps/backend/crates/api/src/routes/character_review.rs` | Route definitions |
| `apps/frontend/src/features/character-review/types.ts` | TypeScript interfaces |
| `apps/frontend/src/features/character-review/hooks/use-character-review.ts` | TanStack Query hooks |
| `apps/frontend/src/features/character-review/ReviewStatusBadge.tsx` | Status badge component |
| `apps/frontend/src/features/character-review/MyReviewsPage.tsx` | Reviewer queue page |
| `apps/frontend/src/features/character-review/CharacterReviewControls.tsx` | Approve/reject controls |
| `apps/frontend/src/features/character-review/CharacterReviewAuditLog.tsx` | Audit timeline component |
| `apps/frontend/src/features/character-review/AssignmentDashboard.tsx` | Admin dashboard |
| `apps/frontend/src/features/character-review/AutoAllocatePreviewModal.tsx` | Allocation preview modal |
| `apps/frontend/src/features/character-review/ProjectAuditLogPanel.tsx` | Project audit log |
| `apps/frontend/src/app/pages/MyReviewsPage.tsx` | Page wrapper |
| `apps/frontend/src/app/pages/AssignmentDashboardPage.tsx` | Page wrapper |
| `apps/frontend/src/app/router.tsx` | Route registration |
| `apps/frontend/src/app/navigation.ts` | Navigation entries |
| `apps/frontend/src/features/characters/CharacterDetailPage.tsx` | Integration point for review controls |

---

## Dependencies

### Existing Components to Reuse
- `Badge` from `@/components/primitives` — for `ReviewStatusBadge`
- `Modal` from `@/components/composite` — for auto-allocate preview and decision modals
- `StatusBadge` from `@/components/domain` — pattern reference
- `ClipQAActions` from `@/features/scenes` — pattern for approve/reject UI
- `PaginationParams` from `crate::query` — backend pagination
- `AuthUser` from `crate::middleware::auth` — role checking
- `BatchReviewRepo` patterns — schema and query patterns
- `ReviewAssignment` / `ReviewSession` — model patterns

### New Infrastructure Needed
- `character-review` feature module (frontend)
- `review_allocation` module in `core` crate (backend)
- 3 new repository files (backend)
- 1 handler + 1 routes file (backend)
- 2 database migrations

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database — Tasks 1.1-1.2
2. Phase 2: Backend Models — Tasks 2.1-2.4
3. Phase 3: Backend Repositories — Tasks 3.1-3.5
4. Phase 4: Backend Core — Tasks 4.1-4.2
5. Phase 5: Backend API — Tasks 5.1-5.3
6. Phase 6: Frontend Types & Hooks — Tasks 6.1-6.3
7. Phase 7: Frontend Reviewer Queue & Controls — Tasks 7.1-7.5
8. Phase 8: Frontend Assignment Dashboard — Tasks 8.1-8.3
9. Phase 9: Frontend Routing — Tasks 9.1-9.3

**MVP Success Criteria:**
- Admin can manually assign characters to reviewers
- Admin can auto-allocate via round-robin with load balancing
- Reviewers see their queue and can approve/reject characters
- Rejected characters flow through rework and re-queue to same reviewer
- Full audit log captures every action with timestamps and durations

### Post-MVP Enhancements
- SLA & deadline management with escalation notifications
- Review performance analytics dashboard
- Skill-based allocation matching
- Configurable review checklists

---

## Notes

1. **Migration ordering**: Run Task 1.1 before Task 1.2. Both must complete before any backend model work.
2. **Core crate isolation**: The allocation engine (Task 4.1) has zero dependencies — it's pure logic with unit tests. Can be developed in parallel with repositories.
3. **Auto-allocate has two modes**: `?preview=true` returns proposed assignments without executing; without the flag it executes. The handler checks the query param.
4. **CSV export**: Use `axum::response::Response` with manual headers rather than `Json` wrapper for the export endpoint.
5. **Re-queue auto-assignment**: When a creator submits for re-review (Task 5.1, handler 10), the handler must look up the most recent completed assignment to find the previous reviewer and create a new assignment for them.

---

## Version History

- **v1.0** (2026-03-08): Initial task list creation from PRD-129
