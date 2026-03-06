-- Speech types lookup table (seeded, user-extensible)
CREATE TABLE speech_types (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default types
INSERT INTO speech_types (name) VALUES
    ('Greeting'), ('Farewell'), ('Flirty'), ('Angry'),
    ('Sad'), ('Excited'), ('Neutral'), ('Whisper');

-- Character speech entries
CREATE TABLE character_speeches (
    id             BIGSERIAL   PRIMARY KEY,
    character_id   BIGINT      NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    speech_type_id SMALLINT    NOT NULL REFERENCES speech_types(id) ON DELETE RESTRICT,
    version        INT         NOT NULL,
    text           TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);

-- Unique: one version per (character, type) pair, excluding soft-deleted
CREATE UNIQUE INDEX uq_character_speeches_char_type_version
    ON character_speeches (character_id, speech_type_id, version)
    WHERE deleted_at IS NULL;

-- FK indexes
CREATE INDEX idx_character_speeches_character_id   ON character_speeches(character_id);
CREATE INDEX idx_character_speeches_speech_type_id ON character_speeches(speech_type_id);

-- Updated_at trigger
CREATE TRIGGER trg_character_speeches_updated_at
    BEFORE UPDATE ON character_speeches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
