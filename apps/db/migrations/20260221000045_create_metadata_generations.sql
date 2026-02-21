-- PRD-13: Dual-Metadata System (JSON) — metadata generation tracking.
--
-- Records when metadata JSON was last generated per entity, enabling
-- staleness detection and regeneration workflows.

CREATE TABLE metadata_generations (
    id                BIGSERIAL PRIMARY KEY,
    entity_type       TEXT NOT NULL,                         -- 'character' or 'scene'
    entity_id         BIGINT NOT NULL,
    file_type         TEXT NOT NULL,                         -- 'character_metadata' or 'video_metadata'
    file_path         TEXT NOT NULL,
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_updated_at TIMESTAMPTZ NOT NULL,                  -- snapshot of entity's updated_at at generation time
    schema_version    TEXT NOT NULL,
    file_hash         TEXT NOT NULL,                          -- SHA-256 of generated file for integrity
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Look up generations by entity.
CREATE INDEX idx_metadata_generations_entity
    ON metadata_generations(entity_type, entity_id);

-- Look up generations by file type.
CREATE INDEX idx_metadata_generations_file_type
    ON metadata_generations(file_type);

-- One generation record per entity + file_type combination.
CREATE UNIQUE INDEX uq_metadata_generations_entity_file
    ON metadata_generations(entity_type, entity_id, file_type);

-- Auto-update updated_at on row modification.
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON metadata_generations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
