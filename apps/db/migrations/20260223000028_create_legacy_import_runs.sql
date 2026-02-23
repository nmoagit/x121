-- Legacy import run tracking (PRD-86).

-- Status lookup table for import runs.
CREATE TABLE legacy_import_run_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_legacy_import_run_statuses_updated_at
    BEFORE UPDATE ON legacy_import_run_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed status values.
INSERT INTO legacy_import_run_statuses (name, label) VALUES
    ('scanning',  'Scanning'),
    ('mapping',   'Mapping'),
    ('preview',   'Preview'),
    ('importing', 'Importing'),
    ('completed', 'Completed'),
    ('partial',   'Partial'),
    ('failed',    'Failed'),
    ('cancelled', 'Cancelled');

-- Main table for legacy import runs.
CREATE TABLE legacy_import_runs (
    id                  BIGSERIAL PRIMARY KEY,
    status_id           BIGINT NOT NULL REFERENCES legacy_import_run_statuses(id) ON DELETE RESTRICT,
    source_path         TEXT NOT NULL,
    project_id          BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    mapping_config      JSONB NOT NULL DEFAULT '{}',
    match_key           TEXT NOT NULL DEFAULT 'name',
    total_files         INTEGER NOT NULL DEFAULT 0,
    characters_created  INTEGER NOT NULL DEFAULT 0,
    characters_updated  INTEGER NOT NULL DEFAULT 0,
    scenes_registered   INTEGER NOT NULL DEFAULT 0,
    images_registered   INTEGER NOT NULL DEFAULT 0,
    duplicates_found    INTEGER NOT NULL DEFAULT 0,
    errors              INTEGER NOT NULL DEFAULT 0,
    gap_report          JSONB NOT NULL DEFAULT '{}',
    initiated_by        BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legacy_import_runs_status_id ON legacy_import_runs(status_id);
CREATE INDEX idx_legacy_import_runs_project_id ON legacy_import_runs(project_id);
CREATE INDEX idx_legacy_import_runs_created_at ON legacy_import_runs(created_at);

CREATE TRIGGER trg_legacy_import_runs_updated_at
    BEFORE UPDATE ON legacy_import_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
