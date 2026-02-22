-- PRD-24: Recursive Video Generation Loop
-- Add generation state columns to the scenes table.

ALTER TABLE scenes
    ADD COLUMN total_segments_estimated INTEGER,
    ADD COLUMN total_segments_completed INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN actual_duration_secs DOUBLE PRECISION,
    ADD COLUMN transition_segment_index INTEGER,
    ADD COLUMN generation_started_at TIMESTAMPTZ,
    ADD COLUMN generation_completed_at TIMESTAMPTZ;
