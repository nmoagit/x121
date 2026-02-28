# Task List: Project Lifecycle & Archival

**PRD Reference:** `design/prds/072-prd-project-lifecycle-archival.md`
**Scope:** Implement formal project lifecycle states (Setup, Active, Delivered, Archived, Closed) with enforced transition rules, completion checklists, auto-generated summary reports, bulk archival, and edit locks on completed projects.

## Overview

Without lifecycle management, old projects accumulate indefinitely, consuming disk and cluttering search results. This PRD introduces a state machine for projects that enforces transition rules (e.g., cannot mark "Delivered" until all scenes are approved), generates summary reports on delivery, supports bulk archival to cold storage, and locks completed projects from accidental edits. The lifecycle states integrate with PRD-39 delivery validation, PRD-45 audit logging, and PRD-48 tiered storage.

### What Already Exists
- PRD-01 project data model with `project_statuses` lookup table
- PRD-39 Scene Assembler for delivery validation
- PRD-45 Audit Logging for transition tracking
- PRD-48 Tiered Storage for archival

### What We're Building
1. Lifecycle state columns on the projects table
2. State transition validation engine (Rust state machine)
3. Completion checklist evaluator with gate conditions
4. Auto-generated project summary report service
5. Bulk archival scheduler
6. Edit lock enforcement middleware
7. React UI for lifecycle management, transitions, and reports

### Key Design Decisions
1. **State machine in Rust** -- Transitions are validated by a typed state machine that rejects invalid transitions at compile time where possible, runtime otherwise.
2. **Completion checklist is computed, not stored** -- The checklist evaluates live data (scene statuses, metadata completeness) rather than storing checkbox state.
3. **Edit lock via middleware** -- API middleware checks project lifecycle state and rejects write operations on locked projects.
4. **Summary reports as JSON** -- Stored as JSONB for flexibility, with PDF/JSON export on demand.

---

## Phase 1: Database Schema

### Task 1.1: Lifecycle State Seed Data
**File:** `migrations/YYYYMMDDHHMMSS_seed_project_lifecycle_statuses.sql`

Add lifecycle-specific statuses to the existing `project_statuses` table if not already present.

```sql
INSERT INTO project_statuses (name, description) VALUES
    ('setup', 'Project created, characters being onboarded, no generation started')
ON CONFLICT (name) DO NOTHING;

INSERT INTO project_statuses (name, description) VALUES
    ('delivered', 'All scenes approved and delivery ZIP exported; locked from new generation')
ON CONFLICT (name) DO NOTHING;

INSERT INTO project_statuses (name, description) VALUES
    ('closed', 'Permanently concluded; supporting files eligible for reclamation')
ON CONFLICT (name) DO NOTHING;
```

**Acceptance Criteria:**
- [x] All five states exist in `project_statuses`: setup, active, delivered, archived, closed
- [x] Idempotent: safe to run if some statuses already exist
- [x] Each status has a human-readable description

### Task 1.2: Lifecycle Columns on Projects Table
**File:** `migrations/YYYYMMDDHHMMSS_add_lifecycle_columns_to_projects.sql`

```sql
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS lifecycle_transitioned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lifecycle_transitioned_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS is_edit_locked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_projects_lifecycle_transitioned_by ON projects(lifecycle_transitioned_by);
```

**Acceptance Criteria:**
- [x] Transition timestamp and actor tracked on the projects table
- [x] `is_edit_locked` flag for quick middleware checks
- [x] FK on `lifecycle_transitioned_by` with index

### Task 1.3: Project Summaries Table
**File:** `migrations/YYYYMMDDHHMMSS_create_project_summaries.sql`

```sql
CREATE TABLE project_summaries (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    report_json JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_summaries_project_id ON project_summaries(project_id);
CREATE INDEX idx_project_summaries_generated_by ON project_summaries(generated_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_summaries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [x] Summary stored as JSONB for flexible content
- [x] Linked to project via FK with CASCADE delete
- [x] `generated_at` captures when the report was auto-generated

---

## Phase 2: Rust Backend -- Lifecycle State Machine

### Task 2.1: Lifecycle State Machine
**File:** `src/services/project_lifecycle.rs`

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LifecycleState {
    Setup,
    Active,
    Delivered,
    Archived,
    Closed,
}

impl LifecycleState {
    pub fn valid_transitions(&self) -> &[LifecycleState] {
        match self {
            Self::Setup => &[Self::Active],
            Self::Active => &[Self::Delivered],
            Self::Delivered => &[Self::Active, Self::Archived],
            Self::Archived => &[Self::Active, Self::Closed],
            Self::Closed => &[],  // terminal state
        }
    }

    pub fn can_transition_to(&self, target: LifecycleState) -> bool {
        self.valid_transitions().contains(&target)
    }
}
```

**Acceptance Criteria:**
- [x] State enum maps to `project_statuses` lookup table names
- [x] `valid_transitions` defines allowed state transitions
- [x] Delivered and Archived can re-open to Active
- [x] Closed is terminal -- no transitions out
- [x] `transition` function validates and returns error for invalid transitions

### Task 2.2: Completion Checklist Evaluator
**File:** `src/services/completion_checklist.rs`

Evaluate gate conditions for the Active -> Delivered transition.

```rust
pub struct ChecklistResult {
    pub passed: bool,
    pub items: Vec<ChecklistItem>,
}

pub struct ChecklistItem {
    pub name: String,
    pub description: String,
    pub passed: bool,
    pub blocking: bool,
    pub details: Option<String>,
}
```

**Acceptance Criteria:**
- [x] Checks: all scenes approved, metadata complete, delivery validation passed (PRD-39)
- [x] Returns structured result with per-item pass/fail
- [x] Blocking items prevent transition; non-blocking items are warnings
- [x] Admin override available with audit log entry (PRD-45)

### Task 2.3: Project Summary Report Generator
**File:** `src/services/summary_report.rs`

Auto-generate a delivery report when transitioning to Delivered state.

```rust
pub struct ProjectSummaryReport {
    pub total_characters: i32,
    pub total_scenes: i32,
    pub gpu_hours_consumed: f64,
    pub wall_clock_days: f64,
    pub qa_pass_rate: f64,
    pub regeneration_count: i32,
    pub generation_breakdown: serde_json::Value,
}
```

**Acceptance Criteria:**
- [x] Generated automatically on transition to Delivered
- [x] Includes: total characters, scenes produced, GPU hours, wall-clock time, QA pass rates, re-generation counts
- [x] Stored in `project_summaries` table as JSONB
- [x] Exportable as PDF/JSON via separate endpoint

### Task 2.4: Edit Lock Middleware
**File:** `src/middleware/edit_lock.rs`

Axum middleware that rejects write operations on locked projects.

```rust
pub async fn enforce_edit_lock(
    State(pool): State<PgPool>,
    req: Request,
    next: Next,
) -> Response {
    // Extract project_id from request path
    // Check is_edit_locked on the project
    // If locked, return 403 with message
    // Otherwise, proceed to handler
}
```

**Acceptance Criteria:**
- [x] Intercepts POST/PUT/PATCH/DELETE on project-scoped routes
- [x] Returns 403 Forbidden with "Project is in {state} state and cannot be modified"
- [x] Does not block read operations (GET)
- [x] Does not block the explicit "re-open" transition endpoint

### Task 2.5: Bulk Archival Service
**File:** `src/services/bulk_archival.rs`

Archive multiple delivered projects at once.

**Acceptance Criteria:**
- [x] Select multiple Delivered projects for archival
- [x] Schedule archival: "Archive all Delivered projects older than N days"
- [x] Archival moves binary assets to cold storage (PRD-48 integration point)
- [x] Metadata remains searchable
- [x] Progress tracking for multi-project archival

---

## Phase 3: API Endpoints

### Task 3.1: Lifecycle Transition Route
**File:** `src/routes/project_lifecycle.rs`

```
POST /projects/:id/transition/:state
```

**Acceptance Criteria:**
- [x] Validates transition is allowed from current state
- [x] Runs completion checklist for Active -> Delivered
- [x] Auto-generates summary report on Delivered transition
- [x] Sets/clears edit lock based on new state
- [x] Logs transition in audit trail (PRD-45)
- [x] Returns updated project with new state

### Task 3.2: Completion Checklist Route
**File:** `src/routes/project_lifecycle.rs`

```
GET /projects/:id/completion-checklist
```

**Acceptance Criteria:**
- [x] Returns structured checklist with pass/fail per item
- [x] Includes details for failed items (e.g., "Scene 'intro' is not approved")
- [x] Available regardless of current state (informational)

### Task 3.3: Summary Report Routes
**File:** `src/routes/project_lifecycle.rs`

```
GET /projects/:id/summary-report       -- Get latest summary
GET /projects/:id/summary-report/pdf   -- Download as PDF
GET /projects/:id/summary-report/json  -- Download as JSON
```

**Acceptance Criteria:**
- [x] Returns latest summary report for project
- [x] PDF export with formatted layout
- [x] JSON export for programmatic consumption
- [x] 404 if no summary report exists (project not yet delivered)

### Task 3.4: Bulk Archival Route
**File:** `src/routes/project_lifecycle.rs`

```
POST /projects/bulk-archive
```

**Acceptance Criteria:**
- [x] Accepts list of project IDs or schedule rule (e.g., "delivered older than 90 days")
- [x] Returns job ID for progress tracking
- [x] Validates all projects are in Delivered state

---

## Phase 4: React Frontend

### Task 4.1: Lifecycle State Display
**File:** `frontend/src/components/project/LifecycleState.tsx`

Prominent lifecycle state indicator on the project header.

**Acceptance Criteria:**
- [x] State badge with color coding (Setup=blue, Active=green, Delivered=purple, Archived=grey, Closed=dark grey)
- [x] Transition buttons for valid next states
- [x] Confirmation dialog for irreversible transitions (Archive, Close)
- [x] "Re-open" action for Delivered/Archived projects

### Task 4.2: Completion Checklist Panel
**File:** `frontend/src/components/project/CompletionChecklist.tsx`

**Acceptance Criteria:**
- [x] Checklist items with green/red indicators
- [x] Failed items link to the entity that needs attention
- [x] "Override & Deliver" button for Admin (with confirmation)
- [x] Auto-refreshes when user navigates back from fixing an item

### Task 4.3: Summary Report View
**File:** `frontend/src/components/project/SummaryReport.tsx`

**Acceptance Criteria:**
- [x] Formatted display of report data with charts
- [x] Export buttons for PDF and JSON
- [x] Shows generation breakdown by scene type
- [x] Displays QA metrics and re-generation statistics

### Task 4.4: Bulk Archival Panel
**File:** `frontend/src/pages/BulkArchival.tsx`

**Acceptance Criteria:**
- [x] List of delivered projects eligible for archival
- [x] Multi-select with "Select All" option
- [x] Schedule configuration: "Archive projects delivered more than N days ago"
- [x] Progress display during bulk archival

---

## Phase 5: Testing

### Task 5.1: State Machine Tests
**File:** `tests/project_lifecycle_test.rs`

**Acceptance Criteria:**
- [x] Test all valid transitions succeed
- [x] Test all invalid transitions are rejected
- [x] Test Closed is terminal (no transitions out)
- [x] Test edit lock is set on Delivered/Archived, cleared on Active

### Task 5.2: Completion Checklist Tests
**File:** `tests/completion_checklist_test.rs`

**Acceptance Criteria:**
- [x] Test checklist blocks when scenes are unapproved
- [x] Test checklist blocks when metadata is incomplete
- [x] Test checklist passes when all conditions met
- [x] Test Admin override bypasses blocking items

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_seed_project_lifecycle_statuses.sql` | Lifecycle status seed data |
| `migrations/YYYYMMDDHHMMSS_add_lifecycle_columns_to_projects.sql` | Lifecycle columns on projects |
| `migrations/YYYYMMDDHHMMSS_create_project_summaries.sql` | Summary report storage |
| `src/services/project_lifecycle.rs` | State machine and transition logic |
| `src/services/completion_checklist.rs` | Gate condition evaluator |
| `src/services/summary_report.rs` | Auto-generated delivery report |
| `src/services/bulk_archival.rs` | Multi-project archival |
| `src/middleware/edit_lock.rs` | Write operation lock middleware |
| `src/routes/project_lifecycle.rs` | Lifecycle API endpoints |
| `frontend/src/components/project/LifecycleState.tsx` | State display and transitions |
| `frontend/src/components/project/CompletionChecklist.tsx` | Checklist UI |
| `frontend/src/components/project/SummaryReport.tsx` | Report display and export |
| `frontend/src/pages/BulkArchival.tsx` | Bulk archival management |

## Dependencies

### Upstream PRDs
- PRD-01: Project data model and structure
- PRD-15: Disk Reclamation for closed project files
- PRD-39: Scene Assembler for delivery validation
- PRD-45: Audit Logging for transition tracking
- PRD-48: Tiered Storage for archival

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Completion checklist correctly blocks incomplete projects from Delivered
- Edit lock prevents 100% of accidental modifications to completed projects
- Summary reports generate in <30 seconds per project
- Bulk archival correctly moves assets to cold storage

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Lifecycle automation: auto-transition and auto-archive (PRD Requirement 2.1)

## Notes

1. **Re-open creates audit trail** -- Every re-open from Delivered/Archived back to Active is logged in PRD-45 with the user and reason.
2. **Archived projects searchable** -- Archival moves binary assets to cold storage but keeps metadata in the main database for search.
3. **PDF generation** -- Use a Rust PDF library (e.g., `printpdf` or `genpdf`) for server-side PDF rendering of summary reports.
4. **Paused state** -- The open question about a "Paused" state is deferred. If needed, it can be added as a transition from Active with resume to Active.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-072
