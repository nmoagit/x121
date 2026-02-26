-- PRD-111: Scene Catalog & Track Management
-- Per-project scene enablement (middle tier of three-level inheritance)

CREATE TABLE project_scene_settings (
    id               BIGSERIAL PRIMARY KEY,
    project_id       BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    is_enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_project_scene_settings_project_scene
    ON project_scene_settings(project_id, scene_catalog_id);

CREATE INDEX idx_project_scene_settings_project_id
    ON project_scene_settings(project_id);

CREATE INDEX idx_project_scene_settings_scene_catalog_id
    ON project_scene_settings(scene_catalog_id);

CREATE TRIGGER trg_project_scene_settings_updated_at BEFORE UPDATE ON project_scene_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
