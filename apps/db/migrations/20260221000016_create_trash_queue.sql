-- Trash queue for deferred file deletion (PRD-15).
--
-- Files marked for deletion enter the trash queue with a grace period.
-- After the grace period expires, the executor permanently deletes the
-- file from disk. Items can be restored before expiration.

-- Lookup table for trash queue entry statuses.
CREATE TABLE trash_queue_statuses (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON trash_queue_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO trash_queue_statuses (name, description) VALUES
    ('pending',  'File is pending deletion after grace period expires'),
    ('expired',  'Grace period has expired; file is eligible for permanent deletion'),
    ('deleted',  'File has been permanently deleted from disk'),
    ('restored', 'File was restored from the trash queue before deletion');

-- The trash queue itself.
CREATE TABLE trash_queue (
    id              BIGSERIAL    PRIMARY KEY,
    status_id       BIGINT       NOT NULL REFERENCES trash_queue_statuses(id),
    entity_type     TEXT         NOT NULL,
    entity_id       BIGINT       NOT NULL,
    file_path       TEXT         NOT NULL,
    file_size_bytes BIGINT       NOT NULL DEFAULT 0,
    policy_id       BIGINT       REFERENCES reclamation_policies(id) ON DELETE SET NULL,
    marked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    delete_after    TIMESTAMPTZ  NOT NULL,
    deleted_at      TIMESTAMPTZ,
    restored_at     TIMESTAMPTZ,
    restored_by     BIGINT,
    project_id      BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON trash_queue
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_trash_queue_status_id ON trash_queue (status_id);
CREATE INDEX idx_trash_queue_entity ON trash_queue (entity_type, entity_id);
CREATE INDEX idx_trash_queue_project_id ON trash_queue (project_id);
CREATE INDEX idx_trash_queue_policy_id ON trash_queue (policy_id);

-- Partial index for efficiently finding pending items whose grace period has expired.
CREATE INDEX idx_trash_queue_pending_expired
    ON trash_queue (delete_after)
    WHERE status_id = 1;
