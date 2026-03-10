-- PRD-130: Link comfyui_instances to cloud_instances for unified orchestration.
-- Tracks which ComfyUI WebSocket connection belongs to which cloud pod.
-- NULL for manually added local instances.

ALTER TABLE comfyui_instances
    ADD COLUMN cloud_instance_id BIGINT REFERENCES cloud_instances(id) ON DELETE SET NULL;

CREATE INDEX idx_comfyui_instances_cloud_instance ON comfyui_instances(cloud_instance_id);
