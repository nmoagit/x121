-- PRD-111: Scene Catalog & Track Management
-- Per-character scene overrides (leaf tier of three-level inheritance)

CREATE TABLE character_scene_overrides (
    id               BIGSERIAL PRIMARY KEY,
    character_id     BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    is_enabled       BOOLEAN NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_character_scene_overrides_character_scene
    ON character_scene_overrides(character_id, scene_catalog_id);

CREATE INDEX idx_character_scene_overrides_character_id
    ON character_scene_overrides(character_id);

CREATE INDEX idx_character_scene_overrides_scene_catalog_id
    ON character_scene_overrides(scene_catalog_id);

CREATE TRIGGER trg_character_scene_overrides_updated_at BEFORE UPDATE ON character_scene_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
