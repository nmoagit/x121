-- PRD-24: Recursive Video Generation Loop
-- Add generation state columns to the segments table.
-- Existing columns (seed_frame_path, output_video_path, last_frame_path,
-- quality_scores) remain untouched.

ALTER TABLE segments
    ADD COLUMN duration_secs DOUBLE PRECISION,
    ADD COLUMN cumulative_duration_secs DOUBLE PRECISION,
    ADD COLUMN boundary_frame_index INTEGER,
    ADD COLUMN boundary_selection_mode TEXT DEFAULT 'auto',
    ADD COLUMN generation_started_at TIMESTAMPTZ,
    ADD COLUMN generation_completed_at TIMESTAMPTZ,
    ADD COLUMN worker_id BIGINT REFERENCES workers(id) ON DELETE SET NULL,
    ADD COLUMN prompt_type TEXT,
    ADD COLUMN prompt_text TEXT;

CREATE INDEX idx_segments_worker_id ON segments(worker_id);
