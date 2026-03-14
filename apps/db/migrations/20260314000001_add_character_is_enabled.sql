-- Add is_enabled flag to characters for disabling without soft-deleting.
-- Disabled characters are excluded from deliverables, readiness, and browse pages.

ALTER TABLE characters ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for efficient filtering
CREATE INDEX idx_characters_is_enabled ON characters (is_enabled) WHERE deleted_at IS NULL;
