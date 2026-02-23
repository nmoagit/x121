-- PRD-18: Bulk Data Maintenance (Search/Replace/Re-path)
-- Creates lookup tables for operation types and statuses, plus the main
-- bulk_operations table for tracking find/replace, re-path, and batch
-- update operations with preview, execution, and undo support.

-- ---------------------------------------------------------------------------
-- Lookup: bulk_operation_types
-- ---------------------------------------------------------------------------

CREATE TABLE bulk_operation_types (
    id   SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO bulk_operation_types (name, label) VALUES
    ('find_replace',  'Find & Replace'),
    ('repath',        'Bulk Re-Path'),
    ('batch_update',  'Batch Update');

-- ---------------------------------------------------------------------------
-- Lookup: bulk_operation_statuses
-- ---------------------------------------------------------------------------

CREATE TABLE bulk_operation_statuses (
    id   SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO bulk_operation_statuses (name, label) VALUES
    ('preview',   'Preview'),
    ('executing', 'Executing'),
    ('completed', 'Completed'),
    ('failed',    'Failed'),
    ('undone',    'Undone');

-- ---------------------------------------------------------------------------
-- Main table: bulk_operations
-- ---------------------------------------------------------------------------

CREATE TABLE bulk_operations (
    id                  BIGSERIAL    PRIMARY KEY,
    operation_type_id   SMALLINT     NOT NULL REFERENCES bulk_operation_types(id)   ON DELETE RESTRICT,
    status_id           SMALLINT     NOT NULL REFERENCES bulk_operation_statuses(id) ON DELETE RESTRICT,
    parameters          JSONB        NOT NULL,
    scope_project_id    BIGINT       NULL,
    affected_entity_type TEXT,
    affected_field      TEXT,
    preview_count       INTEGER      NOT NULL DEFAULT 0,
    affected_count      INTEGER      NOT NULL DEFAULT 0,
    undo_data           JSONB        NOT NULL DEFAULT '[]',
    error_message       TEXT,
    executed_by         BIGINT       NULL,
    executed_at         TIMESTAMPTZ  NULL,
    undone_at           TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bulk_operations_type_id    ON bulk_operations(operation_type_id);
CREATE INDEX idx_bulk_operations_status_id  ON bulk_operations(status_id);
CREATE INDEX idx_bulk_operations_project_id ON bulk_operations(scope_project_id);
CREATE INDEX idx_bulk_operations_created_at ON bulk_operations(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bulk_operations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
