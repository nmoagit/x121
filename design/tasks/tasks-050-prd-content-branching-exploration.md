# Task List: Content Branching & Exploration

**PRD Reference:** `design/prds/050-prd-content-branching-exploration.md`
**Scope:** Git-like branching for scenes and character configurations, enabling concurrent creative exploration with side-by-side comparison, merge/promote, and branch cleanup with disk reclamation.

## Overview

Branching enables concurrent creative exploration without risking the approved main line. Creators can fork a scene, try a completely different LoRA or prompt, compare branch results side-by-side with the main line, and promote the winner. This is distinct from undo (linear reversal) and re-rolling (in-place replacement). Branch metadata and segment outputs are tracked independently, with disk reclamation integration for cleaning up abandoned experiments.

### What Already Exists
- PRD-001: Data model (scenes, segments)
- PRD-015: Intelligent deferred disk reclamation
- PRD-036: Sync-play grid for side-by-side comparison

### What We're Building
1. `branches` table with parent-child relationships
2. Branch creation service (fork scene parameters independently)
3. Branch comparison using sync-play
4. Merge/promote service (branch becomes main line)
5. Branch cleanup with PRD-015 reclamation
6. Branch management UI

### Key Design Decisions
1. **Branch at scene level** — Branches fork a scene's configuration (parameters, workflow). Segments are generated independently per branch.
2. **Main line as branch** — The main line is itself a branch (the "default" branch). Promoting makes a different branch the default.
3. **Soft branch nesting** — Branches of branches allowed but limited to configurable depth (default: 3).
4. **File-level independence** — Each branch generates its own segment files. No shared files between branches.

---

## Phase 1: Database Schema

### Task 1.1: Branches Table
**File:** `migrations/YYYYMMDD_create_branches.sql`

```sql
CREATE TABLE branches (
    id BIGSERIAL PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    parent_branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    depth INTEGER NOT NULL DEFAULT 0,
    parameters_snapshot JSONB NOT NULL,  -- Scene config at branch point
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branches_scene_id ON branches(scene_id);
CREATE INDEX idx_branches_parent_branch_id ON branches(parent_branch_id);
CREATE INDEX idx_branches_created_by_id ON branches(created_by_id);
CREATE UNIQUE INDEX uq_branches_scene_default ON branches(scene_id) WHERE is_default = true;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Add branch_id to segments
ALTER TABLE segments ADD COLUMN branch_id BIGINT REFERENCES branches(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX idx_segments_branch_id ON segments(branch_id);
```

**Acceptance Criteria:**
- [ ] Branches linked to scenes with parent-child relationships
- [ ] Only one default branch per scene (partial unique index)
- [ ] Segments linked to branches
- [ ] Depth tracked for nesting limits

---

## Phase 2: Branch Management Service

### Task 2.1: Branch Creation
**File:** `src/services/branch_service.rs`

```rust
pub async fn create_branch(pool: &sqlx::PgPool, scene_id: DbId, name: &str, user_id: DbId) -> Result<DbId, anyhow::Error> {
    // 1. Load current scene config as snapshot
    // 2. Create branch record with snapshot
    // 3. Branch gets independent copy of parameters
    // 4. Return branch ID
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Branch from any scene at any point
- [ ] Independent copy of parameters
- [ ] Named and described
- [ ] Nesting depth enforced

### Task 2.2: Promote/Merge Service
**File:** `src/services/branch_service.rs`

```rust
pub async fn promote_branch(pool: &sqlx::PgPool, branch_id: DbId) -> Result<(), anyhow::Error> {
    // 1. Current default branch loses is_default
    // 2. Selected branch becomes is_default
    // 3. Previous default preserved as non-default branch
    // 4. Audit trail logged
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Promote replaces current default
- [ ] Previous default preserved (not deleted)
- [ ] Cherry-pick specific segments from branch supported
- [ ] Logged in audit trail

### Task 2.3: Branch Cleanup
**File:** `src/services/branch_service.rs`

**Acceptance Criteria:**
- [ ] Delete branch and associated segment files
- [ ] Deletion through PRD-015 reclamation policies
- [ ] Bulk cleanup for branches older than threshold
- [ ] Confirmation required

---

## Phase 3: API & Frontend

### Task 3.1: Branch API Endpoints
**File:** `src/routes/branch_routes.rs`

```rust
/// POST /api/scenes/:id/branch — Create branch
/// POST /api/branches/:id/promote — Promote to default
/// DELETE /api/branches/:id — Delete branch
/// GET /api/scenes/:id/branches — List branches
```

### Task 3.2: Branch Comparison UI
**File:** `frontend/src/components/branches/BranchComparison.tsx`

**Acceptance Criteria:**
- [ ] Compare branches using PRD-036 Sync-Play
- [ ] QA scores shown for both branches
- [ ] Visual diff highlighting

### Task 3.3: Branch Manager UI
**File:** `frontend/src/components/branches/BranchManager.tsx`

**Acceptance Criteria:**
- [ ] List all branches with status
- [ ] Active branch indicator in scene header
- [ ] Create, promote, delete actions

---

## Phase 4: Testing

### Task 4.1: Branch Tests
**File:** `tests/branch_test.rs`

**Acceptance Criteria:**
- [ ] Branch creation preserves snapshot
- [ ] Promote correctly swaps default
- [ ] Delete removes branch files
- [ ] Nesting depth enforced

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_branches.sql` | Branches table and segment linkage |
| `src/services/branch_service.rs` | Branch CRUD, promote, cleanup |
| `src/routes/branch_routes.rs` | Branch API |
| `frontend/src/components/branches/BranchComparison.tsx` | Comparison UI |
| `frontend/src/components/branches/BranchManager.tsx` | Branch management |

## Dependencies

### Existing Components to Reuse
- PRD-015: Disk reclamation for branch cleanup
- PRD-036: Sync-play for branch comparison

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1-2.2
3. Phase 3 — Tasks 3.1, 3.3

### Post-MVP Enhancements
1. Phase 2 — Task 2.3 (Cleanup)
2. Phase 3 — Task 3.2 (Comparison)
3. Branch timeline visualization

## Notes

1. **Disk impact:** Each branch generates independent segment files. Active branches can significantly increase disk usage. Integration with PRD-015 reclamation is important.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-050 v1.0
