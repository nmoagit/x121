-- Migration 000079: Create delivery_exports table (PRD-39)
--
-- Tracks each delivery export job: which project, which format profile,
-- who initiated it, status, output file, and validation results.

CREATE TABLE IF NOT EXISTS delivery_exports (
    id                      BIGSERIAL PRIMARY KEY,
    project_id              BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    format_profile_id       BIGINT NOT NULL REFERENCES output_format_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id               SMALLINT NOT NULL REFERENCES delivery_export_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    exported_by             BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    include_watermark       BOOLEAN NOT NULL DEFAULT false,
    characters_json         JSONB,
    file_path               TEXT,
    file_size_bytes         BIGINT,
    validation_results_json JSONB,
    error_message           TEXT,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_exports_project_id ON delivery_exports(project_id);
CREATE INDEX idx_delivery_exports_format_profile_id ON delivery_exports(format_profile_id);
CREATE INDEX idx_delivery_exports_status_id ON delivery_exports(status_id);
CREATE INDEX idx_delivery_exports_exported_by ON delivery_exports(exported_by);

CREATE TRIGGER trg_delivery_exports_updated_at
    BEFORE UPDATE ON delivery_exports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
