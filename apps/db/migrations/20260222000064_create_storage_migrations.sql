-- PRD-48: External & Tiered Storage — storage migration tracking.

-- Lookup table: storage migration statuses.
CREATE TABLE storage_migration_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO storage_migration_statuses (name, label) VALUES
    ('pending',     'Pending'),
    ('in_progress', 'In Progress'),
    ('verifying',   'Verifying'),
    ('completed',   'Completed'),
    ('failed',      'Failed'),
    ('rolled_back', 'Rolled Back');

-- Main storage migrations table.
CREATE TABLE storage_migrations (
    id                  BIGSERIAL   PRIMARY KEY,
    status_id           SMALLINT    NOT NULL REFERENCES storage_migration_statuses(id) DEFAULT 1,
    source_backend_id   BIGINT      NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT,
    target_backend_id   BIGINT      NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT,
    total_files         INTEGER     NOT NULL DEFAULT 0,
    transferred_files   INTEGER     NOT NULL DEFAULT 0,
    verified_files      INTEGER     NOT NULL DEFAULT 0,
    failed_files        INTEGER     NOT NULL DEFAULT 0,
    total_bytes         BIGINT      NOT NULL DEFAULT 0,
    transferred_bytes   BIGINT      NOT NULL DEFAULT 0,
    error_log           JSONB       NOT NULL DEFAULT '[]',
    started_at          TIMESTAMPTZ NULL,
    completed_at        TIMESTAMPTZ NULL,
    initiated_by        BIGINT      NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_storage_migrations_updated_at BEFORE UPDATE ON storage_migrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
