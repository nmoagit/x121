-- Add pipeline_id to metadata_templates for pipeline-scoped template defaults

BEGIN;

-- 1. Add nullable pipeline_id column
ALTER TABLE metadata_templates
    ADD COLUMN pipeline_id BIGINT REFERENCES pipelines(id) ON DELETE SET NULL;

-- 2. Backfill pipeline_id from the linked project's pipeline_id
UPDATE metadata_templates mt
   SET pipeline_id = p.pipeline_id
  FROM projects p
 WHERE mt.project_id = p.id
   AND p.pipeline_id IS NOT NULL;

-- 3. FK index
CREATE INDEX idx_metadata_templates_pipeline_id
    ON metadata_templates(pipeline_id);

-- 4. At most one default per pipeline (pipeline-scoped, not project-scoped)
CREATE UNIQUE INDEX uq_metadata_templates_pipeline_default
    ON metadata_templates(pipeline_id)
    WHERE pipeline_id IS NOT NULL AND project_id IS NULL AND is_default = true;

COMMIT;
