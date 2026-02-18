# Task List: Character Consistency Report

**PRD Reference:** `design/prds/094-prd-character-consistency-report.md`
**Scope:** Post-generation cross-scene consistency analysis per character, including face similarity matrix, color/lighting analysis, outlier flagging, and exportable reports.

## Overview

Individual segments are checked by PRD-049 and cross-character comparison by PRD-068, but neither answers: "Does this character look like the same person across all their scenes?" This feature computes pairwise face similarity across all of a character's scenes, analyzes color/lighting consistency, flags outlier scenes that deviate from the character's average, tracks consistency improvement across iterations, and produces exportable reports.

### What Already Exists
- PRD-049: Quality gates, PRD-068: Cross-character comparison
- PRD-076: Identity embedding, PRD-091: Custom QA rulesets

### What We're Building
1. `consistency_reports` table
2. Face consistency matrix (pairwise similarity heatmap)
3. Color/lighting analysis across scenes
4. Outlier flagging with re-queue action
5. Report generation and export (PDF/JSON)

### Key Design Decisions
1. **Representative frames** — Use poster frames or highest-confidence face frames per scene for comparison. Not every frame in every segment.
2. **Pairwise matrix** — All scene pairs compared, not just sequential. This catches outliers that sequential checks miss.
3. **Report format** — PDF for stakeholder review, JSON for programmatic access.

---

## Phase 1: Database Schema

### Task 1.1: Consistency Reports Table
**File:** `migrations/YYYYMMDD_create_consistency_reports.sql`

```sql
CREATE TABLE consistency_reports (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scores_json JSONB NOT NULL,  -- Full pairwise matrix and analysis results
    overall_consistency_score DOUBLE PRECISION,
    outlier_scene_ids BIGINT[],
    report_type TEXT NOT NULL DEFAULT 'face',  -- 'face', 'color', 'full'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consistency_reports_character_id ON consistency_reports(character_id);
CREATE INDEX idx_consistency_reports_project_id ON consistency_reports(project_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON consistency_reports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Consistency Analysis

### Task 2.1: Face Consistency Analyzer
**File:** `src/services/consistency_analysis_service.rs`

```rust
pub async fn compute_face_consistency(pool: &sqlx::PgPool, character_id: DbId) -> Result<ConsistencyReport, anyhow::Error> {
    // 1. Get all scenes for the character
    // 2. Extract representative frame per scene
    // 3. Compute pairwise face embedding similarity
    // 4. Build similarity matrix
    // 5. Identify outliers (below threshold)
    // 6. Store report
    todo!()
}
```

### Task 2.2: Color/Lighting Analyzer
**File:** `scripts/python/consistency_color_analysis.py`

**Acceptance Criteria:**
- [ ] Compare average color temperature, brightness, saturation across scenes
- [ ] Flag visually inconsistent scenes

### Task 2.3: Outlier Detection
**File:** `src/services/consistency_analysis_service.rs`

**Acceptance Criteria:**
- [ ] Flag scenes deviating from character average by configurable threshold
- [ ] One-click: "Re-queue flagged scenes for regeneration"

---

## Phase 3: API & Frontend

### Task 3.1: Consistency API
**File:** `src/routes/consistency_routes.rs`

```rust
/// POST /api/characters/:id/consistency-report — Generate report
/// GET /api/characters/:id/consistency-report — Get latest report
/// GET /api/projects/:id/consistency-overview — Project-wide overview
/// POST /api/projects/:id/batch-consistency — Batch for all characters
```

### Task 3.2: Consistency Heatmap
**File:** `frontend/src/components/consistency/ConsistencyHeatmap.tsx`

**Acceptance Criteria:**
- [ ] Pairwise similarity heatmap (green=consistent, red=outlier)
- [ ] Click cell to see two scenes side by side
- [ ] Outlier scenes highlighted

### Task 3.3: Report Export
**File:** `src/services/consistency_report_export_service.rs`

**Acceptance Criteria:**
- [ ] Export as PDF with keyframes and scores
- [ ] Batch PDF: one page per character
- [ ] Overview: "8 of 12 characters fully consistent"

---

## Phase 4: Testing

### Task 4.1: Consistency Tests
**File:** `tests/consistency_report_test.rs`

**Acceptance Criteria:**
- [ ] Pairwise matrix correctly computed
- [ ] Outliers identified
- [ ] Report generates in <30 seconds per character

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_consistency_reports.sql` | Reports table |
| `src/services/consistency_analysis_service.rs` | Analysis engine |
| `scripts/python/consistency_color_analysis.py` | Color analysis |
| `src/services/consistency_report_export_service.rs` | PDF export |
| `src/routes/consistency_routes.rs` | API |
| `frontend/src/components/consistency/ConsistencyHeatmap.tsx` | Heatmap |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1, 2.3
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 2 — Task 2.2 (Color analysis)
2. Phase 3 — Task 3.3 (PDF export)
3. Trend tracking across iterations

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-094 v1.0
