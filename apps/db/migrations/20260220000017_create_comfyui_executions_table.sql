-- ComfyUI workflow execution tracking (PRD-05).
-- Links platform jobs to ComfyUI prompt executions for progress and error monitoring.

CREATE TABLE comfyui_executions (
    id                 BIGSERIAL   PRIMARY KEY,
    instance_id        BIGINT      NOT NULL REFERENCES comfyui_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
    platform_job_id    BIGINT      NOT NULL,
    comfyui_prompt_id  TEXT        NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'submitted',
    progress_percent   SMALLINT    NOT NULL DEFAULT 0,
    current_node       TEXT,
    error_message      TEXT,
    submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes.
CREATE INDEX idx_comfyui_executions_instance_id ON comfyui_executions(instance_id);

-- Query indexes for job and prompt lookups.
CREATE INDEX idx_comfyui_executions_platform_job_id   ON comfyui_executions(platform_job_id);
CREATE INDEX idx_comfyui_executions_comfyui_prompt_id ON comfyui_executions(comfyui_prompt_id);

CREATE TRIGGER trg_comfyui_executions_updated_at
    BEFORE UPDATE ON comfyui_executions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
