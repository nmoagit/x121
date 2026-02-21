-- PRD-016: Folder-to-Entity Bulk Importer — import session tracking.
--
-- Tables: import_session_statuses (lookup), import_sessions (session lifecycle).

-- ── Import Session Status Lookup ─────────────────────────────────────

CREATE TABLE import_session_statuses (
    id          BIGSERIAL       PRIMARY KEY,
    name        TEXT            NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_session_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO import_session_statuses (name, description) VALUES
    ('uploading',  'Files are being uploaded to staging'),
    ('parsing',    'Folder structure is being analyzed'),
    ('preview',    'Preview ready for user review'),
    ('committing', 'Import is being committed'),
    ('committed',  'Import completed successfully'),
    ('partial',    'Import committed with some skipped records'),
    ('cancelled',  'Import cancelled by user'),
    ('failed',     'Import failed with errors');

-- ── Import Sessions ──────────────────────────────────────────────────

CREATE TABLE import_sessions (
    id                     BIGSERIAL   PRIMARY KEY,
    status_id              BIGINT      NOT NULL REFERENCES import_session_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_id             BIGINT      NOT NULL,
    staging_path           TEXT        NOT NULL,
    source_name            TEXT        NOT NULL,
    total_files            INTEGER     NOT NULL DEFAULT 0,
    total_size_bytes       BIGINT      NOT NULL DEFAULT 0,
    mapped_entities        INTEGER     NOT NULL DEFAULT 0,
    validation_report_id   BIGINT      NULL,
    created_by             BIGINT      NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_sessions_status_id  ON import_sessions(status_id);
CREATE INDEX idx_import_sessions_project_id ON import_sessions(project_id);
CREATE INDEX idx_import_sessions_created_at ON import_sessions(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
