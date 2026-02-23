-- Content Branching & Exploration (PRD-50).
-- Link segments to branches for branch-scoped generation.

ALTER TABLE segments ADD COLUMN branch_id BIGINT REFERENCES branches(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX idx_segments_branch_id ON segments(branch_id);
