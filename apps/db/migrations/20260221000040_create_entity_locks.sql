-- Exclusive entity locking for real-time collaboration (PRD-11: Real-time Collaboration Layer).
-- Stores database-backed locks on (entity_type, entity_id) pairs with configurable expiration.
-- A partial unique index on is_active = true ensures only one active lock per entity.

CREATE TABLE entity_locks (
    id           BIGSERIAL    PRIMARY KEY,
    entity_type  TEXT         NOT NULL,
    entity_id    BIGINT       NOT NULL,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    lock_type    TEXT         NOT NULL DEFAULT 'exclusive',
    acquired_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ  NOT NULL,
    released_at  TIMESTAMPTZ,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one active lock per (entity_type, entity_id) at a time.
CREATE UNIQUE INDEX uq_entity_locks_active
    ON entity_locks(entity_type, entity_id) WHERE is_active = true;

-- FK index for user_id lookups and CASCADE performance.
CREATE INDEX idx_entity_locks_user_id ON entity_locks(user_id);

-- Fast lookup for expired-lock cleanup.
CREATE INDEX idx_entity_locks_expires_at
    ON entity_locks(expires_at) WHERE is_active = true;

CREATE TRIGGER trg_entity_locks_updated_at
    BEFORE UPDATE ON entity_locks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
