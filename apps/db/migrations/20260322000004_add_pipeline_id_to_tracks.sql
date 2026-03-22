-- Add pipeline_id FK to tracks, backfill existing data to x121

ALTER TABLE tracks ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id);

UPDATE tracks SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');

ALTER TABLE tracks ALTER COLUMN pipeline_id SET NOT NULL;

CREATE INDEX idx_tracks_pipeline_id ON tracks(pipeline_id);
