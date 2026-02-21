-- Asset dependency mapping (PRD-17).
-- Links assets to dependent entities via a polymorphic (entity_type + entity_id) pattern.
CREATE TABLE asset_dependencies (
    id                      BIGSERIAL PRIMARY KEY,
    asset_id                BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    dependent_entity_type   TEXT NOT NULL,
    dependent_entity_id     BIGINT NOT NULL,
    dependency_role         TEXT NOT NULL DEFAULT 'required',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_dependencies_asset_id ON asset_dependencies(asset_id);
CREATE INDEX idx_asset_dependencies_entity ON asset_dependencies(dependent_entity_type, dependent_entity_id);
CREATE UNIQUE INDEX uq_asset_dependencies_unique ON asset_dependencies(
    asset_id, dependent_entity_type, dependent_entity_id, dependency_role
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_dependencies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
