-- Per-(scene_type, track) workflow and prompt configuration.
--
-- Allows different workflows and prompt templates for each track within
-- a scene type (e.g., "clothes_off" track may use a different workflow
-- than the default track for the same scene).

CREATE TABLE scene_type_track_configs (
    id              BIGSERIAL PRIMARY KEY,
    scene_type_id   BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    track_id        BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,

    -- Workflow override (NULL = inherit from scene_type.workflow_id)
    workflow_id     BIGINT REFERENCES workflows(id) ON DELETE SET NULL,

    -- Prompt template overrides (NULL = inherit from scene_type)
    prompt_template                   TEXT,
    negative_prompt_template          TEXT,
    prompt_start_clip                 TEXT,
    negative_prompt_start_clip        TEXT,
    prompt_continuation_clip          TEXT,
    negative_prompt_continuation_clip TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (scene_type_id, track_id)
);

CREATE INDEX idx_sttc_scene_type_id ON scene_type_track_configs (scene_type_id);
CREATE INDEX idx_sttc_track_id ON scene_type_track_configs (track_id);
CREATE INDEX idx_sttc_workflow_id ON scene_type_track_configs (workflow_id);
