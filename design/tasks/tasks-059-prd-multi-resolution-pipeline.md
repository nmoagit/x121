# Task List: Multi-Resolution Pipeline

**PRD Reference:** `design/prds/059-prd-multi-resolution-pipeline.md`
**Scope:** Define resolution tiers (Draft/Preview/Production), enable tier selection per job, provide one-click upscale from Draft to Production, and enforce Production-only delivery.

## Overview

Iterating at Draft resolution (512px) then upscaling only approved work to Production (1080p) reduces total GPU time by 60-80%. Most creative decisions are visible at 512px. This feature defines named resolution tiers, allows tier selection per job submission, provides one-click upscale triggering, quality comparison between tiers, and delivery enforcement requiring Production-tier content.

### What Already Exists
- PRD-024: Generation loop, PRD-036: Sync-play, PRD-039: Delivery

### What We're Building
1. `resolution_tiers` table with tier definitions
2. Resolution tier column on scenes and segments
3. Upscale orchestrator (re-generate at higher tier)
4. Delivery enforcement (Production-only)
5. Tier selection UI and upscale button

### Key Design Decisions
1. **Re-generation, not AI upscaling** — Upscaling means re-running the same workflow at higher resolution with identical seeds/parameters. Not super-resolution post-processing.
2. **Tier recorded per scene, not per segment** — All segments in a scene are the same tier. Mixed-tier scenes are not supported.
3. **Delivery blocks non-Production** — PRD-039 delivery pipeline rejects Draft/Preview content.

---

## Phase 1: Database Schema

### Task 1.1: Resolution Tiers Table
**File:** `migrations/YYYYMMDD_create_resolution_tiers.sql`

```sql
CREATE TABLE resolution_tiers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    quality_settings JSONB,
    speed_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON resolution_tiers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO resolution_tiers (name, width, height, speed_factor, is_default, sort_order) VALUES
    ('draft', 512, 512, 5.0, true, 1),
    ('preview', 768, 768, 2.5, false, 2),
    ('production', 1920, 1080, 1.0, false, 3);
```

### Task 1.2: Add Tier to Scenes
**File:** `migrations/YYYYMMDD_add_resolution_tier_to_scenes.sql`

```sql
ALTER TABLE scenes
    ADD COLUMN resolution_tier_id BIGINT NOT NULL DEFAULT 1 REFERENCES resolution_tiers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD COLUMN upscaled_from_scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_scenes_resolution_tier_id ON scenes(resolution_tier_id);
CREATE INDEX idx_scenes_upscaled_from_scene_id ON scenes(upscaled_from_scene_id);
```

**Acceptance Criteria:**
- [ ] Built-in tiers: Draft, Preview, Production
- [ ] Custom tiers configurable by Admin
- [ ] Scene-level tier tracking
- [ ] Upscale linkage between scenes

---

## Phase 2: Upscale Service

### Task 2.1: Upscale Orchestrator
**File:** `src/services/upscale_service.rs`

```rust
pub async fn upscale_scene(pool: &sqlx::PgPool, scene_id: DbId, target_tier_id: DbId) -> Result<DbId, anyhow::Error> {
    // 1. Create new scene at target tier linked to original
    // 2. Re-run same workflow with identical seeds at higher resolution
    // 3. Track progress
    // 4. Link Production output to Draft that was approved
    todo!()
}
```

**Acceptance Criteria:**
- [ ] One-click upscale from Draft/Preview to Production
- [ ] Same seeds, parameters, just higher resolution
- [ ] Progress tracking during upscale
- [ ] Links maintained between tier versions

### Task 2.2: Delivery Enforcement
**File:** `src/services/delivery_enforcement.rs`

**Acceptance Criteria:**
- [ ] PRD-039 delivery rejects non-Production content
- [ ] Clear warning if attempting non-Production delivery
- [ ] Resolution tier badge visible on all scene cards

---

## Phase 3: API & Frontend

### Task 3.1: Resolution Tier API
**File:** `src/routes/resolution_routes.rs`

```rust
/// GET /api/resolution-tiers — List tiers
/// POST /api/scenes/:id/upscale — Trigger upscale
```

### Task 3.2: Tier Badge and Upscale Button
**File:** `frontend/src/components/resolution/TierBadge.tsx`

**Acceptance Criteria:**
- [ ] Badge on every scene card: "Draft", "Preview", "Production"
- [ ] Upscale button prominent on approved Draft scenes
- [ ] Tier selectable on job submission

---

## Phase 4: Testing

### Task 4.1: Resolution Tests
**File:** `tests/resolution_tier_test.rs`

**Acceptance Criteria:**
- [ ] Tier selection stored correctly
- [ ] Upscale creates linked scene at higher tier
- [ ] Delivery enforcement blocks non-Production

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_resolution_tiers.sql` | Tier definitions |
| `migrations/YYYYMMDD_add_resolution_tier_to_scenes.sql` | Scene tier linkage |
| `src/services/upscale_service.rs` | Upscale orchestrator |
| `src/routes/resolution_routes.rs` | Resolution API |
| `frontend/src/components/resolution/TierBadge.tsx` | Tier indicator |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 2 — Task 2.2 (Delivery enforcement)
2. Progressive upscaling (auto-queue on approval)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-059 v1.0
