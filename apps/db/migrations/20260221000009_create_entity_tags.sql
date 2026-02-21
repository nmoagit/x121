-- Polymorphic entity-tag junction table (PRD-47).
--
-- Links tags to any entity type (project, character, scene, segment, workflow)
-- via entity_type + entity_id. A single junction table avoids per-entity-type
-- tag tables while keeping queries efficient via composite indexes.

CREATE TABLE entity_tags (
    id              BIGSERIAL    PRIMARY KEY,
    entity_type     TEXT         NOT NULL,                    -- 'project', 'character', 'scene', 'segment', 'workflow'
    entity_id       BIGINT       NOT NULL,
    tag_id          BIGINT       NOT NULL REFERENCES tags(id) ON DELETE CASCADE ON UPDATE CASCADE,
    applied_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Prevent duplicate tag-entity pairs.
CREATE UNIQUE INDEX uq_entity_tags ON entity_tags(entity_type, entity_id, tag_id);

-- Fast lookup: "which entities have this tag?"
CREATE INDEX idx_entity_tags_tag_id ON entity_tags(tag_id);

-- Fast lookup: "which tags does this entity have?"
CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_type, entity_id);

-- Auto-update updated_at on row changes.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON entity_tags
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
