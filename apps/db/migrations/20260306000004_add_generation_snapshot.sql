ALTER TABLE scene_video_versions
ADD COLUMN generation_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN scene_video_versions.generation_snapshot IS 'Immutable snapshot of generation parameters (workflow_id, prompts, seed, model, lora, configuration). NULL for imported versions.';
