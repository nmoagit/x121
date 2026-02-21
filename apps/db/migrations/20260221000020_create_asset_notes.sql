-- Asset compatibility notes (PRD-17).
-- Notes can be attached to a single asset or to a pair of related assets.
CREATE TABLE asset_notes (
    id               BIGSERIAL PRIMARY KEY,
    asset_id         BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    related_asset_id BIGINT NULL REFERENCES assets(id) ON DELETE CASCADE,
    note_text        TEXT NOT NULL,
    severity         TEXT NOT NULL DEFAULT 'info',
    author_id        BIGINT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_notes_asset_id ON asset_notes(asset_id);
CREATE INDEX idx_asset_notes_related_asset_id ON asset_notes(related_asset_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
