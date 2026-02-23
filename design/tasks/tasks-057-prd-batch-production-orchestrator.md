# Task List: Batch Production Orchestrator

**PRD Reference:** `design/prds/057-prd-batch-production-orchestrator.md`
**Scope:** Mission control for production runs: generate the full job matrix (N characters x M scene types x K variants), dependency-aware pipeline sequencing, single-screen matrix overview, selective submission, progress dashboard, and one-click delivery.

## Overview

This is the primary workspace for managing production runs at scale. Individual PRDs handle each pipeline stage, but the batch orchestrator coordinates the full end-to-end flow across characters, scene types, and variants. The matrix view (characters as rows, scene types as columns) provides a single-screen overview of a complex parallel pipeline, with dependency awareness (variants must be approved before scene generation), selective submission, aggregate progress tracking, and one-click delivery when everything is approved.

### What Already Exists
- PRD-001: Data model, PRD-008: Queue management, PRD-010: Event bus
- PRD-021: Source images, PRD-023: Scene types, PRD-024: Generation loop
- PRD-035: Approval flow, PRD-039: Scene assembler, PRD-042: Studio pulse
- PRD-046: Worker pool management

### What We're Building
1. `production_runs` table for tracking batch runs
2. Matrix state manager computing status per cell
3. Dependency resolver ensuring correct pipeline sequencing
4. Batch submission coordinator
5. Matrix visualization component
6. One-click delivery trigger

### Key Design Decisions
1. **Matrix as primary view** — Characters x Scene Types x Variants grid is the producer's command center.
2. **Dependency-driven sequencing** — Source QA -> variant generation -> variant approval -> scene generation. The system enforces this order automatically.
3. **Cell-level granularity** — Submit, re-submit, or skip individual cells in the matrix.
4. **Real-time updates** — WebSocket-driven status changes appear within seconds.

---

## Phase 1: Database Schema

### Task 1.1: Production Runs Table
**File:** `migrations/YYYYMMDD_create_production_runs.sql`

```sql
CREATE TABLE production_runs (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    matrix_config JSONB NOT NULL,  -- {character_ids: [...], scene_type_ids: [...]}
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    total_cells INTEGER NOT NULL DEFAULT 0,
    completed_cells INTEGER NOT NULL DEFAULT 0,
    failed_cells INTEGER NOT NULL DEFAULT 0,
    estimated_gpu_hours DOUBLE PRECISION,
    estimated_disk_gb DOUBLE PRECISION,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_runs_project_id ON production_runs(project_id);
CREATE INDEX idx_production_runs_status_id ON production_runs(status_id);
CREATE INDEX idx_production_runs_created_by_id ON production_runs(created_by_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON production_runs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [x] Tracks batch production run with matrix configuration
- [x] Cell counts for progress tracking
- [x] Estimated resources stored pre-submission
- [x] Standard conventions followed

---

## Phase 2: Matrix State Manager

### Task 2.1: Matrix State Service
**File:** `src/services/matrix_state_service.rs`

```rust
pub struct MatrixCell {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub variant_type: String,
    pub status: CellStatus,
    pub scene_id: Option<DbId>,
    pub blocking_dependency: Option<String>,
}

pub enum CellStatus {
    NotStarted,
    Blocked { reason: String },
    Generating,
    QaReview,
    Approved,
    Failed,
    Rejected,
}

pub async fn compute_matrix(
    pool: &sqlx::PgPool,
    run_id: DbId,
) -> Result<Vec<MatrixCell>, anyhow::Error> {
    // For each character x scene_type x variant:
    //   Check variant approval status
    //   Check scene generation status
    //   Check QA status
    //   Determine cell status and any blocking dependencies
    todo!()
}
```

**Acceptance Criteria:**
- [x] Computes status for every cell in the matrix
- [x] Identifies blocking dependencies per cell
- [x] Updates in response to pipeline events
- [x] Renders in <2 seconds for 20x10 matrix

### Task 2.2: Dependency Resolver
**File:** `src/services/dependency_resolver_service.rs`

```rust
pub async fn resolve_dependencies(
    pool: &sqlx::PgPool,
    run_id: DbId,
) -> Result<Vec<DependencyResult>, anyhow::Error> {
    // Pipeline order:
    // 1. Source image QA (PRD-22)
    // 2. Variant generation (PRD-21)
    // 3. Variant approval
    // 4. Scene generation (PRD-24)
    // Blocked cells show which dependency is unmet
    todo!()
}
```

**Acceptance Criteria:**
- [x] Enforces: source QA -> variant generation -> variant approval -> scene generation
- [x] Blocked cells show which dependency is unmet
- [x] Auto-advance: when dependency met, dependent cells auto-queue

---

## Phase 3: Submission & Delivery

### Task 3.1: Batch Submission Coordinator
**File:** `src/services/batch_submission_service.rs`

**Acceptance Criteria:**
- [x] Submit entire matrix or subset
- [x] Re-submit failed/rejected cells only
- [x] Respects budget limits (PRD-093)
- [x] Jobs queued via PRD-008

### Task 3.2: One-Click Delivery
**File:** `src/services/batch_delivery_service.rs`

**Acceptance Criteria:**
- [x] Button enabled only when all cells approved
- [x] Triggers PRD-039 scene assembler for project
- [x] Delivery validation runs before packaging
- [x] Progress shown during packaging

---

## Phase 4: API Endpoints

### Task 4.1: Production Run APIs
**File:** `src/routes/production_run_routes.rs`

```rust
/// POST /api/production-runs — Create production run
/// GET /api/production-runs/:id/matrix — Get matrix state
/// POST /api/production-runs/:id/submit — Submit matrix (all or subset)
/// POST /api/production-runs/:id/deliver — Trigger delivery
/// GET /api/production-runs/:id/progress — Aggregate progress
```

---

## Phase 5: Frontend

### Task 5.1: Matrix Grid Component
**File:** `frontend/src/components/production/MatrixGrid.tsx`

```typescript
export function MatrixGrid({ matrix, characters, sceneTypes }: MatrixGridProps) {
  // Characters as rows, scene types as columns, variant sub-columns
  // Color-coded cells: grey/blue/yellow/green/red
  // Click cell -> navigate to detail
  // Checkbox selection for submission
  // Zoom levels: full project, single character, single scene type
}
```

**Acceptance Criteria:**
- [x] Single-screen overview for entire production
- [x] Color-coded status per cell at a glance
- [x] Click for navigation, checkbox for selection
- [x] Blocked cells show dependency reason on hover

### Task 5.2: Progress Dashboard
**File:** `frontend/src/components/production/ProductionProgress.tsx`

**Acceptance Criteria:**
- [x] Total scenes, segments, QA pass rate, approved count
- [x] Estimated time remaining
- [x] Real-time WebSocket updates

---

## Phase 6: Testing

### Task 6.1: Matrix Tests
**File:** `tests/production_matrix_test.rs`

**Acceptance Criteria:**
- [x] Matrix correctly computed for various configurations
- [x] Dependencies correctly resolved
- [x] Selective submission works
- [x] Progress tracking accurate

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_production_runs.sql` | Production runs table |
| `src/services/matrix_state_service.rs` | Matrix state computation |
| `src/services/dependency_resolver_service.rs` | Pipeline dependency resolution |
| `src/services/batch_submission_service.rs` | Batch submission |
| `src/services/batch_delivery_service.rs` | One-click delivery |
| `src/routes/production_run_routes.rs` | Production run API |
| `frontend/src/components/production/MatrixGrid.tsx` | Matrix visualization |
| `frontend/src/components/production/ProductionProgress.tsx` | Progress dashboard |

## Dependencies

### Existing Components to Reuse
- PRD-008: Queue management, PRD-010: Event bus
- PRD-021/023/024: Pipeline stages, PRD-039: Delivery, PRD-046: Workers

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1-2.2
3. Phase 3 — Task 3.1
4. Phase 4 — Task 4.1
5. Phase 5 — Task 5.1

### Post-MVP
1. Phase 3 — Task 3.2 (One-click delivery)
2. Phase 5 — Task 5.2 (Progress dashboard)
3. Batch review queue (grouped review)

## Notes

1. **Matrix performance:** For 20x10x2 = 400 cells, matrix computation should be a single efficient SQL query joining scenes/segments/statuses, not N individual queries.
2. **Real-time updates:** WebSocket events from PRD-010 drive matrix cell status changes without polling.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-057 v1.0
