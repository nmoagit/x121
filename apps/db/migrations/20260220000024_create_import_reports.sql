-- Import reports and per-record entries for audit trail (PRD-14).

--------------------------------------------------------------------------------
-- import_report_statuses: lookup for report lifecycle states
--------------------------------------------------------------------------------

CREATE TABLE import_report_statuses (
    id          BIGSERIAL   PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_import_report_statuses_updated_at
    BEFORE UPDATE ON import_report_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO import_report_statuses (name, description) VALUES
    ('preview',   'Dry-run preview completed'),
    ('committed', 'Import committed successfully'),
    ('partial',   'Import partially committed with some rejections'),
    ('failed',    'Import failed entirely'),
    ('cancelled', 'Import cancelled by user after preview');

--------------------------------------------------------------------------------
-- import_reports: summary record for each import operation
--------------------------------------------------------------------------------

CREATE TABLE import_reports (
    id               BIGSERIAL   PRIMARY KEY,
    status_id        BIGINT      NOT NULL REFERENCES import_report_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_type      TEXT        NOT NULL,
    source_reference TEXT,
    entity_type      TEXT        NOT NULL,
    project_id       BIGINT      REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    total_records    INTEGER     NOT NULL DEFAULT 0,
    accepted         INTEGER     NOT NULL DEFAULT 0,
    rejected         INTEGER     NOT NULL DEFAULT 0,
    auto_corrected   INTEGER     NOT NULL DEFAULT 0,
    skipped          INTEGER     NOT NULL DEFAULT 0,
    report_data      JSONB       NOT NULL DEFAULT '{}',
    created_by       BIGINT      REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_import_reports_status_id  ON import_reports(status_id);
CREATE INDEX idx_import_reports_project_id ON import_reports(project_id);
CREATE INDEX idx_import_reports_created_by ON import_reports(created_by);

-- Query indexes
CREATE INDEX idx_import_reports_entity_type ON import_reports(entity_type);
CREATE INDEX idx_import_reports_created_at  ON import_reports(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER trg_import_reports_updated_at
    BEFORE UPDATE ON import_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--------------------------------------------------------------------------------
-- import_report_entries: per-record detail within a report
--------------------------------------------------------------------------------

CREATE TABLE import_report_entries (
    id                   BIGSERIAL   PRIMARY KEY,
    report_id            BIGINT      NOT NULL REFERENCES import_reports(id) ON DELETE CASCADE ON UPDATE CASCADE,
    record_index         INTEGER     NOT NULL,
    entity_id            BIGINT,
    action               TEXT        NOT NULL,
    field_errors         JSONB       NOT NULL DEFAULT '[]',
    field_warnings       JSONB       NOT NULL DEFAULT '[]',
    field_diffs          JSONB       NOT NULL DEFAULT '[]',
    conflict_resolutions JSONB       NOT NULL DEFAULT '[]',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_import_report_entries_report_id ON import_report_entries(report_id);

-- Updated_at trigger
CREATE TRIGGER trg_import_report_entries_updated_at
    BEFORE UPDATE ON import_report_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
