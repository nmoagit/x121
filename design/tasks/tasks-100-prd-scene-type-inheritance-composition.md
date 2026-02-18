# Task List: Scene Type Inheritance & Composition

**PRD Reference:** `design/prds/100-prd-scene-type-inheritance-composition.md`
**Scope:** Hierarchical scene type definitions with parent-child inheritance, selective override, cascade updates, override indicators, and mixin compositions for reusable parameter bundles.

## Overview

Studios typically have 3-5 base scene types with 2-4 variations each. Without inheritance, updating a shared LoRA means editing 15 scene types. This feature provides parent-child hierarchy where children inherit and selectively override parent settings, cascade updates that propagate parent changes to non-overridden children, visual distinction between inherited and overridden values, and mixins for reusable parameter bundles that apply across scene types.

### What Already Exists
- PRD-023: Scene type configuration (base entity)

### What We're Building
1. `parent_scene_type_id` column on scene types
2. `scene_type_overrides` table tracking which fields are overridden
3. `mixins` table for reusable parameter bundles
4. Inheritance resolver (parent -> mixin -> child override)
5. Cascade update propagator
6. Override indicator UI

### Key Design Decisions
1. **Max depth 3** — Parent -> child -> grandchild. Deeper hierarchies add complexity without proportional value.
2. **Override tracking is field-level** — Each field independently tracked as inherited or overridden. One-click revert to re-inherit.
3. **Mixin precedence** — Parent < mixin < child override. Multiple mixins applied in specified order (last wins on conflict).

---

## Phase 1: Database Schema

### Task 1.1: Add Inheritance to Scene Types
**File:** `migrations/YYYYMMDD_add_scene_type_inheritance.sql`

```sql
ALTER TABLE scene_types
    ADD COLUMN parent_scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_scene_types_parent_scene_type_id ON scene_types(parent_scene_type_id);
```

### Task 1.2: Scene Type Overrides Table
**File:** `migrations/YYYYMMDD_create_scene_type_overrides.sql`

```sql
CREATE TABLE scene_type_overrides (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    field_name TEXT NOT NULL,
    override_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_scene_type_overrides ON scene_type_overrides(scene_type_id, field_name);
CREATE INDEX idx_scene_type_overrides_scene_type_id ON scene_type_overrides(scene_type_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_type_overrides
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.3: Mixins Table
**File:** `migrations/YYYYMMDD_create_mixins.sql`

```sql
CREATE TABLE mixins (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parameters JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON mixins
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE scene_type_mixins (
    id BIGSERIAL PRIMARY KEY,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    mixin_id BIGINT NOT NULL REFERENCES mixins(id) ON DELETE CASCADE ON UPDATE CASCADE,
    apply_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scene_type_mixins_scene_type_id ON scene_type_mixins(scene_type_id);
CREATE INDEX idx_scene_type_mixins_mixin_id ON scene_type_mixins(mixin_id);
CREATE UNIQUE INDEX uq_scene_type_mixins ON scene_type_mixins(scene_type_id, mixin_id);
```

---

## Phase 2: Inheritance Resolver

### Task 2.1: Effective Config Resolver
**File:** `src/services/scene_type_inheritance_service.rs`

```rust
pub async fn resolve_effective_config(pool: &sqlx::PgPool, scene_type_id: DbId) -> Result<EffectiveConfig, anyhow::Error> {
    // 1. Walk up parent chain to root
    // 2. Start with root config
    // 3. Apply each ancestor's values (non-overridden inherited)
    // 4. Apply mixins in order
    // 5. Apply child overrides
    // 6. Return effective config with per-field source annotations
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Correctly resolves parent -> mixin -> child chain
- [ ] Non-overridden fields inherit from parent
- [ ] Max depth enforced
- [ ] Returns per-field annotations (inherited from X / overridden)

### Task 2.2: Cascade Update Propagator
**File:** `src/services/scene_type_inheritance_service.rs`

```rust
pub async fn propagate_parent_change(pool: &sqlx::PgPool, parent_id: DbId, changed_field: &str) -> Result<Vec<DbId>, anyhow::Error> {
    // Find all children without override on changed_field
    // These children's effective config changes
    // Return affected child IDs
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Parent changes propagate to non-overridden children
- [ ] Children with overrides unaffected
- [ ] Impact preview available before applying

---

## Phase 3: API & Frontend

### Task 3.1: Inheritance API
**File:** `src/routes/scene_type_inheritance_routes.rs`

```rust
/// POST /api/scene-types/:id/children — Create child scene type
/// GET /api/scene-types/:id/effective-config — Resolved config with annotations
/// PUT /api/scene-types/:id/overrides/:field — Set/clear override
/// CRUD /api/mixins
/// POST /api/scene-types/:id/mixins — Apply mixin
```

### Task 3.2: Override Indicator UI
**File:** `frontend/src/components/scene-types/OverrideIndicator.tsx`

**Acceptance Criteria:**
- [ ] Inherited values: greyed, "inherited from [Parent]"
- [ ] Overridden values: bold, "overridden"
- [ ] One-click toggle between inherited and overridden

### Task 3.3: Inheritance Tree View
**File:** `frontend/src/components/scene-types/InheritanceTree.tsx`

**Acceptance Criteria:**
- [ ] Tree view of parent -> children hierarchy
- [ ] Shows effective values at each level
- [ ] Navigate to any node for editing

---

## Phase 4: Testing

### Task 4.1: Inheritance Tests
**File:** `tests/scene_type_inheritance_test.rs`

**Acceptance Criteria:**
- [ ] Child inherits all parent fields
- [ ] Override replaces inherited value
- [ ] Cascade propagates to non-overridden children
- [ ] Max depth enforced
- [ ] Mixin application order correct

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_add_scene_type_inheritance.sql` | Parent FK |
| `migrations/YYYYMMDD_create_scene_type_overrides.sql` | Override tracking |
| `migrations/YYYYMMDD_create_mixins.sql` | Mixin tables |
| `src/services/scene_type_inheritance_service.rs` | Resolver and cascade |
| `src/routes/scene_type_inheritance_routes.rs` | Inheritance API |
| `frontend/src/components/scene-types/OverrideIndicator.tsx` | Override UI |
| `frontend/src/components/scene-types/InheritanceTree.tsx` | Tree view |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Tasks 2.1-2.2
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 1 — Task 1.3 (Mixins)
2. Phase 3 — Task 3.3 (Tree view)
3. Multi-level cascade preview

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-100 v1.0
