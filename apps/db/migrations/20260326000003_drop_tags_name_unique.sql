-- Fix: drop the overly-restrictive unique index on tags.name alone.
-- The correct constraint is uq_tags_pipeline_name which scopes uniqueness
-- to (COALESCE(pipeline_id, -1), name), allowing the same tag name in
-- different pipelines. The old index prevented this.

DROP INDEX IF EXISTS uq_tags_name;
