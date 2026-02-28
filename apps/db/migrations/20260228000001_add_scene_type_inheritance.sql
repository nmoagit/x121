-- PRD-100: Scene Type Inheritance & Composition
--
-- 1. Add parent/depth columns to scene_types for hierarchical inheritance (max depth 3).
-- 2. Create scene_type_overrides for field-level override tracking.
-- 3. Create mixins for reusable parameter bundles.
-- 4. Create scene_type_mixins for the many-to-many association.

-- 1. Parent reference and depth on scene_types.
ALTER TABLE scene_types
    ADD COLUMN parent_scene_type_id BIGINT REFERENCES scene_types(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_scene_types_parent_scene_type_id ON scene_types(parent_scene_type_id);

-- 2. Scene type field-level overrides.
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

-- 3. Mixins (reusable parameter bundles).
CREATE TABLE mixins (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON mixins
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. Scene type <-> mixin association.
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
