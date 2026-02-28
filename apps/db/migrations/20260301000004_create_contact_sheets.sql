-- Contact sheet images for face crop storage (PRD-103).
--
-- Stores extracted face crops from representative frames across all scenes
-- for a given character. Used to build tiled contact sheet grids for visual
-- consistency review.

CREATE TABLE contact_sheet_images (
    id          BIGSERIAL        PRIMARY KEY,
    character_id BIGINT          NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_id    BIGINT           NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    face_crop_path TEXT          NOT NULL,
    confidence_score DOUBLE PRECISION,
    frame_number INTEGER,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_sheet_images_character_id ON contact_sheet_images(character_id);
CREATE INDEX idx_contact_sheet_images_scene_id ON contact_sheet_images(scene_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contact_sheet_images
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
