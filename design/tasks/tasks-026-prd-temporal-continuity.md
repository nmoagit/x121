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

## Phase 1: Database Schema [COMPLETE]

### Task 1.1: Temporal Metrics Table [COMPLETE]
**File:** `apps/db/migrations/20260223000003_create_temporal_metrics.sql`

**Acceptance Criteria:**
- [x] Per-segment drift score, centering offset, and grain metrics stored
- [x] FK to segments with CASCADE delete
- [x] Index on segment_id
- [x] `temporal_settings` table for per-project/scene-type threshold overrides
- [x] Unique index on (segment_id, analysis_version)
- [x] Unique index on (project_id, scene_type_id) for settings

**Implementation Notes:** Also added `analysis_version` column and `temporal_settings` table as specified in the PRD spec. Used `set_updated_at()` trigger function consistent with the rest of the codebase.

---

## Phase 2: Likeness Anchoring [COMPLETE]

### Task 2.1: Core Module & Drift Classification [COMPLETE]
**File:** `apps/backend/crates/core/src/temporal_continuity.rs`

**Acceptance Criteria:**
- [x] `DriftSeverity` enum (Normal, Warning, Critical) with `classify_drift` function
- [x] `GrainQuality` enum (Good, Marginal, Poor) with `classify_grain_match` function
- [x] `TrendDirection` enum (Improving, Stable, Worsening) with `compute_trend_direction`
- [x] Threshold constants: `DEFAULT_DRIFT_THRESHOLD`, `DEFAULT_GRAIN_THRESHOLD`, `DEFAULT_CENTERING_THRESHOLD`
- [x] Validation functions for all threshold types
- [x] 22 unit tests, all passing

### Task 2.2: Drift Analysis Python Script [COMPLETE]
**File:** `scripts/python/temporal/temporal_drift_analysis.py`

**Acceptance Criteria:**
- [x] Extracts face from representative frame
- [x] Computes cosine similarity with source embedding
- [x] Returns drift score, face bounding box, and confidence

---

## Phase 3: Texture Synchronization [COMPLETE]

### Task 3.1: Grain Analysis Script [COMPLETE]
**File:** `scripts/python/temporal/temporal_grain_analysis.py`

**Acceptance Criteria:**
- [x] Grain pattern analysis at segment boundaries
- [x] Normalized match score between adjacent segments
- [x] Before/after comparison data available

### Task 3.2: Grain Normalization Script [COMPLETE]
**File:** `scripts/python/temporal/temporal_grain_normalize.py`

**Acceptance Criteria:**
- [x] Applies normalization to reduce grain differences
- [x] Non-destructive: outputs new file, doesn't modify original
- [x] Before/after comparison verifiable

---

## Phase 4: Subject Re-centering [COMPLETE]

### Task 4.1: Subject Position Tracking [COMPLETE]
**File:** `scripts/python/temporal/temporal_centering.py`

**Acceptance Criteria:**
- [x] Subject position tracked across segments via face bounding box
- [x] Drift from initial center computed
- [x] Max offset calculated

---

## Phase 5: API & Frontend [COMPLETE]

### Task 5.1: Temporal Metrics API [COMPLETE]
**Files:**
- `apps/backend/crates/db/src/models/temporal_metric.rs`
- `apps/backend/crates/db/src/repositories/temporal_metric_repo.rs`
- `apps/backend/crates/api/src/handlers/temporal.rs`
- `apps/backend/crates/api/src/routes/temporal.rs`

**Endpoints:**
- `GET /scenes/{id}/temporal-metrics` — scene metrics with drift enrichment
- `GET /segments/{id}/temporal-metric` — single segment metric
- `POST /segments/{id}/analyze-drift` — record drift analysis
- `POST /segments/{id}/analyze-grain` — record grain analysis
- `POST /segments/{id}/normalize-grain` — record normalization
- `GET /projects/{id}/temporal-settings` — get project settings
- `PUT /projects/{id}/temporal-settings` — update settings

**Acceptance Criteria:**
- [x] Returns drift scores, centering offsets, and grain metrics for all segments
- [x] Enriched response with drift severity and grain quality classification
- [x] Trend data suitable for chart rendering
- [x] Settings CRUD with threshold validation

### Task 5.2: Drift Trend Visualization [COMPLETE]
**Files:**
- `apps/frontend/src/features/temporal/types.ts`
- `apps/frontend/src/features/temporal/hooks/use-temporal.ts`
- `apps/frontend/src/features/temporal/DriftTrendChart.tsx`
- `apps/frontend/src/features/temporal/GrainComparisonPanel.tsx`
- `apps/frontend/src/features/temporal/index.ts`

**Acceptance Criteria:**
- [x] Drift score trend line across all segments
- [x] Configurable threshold line
- [x] Toggle between drift, centering, and grain views
- [x] Color-coded dots by severity (green/yellow/red)
- [x] Uses shared chart styles from `chartStyles.ts` (DRY-128)
- [x] GrainComparisonPanel with match score and normalize button

---

## Phase 6: Testing [COMPLETE]

### Task 6.1: Core + Frontend Tests [COMPLETE]
**Files:**
- `apps/backend/crates/core/src/temporal_continuity.rs` (inline `#[cfg(test)]` module)
- `apps/frontend/src/features/temporal/__tests__/DriftTrendChart.test.tsx`

**Acceptance Criteria:**
- [x] 22 unit tests for drift classification, grain quality, trend direction, validation
- [x] 5 frontend component tests (render, loading, empty state, trend label, toggles)
- [x] All tests passing

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260223000003_create_temporal_metrics.sql` | temporal_metrics + temporal_settings tables |
| `apps/backend/crates/core/src/temporal_continuity.rs` | Constants, classification, validation, unit tests |
| `apps/backend/crates/db/src/models/temporal_metric.rs` | Entity models and DTOs |
| `apps/backend/crates/db/src/repositories/temporal_metric_repo.rs` | CRUD + aggregation queries |
| `apps/backend/crates/api/src/handlers/temporal.rs` | API handlers for all temporal endpoints |
| `apps/backend/crates/api/src/routes/temporal.rs` | Route definitions (scene, segment, project scoped) |
| `scripts/python/temporal/temporal_drift_analysis.py` | Face drift analysis |
| `scripts/python/temporal/temporal_grain_analysis.py` | Grain pattern analysis |
| `scripts/python/temporal/temporal_grain_normalize.py` | Grain normalization |
| `scripts/python/temporal/temporal_centering.py` | Subject position tracking |
| `apps/frontend/src/features/temporal/types.ts` | TypeScript types and constants |
| `apps/frontend/src/features/temporal/hooks/use-temporal.ts` | TanStack Query hooks |
| `apps/frontend/src/features/temporal/DriftTrendChart.tsx` | Drift trend chart component |
| `apps/frontend/src/features/temporal/GrainComparisonPanel.tsx` | Grain comparison panel |
| `apps/frontend/src/features/temporal/index.ts` | Barrel export |
| `apps/frontend/src/features/temporal/__tests__/DriftTrendChart.test.tsx` | Component tests |

## Dependencies

### Existing Components to Reuse
- PRD-076: Identity embeddings for likeness comparison
- PRD-024: Generation loop segment data
- PRD-009: Python runtime for analysis scripts

## Module Registration

- [x] `pub mod temporal_continuity;` in `core/src/lib.rs`
- [x] `pub mod temporal_metric;` in `db/src/models/mod.rs`
- [x] `pub mod temporal_metric_repo;` + `pub use` in `db/src/repositories/mod.rs`
- [x] `pub mod temporal;` in `api/src/handlers/mod.rs`
- [x] `pub mod temporal;` in `api/src/routes/mod.rs`
- [x] Routes merged into `api_routes()` for scenes, segments, and projects

## Verification Results

- [x] `cargo check` — zero errors, zero warnings
- [x] `cargo test -p x121-core --lib temporal_continuity` — 22/22 passed
- [x] `npx tsc --noEmit` — zero errors
- [x] `npx vitest run src/features/temporal` — 5/5 passed

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-026 v1.0
- **v1.1** (2026-02-23): All tasks implemented and verified
