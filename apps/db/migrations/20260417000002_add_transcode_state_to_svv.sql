-- PRD-169: Add denormalized `transcode_state` surface column to
-- `scene_video_versions`. The `transcode_jobs` table is the source of truth
-- for queue state; this column is a cheap read for card/player "is this
-- playable?" checks without joining the queue table.
--
-- Existing rows default to `'completed'` so the existing library remains
-- playable (PRD §14 Q1 — retroactive backfill is left for a future
-- admin CLI sweep).

BEGIN;

ALTER TABLE scene_video_versions
    ADD COLUMN transcode_state TEXT NOT NULL DEFAULT 'completed'
        CHECK (transcode_state IN ('pending', 'in_progress', 'completed', 'failed'));

-- Cheap "what's not ready?" queries for frontend badges and polling fallback.
CREATE INDEX idx_scene_video_versions_transcode_state_pending
    ON scene_video_versions (transcode_state)
    WHERE transcode_state <> 'completed';

COMMIT;
