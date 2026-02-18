# Task List: Scene Preview & Quick Test

**PRD Reference:** `design/prds/058-prd-scene-preview-quick-test.md`
**Scope:** Rapid single-segment preview generation to validate workflow/LoRA/prompt combinations at ~5% of full scene cost, with test shot gallery, batch testing across characters, and promotion of good test shots to become segment 001.

## Overview

Full scene generation is expensive. This feature provides "test shots" -- single short segments (2-3 seconds) for quick validation before committing to full generation. Test shots use the exact same pipeline as PRD-024 but terminate after one segment. Results are persisted with parameters for experimentation history, comparable side-by-side, and promotable as the first segment of a full scene to avoid re-generation.

### What Already Exists
- PRD-021: Source images (seeds), PRD-023: Scene types, PRD-024: Generation loop
- PRD-036: Sync-play for comparison

### What We're Building
1. `test_shots` table for persisting test shots with parameters
2. Test shot generation service (PRD-024 pipeline with early termination)
3. Batch test shot dispatcher across characters
4. Test shot gallery with parameter display
5. Promotion service (test shot -> segment 001)

### Key Design Decisions
1. **Same pipeline, early termination** — Test shots use the exact same ComfyUI workflow as full generation. Only the loop termination differs (1 segment instead of N).
2. **Parameters recorded for reproducibility** — Every test shot stores the exact workflow, LoRA, CFG, seed, and prompt used.
3. **Promotion preserves continuity** — When promoted, the test shot's last frame becomes the seed for segment 002, maintaining the chaining model.

---

## Phase 1: Database Schema

### Task 1.1: Test Shots Table
**File:** `migrations/YYYYMMDD_create_test_shots.sql`

```sql
CREATE TABLE test_shots (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    workflow_id BIGINT REFERENCES workflows(id) ON DELETE SET NULL ON UPDATE CASCADE,
    parameters JSONB NOT NULL,
    seed_image_path TEXT NOT NULL,
    output_video_path TEXT,
    last_frame_path TEXT,
    duration_secs DOUBLE PRECISION,
    quality_score DOUBLE PRECISION,
    is_promoted BOOLEAN NOT NULL DEFAULT false,
    promoted_to_scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_shots_scene_type_id ON test_shots(scene_type_id);
CREATE INDEX idx_test_shots_character_id ON test_shots(character_id);
CREATE INDEX idx_test_shots_created_by_id ON test_shots(created_by_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON test_shots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Test shots linked to scene type and character
- [ ] Full generation parameters stored as JSONB
- [ ] Promotion tracking with link to scene

---

## Phase 2: Test Shot Generation

### Task 2.1: Test Shot Service
**File:** `src/services/test_shot_service.rs`

```rust
pub async fn generate_test_shot(pool: &sqlx::PgPool, request: TestShotRequest) -> Result<DbId, anyhow::Error> {
    // 1. Create test_shot record
    // 2. Use same pipeline as PRD-024 but stop after 1 segment
    // 3. Store output and last frame
    // 4. Run QA checks (PRD-049) on result
    todo!()
}

pub async fn batch_test_shots(pool: &sqlx::PgPool, scene_type_id: DbId, character_ids: &[DbId]) -> Result<Vec<DbId>, anyhow::Error> {
    // Generate test shots for a scene type across multiple characters
    // Parallel dispatch across workers
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Single segment generation using PRD-024 pipeline
- [ ] Batch dispatch across characters
- [ ] QA runs on results
- [ ] Available in ~30-60 seconds (GPU-dependent)

### Task 2.2: Promotion Service
**File:** `src/services/test_shot_promotion_service.rs`

```rust
pub async fn promote_test_shot(pool: &sqlx::PgPool, test_shot_id: DbId, scene_id: DbId) -> Result<(), anyhow::Error> {
    // 1. Create segment 001 from test shot output
    // 2. Copy video and last frame to scene storage
    // 3. Full generation continues from segment 002
    // 4. Mark test shot as promoted
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Test shot becomes segment 001 of the scene
- [ ] Last frame used as seed for segment 002
- [ ] Saves GPU time of re-generating first segment

---

## Phase 3: API & Frontend

### Task 3.1: Test Shot API
**File:** `src/routes/test_shot_routes.rs`

```rust
/// POST /api/scenes/:id/test-shot — Generate test shot
/// POST /api/test-shots/batch — Batch test shots
/// GET /api/test-shots/gallery — Browse test shots
/// POST /api/test-shots/:id/promote — Promote to scene segment
```

### Task 3.2: Test Shot Gallery
**File:** `frontend/src/components/test-shots/TestShotGallery.tsx`

**Acceptance Criteria:**
- [ ] Gallery of test shots with parameter display
- [ ] Sortable by date, character, quality
- [ ] Side-by-side comparison via PRD-036

### Task 3.3: Test Shot Button
**File:** `frontend/src/components/test-shots/TestShotButton.tsx`

**Acceptance Criteria:**
- [ ] Prominent "Test Shot" button on scene type config and scene views
- [ ] Quick toggle between configurations for comparison

---

## Phase 4: Testing

### Task 4.1: Test Shot Tests
**File:** `tests/test_shot_test.rs`

**Acceptance Criteria:**
- [ ] Test shot generates single segment
- [ ] Promotion correctly creates segment 001
- [ ] Batch test shots parallelize

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_test_shots.sql` | Test shots table |
| `src/services/test_shot_service.rs` | Generation and batch |
| `src/services/test_shot_promotion_service.rs` | Promotion to scene |
| `src/routes/test_shot_routes.rs` | API endpoints |
| `frontend/src/components/test-shots/TestShotGallery.tsx` | Gallery UI |
| `frontend/src/components/test-shots/TestShotButton.tsx` | Quick test button |

## Dependencies

### Existing Components to Reuse
- PRD-024: Generation pipeline (single segment), PRD-036: Sync-play, PRD-049: QA

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1, 3.3

### Post-MVP
1. Phase 2 — Task 2.2 (Promotion)
2. Phase 3 — Task 3.2 (Gallery)
3. Quick A/B testing

## Notes

1. **Cost savings:** Test shots cost ~5-10% of a full scene. For a 10-segment scene at 2 minutes per segment, a test shot takes ~2 minutes instead of ~20 minutes.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-058 v1.0
