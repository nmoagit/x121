CREATE TABLE image_type_tracks (
    image_type_id BIGINT NOT NULL REFERENCES image_types(id) ON DELETE CASCADE,
    track_id      BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (image_type_id, track_id)
);

CREATE INDEX idx_image_type_tracks_track_id ON image_type_tracks (track_id);
