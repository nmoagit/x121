-- Batch Metadata Operations (PRD-088).
-- Status lookup table + batch operation tracking with JSONB undo snapshots.

-- Status lookup table.
CREATE TABLE batch_metadata_op_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_batch_metadata_op_statuses_updated_at
    BEFORE UPDATE ON batch_metadata_op_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO batch_metadata_op_statuses (name, label) VALUES
    ('preview',    'Preview'),
    ('applying',   'Applying'),
    ('completed',  'Completed'),
    ('undone',     'Undone'),
    ('failed',     'Failed');

-- Batch metadata operations tracking table.
CREATE TABLE batch_metadata_operations (
    id              BIGSERIAL PRIMARY KEY,
    status_id       SMALLINT NOT NULL REFERENCES batch_metadata_op_statuses(id)
                        ON DELETE RESTRICT ON UPDATE CASCADE,
    operation_type  TEXT NOT NULL,
    project_id      BIGINT NOT NULL,
    character_ids   BIGINT[] NOT NULL,
    character_count INTEGER NOT NULL DEFAULT 0,
    parameters      JSONB NOT NULL DEFAULT '{}',
    before_snapshot JSONB NOT NULL DEFAULT '{}',
    after_snapshot  JSONB NOT NULL DEFAULT '{}',
    summary         TEXT NOT NULL DEFAULT '',
    initiated_by    BIGINT NULL,
    applied_at      TIMESTAMPTZ NULL,
    undone_at       TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_batch_metadata_operations_updated_at
    BEFORE UPDATE ON batch_metadata_operations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_batch_metadata_operations_status_id
    ON batch_metadata_operations(status_id);
CREATE INDEX idx_batch_metadata_operations_project_id
    ON batch_metadata_operations(project_id);
CREATE INDEX idx_batch_metadata_operations_operation_type
    ON batch_metadata_operations(operation_type);
CREATE INDEX idx_batch_metadata_operations_created_at
    ON batch_metadata_operations(created_at);
