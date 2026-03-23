-- Pipeline-scope speech_types: each pipeline gets its own set of speech types.

BEGIN;

-- 1. Add nullable pipeline_id column
ALTER TABLE speech_types
    ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE CASCADE;

-- 2. Backfill all existing speech types to x121
UPDATE speech_types
SET pipeline_id = (SELECT id FROM pipelines WHERE code = 'x121');

-- 3. Make pipeline_id NOT NULL now that all rows are backfilled
ALTER TABLE speech_types
    ALTER COLUMN pipeline_id SET NOT NULL;

-- 4. Drop the global unique constraint on name
ALTER TABLE speech_types DROP CONSTRAINT IF EXISTS speech_types_name_key;

-- 5. Create pipeline-scoped unique constraint
CREATE UNIQUE INDEX uq_speech_types_pipeline_name
    ON speech_types(pipeline_id, name);

-- 6. FK index for pipeline_id
CREATE INDEX idx_speech_types_pipeline_id
    ON speech_types(pipeline_id);

-- 7. Seed y122 speech types
INSERT INTO speech_types (name, sort_order, pipeline_id)
VALUES
    ('Introduction',  1, (SELECT id FROM pipelines WHERE code = 'y122')),
    ('Explanation',   2, (SELECT id FROM pipelines WHERE code = 'y122')),
    ('Q&A Response',  3, (SELECT id FROM pipelines WHERE code = 'y122')),
    ('Summary',       4, (SELECT id FROM pipelines WHERE code = 'y122')),
    ('Neutral',       5, (SELECT id FROM pipelines WHERE code = 'y122'));

COMMIT;
