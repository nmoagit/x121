-- Character metadata versions — versioned metadata with generation reports.
--
-- Each row is an immutable snapshot of character metadata at a point in time.
-- The `is_active` flag indicates which version feeds `characters.metadata`.

CREATE TABLE character_metadata_versions (
    id                BIGSERIAL PRIMARY KEY,
    character_id      BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    version_number    INT NOT NULL,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'generated', 'csv_import', 'json_import')),
    source_bio        JSONB,
    source_tov        JSONB,
    generation_report JSONB,
    is_active         BOOLEAN NOT NULL DEFAULT false,
    notes             TEXT,
    rejection_reason  TEXT,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by character, ordered by version
CREATE UNIQUE INDEX idx_cmv_char_version
    ON character_metadata_versions (character_id, version_number);

-- Enforce at most one active version per character (among non-deleted rows)
CREATE UNIQUE INDEX idx_cmv_active
    ON character_metadata_versions (character_id)
    WHERE is_active = true AND deleted_at IS NULL;

-- FK index for cascading deletes
CREATE INDEX idx_cmv_character_id
    ON character_metadata_versions (character_id);

-- updated_at trigger (reuses the shared trigger function)
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON character_metadata_versions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
