-- Add pipeline_id FK to scene_types (nullable - project-scoped types inherit from project)

ALTER TABLE scene_types ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

-- Backfill global scene types (project_id IS NULL) to x121
UPDATE scene_types
SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121')
WHERE project_id IS NULL;

CREATE INDEX idx_scene_types_pipeline_id ON scene_types(pipeline_id);
