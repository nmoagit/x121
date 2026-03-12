-- Add configurable blocking deliverables to projects.
-- NULL means "inherit from platform_settings default" (key: blocking_deliverables).
-- When set, overrides the studio default for this project.
-- Valid values: metadata, images, scenes, speech (extensible).

ALTER TABLE projects
    ADD COLUMN blocking_deliverables TEXT[] DEFAULT NULL;
