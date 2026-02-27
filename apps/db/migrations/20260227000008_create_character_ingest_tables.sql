-- Character ingest pipeline tables (PRD-113)

-- Status lookup for ingest sessions
CREATE TABLE character_ingest_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO character_ingest_statuses (name, label) VALUES
    ('scanning',            'Scanning'),
    ('preview',             'Preview'),
    ('generating_metadata', 'Generating Metadata'),
    ('ready',               'Ready'),
    ('importing',           'Importing'),
    ('completed',           'Completed'),
    ('failed',              'Failed'),
    ('cancelled',           'Cancelled');

-- Ingest sessions: one session per batch import operation
CREATE TABLE character_ingest_sessions (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status_id       SMALLINT NOT NULL DEFAULT 1 REFERENCES character_ingest_statuses(id),
    source_type     TEXT NOT NULL CHECK (source_type IN ('folder', 'csv', 'text')),
    source_name     TEXT,
    target_group_id BIGINT,
    total_entries   INTEGER NOT NULL DEFAULT 0,
    ready_count     INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    excluded_count  INTEGER NOT NULL DEFAULT 0,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_character_ingest_sessions_updated_at
    BEFORE UPDATE ON character_ingest_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK indexes
CREATE INDEX idx_character_ingest_sessions_project_id ON character_ingest_sessions(project_id);
CREATE INDEX idx_character_ingest_sessions_status_id ON character_ingest_sessions(status_id);
CREATE INDEX idx_character_ingest_sessions_created_by ON character_ingest_sessions(created_by);

-- Individual entries within an ingest session
CREATE TABLE character_ingest_entries (
    id                      BIGSERIAL PRIMARY KEY,
    session_id              BIGINT NOT NULL REFERENCES character_ingest_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    folder_name             TEXT,
    parsed_name             TEXT NOT NULL,
    confirmed_name          TEXT,
    name_confidence         TEXT CHECK (name_confidence IN ('high', 'medium', 'low')),
    detected_images         JSONB NOT NULL DEFAULT '[]',
    image_classifications   JSONB NOT NULL DEFAULT '{}',
    metadata_status         TEXT CHECK (metadata_status IN ('none', 'found', 'generating', 'generated', 'failed')),
    metadata_json           JSONB,
    metadata_source         TEXT CHECK (metadata_source IN ('direct', 'generated', 'manual')),
    tov_json                JSONB,
    bio_json                JSONB,
    metadata_errors         JSONB NOT NULL DEFAULT '[]',
    validation_status       TEXT CHECK (validation_status IN ('pending', 'pass', 'warning', 'fail')),
    validation_errors       JSONB NOT NULL DEFAULT '[]',
    validation_warnings     JSONB NOT NULL DEFAULT '[]',
    is_included             BOOLEAN NOT NULL DEFAULT true,
    created_character_id    BIGINT REFERENCES characters(id) ON DELETE SET NULL,
    script_execution_id     BIGINT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_character_ingest_entries_updated_at
    BEFORE UPDATE ON character_ingest_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK indexes
CREATE INDEX idx_character_ingest_entries_session_id ON character_ingest_entries(session_id);
CREATE INDEX idx_character_ingest_entries_created_character_id ON character_ingest_entries(created_character_id);
