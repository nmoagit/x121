-- Add pipeline_id to tags for pipeline-scoped labeling.

BEGIN;

ALTER TABLE tags ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE CASCADE;

-- Replace global unique constraint with pipeline-scoped one
ALTER TABLE tags DROP CONSTRAINT IF EXISTS uq_tags_name;
CREATE UNIQUE INDEX uq_tags_pipeline_name ON tags (COALESCE(pipeline_id, -1), name);

CREATE INDEX idx_tags_pipeline_id ON tags (pipeline_id);

COMMIT;
