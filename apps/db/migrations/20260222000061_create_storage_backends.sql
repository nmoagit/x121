-- PRD-48: External & Tiered Storage — backend types, statuses, and backends table.

-- Lookup table: storage backend types (local, s3, nfs).
CREATE TABLE storage_backend_types (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO storage_backend_types (name, label) VALUES
    ('local', 'Local Filesystem'),
    ('s3',    'Amazon S3 / Compatible'),
    ('nfs',   'Network File System');

-- Lookup table: storage backend statuses.
CREATE TABLE storage_backend_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO storage_backend_statuses (name, label) VALUES
    ('active',          'Active'),
    ('read_only',       'Read Only'),
    ('offline',         'Offline'),
    ('decommissioned',  'Decommissioned');

-- Main storage backends table.
CREATE TABLE storage_backends (
    id                  BIGSERIAL   PRIMARY KEY,
    name                TEXT        NOT NULL,
    backend_type_id     SMALLINT    NOT NULL REFERENCES storage_backend_types(id),
    status_id           SMALLINT    NOT NULL REFERENCES storage_backend_statuses(id) DEFAULT 1,
    tier                TEXT        NOT NULL DEFAULT 'hot' CHECK (tier IN ('hot', 'cold')),
    config              JSONB       NOT NULL DEFAULT '{}',
    is_default          BOOLEAN     NOT NULL DEFAULT FALSE,
    total_capacity_bytes BIGINT     NULL,
    used_bytes          BIGINT      NOT NULL DEFAULT 0,
    project_id          BIGINT      NULL REFERENCES projects(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_backends_type_id    ON storage_backends(backend_type_id);
CREATE INDEX idx_storage_backends_status_id  ON storage_backends(status_id);
CREATE INDEX idx_storage_backends_tier       ON storage_backends(tier);
CREATE INDEX idx_storage_backends_project_id ON storage_backends(project_id);

CREATE TRIGGER trg_storage_backends_updated_at BEFORE UPDATE ON storage_backends
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
