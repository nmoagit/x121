-- PRD-25: Incremental Re-stitching & Smoothing
-- Add versioning columns to the segments table for single-segment regeneration,
-- boundary SSIM tracking, and downstream staleness flagging.

ALTER TABLE segments
    ADD COLUMN IF NOT EXISTS previous_segment_id BIGINT REFERENCES segments(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS regeneration_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS boundary_ssim_before DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS boundary_ssim_after DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_segments_previous_segment_id ON segments(previous_segment_id);
CREATE INDEX IF NOT EXISTS idx_segments_is_stale ON segments(is_stale) WHERE is_stale = true;
