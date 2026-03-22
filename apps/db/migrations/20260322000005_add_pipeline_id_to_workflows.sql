-- Add pipeline_id FK to workflows, backfill existing data to x121

ALTER TABLE workflows ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

UPDATE workflows SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');

ALTER TABLE workflows ALTER COLUMN pipeline_id SET NOT NULL;

CREATE INDEX idx_workflows_pipeline_id ON workflows(pipeline_id);
