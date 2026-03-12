-- Add last_validated_at timestamp to workflows table.
-- Tracks when a workflow was last validated (manually or auto on ComfyUI connect).

ALTER TABLE workflows
    ADD COLUMN last_validated_at TIMESTAMPTZ;
