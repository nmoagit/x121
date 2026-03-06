-- Deliverable ignore list: marks specific scene_type+track combos as intentionally skipped for a character.
CREATE TABLE character_deliverable_ignores (
    id         BIGSERIAL   PRIMARY KEY,
    uuid       UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    character_id BIGINT    NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_type_id BIGINT   NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    track_id   BIGINT      REFERENCES tracks(id) ON DELETE CASCADE,
    ignored_by TEXT,
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_char_deliverable_ignore UNIQUE (character_id, scene_type_id, track_id)
);

CREATE INDEX idx_char_deliverable_ignores_char ON character_deliverable_ignores(character_id);
