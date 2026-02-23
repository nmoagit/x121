# Task List: Incremental Re-stitching & Smoothing

**PRD Reference:** `design/prds/025-prd-incremental-restitching-smoothing.md`
**Scope:** Enable targeted single-segment regeneration without re-rendering the entire scene, with automatic boundary smoothing to maintain visual continuity with adjacent segments.

## Overview

When one segment in a 10-segment scene is flawed, regenerating the entire scene wastes 9 segments worth of GPU time. This feature enables regeneration of only the problematic segment using its original seed frame, then automatically checks and smooths boundaries with adjacent segments. Old versions are preserved for comparison, and downstream segments are flagged if their seed frame may have changed. This reduces fix cost from O(scene) to O(segment).

### What Already Exists
- PRD-024: Generation loop (segment chaining, frame extraction)
- PRD-028: Checkpointing (preserves completed segment state)
- PRD-049: Quality gates (automatic QA on generated segments)

### What We're Building
1. Single-segment regeneration service
2. Boundary SSIM/visual consistency checker
3. Boundary smoothing (frame blending, re-extraction)
4. Old segment version preservation for comparison
5. Downstream segment flagging when seed frame changes

### Key Design Decisions
1. **Regenerate with same seed** — The regenerated segment uses the same seed frame (last frame of previous segment) to maintain upstream continuity.
2. **Old version preserved** — Previous segment output kept for A/B comparison; stored via `previous_segment_id` reference.
3. **Boundary check is automatic** — SSIM computed at both boundaries after regeneration; smoothing offered if discontinuity exceeds threshold.
4. **Downstream flagging, not automatic cascade** — Regenerated segment may produce a different last frame, making downstream seeds stale. Flag, don't auto-regenerate (cascade is opt-in).

---

## Phase 1: Database Schema

### Task 1.1: Segment Versioning Columns
**File:** `migrations/YYYYMMDD_add_segment_versioning.sql`

```sql
ALTER TABLE segments
    ADD COLUMN previous_segment_id BIGINT REFERENCES segments(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN regeneration_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN is_stale BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN boundary_ssim_before DOUBLE PRECISION,
    ADD COLUMN boundary_ssim_after DOUBLE PRECISION;

CREATE INDEX idx_segments_previous_segment_id ON segments(previous_segment_id);
```

**Acceptance Criteria:**
- [x] `previous_segment_id` links to the old version of a regenerated segment
- [x] `regeneration_count` tracks how many times this position has been regenerated
- [x] `is_stale` flags segments whose seed frame may have changed
- [x] Boundary SSIM scores recorded at both transitions

---

## Phase 2: Single-Segment Regeneration

### Task 2.1: Regeneration Service
**File:** `src/services/segment_regeneration_service.rs`

```rust
pub async fn regenerate_segment(
    pool: &sqlx::PgPool,
    segment_id: DbId,
    modified_params: Option<serde_json::Value>,
) -> Result<DbId, anyhow::Error> {
    // 1. Load the segment and its scene context
    // 2. Get the seed frame (previous segment's last_frame_path)
    // 3. Archive the current segment (set previous_segment_id)
    // 4. Create new segment with same index and seed
    // 5. Optionally apply modified generation parameters
    // 6. Dispatch generation to ComfyUI (same as PRD-24 single segment)
    // 7. After completion: run QA (PRD-49), check boundaries
    // 8. Flag downstream segments as stale
    // 9. Return new segment ID
    todo!()
}
```

**Acceptance Criteria:**
- [x] Regenerates using seed frame from previous segment's last frame
- [x] Old version preserved with `previous_segment_id` link
- [x] QA checks run automatically on new segment
- [x] Downstream segments flagged as `is_stale = true`
- [x] Modified parameters supported (different seed, CFG, etc.)

### Task 2.2: Downstream Staleness Flagger
**File:** `src/services/segment_regeneration_service.rs`

```rust
async fn flag_downstream_stale(
    pool: &sqlx::PgPool,
    scene_id: DbId,
    from_segment_index: u32,
) -> Result<u32, anyhow::Error> {
    // Flag all segments after the regenerated one as stale
    // if the regenerated segment's last_frame differs from the original
    let count = sqlx::query_scalar!(
        r#"
        UPDATE segments SET is_stale = true
        WHERE scene_id = $1 AND sequence_index > $2
        RETURNING COUNT(*)
        "#,
        scene_id,
        from_segment_index as i32,
    )
    .fetch_one(pool)
    .await?;
    Ok(count as u32)
}
```

**Acceptance Criteria:**
- [x] All segments after the regenerated one flagged as stale
- [x] Returns count of flagged segments
- [x] Stale flag cleared when segment is regenerated or manually approved

---

## Phase 3: Boundary Smoothing

### Task 3.1: Boundary Consistency Checker
**File:** `src/services/boundary_check_service.rs`

```rust
pub struct BoundaryCheckResult {
    pub before_ssim: f64,   // SSIM between previous segment's last frame and this segment's first frame
    pub after_ssim: f64,    // SSIM between this segment's last frame and next segment's first frame
    pub needs_smoothing_before: bool,
    pub needs_smoothing_after: bool,
}

pub async fn check_boundaries(
    pool: &sqlx::PgPool,
    segment_id: DbId,
    ssim_threshold: f64,
) -> Result<BoundaryCheckResult, anyhow::Error> {
    // 1. Extract first frame of regenerated segment
    // 2. Compare with previous segment's last frame (SSIM)
    // 3. Compare regenerated segment's last frame with next segment's first frame
    // 4. Flag if either boundary exceeds discontinuity threshold
    todo!()
}
```

**Acceptance Criteria:**
- [x] SSIM computed at both boundaries (before and after)
- [x] Discontinuity flagged when SSIM < threshold
- [x] Results stored on the segment record
- [x] Threshold configurable per project

### Task 3.2: Boundary Smoothing Service
**File:** `src/services/boundary_smoothing_service.rs`

```rust
pub enum SmoothingMethod {
    FrameBlending,    // Blend overlapping frames
    ReExtraction,     // Re-extract boundary frame from wider window
}

pub async fn smooth_boundary(
    pool: &sqlx::PgPool,
    segment_id: DbId,
    boundary: BoundaryPosition,  // Before or After
    method: SmoothingMethod,
) -> Result<(), anyhow::Error> {
    // Apply smoothing to reduce visual discontinuity at boundary
    todo!()
}
```

**Acceptance Criteria:**
- [x] Frame blending: cross-fade between adjacent segment frames
- [x] Re-extraction: pick a better boundary frame from a wider window
- [x] Manual override: accept boundary as-is
- [x] Updated SSIM recorded after smoothing

---

## Phase 4: API Endpoints

### Task 4.1: Regeneration & Boundary Endpoints
**File:** `src/routes/regeneration_routes.rs`

```rust
/// POST /api/segments/:id/regenerate — Regenerate a single segment
/// GET /api/segments/:id/boundary-check — Check boundary consistency
/// POST /api/segments/:id/smooth-boundary — Apply smoothing
/// GET /api/segments/:id/versions — Get version history
```

**Acceptance Criteria:**
- [x] Regeneration accepts optional modified parameters
- [x] Boundary check returns SSIM scores and recommendations
- [x] Smoothing accepts method selection
- [x] Version history returns all previous versions of this segment position

---

## Phase 5: Frontend Components

### Task 5.1: Segment Regeneration Action
**File:** `frontend/src/components/segments/RegenerateSegmentButton.tsx`

```typescript
export function RegenerateSegmentButton({ segmentId, onRegenerated }: RegenerateProps) {
  // Button available on segment in review view
  // Optional parameter modification dialog
  // Confirmation: "This will regenerate segment 5. Segments 6-10 may need re-checking."
}
```

**Acceptance Criteria:**
- [x] Available directly on segment in review view
- [x] Optional parameter modification before regeneration
- [x] Confirmation showing downstream impact

### Task 5.2: Boundary Quality Indicator
**File:** `frontend/src/components/segments/BoundaryQualityIndicator.tsx`

```typescript
export function BoundaryQualityIndicator({ ssimBefore, ssimAfter, threshold }: BoundaryIndicatorProps) {
  // Green: SSIM above threshold (smooth transition)
  // Yellow: SSIM near threshold (acceptable)
  // Red: SSIM below threshold (visible discontinuity)
  // Shown at segment transitions
}
```

**Acceptance Criteria:**
- [x] SSIM scores displayed at each segment boundary
- [x] Color-coded: green (good), yellow (borderline), red (discontinuity)
- [x] Smoothing action available on red boundaries

### Task 5.3: Segment Version Comparison
**File:** `frontend/src/components/segments/SegmentVersionComparison.tsx`

**Acceptance Criteria:**
- [x] Side-by-side comparison of old vs. new segment
- [x] QA score comparison between versions
- [x] Stale segment indicators in downstream segments

---

## Phase 6: Testing

### Task 6.1: Regeneration Tests
**File:** `tests/segment_regeneration_test.rs`

**Acceptance Criteria:**
- [x] Regenerate middle segment -> old preserved, new generated
- [x] Downstream segments flagged as stale
- [x] QA runs on regenerated segment
- [x] Boundary SSIM computed

### Task 6.2: Boundary Smoothing Tests
**File:** `tests/boundary_smoothing_test.rs`

**Acceptance Criteria:**
- [x] Smoothing improves SSIM score
- [x] Manual override accepts boundary as-is
- [x] Both smoothing methods produce valid output

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_add_segment_versioning.sql` | Segment versioning columns |
| `src/services/segment_regeneration_service.rs` | Single-segment regeneration |
| `src/services/boundary_check_service.rs` | SSIM boundary consistency |
| `src/services/boundary_smoothing_service.rs` | Boundary smoothing methods |
| `src/routes/regeneration_routes.rs` | Regeneration API endpoints |
| `frontend/src/components/segments/RegenerateSegmentButton.tsx` | Regeneration action |
| `frontend/src/components/segments/BoundaryQualityIndicator.tsx` | SSIM display |
| `frontend/src/components/segments/SegmentVersionComparison.tsx` | Version comparison |

## Dependencies

### Existing Components to Reuse
- PRD-024: Generation pipeline (single segment generation)
- PRD-028: Checkpointing for preserving state
- PRD-049: Quality gates for QA on regenerated segments

### New Infrastructure Needed
- SSIM computation (Python scikit-image or Rust implementation)

## Implementation Order

### MVP
1. Phase 1: Database Schema — Task 1.1
2. Phase 2: Regeneration Service — Tasks 2.1-2.2
3. Phase 3: Boundary Check — Task 3.1
4. Phase 4: API Endpoints — Task 4.1
5. Phase 5: Frontend — Tasks 5.1-5.2

### Post-MVP Enhancements
1. Phase 3: Task 3.2 (Boundary smoothing)
2. Phase 5: Task 5.3 (Version comparison)
3. Phase 6: Testing
4. Cascade regeneration (opt-in downstream re-generation)

## Notes

1. **SSIM computation:** Can be done in Python (scikit-image `structural_similarity`) or Rust (image comparison crate). Python is simpler and consistent with other analysis scripts.
2. **Cascade regeneration:** Post-MVP feature. When the regenerated segment's last frame differs significantly, the user can opt to regenerate all downstream segments. This is expensive but sometimes necessary.
3. **GPU savings:** For a 10-segment scene, regenerating 1 segment saves 90% of GPU time compared to full scene regeneration.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-025 v1.0
