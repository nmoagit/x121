# Task List: Smart Auto-Retry

**PRD Reference:** `design/prds/071-prd-smart-auto-retry.md`
**Scope:** Opt-in, transparent, bounded automatic retry of segments that fail quality gates, using varied seeds and parameter jitter, with best-of-N selection and transparent reporting.

## Overview

Many QA failures are stochastic (bad seed) not systematic (broken workflow). Varying the seed fixes ~60-70% of one-off failures. This feature provides opt-in auto-retry with configurable max attempts, seed variation, parameter jitter (CFG +/- range), best-of-N selection from passing attempts, fully transparent reporting of all retry activity, and escalation to human review when all retries fail. This is explicitly NOT silent retrying.

### What Already Exists
- PRD-023: Scene types, PRD-049: Quality gates
- PRD-061: Cost estimation, PRD-064: Failure patterns, PRD-069: Provenance

### What We're Building
1. `retry_attempts` table tracking all attempts
2. Auto-retry policy configuration per scene type/project
3. Retry orchestrator with seed variation and parameter jitter
4. Best-of-N selector choosing highest quality passing attempt
5. Transparent reporting UI
6. Escalation when all retries fail

### Key Design Decisions
1. **Opt-in, not default** — Auto-retry is disabled by default. Must be explicitly enabled per scene type or project.
2. **Budget-aware** — Retry GPU time counts against project budget (PRD-093).
3. **Best-of-N** — If multiple retries pass, the highest quality one is selected. All attempts remain viewable.
4. **Transparent** — Every retry attempt, its parameters, and scores are logged and visible to the user.

---

## Phase 1: Database Schema

### Task 1.1: Retry Attempts Table
**File:** `migrations/YYYYMMDD_create_retry_attempts.sql`

```sql
CREATE TABLE retry_attempts (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    attempt_number INTEGER NOT NULL,
    seed BIGINT NOT NULL,
    parameters JSONB NOT NULL,  -- All generation params including jittered values
    original_parameters JSONB NOT NULL,  -- Original params before jitter
    output_video_path TEXT,
    quality_scores JSONB,
    overall_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'generating', 'passed', 'failed'
    is_selected BOOLEAN NOT NULL DEFAULT false,
    gpu_seconds DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retry_attempts_segment_id ON retry_attempts(segment_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON retry_attempts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.2: Retry Policy Columns
**File:** `migrations/YYYYMMDD_add_retry_policy.sql`

```sql
ALTER TABLE scene_types
    ADD COLUMN auto_retry_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN auto_retry_max_attempts INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN auto_retry_trigger_checks TEXT[] DEFAULT '{face_confidence}',
    ADD COLUMN auto_retry_seed_variation BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN auto_retry_cfg_jitter DOUBLE PRECISION DEFAULT 0.5;
```

---

## Phase 2: Retry Orchestrator

### Task 2.1: Retry Service
**File:** `src/services/auto_retry_service.rs`

```rust
pub async fn handle_qa_failure(pool: &sqlx::PgPool, segment_id: DbId) -> Result<RetryDecision, anyhow::Error> {
    // 1. Check if auto-retry is enabled for this scene type
    // 2. Check if max attempts reached
    // 3. Check if failure type is retriable
    // 4. Generate new seed and jittered parameters
    // 5. Create retry attempt record
    // 6. Dispatch generation
    // 7. After completion: run QA, compare with previous attempts
    // 8. If any pass: select best-of-N
    // 9. If all fail: escalate to human review
    todo!()
}
```

### Task 2.2: Parameter Jitter Engine
**File:** `src/services/parameter_jitter_service.rs`

```rust
pub fn jitter_parameters(original: &serde_json::Value, config: &JitterConfig) -> serde_json::Value {
    // Apply small random adjustments to numeric parameters
    // cfg_scale: +/- configured range
    // denoise_strength: +/- configured range
    // seed: completely new random value
    todo!()
}
```

### Task 2.3: Best-of-N Selector
**File:** `src/services/auto_retry_service.rs`

**Acceptance Criteria:**
- [ ] All passing attempts compared by quality score
- [ ] Best result selected automatically
- [ ] All attempts available for manual comparison
- [ ] Selected attempt marked with `is_selected = true`

---

## Phase 3: API & Frontend

### Task 3.1: Retry API
**File:** `src/routes/retry_routes.rs`

```rust
/// PUT /api/scene-types/:id/retry-policy — Configure retry policy
/// GET /api/segments/:id/retry-history — All retry attempts for a segment
```

### Task 3.2: Retry History Panel
**File:** `frontend/src/components/retry/RetryHistoryPanel.tsx`

**Acceptance Criteria:**
- [ ] Shows: "Segment 5: failed attempt 1 (face 0.42), passed attempt 3 (face 0.87)"
- [ ] All attempts viewable with scores
- [ ] Best-of-N selection indicator
- [ ] Retry count and GPU time displayed

### Task 3.3: Retry Policy Editor
**File:** `frontend/src/components/retry/RetryPolicyEditor.tsx`

**Acceptance Criteria:**
- [ ] Enable/disable toggle
- [ ] Max attempts slider
- [ ] Which QA checks trigger retry (checklist)
- [ ] Jitter range configuration

---

## Phase 4: Testing

### Task 4.1: Retry Tests
**File:** `tests/auto_retry_test.rs`

**Acceptance Criteria:**
- [ ] Retry triggered only when enabled
- [ ] Max attempts respected
- [ ] Different seed per attempt
- [ ] Best-of-N selects highest quality
- [ ] All retries fail -> escalation

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_retry_attempts.sql` | Retry tracking |
| `migrations/YYYYMMDD_add_retry_policy.sql` | Policy config on scene types |
| `src/services/auto_retry_service.rs` | Retry orchestrator |
| `src/services/parameter_jitter_service.rs` | Parameter variation |
| `src/routes/retry_routes.rs` | Retry API |
| `frontend/src/components/retry/RetryHistoryPanel.tsx` | History display |
| `frontend/src/components/retry/RetryPolicyEditor.tsx` | Policy config |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Tasks 2.1-2.3
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 3 — Task 3.3 (Policy editor)
2. Adaptive retry strategy (learn effective variations)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-071 v1.0
