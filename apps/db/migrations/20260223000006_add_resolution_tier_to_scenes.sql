-- PRD-59: Multi-Resolution Pipeline
-- Adds resolution_tier_id and upscaled_from_scene_id columns to the scenes table.

ALTER TABLE scenes
    ADD COLUMN IF NOT EXISTS resolution_tier_id BIGINT DEFAULT 1 REFERENCES resolution_tiers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS upscaled_from_scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_scenes_resolution_tier_id ON scenes(resolution_tier_id);
CREATE INDEX IF NOT EXISTS idx_scenes_upscaled_from_scene_id ON scenes(upscaled_from_scene_id) WHERE upscaled_from_scene_id IS NOT NULL;
