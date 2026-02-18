# Task List: Automated Quality Gates

**PRD Reference:** `design/prds/049-prd-automated-quality-gates.md`
**Scope:** Machine-driven quality assessment that runs automatically after each segment generation, checking face detection, boundary stability, motion score, resolution/artifacts, and likeness drift, with configurable pass/warn/fail thresholds.

## Overview

Human reviewers should not waste time on obviously broken segments. This feature provides automated quality assessment running post-generation for every segment, producing structured pass/warn/fail results per check with numeric scores. Checks include face detection confidence, boundary SSIM stability, motion analysis (frozen/jittery), resolution/artifact detection, and likeness drift against the source image. Results feed into the review queue and downstream analytics.

### What Already Exists
- PRD-024: Generation loop (produces segments to check)
- PRD-028: Checkpointing (QA integrates into pipeline)
- PRD-010: Event bus (QA events for notifications)
- PRD-076: Identity embeddings (for likeness drift)

### What We're Building
1. `quality_scores` table for per-segment per-check results
2. QA runner service orchestrating all checks
3. Python analysis scripts for each metric
4. Configurable threshold engine per project
5. Review queue integration (flagging failed segments)
6. QA scorecard UI component

### Key Design Decisions
1. **Per-check independence** — Each check produces an independent score. No composite score is computed; let humans weigh the importance.
2. **Non-blocking by default** — QA runs async after generation. Results appear when ready but do not block the pipeline.
3. **Technical checks are non-configurable** — Black frames, NaN pixels, resolution changes always fail. Creative checks (face, motion) have configurable thresholds.

---

## Phase 1: Database Schema

### Task 1.1: Quality Scores Table
**File:** `migrations/YYYYMMDD_create_quality_scores.sql`

```sql
CREATE TABLE quality_scores (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type TEXT NOT NULL,  -- 'face_confidence', 'boundary_ssim', 'motion', 'resolution', 'artifacts', 'likeness_drift'
    score DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL,  -- 'pass', 'warn', 'fail'
    details JSONB,
    threshold_used DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_scores_segment_id ON quality_scores(segment_id);
CREATE INDEX idx_quality_scores_check_type ON quality_scores(check_type);
CREATE INDEX idx_quality_scores_status ON quality_scores(status);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quality_scores
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.2: QA Thresholds Table
**File:** `migrations/YYYYMMDD_create_qa_thresholds.sql`

```sql
CREATE TABLE qa_thresholds (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type TEXT NOT NULL,
    warn_threshold DOUBLE PRECISION NOT NULL,
    fail_threshold DOUBLE PRECISION NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qa_thresholds_project_id ON qa_thresholds(project_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON qa_thresholds
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Per-segment, per-check quality scores stored
- [ ] Project-level threshold overrides (NULL project_id = studio default)
- [ ] Status tracked as text: pass/warn/fail

---

## Phase 2: QA Check Implementations

### Task 2.1: Face Detection Confidence Check
**File:** `scripts/python/qa_face_confidence.py`

**Acceptance Criteria:**
- [ ] Compares segment's representative frame face against PRD-076 embedding
- [ ] Returns numeric confidence score
- [ ] Flags below configurable threshold

### Task 2.2: Boundary Stability (SSIM) Check
**File:** `scripts/python/qa_boundary_ssim.py`

```python
from skimage.metrics import structural_similarity as ssim
import cv2

def check_boundary(last_frame_path: str, first_frame_path: str) -> dict:
    a = cv2.imread(last_frame_path, cv2.IMREAD_GRAYSCALE)
    b = cv2.imread(first_frame_path, cv2.IMREAD_GRAYSCALE)
    score = ssim(a, b)
    return {"check": "boundary_ssim", "score": float(score)}
```

**Acceptance Criteria:**
- [ ] SSIM between segment N last frame and N+1 first frame
- [ ] Score per boundary recorded
- [ ] Flags discontinuities exceeding threshold

### Task 2.3: Motion Score Check
**File:** `scripts/python/qa_motion_score.py`

**Acceptance Criteria:**
- [ ] Detects frozen frames (zero motion)
- [ ] Detects excessive jitter or acceleration
- [ ] Flags outside expected motion envelope
- [ ] Configurable motion thresholds

### Task 2.4: Resolution & Artifact Detection
**File:** `scripts/python/qa_technical.py`

**Acceptance Criteria:**
- [ ] Detects unexpected resolution changes
- [ ] Detects black frames and NaN pixel values
- [ ] Detects encoding artifacts
- [ ] Always fails on technical issues (non-configurable)

### Task 2.5: Likeness Drift Score
**File:** `scripts/python/qa_likeness_drift.py`

**Acceptance Criteria:**
- [ ] Compares representative frame against source embedding
- [ ] Drift score trend visible across segments
- [ ] Threshold configurable per project

---

## Phase 3: QA Runner Service

### Task 3.1: QA Orchestrator
**File:** `src/services/qa_runner_service.rs`

```rust
pub async fn run_segment_qa(
    pool: &sqlx::PgPool,
    segment_id: DbId,
) -> Result<QaSummary, anyhow::Error> {
    // 1. Load segment and scene context
    // 2. Load thresholds for the project
    // 3. Run each check via Python scripts
    // 4. Compare scores against thresholds -> pass/warn/fail
    // 5. Store all results in quality_scores
    // 6. Publish QA completion event via PRD-10
    // 7. If any check fails, flag segment in review queue (PRD-35)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Runs all applicable checks for each segment
- [ ] Results stored with numeric scores and pass/warn/fail
- [ ] Failed segments flagged in review queue
- [ ] Events published for real-time notifications
- [ ] Completes in <30 seconds per segment

### Task 3.2: QA Summary Aggregator
**File:** `src/services/qa_summary_service.rs`

**Acceptance Criteria:**
- [ ] Summary statistics: "3 of 12 segments auto-flagged"
- [ ] Per-check pass rates across a batch
- [ ] Feeds into PRD-42 Studio Pulse Dashboard

---

## Phase 4: API Endpoints

### Task 4.1: QA Endpoints
**File:** `src/routes/qa_routes.rs`

```rust
/// GET /api/segments/:id/qa-scores — Per-segment QA results
/// POST /api/projects/:id/qa-thresholds — Update project thresholds
/// GET /api/scenes/:id/qa-summary — QA summary for a scene
/// GET /api/production-runs/:id/qa-summary — Batch QA summary
```

**Acceptance Criteria:**
- [ ] Per-segment scores with details
- [ ] Project threshold management
- [ ] Scene and batch summaries

---

## Phase 5: Frontend

### Task 5.1: QA Scorecard Component
**File:** `frontend/src/components/qa/QaScorecard.tsx`

```typescript
export function QaScorecard({ scores }: { scores: QualityScore[] }) {
  // Compact card per segment
  // Per-check: traffic light icon + numeric score
  // Click to expand for details
  // Links to explanatory documentation for each check type
}
```

**Acceptance Criteria:**
- [ ] Traffic-light colors: green/yellow/red per check
- [ ] Numeric scores displayed
- [ ] Expandable details per check
- [ ] Links to documentation

---

## Phase 6: Testing

### Task 6.1: QA Check Tests
**File:** `tests/qa_checks_test.rs`

**Acceptance Criteria:**
- [ ] Black frames always flagged
- [ ] Face-melt (low confidence) detected
- [ ] Boundary discontinuity detected
- [ ] Scores are reproducible (deterministic)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_quality_scores.sql` | Quality scores table |
| `migrations/YYYYMMDD_create_qa_thresholds.sql` | Threshold configuration |
| `scripts/python/qa_face_confidence.py` | Face confidence check |
| `scripts/python/qa_boundary_ssim.py` | SSIM boundary check |
| `scripts/python/qa_motion_score.py` | Motion analysis |
| `scripts/python/qa_technical.py` | Technical checks |
| `scripts/python/qa_likeness_drift.py` | Likeness drift |
| `src/services/qa_runner_service.rs` | QA orchestrator |
| `src/routes/qa_routes.rs` | QA API |
| `frontend/src/components/qa/QaScorecard.tsx` | Scorecard UI |

## Dependencies

### Existing Components to Reuse
- PRD-076: Identity embeddings
- PRD-010: Event bus
- PRD-009: Python runtime

## Implementation Order

### MVP
1. Phase 1: Database — Tasks 1.1-1.2
2. Phase 2: Checks — Tasks 2.1, 2.2, 2.4
3. Phase 3: Runner — Task 3.1
4. Phase 4: API — Task 4.1
5. Phase 5: Frontend — Task 5.1

### Post-MVP Enhancements
1. Phase 2: Tasks 2.3, 2.5 (Motion, likeness drift)
2. Phase 3: Task 3.2 (Summary aggregation)
3. Custom QA checks via hook scripts

## Notes

1. **QA runs async** — Triggered after segment generation completes. Does not block the generation loop.
2. **Shared Python model** — Face confidence check reuses InsightFace model from PRD-076.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-049 v1.0
