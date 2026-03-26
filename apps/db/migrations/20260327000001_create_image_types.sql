CREATE TABLE image_types (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,
    pipeline_id     BIGINT NOT NULL REFERENCES pipelines(id),
    workflow_id     BIGINT REFERENCES workflows(id) ON DELETE SET NULL,
    source_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    output_track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    prompt_template TEXT,
    negative_prompt_template TEXT,
    generation_params JSONB,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_image_types_pipeline_slug
    ON image_types (pipeline_id, slug) WHERE deleted_at IS NULL;

CREATE INDEX idx_image_types_pipeline_id ON image_types (pipeline_id);
CREATE INDEX idx_image_types_workflow_id ON image_types (workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_image_types_source_track_id ON image_types (source_track_id) WHERE source_track_id IS NOT NULL;
CREATE INDEX idx_image_types_output_track_id ON image_types (output_track_id) WHERE output_track_id IS NOT NULL;

CREATE TRIGGER trg_image_types_updated_at
    BEFORE UPDATE ON image_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
