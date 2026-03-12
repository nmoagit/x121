-- Add track_id to production_run_cells for scene_type × track granularity.
--
-- Each cell now represents a (character, scene_type, track) combination
-- rather than just (character, scene_type).

ALTER TABLE production_run_cells
    ADD COLUMN track_id BIGINT REFERENCES tracks(id) ON DELETE SET NULL;

-- Update the unique-ish lookup pattern: ensure no duplicate cells per combo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prc_run_char_st_track
    ON production_run_cells (run_id, character_id, scene_type_id, track_id)
    WHERE track_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prc_run_char_st_notrack
    ON production_run_cells (run_id, character_id, scene_type_id)
    WHERE track_id IS NULL;
