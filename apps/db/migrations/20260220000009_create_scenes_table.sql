-- Scenes: a specific combination of character, scene type, and image variant.

CREATE TABLE scenes (
    id               BIGSERIAL PRIMARY KEY,
    character_id     BIGINT   NOT NULL REFERENCES characters(id)     ON DELETE CASCADE  ON UPDATE CASCADE,
    scene_type_id    BIGINT   NOT NULL REFERENCES scene_types(id)    ON DELETE RESTRICT ON UPDATE CASCADE,
    image_variant_id BIGINT   NOT NULL REFERENCES image_variants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id        SMALLINT NOT NULL REFERENCES scene_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    transition_mode  TEXT     NOT NULL DEFAULT 'normal',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_scenes_character_id     ON scenes(character_id);
CREATE INDEX idx_scenes_scene_type_id    ON scenes(scene_type_id);
CREATE INDEX idx_scenes_image_variant_id ON scenes(image_variant_id);
CREATE INDEX idx_scenes_status_id        ON scenes(status_id);

-- Unique constraint: one scene per character + scene_type + image_variant
CREATE UNIQUE INDEX uq_scenes_character_scene_type_variant
    ON scenes(character_id, scene_type_id, image_variant_id);

-- Updated_at trigger
CREATE TRIGGER trg_scenes_updated_at
    BEFORE UPDATE ON scenes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
