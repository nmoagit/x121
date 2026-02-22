-- Migration 000076: Create preset_ratings table (PRD-27)
--
-- Allows users to rate shared presets (1-5 stars) with an optional comment.
-- Each user may rate a preset only once (upsert on conflict).

CREATE TABLE preset_ratings (
    id              BIGSERIAL PRIMARY KEY,
    preset_id       BIGINT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_preset_ratings_preset_id ON preset_ratings(preset_id);
CREATE INDEX idx_preset_ratings_user_id ON preset_ratings(user_id);
CREATE UNIQUE INDEX uq_preset_ratings_user_preset ON preset_ratings(preset_id, user_id);

CREATE TRIGGER trg_preset_ratings_updated_at BEFORE UPDATE ON preset_ratings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
