-- Add pipeline_id FK to projects, backfill existing data to x121

ALTER TABLE projects ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

UPDATE projects SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');

ALTER TABLE projects ALTER COLUMN pipeline_id SET NOT NULL;

CREATE INDEX idx_projects_pipeline_id ON projects(pipeline_id);
