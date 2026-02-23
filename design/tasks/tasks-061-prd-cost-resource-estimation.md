# Task List: Cost & Resource Estimation

**PRD Reference:** `design/prds/061-prd-cost-resource-estimation.md`
**Scope:** Pre-submission estimation of GPU time, wall-clock time, and disk space based on historical performance data, with per-scene and batch-level breakdowns that improve as the system accumulates production data.

## Overview

Submitting 160 scenes without knowing the cost impact causes surprise GPU bottlenecks. This feature provides resource estimates before submission, factoring in historical generation performance, current worker pool size, and queue depth. Estimates improve automatically as the system accumulates production data. New workflows show "No estimate available" instead of guessing.

### What Already Exists
- PRD-008: Queue management, PRD-041: Performance dashboard
- PRD-046: Worker pool, PRD-057: Batch orchestrator

### What We're Building
1. `generation_metrics` table for historical averages
2. Estimation engine computing GPU time, wall-clock, disk space
3. Worker-aware wall-clock estimation
4. Estimation breakdown by scene type and character
5. Estimation display on submission screens

### Key Design Decisions
1. **Historical calibration** — Estimates based on actual past generation times, not theoretical calculations.
2. **Worker-aware wall-clock** — Factors in current pool size and queue depth for realistic completion time.
3. **No guessing** — New workflows with no history show "estimate not available" rather than inaccurate numbers.

---

## Phase 1: Database Schema

### Task 1.1: Generation Metrics Table
**File:** `migrations/YYYYMMDD_create_generation_metrics.sql`

```sql
CREATE TABLE generation_metrics (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resolution_tier_id BIGINT NOT NULL REFERENCES resolution_tiers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    avg_gpu_secs_per_segment DOUBLE PRECISION NOT NULL,
    avg_disk_mb_per_segment DOUBLE PRECISION NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_generation_metrics_workflow_tier ON generation_metrics(workflow_id, resolution_tier_id);
CREATE INDEX idx_generation_metrics_workflow_id ON generation_metrics(workflow_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON generation_metrics
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [x] Tracks average GPU time and disk per segment per workflow per tier
- [x] Sample count for confidence assessment
- [x] Unique per workflow + tier combination

---

## Phase 2: Estimation Engine

### Task 2.1: Per-Scene Estimator
**File:** `src/services/estimation_service.rs`

```rust
pub struct SceneEstimate {
    pub segments_needed: u32,
    pub gpu_seconds: f64,
    pub disk_mb: f64,
    pub confidence: EstimateConfidence,  // High (10+ samples), Medium (3-9), Low/None
}

pub async fn estimate_scene(pool: &sqlx::PgPool, scene_config: &SceneConfig) -> Result<SceneEstimate, anyhow::Error> {
    // segments = ceil(target_duration / segment_duration)
    // gpu_seconds = segments * avg_gpu_secs_per_segment for workflow+tier
    // disk = segments * avg_disk_mb_per_segment
    todo!()
}
```

### Task 2.2: Batch Estimator
**File:** `src/services/estimation_service.rs`

```rust
pub struct BatchEstimate {
    pub total_scenes: u32,
    pub total_gpu_hours: f64,
    pub wall_clock_hours: f64,
    pub total_disk_gb: f64,
    pub worker_count: u32,
    pub queue_depth: u32,
}

pub async fn estimate_batch(pool: &sqlx::PgPool, scenes: &[SceneConfig]) -> Result<BatchEstimate, anyhow::Error> {
    // Sum per-scene estimates
    // Factor in worker count and queue depth for wall-clock
    todo!()
}
```

**Acceptance Criteria:**
- [x] Per-scene: segments, GPU time, disk space
- [x] Batch: total GPU-hours, wall-clock with workers, disk
- [x] Confidence levels based on sample count
- [x] Response <1 second for 200 scenes

### Task 2.3: Metric Collection Hook
**File:** `src/services/estimation_service.rs`

```rust
pub async fn record_generation_metric(pool: &sqlx::PgPool, workflow_id: DbId, tier_id: DbId, gpu_secs: f64, disk_mb: f64) -> Result<(), anyhow::Error> {
    // Update running average in generation_metrics (incremental mean)
    todo!()
}
```

**Acceptance Criteria:**
- [x] Records actual times after each segment generation
- [x] Incremental average update (not full recalculation)
- [x] Accuracy improves with more data

---

## Phase 3: API & Frontend

### Task 3.1: Estimation API
**File:** `src/routes/estimation_routes.rs`

```rust
/// POST /api/estimates — Estimate for a list of scenes
/// GET /api/estimates/history — Historical calibration data
```

### Task 3.2: Estimation Card
**File:** `frontend/src/components/estimation/EstimationCard.tsx`

**Acceptance Criteria:**
- [x] Summary card on submission screen
- [x] Breakdown by scene type
- [x] Confidence indicator (high/medium/low)
- [x] "No estimate available" for new workflows

---

## Phase 4: Testing

### Task 4.1: Estimation Tests
**File:** `tests/estimation_test.rs`

**Acceptance Criteria:**
- [x] Estimates within expected ranges for known workflows
- [x] New workflows return no-estimate
- [x] Batch estimate factors in worker count

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_generation_metrics.sql` | Historical metrics |
| `src/services/estimation_service.rs` | Estimation engine |
| `src/routes/estimation_routes.rs` | Estimation API |
| `frontend/src/components/estimation/EstimationCard.tsx` | Estimation display |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1-2.3
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Budget alerts (PRD-093 integration)
2. Estimation breakdown drill-down

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-061 v1.0
