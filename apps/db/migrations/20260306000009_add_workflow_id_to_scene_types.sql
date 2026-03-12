-- Add workflow_id to scene_types so each scene type can reference a
-- registered workflow from the workflows registry.
-- The existing workflow_json column remains for backward compatibility
-- (raw embedded workflows), but workflow_id is the preferred approach.

ALTER TABLE scene_types
    ADD COLUMN workflow_id BIGINT NULL REFERENCES workflows(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_scene_types_workflow_id ON scene_types(workflow_id)
    WHERE workflow_id IS NOT NULL;
