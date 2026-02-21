-- Asset protection rules for disk reclamation (PRD-15).
--
-- Defines conditions under which files/assets are permanently protected
-- from automated cleanup. Rules are evaluated before any reclamation action.

CREATE TABLE asset_protection_rules (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL UNIQUE,
    description TEXT,
    entity_type TEXT         NOT NULL,
    condition_field    TEXT  NOT NULL,
    condition_operator TEXT  NOT NULL,
    condition_value    TEXT  NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_protection_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_asset_protection_rules_entity_type ON asset_protection_rules (entity_type);
CREATE INDEX idx_asset_protection_rules_active ON asset_protection_rules (is_active) WHERE is_active = true;

-- Seed default protection rules.
INSERT INTO asset_protection_rules (name, description, entity_type, condition_field, condition_operator, condition_value) VALUES
    ('protect_source_images', 'Source images are permanently protected', 'source_image', 'id', 'is_not_null', 'true'),
    ('protect_approved_variants', 'Approved image variants are permanently protected', 'image_variant', 'status', 'eq', 'approved'),
    ('protect_delivered_scenes', 'Delivered scene outputs are permanently protected', 'scene', 'status', 'eq', 'delivered'),
    ('protect_approved_segments', 'Approved segments are permanently protected', 'segment', 'status', 'eq', 'approved');
