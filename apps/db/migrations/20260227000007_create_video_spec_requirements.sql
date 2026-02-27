-- Video specification requirements for quality validation (PRD-113)

CREATE TABLE video_spec_requirements (
    id                  BIGSERIAL PRIMARY KEY,
    project_id          BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id       BIGINT REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                TEXT NOT NULL,
    framerate           NUMERIC(6,2),
    min_duration_secs   NUMERIC(10,3),
    max_duration_secs   NUMERIC(10,3),
    width               INTEGER,
    height              INTEGER,
    codec               TEXT,
    container           TEXT,
    max_file_size_bytes BIGINT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_video_spec_requirements_updated_at
    BEFORE UPDATE ON video_spec_requirements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK indexes
CREATE INDEX idx_video_spec_requirements_project_id ON video_spec_requirements(project_id);
CREATE INDEX idx_video_spec_requirements_scene_type_id ON video_spec_requirements(scene_type_id);

-- Active specs filter
CREATE INDEX idx_video_spec_requirements_active ON video_spec_requirements(is_active) WHERE is_active = true;

-- Seed: default 1080p 30fps H.264 MP4 spec
INSERT INTO video_spec_requirements (name, framerate, width, height, codec, container)
VALUES ('Default 1080p H.264', 30.00, 1920, 1080, 'h264', 'mp4');
