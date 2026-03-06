CREATE TABLE scene_video_version_artifacts (
    id              BIGSERIAL PRIMARY KEY,
    version_id      BIGINT NOT NULL REFERENCES scene_video_versions(id),
    role            TEXT NOT NULL CHECK (role IN ('final', 'intermediate')),
    label           TEXT NOT NULL,
    node_id         TEXT,
    file_path       TEXT NOT NULL,
    file_size_bytes BIGINT,
    duration_secs   DOUBLE PRECISION,
    width           INTEGER,
    height          INTEGER,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_svv_artifacts_version_id ON scene_video_version_artifacts(version_id)
    WHERE deleted_at IS NULL;
