-- Asset ratings and reviews (PRD-17).
CREATE TABLE asset_ratings (
    id          BIGSERIAL PRIMARY KEY,
    asset_id    BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    reviewer_id BIGINT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_ratings_asset_id ON asset_ratings(asset_id);

-- Each authenticated reviewer may rate an asset only once.
CREATE UNIQUE INDEX uq_asset_ratings_reviewer ON asset_ratings(asset_id, reviewer_id)
    WHERE reviewer_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_ratings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
