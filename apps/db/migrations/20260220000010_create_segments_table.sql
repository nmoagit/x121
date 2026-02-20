-- Segments: ordered video segments within a scene.

CREATE TABLE segments (
    id                BIGSERIAL PRIMARY KEY,
    scene_id          BIGINT   NOT NULL REFERENCES scenes(id)          ON DELETE CASCADE  ON UPDATE CASCADE,
    sequence_index    INTEGER  NOT NULL,
    status_id         SMALLINT NOT NULL REFERENCES segment_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    seed_frame_path   TEXT,
    output_video_path TEXT,
    last_frame_path   TEXT,
    quality_scores    JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_segments_scene_id  ON segments(scene_id);
CREATE INDEX idx_segments_status_id ON segments(status_id);

-- Unique constraint: one segment per position within a scene
CREATE UNIQUE INDEX uq_segments_scene_id_sequence_index ON segments(scene_id, sequence_index);

-- Updated_at trigger
CREATE TRIGGER trg_segments_updated_at
    BEFORE UPDATE ON segments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
