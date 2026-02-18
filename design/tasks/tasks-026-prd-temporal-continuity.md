# Task List: Temporal Continuity (Normalization & Sync)

**PRD Reference:** `design/prds/026-prd-temporal-continuity.md`
**Scope:** Prevent subject drift, normalize grain/texture between chained segments, and re-center subjects that drift spatially, using likeness anchoring against the character's source image embedding.

## Overview

Long-form AI-generated video suffers from progressive "subject drift" -- the character's appearance gradually changes over many chained segments -- and visible grain/texture flickering at segment boundaries. This feature addresses these issues through three mechanisms: likeness anchoring (comparing each segment against the PRD-076 identity embedding to detect drift), latent texture synchronization (normalizing grain patterns between segments), and spatial re-centering (correcting subject position drift). Analysis runs via Python (OpenCV/NumPy) scripts orchestrated by Rust.

### What Already Exists
- PRD-024: Generation loop (segment chaining)
- PRD-076: Character identity embedding (face reference for comparison)
- PRD-009: Python runtime for analysis scripts

### What We're Building
1. `temporal_metrics` table storing per-segment drift/centering data
2. Likeness anchoring service comparing segments against source embedding
3. Grain/texture normalization between adjacent segments
4. Subject re-centering detection and correction
5. Drift trend visualization across segments

### Key Design Decisions
1. **Post-generation analysis** — Temporal metrics computed after each segment generates, not during. This avoids adding latency to the generation pipeline.
2. **Configurable thresholds per scene type** — High-motion scenes tolerate more drift; static scenes are stricter.
3. **Non-destructive** — Normalization and re-centering are optional post-processing steps, not baked into the generation pipeline.

---

## Phase 1: Database Schema

### Task 1.1: Temporal Metrics Table
**File:** `migrations/YYYYMMDD_create_temporal_metrics.sql`

```sql
CREATE TABLE temporal_metrics (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    drift_score DOUBLE PRECISION,
    centering_offset_x DOUBLE PRECISION,
    centering_offset_y DOUBLE PRECISION,
    grain_variance DOUBLE PRECISION,
    grain_match_score DOUBLE PRECISION,
    subject_bbox JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_temporal_metrics_segment_id ON temporal_metrics(segment_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON temporal_metrics
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Per-segment drift score, centering offset, and grain metrics stored
- [ ] FK to segments with CASCADE delete
- [ ] Index on segment_id

---

## Phase 2: Likeness Anchoring

### Task 2.1: Likeness Anchoring Service
**File:** `src/services/likeness_anchoring_service.rs`

```rust
pub async fn compute_drift_score(
    pool: &sqlx::PgPool,
    segment_id: DbId,
    character_id: DbId,
) -> Result<f64, anyhow::Error> {
    // 1. Extract representative frame from segment (middle frame)
    // 2. Extract face embedding from representative frame (reuse PRD-076 Python)
    // 3. Load character's source identity embedding from characters table
    // 4. Compute cosine similarity
    // 5. Store drift_score in temporal_metrics
    // 6. Warn if drift exceeds threshold
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Each segment's representative frame compared against PRD-076 identity embedding
- [ ] Drift score calculated as 1.0 - cosine_similarity (0 = no drift, 1 = maximum drift)
- [ ] Warning when drift exceeds configurable threshold
- [ ] Anchoring parameters adjustable per scene type

### Task 2.2: Drift Analysis Python Script
**File:** `scripts/python/temporal_drift_analysis.py`

```python
def analyze_drift(frame_path: str, source_embedding: list) -> dict:
    # Extract face from frame
    # Compute embedding
    # Compare with source
    # Return drift score and face bounding box
    pass
```

**Acceptance Criteria:**
- [ ] Extracts face from representative frame
- [ ] Computes cosine similarity with source embedding
- [ ] Returns drift score, face bounding box, and confidence

---

## Phase 3: Texture Synchronization

### Task 3.1: Grain Analysis Script
**File:** `scripts/python/temporal_grain_analysis.py`

```python
import cv2, numpy as np

def analyze_grain(frame_a_path: str, frame_b_path: str) -> dict:
    a = cv2.imread(frame_a_path)
    b = cv2.imread(frame_b_path)
    # High-pass filter to isolate grain/texture
    grain_a = a - cv2.GaussianBlur(a, (21, 21), 0)
    grain_b = b - cv2.GaussianBlur(b, (21, 21), 0)
    var_a = np.var(grain_a)
    var_b = np.var(grain_b)
    # Normalized match score
    match_score = 1.0 - abs(var_a - var_b) / max(var_a, var_b, 1e-6)
    return {"grain_variance_a": float(var_a), "grain_variance_b": float(var_b), "match_score": float(match_score)}
```

**Acceptance Criteria:**
- [ ] Grain pattern analysis at segment boundaries
- [ ] Normalized match score between adjacent segments
- [ ] Before/after comparison data available

### Task 3.2: Grain Normalization Script
**File:** `scripts/python/temporal_grain_normalize.py`

**Acceptance Criteria:**
- [ ] Applies normalization to reduce grain differences
- [ ] Non-destructive: outputs new file, doesn't modify original
- [ ] Before/after comparison verifiable

---

## Phase 4: Subject Re-centering

### Task 4.1: Subject Position Tracking
**File:** `scripts/python/temporal_centering.py`

```python
def track_subject_position(frames: list) -> dict:
    # For each frame: detect face bounding box center
    # Track center position across frames
    # Compute drift from initial center
    pass
```

**Acceptance Criteria:**
- [ ] Subject position tracked across segments via face bounding box
- [ ] Drift from initial center computed
- [ ] Re-centering applied subtly (no jarring jumps)

---

## Phase 5: API & Frontend

### Task 5.1: Temporal Metrics API
**File:** `src/routes/temporal_routes.rs`

```rust
/// GET /api/scenes/:id/temporal-metrics — All segment metrics for a scene
```

**Acceptance Criteria:**
- [ ] Returns drift scores, centering offsets, and grain metrics for all segments
- [ ] Trend data suitable for chart rendering

### Task 5.2: Drift Trend Visualization
**File:** `frontend/src/components/temporal/DriftTrendChart.tsx`

```typescript
export function DriftTrendChart({ metrics }: { metrics: TemporalMetric[] }) {
  // Line chart: X = segment index, Y = drift score
  // Threshold line showing acceptable drift
  // Color-coded points: green (ok), yellow (warning), red (high drift)
}
```

**Acceptance Criteria:**
- [ ] Drift score trend line across all segments
- [ ] Configurable threshold line
- [ ] Toggle between drift, centering, and grain views

---

## Phase 6: Testing

### Task 6.1: Drift Detection Tests
**File:** `tests/temporal_continuity_test.rs`

**Acceptance Criteria:**
- [ ] Drift score correctly identifies matching faces (low score)
- [ ] Drift score correctly identifies different faces (high score)
- [ ] Grain analysis detects texture differences between segments

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_temporal_metrics.sql` | Temporal metrics table |
| `src/services/likeness_anchoring_service.rs` | Drift score computation |
| `scripts/python/temporal_drift_analysis.py` | Face drift analysis |
| `scripts/python/temporal_grain_analysis.py` | Grain pattern analysis |
| `scripts/python/temporal_grain_normalize.py` | Grain normalization |
| `scripts/python/temporal_centering.py` | Subject position tracking |
| `src/routes/temporal_routes.rs` | Temporal metrics API |
| `frontend/src/components/temporal/DriftTrendChart.tsx` | Drift visualization |

## Dependencies

### Existing Components to Reuse
- PRD-076: Identity embeddings for likeness comparison
- PRD-024: Generation loop segment data
- PRD-009: Python runtime for analysis scripts

## Implementation Order

### MVP
1. Phase 1: Database Schema — Task 1.1
2. Phase 2: Likeness Anchoring — Tasks 2.1-2.2
3. Phase 5: API & Frontend — Tasks 5.1-5.2

### Post-MVP Enhancements
1. Phase 3: Texture Synchronization — Tasks 3.1-3.2
2. Phase 4: Subject Re-centering — Task 4.1
3. Phase 6: Testing
4. Adaptive anchoring strength per scene type

## Notes

1. **Performance:** Temporal analysis adds ~3-5 seconds per segment as a post-processing step. This runs asynchronously and does not block the generation loop.
2. **Anchoring mechanism:** Currently implemented as post-generation analysis. In the future, anchoring could be integrated into the generation pipeline as guidance.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-026 v1.0
