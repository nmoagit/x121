-- VFX Sidecar Templates & Dataset Exports (PRD-40)

-- Sidecar templates
CREATE TABLE sidecar_templates (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    format TEXT NOT NULL CHECK (format IN ('xml', 'csv')),
    target_tool TEXT,
    template_json JSONB NOT NULL,
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sidecar_templates_created_by ON sidecar_templates(created_by);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sidecar_templates FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO sidecar_templates (name, description, format, target_tool, template_json, is_builtin) VALUES
    ('Nuke XML', 'Foundry Nuke compatible XML sidecar', 'xml', 'nuke', '{"root_element": "clip", "fields": ["resolution", "framerate", "codec", "duration", "color_space", "generation_params"]}'::jsonb, true),
    ('After Effects CSV', 'Adobe After Effects frame-level CSV', 'csv', 'after_effects', '{"columns": ["frame", "face_confidence", "motion_score", "quality_metric", "boundary_ssim"]}'::jsonb, true),
    ('Resolve XML', 'DaVinci Resolve compatible XML sidecar', 'xml', 'resolve', '{"root_element": "media", "fields": ["resolution", "framerate", "codec", "duration", "pixel_format"]}'::jsonb, true);

-- Dataset exports
CREATE TABLE dataset_exports (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    config_json JSONB NOT NULL,
    manifest_json JSONB,
    file_path TEXT,
    file_size_bytes BIGINT,
    sample_count INTEGER,
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    exported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dataset_exports_project_id ON dataset_exports(project_id);
CREATE INDEX idx_dataset_exports_status_id ON dataset_exports(status_id);
CREATE INDEX idx_dataset_exports_exported_by ON dataset_exports(exported_by);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dataset_exports FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
