-- PRD-31: Command Palette & Navigation (Cmd+K)
-- Tracks recently accessed entities per user for frecency-ranked recent items.

CREATE TABLE user_recent_items (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type     TEXT            NOT NULL,
    entity_id       BIGINT          NOT NULL,
    access_count    INTEGER         NOT NULL DEFAULT 1,
    last_accessed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_recent_items_user_id ON user_recent_items(user_id);
CREATE INDEX idx_user_recent_items_last_accessed ON user_recent_items(user_id, last_accessed_at DESC);
CREATE UNIQUE INDEX uq_user_recent_items_user_entity ON user_recent_items(user_id, entity_type, entity_id);

CREATE TRIGGER trg_user_recent_items_updated_at BEFORE UPDATE ON user_recent_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
