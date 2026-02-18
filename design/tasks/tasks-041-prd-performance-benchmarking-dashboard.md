# Task List: Performance & Benchmarking Dashboard

**PRD Reference:** `design/prds/041-prd-performance-benchmarking-dashboard.md`
**Scope:** Build a performance analytics dashboard reporting time-per-frame, VRAM peaks, likeness scores, and quality metrics per workflow and worker, enabling data-driven optimization of generation pipelines.

## Overview

Admins need to identify expensive or low-quality workflows to optimize resource allocation. This dashboard collects performance metrics from generation jobs (time-per-frame, GPU time, VRAM peaks) and quality metrics (likeness scores, face confidence, motion quality), then provides visualization tools for workflow comparison, worker benchmarking, and trend analysis. The backend aggregates raw per-job metrics into queryable time-series data, while the frontend uses charting components for interactive exploration.

### What Already Exists
- PRD-10 Event Bus for metric collection events
- PRD-06 hardware monitoring data (GPU utilization, VRAM)
- Job and worker tables from earlier PRDs
- Status lookup tables from PRD-000

### What We're Building
1. Database table for performance metrics with time-series structure
2. Rust metric aggregation service consuming events from the event bus
3. API endpoints for overview, per-workflow, per-worker, and comparison views
4. React dashboard with charting components (Recharts or similar)
5. Configurable alert thresholds for performance anomalies

### Key Design Decisions
1. **Metrics stored per-job** -- Raw metrics are captured per generation job, then aggregated on query for dashboard views. No pre-aggregation to preserve flexibility.
2. **Quality scores as JSON** -- Variable quality metrics stored as JSONB to accommodate different quality measures across workflows.
3. **Time-series querying via SQL** -- Use PostgreSQL date_trunc and window functions for aggregation rather than a dedicated time-series database. Simpler infrastructure.
4. **Metric collection is async** -- Metrics are captured via event bus, adding <1% overhead to generation time.

---

## Phase 1: Database Schema

### Task 1.1: Performance Metrics Table
**File:** `migrations/YYYYMMDDHHMMSS_create_performance_metrics.sql`

```sql
CREATE TABLE performance_metrics (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE ON UPDATE CASCADE,
    worker_id BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE,

    -- Performance metrics
    time_per_frame_ms REAL,
    total_gpu_time_ms BIGINT,
    total_wall_time_ms BIGINT,
    vram_peak_mb INTEGER,
    frame_count INTEGER,

    -- Quality metrics (flexible JSON for varying measures)
    quality_scores_json JSONB,         -- {"likeness": 0.92, "face_confidence": 0.87, "motion_quality": 0.75, "boundary_ssim": 0.95}

    -- Pipeline breakdown
    pipeline_stages_json JSONB,        -- [{"name": "load_model", "duration_ms": 1200}, ...]

    -- Resolution tier for grouping
    resolution_tier TEXT,              -- e.g., '1080p', '720p', '4k'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_performance_metrics_job_id ON performance_metrics(job_id);
CREATE INDEX idx_performance_metrics_workflow_id ON performance_metrics(workflow_id);
CREATE INDEX idx_performance_metrics_worker_id ON performance_metrics(worker_id);
CREATE INDEX idx_performance_metrics_project_id ON performance_metrics(project_id);
CREATE INDEX idx_performance_metrics_character_id ON performance_metrics(character_id);
CREATE INDEX idx_performance_metrics_scene_id ON performance_metrics(scene_id);
CREATE INDEX idx_performance_metrics_created_at ON performance_metrics(created_at);
```

**Acceptance Criteria:**
- [ ] All FK columns have indexes
- [ ] `created_at` indexed for time-range queries
- [ ] JSONB for flexible quality scores and pipeline stages
- [ ] No `updated_at` -- metrics are immutable once recorded
- [ ] Migration applies cleanly

### Task 1.2: Performance Alert Thresholds Table
**File:** `migrations/YYYYMMDDHHMMSS_create_performance_alert_thresholds.sql`

```sql
CREATE TABLE performance_alert_thresholds (
    id BIGSERIAL PRIMARY KEY,
    metric_name TEXT NOT NULL,         -- e.g., 'time_per_frame_ms', 'vram_peak_mb'
    scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'workflow', 'worker')),
    scope_id BIGINT,                   -- workflow_id or worker_id, NULL for global
    warning_threshold REAL NOT NULL,
    critical_threshold REAL NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_performance_alert_thresholds_scope ON performance_alert_thresholds(scope_type, scope_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON performance_alert_thresholds
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Supports global, per-workflow, and per-worker thresholds
- [ ] Warning and critical levels for each metric
- [ ] Enabled flag for toggling without deleting

---

## Phase 2: Rust Backend -- Metric Collection & Aggregation

### Task 2.1: Performance Metric Model
**File:** `src/models/performance_metric.rs`

```rust
#[derive(Debug, FromRow)]
pub struct PerformanceMetric {
    pub id: DbId,
    pub job_id: DbId,
    pub workflow_id: DbId,
    pub worker_id: DbId,
    pub project_id: Option<DbId>,
    pub character_id: Option<DbId>,
    pub scene_id: Option<DbId>,
    pub time_per_frame_ms: Option<f32>,
    pub total_gpu_time_ms: Option<i64>,
    pub total_wall_time_ms: Option<i64>,
    pub vram_peak_mb: Option<i32>,
    pub frame_count: Option<i32>,
    pub quality_scores_json: Option<serde_json::Value>,
    pub pipeline_stages_json: Option<serde_json::Value>,
    pub resolution_tier: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] All ID fields use `DbId`
- [ ] Functions: `insert`, `get_by_job`, `query_by_workflow`, `query_by_worker`, `query_by_time_range`
- [ ] Time-range queries use `created_at` index

### Task 2.2: Metric Collection Event Handler
**File:** `src/services/metric_collector.rs`

Listens to the PRD-10 event bus for job completion events and records performance metrics.

```rust
pub struct MetricCollector {
    pool: PgPool,
}

impl MetricCollector {
    /// Called when a generation job completes. Extracts performance data
    /// from the job result and inserts into performance_metrics.
    pub async fn on_job_completed(&self, event: &JobCompletedEvent) -> Result<(), MetricError> {
        // Extract timing data, VRAM peaks, quality scores
        // Insert into performance_metrics table
        // Check against alert thresholds
    }
}
```

**Acceptance Criteria:**
- [ ] Subscribes to job completion events via PRD-10 event bus
- [ ] Extracts all available performance data from job result
- [ ] Metric insertion adds <1% overhead to job completion
- [ ] Checks recorded metrics against alert thresholds and fires alerts

### Task 2.3: Metric Aggregation Service
**File:** `src/services/metric_aggregator.rs`

Aggregation queries for dashboard views.

```rust
pub struct MetricAggregator {
    pool: PgPool,
}

pub struct WorkflowPerformanceSummary {
    pub workflow_id: DbId,
    pub workflow_name: String,
    pub avg_time_per_frame_ms: f64,
    pub avg_gpu_time_ms: f64,
    pub avg_vram_peak_mb: f64,
    pub avg_likeness_score: Option<f64>,
    pub job_count: i64,
}
```

**Acceptance Criteria:**
- [ ] Per-workflow aggregation: avg/min/max time-per-frame, GPU time, VRAM peak
- [ ] Per-worker aggregation: same metrics plus utilization percentage
- [ ] Time-series aggregation: metrics grouped by day/week/month
- [ ] Quality score trend calculation with moving averages
- [ ] Queries return results in <3 seconds for 30 days of data

### Task 2.4: Workflow Comparison Service
**File:** `src/services/workflow_comparison.rs`

Compare two or more workflows on speed, quality, and resource usage.

**Acceptance Criteria:**
- [ ] Takes list of workflow IDs and time range
- [ ] Returns side-by-side metrics: speed, quality, resource usage
- [ ] Calculates percentage differences ("Workflow A is 20% slower but 15% higher quality")
- [ ] Supports historical comparison (same workflow over different time periods)

---

## Phase 3: API Endpoints

### Task 3.1: Performance Overview Route
**File:** `src/routes/performance.rs`

```
GET /performance/overview              -- Aggregated metrics across all workflows
GET /performance/overview?from=X&to=Y  -- Time-bounded overview
```

**Acceptance Criteria:**
- [ ] Returns top-level summary: total GPU hours, average time-per-frame, VRAM peaks
- [ ] Supports date range filtering
- [ ] Includes top/bottom performers (best and worst workflows)

### Task 3.2: Per-Workflow Performance Route
**File:** `src/routes/performance.rs`

```
GET /performance/workflow/:id          -- Detailed metrics for a single workflow
GET /performance/workflow/:id/trend    -- Time-series trend data
```

**Acceptance Criteria:**
- [ ] Returns per-workflow: time-per-frame distribution, GPU time breakdown, quality metrics
- [ ] Trend endpoint returns time-series data suitable for charting
- [ ] Pipeline stage breakdown showing which nodes consume the most time

### Task 3.3: Per-Worker Performance Route
**File:** `src/routes/performance.rs`

```
GET /performance/worker/:id            -- Per-worker metrics
GET /performance/workers/comparison    -- Compare multiple workers
```

**Acceptance Criteria:**
- [ ] Per-worker: speed comparison across same job types
- [ ] Worker utilization: generating vs. idle percentage
- [ ] Multi-worker comparison for hardware efficiency ranking

### Task 3.4: Workflow Comparison Route
**File:** `src/routes/performance.rs`

```
GET /performance/comparison?workflows=id1,id2&from=X&to=Y
```

**Acceptance Criteria:**
- [ ] Accepts 2+ workflow IDs as query parameters
- [ ] Returns structured comparison data with percentage differences
- [ ] Supports time-bounded comparison

### Task 3.5: Alert Threshold CRUD Routes
**File:** `src/routes/performance_alerts.rs`

```
GET    /performance/alerts/thresholds
POST   /performance/alerts/thresholds
PUT    /performance/alerts/thresholds/:id
DELETE /performance/alerts/thresholds/:id
```

**Acceptance Criteria:**
- [ ] Standard CRUD for alert thresholds
- [ ] Validation: critical threshold must exceed warning threshold
- [ ] Scope validation: scope_id must reference valid workflow/worker

---

## Phase 4: React Frontend

### Task 4.1: Performance Overview Dashboard
**File:** `frontend/src/pages/PerformanceDashboard.tsx`

Main dashboard with key performance indicators.

**Acceptance Criteria:**
- [ ] Summary cards: total GPU hours, avg time-per-frame, peak VRAM usage
- [ ] Time-series chart of generation throughput over time
- [ ] Top/bottom performers table
- [ ] Date range selector with presets (7d, 30d, 90d)

### Task 4.2: Quality Metrics Charts
**File:** `frontend/src/components/performance/QualityCharts.tsx`

Quality trend visualization.

**Acceptance Criteria:**
- [ ] Likeness score distribution chart (histogram per workflow)
- [ ] Face confidence, motion quality, boundary SSIM trends over time (line charts)
- [ ] Correlation scatter plot: parameter values vs. quality outcomes
- [ ] Recharts or similar React charting library

### Task 4.3: Workflow Comparison View
**File:** `frontend/src/components/performance/WorkflowComparison.tsx`

Side-by-side workflow comparison.

**Acceptance Criteria:**
- [ ] Select 2+ workflows for comparison
- [ ] Bar chart comparing speed, quality, and resource usage
- [ ] Highlight trade-offs in human-readable text
- [ ] Historical comparison: same workflow before/after parameter changes

### Task 4.4: Worker Benchmarking View
**File:** `frontend/src/components/performance/WorkerBenchmark.tsx`

**Acceptance Criteria:**
- [ ] Per-worker cards showing speed, utilization, VRAM usage
- [ ] Same-job-type comparison across different workers
- [ ] Hardware efficiency ranking table
- [ ] Utilization pie chart: generating vs. idle time

### Task 4.5: Alert Threshold Configuration
**File:** `frontend/src/components/performance/AlertConfig.tsx`

**Acceptance Criteria:**
- [ ] List current thresholds with scope and enabled status
- [ ] Create/edit form for thresholds
- [ ] Enable/disable toggle per threshold

---

## Phase 5: Testing

### Task 5.1: Metric Collection Tests
**File:** `tests/metric_collection_test.rs`

**Acceptance Criteria:**
- [ ] Test metric insertion from job completed event
- [ ] Test alert threshold checking fires events correctly
- [ ] Test overhead measurement: metric collection adds <1% to job time

### Task 5.2: Aggregation Query Tests
**File:** `tests/metric_aggregation_test.rs`

**Acceptance Criteria:**
- [ ] Test per-workflow aggregation returns correct averages
- [ ] Test per-worker aggregation includes utilization calculation
- [ ] Test time-series grouping by day/week/month
- [ ] Test workflow comparison returns percentage differences
- [ ] Test query performance with 30 days of synthetic data

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_performance_metrics.sql` | Performance metrics table |
| `migrations/YYYYMMDDHHMMSS_create_performance_alert_thresholds.sql` | Alert thresholds table |
| `src/models/performance_metric.rs` | Metric SQLx model |
| `src/services/metric_collector.rs` | Event-driven metric capture |
| `src/services/metric_aggregator.rs` | Query aggregation for dashboards |
| `src/services/workflow_comparison.rs` | Multi-workflow comparison logic |
| `src/routes/performance.rs` | Performance API endpoints |
| `src/routes/performance_alerts.rs` | Alert threshold CRUD |
| `frontend/src/pages/PerformanceDashboard.tsx` | Main dashboard page |
| `frontend/src/components/performance/QualityCharts.tsx` | Quality visualization |
| `frontend/src/components/performance/WorkflowComparison.tsx` | Comparison view |
| `frontend/src/components/performance/WorkerBenchmark.tsx` | Worker benchmarking |
| `frontend/src/components/performance/AlertConfig.tsx` | Threshold configuration |

## Dependencies

### Upstream PRDs
- PRD-10: Event Bus for metric collection
- PRD-06: Hardware monitoring for GPU/VRAM data
- PRD-08: Job management (job completion events)

### Downstream PRDs
- PRD-61: Cost Estimation uses performance data
- PRD-64: Failure Pattern Tracking
- PRD-73: Production Reporting aggregates

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.5)

**MVP Success Criteria:**
- Metrics captured for every completed generation job
- Dashboard loads in <3 seconds with 30 days of data
- Workflow comparison correctly identifies faster/better workflow in >95% of cases
- Alert thresholds fire notifications for anomalous performance

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.5)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Predictive performance estimation (PRD Requirement 2.1)

## Notes

1. **Metric retention** -- Raw per-job metrics should be retained for at least 90 days. Consider partitioning the `performance_metrics` table by month for query performance.
2. **VRAM peak capture** -- Requires PRD-06 hardware monitoring to report VRAM usage per job. If not available, the field will be NULL.
3. **Pipeline stage breakdown** -- Requires ComfyUI to report per-node timing. This data may not be available for all workflow types.
4. **Charting library** -- Recharts is recommended for React charting. It is declarative, composable, and handles time-series data well.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-041
