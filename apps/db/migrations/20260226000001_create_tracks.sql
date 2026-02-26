-- PRD-111: Scene Catalog & Track Management
-- Create tracks table (replaces hardcoded variant_applicability)

CREATE TABLE tracks (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_tracks_name ON tracks(name);

CREATE TRIGGER trg_tracks_updated_at BEFORE UPDATE ON tracks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO tracks (name, slug, sort_order) VALUES
    ('Clothed', 'clothed', 1),
    ('Topless', 'topless', 2);
