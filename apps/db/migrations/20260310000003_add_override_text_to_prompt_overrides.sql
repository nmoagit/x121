-- Add override_text column to all three prompt override tables.
-- When set, this text REPLACES the base prompt (workflow default or scene-type default)
-- instead of appending fragments to it. Fragments still append on top of the override.

ALTER TABLE character_scene_prompt_overrides
    ADD COLUMN IF NOT EXISTS override_text text;

ALTER TABLE project_prompt_overrides
    ADD COLUMN IF NOT EXISTS override_text text;

ALTER TABLE group_prompt_overrides
    ADD COLUMN IF NOT EXISTS override_text text;
