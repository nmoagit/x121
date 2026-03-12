BEGIN;

CREATE TABLE scene_generation_logs (
    id         BIGSERIAL    PRIMARY KEY,
    scene_id   BIGINT       NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    level      TEXT         NOT NULL DEFAULT 'info',
    message    TEXT         NOT NULL,
    metadata   JSONB,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scene_generation_logs_scene_id
    ON scene_generation_logs(scene_id);

CREATE INDEX idx_scene_generation_logs_scene_id_created_at
    ON scene_generation_logs(scene_id, created_at);

COMMIT;
