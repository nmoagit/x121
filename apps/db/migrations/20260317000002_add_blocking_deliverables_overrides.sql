-- Add blocking_deliverables overrides at group and character level.
-- NULL means "inherit from parent" (group inherits project, character inherits group or project).
-- When set, overrides the parent default for that scope.
-- Valid values: metadata, images, scenes, speech (extensible).

ALTER TABLE character_groups
    ADD COLUMN blocking_deliverables TEXT[] DEFAULT NULL;

ALTER TABLE characters
    ADD COLUMN blocking_deliverables TEXT[] DEFAULT NULL;
