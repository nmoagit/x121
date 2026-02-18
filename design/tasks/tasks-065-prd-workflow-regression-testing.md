# Task List: Workflow Regression Testing

**PRD Reference:** `design/prds/065-prd-workflow-regression-testing.md`
**Scope:** Automated regression testing for workflow/LoRA/model updates using designated reference scenes, Draft-resolution re-generation, objective metric comparison, and pass/fail reports with rollback support.

## Overview

Workflow and model updates improve quality but risk breaking scenes that currently work. This feature provides automated "generation tests": designate reference scenes as benchmarks, auto-trigger re-generation at Draft resolution when assets are updated, compare old vs. new output with SSIM, face similarity, motion, and QA metrics, and produce pass/fail reports with rollback to the previous version on failure.

### What Already Exists
- PRD-023: Scene types, PRD-027: Templates, PRD-036: Sync-play
- PRD-049: Quality gates, PRD-059: Resolution tiers, PRD-008: Queue

### What We're Building
1. `regression_references`, `regression_runs`, `regression_results` tables
2. Reference scene designation service
3. Regression run orchestrator (re-generate at Draft tier)
4. Comparison engine (SSIM, face, motion, QA metrics)
5. Pass/fail report with rollback

### Key Design Decisions
1. **Draft resolution for speed** — Regression tests run at Draft tier (PRD-059) for 3-5x faster execution.
2. **Same seeds and parameters** — Re-generation uses identical seeds/parameters as the reference. Only the workflow/LoRA version differs.
3. **Objective comparison** — Automated metrics compare old vs. new. Human review is optional.

---

## Phase 1: Database Schema

### Task 1.1: Regression Tables
**File:** `migrations/YYYYMMDD_create_regression_tables.sql`

```sql
CREATE TABLE regression_references (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reference_scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    baseline_scores JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE regression_runs (
    id BIGSERIAL PRIMARY KEY,
    trigger_type TEXT NOT NULL,  -- 'workflow_update', 'lora_update', 'manual'
    trigger_asset_id BIGINT,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE regression_results (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES regression_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reference_id BIGINT NOT NULL REFERENCES regression_references(id) ON DELETE CASCADE ON UPDATE CASCADE,
    new_scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE,
    baseline_scores JSONB NOT NULL,
    new_scores JSONB NOT NULL,
    verdict TEXT NOT NULL,  -- 'improved', 'same', 'degraded'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regression_references_character_id ON regression_references(character_id);
CREATE INDEX idx_regression_references_scene_type_id ON regression_references(scene_type_id);
CREATE INDEX idx_regression_results_run_id ON regression_results(run_id);
CREATE INDEX idx_regression_results_reference_id ON regression_results(reference_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regression_references FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regression_runs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regression_results FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Regression Services

### Task 2.1: Reference Designation
**File:** `src/services/regression_reference_service.rs`

**Acceptance Criteria:**
- [ ] Mark character + scene type as reference benchmark
- [ ] Store baseline quality scores for comparison

### Task 2.2: Regression Run Orchestrator
**File:** `src/services/regression_run_service.rs`

**Acceptance Criteria:**
- [ ] Trigger on workflow/LoRA update
- [ ] Re-generate references at Draft resolution (PRD-059)
- [ ] Same seeds and parameters as reference
- [ ] Compare new vs. baseline scores

### Task 2.3: Comparison Engine
**File:** `src/services/regression_comparison_service.rs`

**Acceptance Criteria:**
- [ ] SSIM, face similarity, motion, QA metrics compared
- [ ] Verdict: improved, same, or degraded per reference
- [ ] Configurable thresholds for pass/fail

---

## Phase 3: API & Frontend

### Task 3.1: Regression API
**File:** `src/routes/regression_routes.rs`

```rust
/// POST /api/regression/run — Trigger regression run
/// GET /api/regression/runs/:id/report — Get results report
/// CRUD /api/regression/references — Manage references
```

### Task 3.2: Regression Report View
**File:** `frontend/src/components/regression/RegressionReport.tsx`

**Acceptance Criteria:**
- [ ] Per-reference: improved/same/degraded indicator
- [ ] Side-by-side comparison via PRD-036
- [ ] Rollback button on degraded results

---

## Phase 4: Testing

### Task 4.1: Regression Tests
**File:** `tests/regression_test.rs`

**Acceptance Criteria:**
- [ ] References correctly designate benchmarks
- [ ] Re-generation at Draft tier works
- [ ] Comparison correctly classifies changes

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_regression_tables.sql` | All regression tables |
| `src/services/regression_reference_service.rs` | Reference management |
| `src/services/regression_run_service.rs` | Run orchestrator |
| `src/services/regression_comparison_service.rs` | Comparison engine |
| `src/routes/regression_routes.rs` | Regression API |
| `frontend/src/components/regression/RegressionReport.tsx` | Report UI |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1-2.3
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Scheduled recurring regression runs
2. Automatic trigger on asset update

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-065 v1.0
