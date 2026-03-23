-- Pipeline generator scripts: versioned scripts per pipeline for generation workflows
BEGIN;

CREATE TABLE pipeline_generator_scripts (
    id         BIGSERIAL    PRIMARY KEY,
    uuid       UUID         NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    pipeline_id BIGINT      NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name       TEXT         NOT NULL,
    description TEXT,
    script_type TEXT        NOT NULL CHECK (script_type IN ('python', 'javascript', 'shell')),
    script_content TEXT     NOT NULL,
    version    INT          NOT NULL DEFAULT 1,
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Only one active script per pipeline+name combination
CREATE UNIQUE INDEX uq_generator_scripts_pipeline_name_version
    ON pipeline_generator_scripts(pipeline_id, name, version);

CREATE UNIQUE INDEX uq_generator_scripts_pipeline_name_active
    ON pipeline_generator_scripts(pipeline_id, name) WHERE is_active = true;

-- FK index
CREATE INDEX idx_generator_scripts_pipeline
    ON pipeline_generator_scripts(pipeline_id);

-- Auto-update updated_at on row modification
CREATE TRIGGER trg_pipeline_generator_scripts_updated_at
    BEFORE UPDATE ON pipeline_generator_scripts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
