-- PRD-136: Multilingual Speech & Deliverable System
-- Adds language support, speech statuses, sort ordering, and per-project speech config.

BEGIN;

-- ============================================================
-- 1. Languages lookup table
-- ============================================================
CREATE TABLE languages (
    id         SMALLSERIAL  PRIMARY KEY,
    code       VARCHAR(10)  NOT NULL UNIQUE,
    name       TEXT         NOT NULL,
    flag_code  VARCHAR(10)  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO languages (code, name, flag_code) VALUES
    ('en', 'English',    'us'),
    ('es', 'Spanish',    'es'),
    ('fr', 'French',     'fr'),
    ('de', 'German',     'de'),
    ('pt', 'Portuguese', 'br'),
    ('it', 'Italian',    'it'),
    ('ja', 'Japanese',   'jp'),
    ('ko', 'Korean',     'kr'),
    ('zh', 'Chinese',    'cn'),
    ('ru', 'Russian',    'ru'),
    ('ar', 'Arabic',     'sa'),
    ('hi', 'Hindi',      'in');

-- ============================================================
-- 2. Speech statuses lookup table
-- ============================================================
CREATE TABLE speech_statuses (
    id         SMALLSERIAL  PRIMARY KEY,
    name       TEXT         NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO speech_statuses (id, name) VALUES
    (1, 'draft'),
    (2, 'approved'),
    (3, 'rejected');

-- ============================================================
-- 3. Add sort_order to speech_types and backfill
-- ============================================================
ALTER TABLE speech_types
    ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

UPDATE speech_types SET sort_order = CASE name
    WHEN 'Greeting' THEN 1
    WHEN 'Farewell' THEN 2
    WHEN 'Flirty'   THEN 3
    WHEN 'Excited'  THEN 4
    WHEN 'Neutral'  THEN 5
    WHEN 'Whisper'  THEN 6
    WHEN 'Angry'    THEN 7
    WHEN 'Sad'      THEN 8
    ELSE 99
END;

-- ============================================================
-- 4. Add language_id, status_id, sort_order to character_speeches
-- ============================================================
ALTER TABLE character_speeches
    ADD COLUMN language_id SMALLINT NOT NULL DEFAULT 1
        REFERENCES languages(id) ON DELETE RESTRICT,
    ADD COLUMN status_id   SMALLINT NOT NULL DEFAULT 1
        REFERENCES speech_statuses(id) ON DELETE RESTRICT,
    ADD COLUMN sort_order  INT      NOT NULL DEFAULT 0;

-- ============================================================
-- 5. Backfill sort_order: sequential per (character_id, speech_type_id)
-- ============================================================
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY character_id, speech_type_id
               ORDER BY version
           ) AS rn
    FROM character_speeches
)
UPDATE character_speeches cs
SET sort_order = r.rn
FROM ranked r
WHERE cs.id = r.id;

-- ============================================================
-- 6. Replace unique constraint to include language_id
-- ============================================================
DROP INDEX IF EXISTS uq_character_speeches_char_type_version;

CREATE UNIQUE INDEX uq_character_speeches_char_type_lang_version
    ON character_speeches (character_id, speech_type_id, language_id, version)
    WHERE deleted_at IS NULL;

-- ============================================================
-- 7. FK indexes on new columns
-- ============================================================
CREATE INDEX idx_character_speeches_language_id ON character_speeches(language_id);
CREATE INDEX idx_character_speeches_status_id   ON character_speeches(status_id);

-- ============================================================
-- 8. Project speech configuration table
-- ============================================================
CREATE TABLE project_speech_config (
    id             BIGSERIAL   PRIMARY KEY,
    project_id     BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    speech_type_id SMALLINT    NOT NULL REFERENCES speech_types(id) ON DELETE CASCADE,
    language_id    SMALLINT    NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    min_variants   INT         NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_project_speech_config_proj_type_lang
    ON project_speech_config (project_id, speech_type_id, language_id);

CREATE INDEX idx_project_speech_config_project_id ON project_speech_config(project_id);

COMMIT;
