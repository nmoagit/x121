-- PRD-133: Add approval workflow columns to character_metadata_versions.
--
-- Layers a reviewer approval step on top of the existing activate/reject system.
-- Each version can be pending, approved, or rejected by the assigned character reviewer.

-- Add approval columns
ALTER TABLE character_metadata_versions
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN approved_by BIGINT REFERENCES users(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approval_comment TEXT;

-- Constraint: approval_status must be one of the valid values
ALTER TABLE character_metadata_versions
  ADD CONSTRAINT chk_metadata_approval_status
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Index for quickly finding the approved version per character
CREATE INDEX idx_metadata_versions_approved
  ON character_metadata_versions (character_id)
  WHERE approval_status = 'approved' AND deleted_at IS NULL;
