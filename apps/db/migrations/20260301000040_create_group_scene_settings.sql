-- Group-level scene settings: intermediate layer between project and character.
-- Inheritance chain: scene_type → project → group → character.

CREATE TABLE group_scene_settings (
    id            BIGSERIAL PRIMARY KEY,
    group_id      BIGINT NOT NULL REFERENCES character_groups(id) ON DELETE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    track_id      BIGINT REFERENCES tracks(id) ON DELETE CASCADE,
    is_enabled    BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one setting per (group, scene_type, track) triple.
ALTER TABLE group_scene_settings
    ADD CONSTRAINT group_scene_settings_group_scene_track_uq
        UNIQUE NULLS NOT DISTINCT (group_id, scene_type_id, track_id);

CREATE INDEX idx_group_scene_settings_group_id
    ON group_scene_settings (group_id);

CREATE INDEX idx_group_scene_settings_scene_type_id
    ON group_scene_settings (scene_type_id);

CREATE INDEX idx_group_scene_settings_track_id
    ON group_scene_settings (track_id);

-- Auto-update updated_at on modification.
CREATE TRIGGER set_updated_at_group_scene_settings
    BEFORE UPDATE ON group_scene_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
