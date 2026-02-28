-- PRD-96: Poster Frame & Thumbnail Selection
-- Stores poster frame selections for characters and scenes.

CREATE TABLE poster_frames (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'scene')),
    entity_id BIGINT NOT NULL,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    crop_settings_json JSONB,
    brightness REAL NOT NULL DEFAULT 1.0,
    contrast REAL NOT NULL DEFAULT 1.0,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poster_frames_entity ON poster_frames(entity_type, entity_id);
CREATE INDEX idx_poster_frames_segment_id ON poster_frames(segment_id);
CREATE INDEX idx_poster_frames_created_by ON poster_frames(created_by);
CREATE UNIQUE INDEX uq_poster_frames_entity ON poster_frames(entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON poster_frames
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
