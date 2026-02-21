-- Per-user undo snapshot storage (PRD-04: Session & Workspace Persistence).
-- Stores serialized undo trees per entity, separate from workspace state
-- to keep the workspace blob lean while allowing large undo histories.

CREATE TABLE undo_snapshots (
    id                  BIGSERIAL    PRIMARY KEY,
    user_id             BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    entity_type         TEXT         NOT NULL,
    entity_id           BIGINT       NOT NULL,
    snapshot_data       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    snapshot_size_bytes INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FK index for user_id lookups and CASCADE performance.
CREATE INDEX idx_undo_snapshots_user_id ON undo_snapshots(user_id);

-- One undo snapshot per user per entity.
CREATE UNIQUE INDEX uq_undo_snapshots_user_entity ON undo_snapshots(user_id, entity_type, entity_id);

CREATE TRIGGER trg_undo_snapshots_updated_at
    BEFORE UPDATE ON undo_snapshots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
