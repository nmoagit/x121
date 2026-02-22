-- Extend scene_types table for PRD-23 (Scene Type Configuration).
--
-- Adds multi-position prompt templates, negative prompts, model config,
-- generation params, duration tolerance, sort order, and is_active flag.

ALTER TABLE scene_types
  ADD COLUMN description TEXT,
  ADD COLUMN model_config JSONB,
  ADD COLUMN negative_prompt_template TEXT,
  ADD COLUMN prompt_start_clip TEXT,
  ADD COLUMN negative_prompt_start_clip TEXT,
  ADD COLUMN prompt_continuation_clip TEXT,
  ADD COLUMN negative_prompt_continuation_clip TEXT,
  ADD COLUMN duration_tolerance_secs INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN generation_params JSONB,
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Unique name among studio-level types (project_id IS NULL).
CREATE UNIQUE INDEX uq_scene_types_studio_name ON scene_types(name)
  WHERE project_id IS NULL;
