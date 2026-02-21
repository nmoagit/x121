-- User presence tracking for real-time collaboration (PRD-11: Real-time Collaboration Layer).
-- Tracks which user is viewing which entity, with last_seen_at for activity detection.

CREATE TABLE user_presence (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    entity_type  TEXT         NOT NULL,
    entity_id    BIGINT       NOT NULL,
    last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- One active presence record per user per entity.
CREATE UNIQUE INDEX uq_user_presence_user_entity
    ON user_presence(user_id, entity_type, entity_id) WHERE is_active = true;

-- "Who is viewing this entity?" queries.
CREATE INDEX idx_user_presence_entity
    ON user_presence(entity_type, entity_id) WHERE is_active = true;

-- FK index for user_id lookups and CASCADE performance.
CREATE INDEX idx_user_presence_user_id ON user_presence(user_id);

CREATE TRIGGER trg_user_presence_updated_at
    BEFORE UPDATE ON user_presence
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
