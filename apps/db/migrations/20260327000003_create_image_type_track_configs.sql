CREATE TABLE image_type_track_configs (
    id                       BIGSERIAL PRIMARY KEY,
    image_type_id            BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id                 BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    workflow_id              BIGINT REFERENCES workflows(id) ON DELETE SET NULL,
    prompt_template          TEXT,
    negative_prompt_template TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (image_type_id, track_id)
);

CREATE INDEX idx_ittc_image_type_id ON image_type_track_configs (image_type_id);
CREATE INDEX idx_ittc_track_id ON image_type_track_configs (track_id);
CREATE INDEX idx_ittc_workflow_id ON image_type_track_configs (workflow_id) WHERE workflow_id IS NOT NULL;

CREATE TRIGGER trg_image_type_track_configs_updated_at
    BEFORE UPDATE ON image_type_track_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
