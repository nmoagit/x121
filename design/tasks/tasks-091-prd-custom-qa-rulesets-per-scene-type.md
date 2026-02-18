# Task List: Custom QA Rulesets per Scene Type

**PRD Reference:** `design/prds/091-prd-custom-qa-rulesets-per-scene-type.md`
**Scope:** Configurable per-scene-type quality gate thresholds, preset QA profiles (High Motion, Portrait, Transition), visual threshold editor with historical score histograms, and A/B threshold testing against historical data.

## Overview

A single global QA threshold produces false positives for high-motion scenes and false negatives for static scenes. This feature allows per-scene-type threshold overrides for every metric, provides preset QA profiles, a visual slider-based threshold editor showing historical score distributions, and A/B testing of proposed thresholds against historical segments before applying changes.

### What Already Exists
- PRD-023: Scene types, PRD-049: Quality gates
- PRD-077: Pipeline hooks for custom metrics

### What We're Building
1. `qa_profiles` and `scene_type_qa_overrides` tables
2. Threshold override resolution engine
3. Preset QA profiles (High Motion, Portrait, Transition)
4. Visual threshold editor with histogram overlay
5. A/B threshold testing (read-only analysis)

### Key Design Decisions
1. **Override, not replace** — Scene-type overrides only change specific metrics. Unoverridden metrics fall back to studio defaults.
2. **Historical histograms** — Threshold editor shows actual score distributions from past generations, making threshold tuning data-driven.
3. **Read-only A/B testing** — Proposed thresholds tested against historical data without modifying any records.

---

## Phase 1: Database Schema

### Task 1.1: QA Profiles Table
**File:** `migrations/YYYYMMDD_create_qa_profiles.sql`

```sql
CREATE TABLE qa_profiles (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    thresholds JSONB NOT NULL,  -- {face_confidence: {warn: 0.7, fail: 0.5}, motion: {warn: ..., fail: ...}, ...}
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON qa_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO qa_profiles (name, description, thresholds, is_builtin) VALUES
    ('high_motion', 'Relaxed face, strict motion continuity', '{"face_confidence": {"warn": 0.55, "fail": 0.35}, "motion": {"warn": 0.8, "fail": 0.6}}', true),
    ('portrait', 'Strict face, relaxed motion', '{"face_confidence": {"warn": 0.85, "fail": 0.7}, "motion": {"warn": 0.4, "fail": 0.2}}', true),
    ('transition', 'Relaxed overall, strict boundary SSIM', '{"boundary_ssim": {"warn": 0.9, "fail": 0.8}}', true);
```

### Task 1.2: Scene Type QA Overrides Table
**File:** `migrations/YYYYMMDD_create_scene_type_qa_overrides.sql`

```sql
CREATE TABLE scene_type_qa_overrides (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    qa_profile_id BIGINT REFERENCES qa_profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    custom_thresholds JSONB,  -- Per-metric overrides on top of profile
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_scene_type_qa_overrides ON scene_type_qa_overrides(scene_type_id);
CREATE INDEX idx_scene_type_qa_overrides_qa_profile_id ON scene_type_qa_overrides(qa_profile_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_type_qa_overrides
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Threshold Resolution

### Task 2.1: Threshold Resolver
**File:** `src/services/qa_threshold_resolver.rs`

```rust
pub async fn resolve_thresholds(pool: &sqlx::PgPool, scene_type_id: DbId, project_id: DbId) -> Result<QaThresholds, anyhow::Error> {
    // Resolution order: scene_type custom > scene_type profile > project defaults > studio defaults
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Scene type overrides take precedence
- [ ] Unoverridden metrics fall back to profile, then project, then studio

### Task 2.2: A/B Threshold Testing
**File:** `src/services/qa_ab_testing_service.rs`

```rust
pub async fn test_thresholds(pool: &sqlx::PgPool, scene_type_id: DbId, proposed: &QaThresholds) -> Result<AbTestResult, anyhow::Error> {
    // Run proposed thresholds against historical quality_scores
    // Compare: pass/warn/fail counts vs. current thresholds
    // No data modification (read-only)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Tests against last N segments (configurable window)
- [ ] Reports how many would pass/fail under proposed thresholds
- [ ] Read-only, no actual data changes

---

## Phase 3: API & Frontend

### Task 3.1: QA Ruleset API
**File:** `src/routes/qa_ruleset_routes.rs`

```rust
/// CRUD /api/qa-profiles
/// PUT /api/scene-types/:id/qa-overrides
/// POST /api/qa-profiles/ab-test
```

### Task 3.2: Threshold Editor
**File:** `frontend/src/components/qa/ThresholdEditor.tsx`

**Acceptance Criteria:**
- [ ] Slider per metric with histogram of historical scores
- [ ] Shows pass/fail ratio at proposed threshold
- [ ] "If you raise face confidence to 0.8, 15% more segments would have been flagged"
- [ ] Profile presets selectable as starting point

---

## Phase 4: Testing

### Task 4.1: Threshold Tests
**File:** `tests/qa_rulesets_test.rs`

**Acceptance Criteria:**
- [ ] Resolution order correct
- [ ] A/B testing predicts correctly
- [ ] Built-in profiles seeded correctly

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_qa_profiles.sql` | QA profiles |
| `migrations/YYYYMMDD_create_scene_type_qa_overrides.sql` | Per-scene-type overrides |
| `src/services/qa_threshold_resolver.rs` | Threshold resolution |
| `src/services/qa_ab_testing_service.rs` | A/B testing |
| `src/routes/qa_ruleset_routes.rs` | API |
| `frontend/src/components/qa/ThresholdEditor.tsx` | Visual editor |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 2 — Task 2.2 (A/B testing)
2. Custom metrics per scene type via PRD-077 hooks

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-091 v1.0
