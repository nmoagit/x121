-- PRD-111: Scene Catalog & Track Management
-- Many-to-many join table: which scenes are available on which tracks

CREATE TABLE scene_catalog_tracks (
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    track_id         BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scene_catalog_id, track_id)
);

CREATE INDEX idx_scene_catalog_tracks_track_id ON scene_catalog_tracks(track_id);

-- Clothed track (id=1): all scenes belong to clothed
INSERT INTO scene_catalog_tracks (scene_catalog_id, track_id)
SELECT id, 1 FROM scene_catalog;

-- Topless track (id=2): only scenes that support topless variant
INSERT INTO scene_catalog_tracks (scene_catalog_id, track_id)
SELECT id, 2 FROM scene_catalog
WHERE slug IN (
    'idle', 'bj', 'bottom', 'cumshot', 'dance', 'deal',
    'feet', 'from_behind', 'handjob', 'kiss', 'orgasm',
    'pussy', 'sex', 'titwank'
);
