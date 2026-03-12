-- PRD-132: Queue Manager schema changes
-- Adds held job status, drain mode, instance tracking on jobs,
-- and reassignment tracking on job_state_transitions.

-- Add held status to job_statuses lookup table
INSERT INTO job_statuses (id, name, label)
VALUES (10, 'held', 'Held')
ON CONFLICT (id) DO NOTHING;

-- Add drain_mode to comfyui_instances
ALTER TABLE comfyui_instances
    ADD COLUMN IF NOT EXISTS drain_mode BOOLEAN NOT NULL DEFAULT false;

-- Add comfyui_instance_id to jobs for instance tracking
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS comfyui_instance_id BIGINT REFERENCES comfyui_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_comfyui_instance
    ON jobs(comfyui_instance_id) WHERE comfyui_instance_id IS NOT NULL;

-- Add reassignment tracking to job_state_transitions
ALTER TABLE job_state_transitions
    ADD COLUMN IF NOT EXISTS from_instance_id BIGINT REFERENCES comfyui_instances(id),
    ADD COLUMN IF NOT EXISTS to_instance_id BIGINT REFERENCES comfyui_instances(id);
