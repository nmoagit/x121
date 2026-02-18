# Task List: Failure Pattern Tracking & Insights

**PRD Reference:** `design/prds/064-prd-failure-pattern-tracking-insights.md`
**Scope:** Correlate quality gate failures with generation parameters to surface recurring patterns, provide failure heatmaps, trend tracking, actionable alerts, and root cause linking for institutional learning.

## Overview

Quality gate data from PRD-049 is valuable individually, but the real value is in aggregate patterns. This feature turns failure data into institutional knowledge by correlating failures with workflow/model/LoRA/character/segment-position combinations, surfacing heatmaps and trends, providing alerts when historically problematic combinations are used, and linking discovered fixes to failure patterns.

### What Already Exists
- PRD-017: Asset registry (LoRA/model data)
- PRD-041: Performance dashboard
- PRD-049: Quality gates (failure source data)

### What We're Building
1. `failure_patterns` and `pattern_fixes` tables
2. Pattern correlation engine
3. Failure heatmap generator
4. Trend tracking over time
5. Actionable alert service
6. Root cause linking

### Key Design Decisions
1. **Statistical significance** — Only surface patterns with enough data points (configurable minimum, default: 5 occurrences).
2. **Non-blocking alerts** — Alerts warn but don't prevent scene configuration. Creators make the final call.
3. **Fix linking** — When a fix is found, it's recorded and shown in future alerts for the same pattern.

---

## Phase 1: Database Schema

### Task 1.1: Failure Patterns Table
**File:** `migrations/YYYYMMDD_create_failure_patterns.sql`

```sql
CREATE TABLE failure_patterns (
    id BIGSERIAL PRIMARY KEY,
    pattern_key TEXT NOT NULL UNIQUE,  -- e.g., "workflow:5:lora:3:character:12:segment_pos:6+"
    description TEXT,
    dimension_workflow_id BIGINT REFERENCES workflows(id) ON DELETE SET NULL ON UPDATE CASCADE,
    dimension_lora_id BIGINT,
    dimension_character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    dimension_scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE SET NULL ON UPDATE CASCADE,
    dimension_segment_position TEXT,  -- e.g., "6+", "1-3"
    failure_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    failure_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    severity TEXT NOT NULL DEFAULT 'low',  -- 'low', 'medium', 'high'
    last_occurrence TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failure_patterns_dimension_workflow_id ON failure_patterns(dimension_workflow_id);
CREATE INDEX idx_failure_patterns_severity ON failure_patterns(severity);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON failure_patterns
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.2: Pattern Fixes Table
**File:** `migrations/YYYYMMDD_create_pattern_fixes.sql`

```sql
CREATE TABLE pattern_fixes (
    id BIGSERIAL PRIMARY KEY,
    pattern_id BIGINT NOT NULL REFERENCES failure_patterns(id) ON DELETE CASCADE ON UPDATE CASCADE,
    fix_description TEXT NOT NULL,
    fix_parameters JSONB,
    effectiveness TEXT,  -- 'resolved', 'improved', 'no_effect'
    reported_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pattern_fixes_pattern_id ON pattern_fixes(pattern_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON pattern_fixes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Pattern Correlation Engine

### Task 2.1: Correlation Service
**File:** `src/services/failure_pattern_service.rs`

```rust
pub async fn correlate_failures(pool: &sqlx::PgPool) -> Result<Vec<FailurePattern>, anyhow::Error> {
    // 1. Query quality_scores for failures
    // 2. Group by dimension combinations (workflow, LoRA, character, segment position)
    // 3. Compute failure rates per combination
    // 4. Only surface patterns with minimum sample size
    // 5. Upsert into failure_patterns table
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Correlates failures across workflow, LoRA, character, scene type, segment position
- [ ] Statistical significance filter (minimum sample count)
- [ ] Failure rate calculated per combination
- [ ] Severity classified by failure rate

### Task 2.2: Alert Service
**File:** `src/services/failure_alert_service.rs`

**Acceptance Criteria:**
- [ ] Alert on scene configuration when known-bad combination used
- [ ] Suggests alternatives based on similar successful configurations
- [ ] Alert severity based on historical failure rate
- [ ] Includes known fixes if available

---

## Phase 3: API & Frontend

### Task 3.1: Failure Analytics API
**File:** `src/routes/failure_analytics_routes.rs`

```rust
/// GET /api/analytics/failure-patterns — List patterns
/// GET /api/analytics/failure-heatmap — Matrix heatmap data
/// GET /api/analytics/failure-trends — Time-series trend data
/// POST /api/failure-patterns/:id/fixes — Record a fix
```

### Task 3.2: Failure Heatmap
**File:** `frontend/src/components/analytics/FailureHeatmap.tsx`

**Acceptance Criteria:**
- [ ] Matrix: scene type x character (or LoRA x segment position)
- [ ] Color-coded: green (low failure) to red (high failure)
- [ ] Clickable cells to see specific failures

### Task 3.3: Trend Chart
**File:** `frontend/src/components/analytics/FailureTrendChart.tsx`

**Acceptance Criteria:**
- [ ] Time-series chart of failure rates
- [ ] Detect regressions after model/workflow updates
- [ ] Detect improvements from changes

---

## Phase 4: Testing

### Task 4.1: Correlation Tests
**File:** `tests/failure_pattern_test.rs`

**Acceptance Criteria:**
- [ ] Patterns correctly identified from test data
- [ ] Minimum sample size enforced
- [ ] Alerts triggered for known bad combinations

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_failure_patterns.sql` | Patterns table |
| `migrations/YYYYMMDD_create_pattern_fixes.sql` | Fixes table |
| `src/services/failure_pattern_service.rs` | Correlation engine |
| `src/services/failure_alert_service.rs` | Alert service |
| `src/routes/failure_analytics_routes.rs` | Analytics API |
| `frontend/src/components/analytics/FailureHeatmap.tsx` | Heatmap |
| `frontend/src/components/analytics/FailureTrendChart.tsx` | Trends |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 2 — Task 2.2 (Alerts)
2. Phase 3 — Task 3.3 (Trends)
3. Predictive failure analysis

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-064 v1.0
