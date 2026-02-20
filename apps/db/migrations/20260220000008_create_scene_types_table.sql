-- Scene types: pipeline workflow definitions, optionally scoped to a project.

CREATE TABLE scene_types (
    id                       BIGSERIAL PRIMARY KEY,
    project_id               BIGINT            REFERENCES projects(id)           ON DELETE CASCADE  ON UPDATE CASCADE,
    name                     TEXT      NOT NULL,
    status_id                SMALLINT  NOT NULL REFERENCES scene_type_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    workflow_json            JSONB,
    lora_config              JSONB,
    prompt_template          TEXT,
    target_duration_secs     INTEGER,
    segment_duration_secs    INTEGER,
    variant_applicability    TEXT      NOT NULL DEFAULT 'both',
    transition_segment_index INTEGER,
    is_studio_level          BOOLEAN   NOT NULL DEFAULT false,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_scene_types_project_id ON scene_types(project_id);
CREATE INDEX idx_scene_types_status_id  ON scene_types(status_id);

-- Partial unique: name must be unique within a project (studio-level types excluded)
CREATE UNIQUE INDEX uq_scene_types_project_id_name ON scene_types(project_id, name)
    WHERE project_id IS NOT NULL;

-- GIN indexes for JSONB columns
CREATE INDEX idx_scene_types_workflow_json ON scene_types USING GIN (workflow_json);
CREATE INDEX idx_scene_types_lora_config   ON scene_types USING GIN (lora_config);

-- Updated_at trigger
CREATE TRIGGER trg_scene_types_updated_at
    BEFORE UPDATE ON scene_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
