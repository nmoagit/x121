-- Saved searches table (PRD-20).
-- Persists named search queries for quick access and sharing.

CREATE TABLE saved_searches (
    id           BIGSERIAL    PRIMARY KEY,
    name         TEXT         NOT NULL,
    description  TEXT,
    query_text   TEXT,
    filters      JSONB        NOT NULL DEFAULT '{}',
    entity_types TEXT[]       NOT NULL DEFAULT '{}',
    is_shared    BOOLEAN      NOT NULL DEFAULT false,
    owner_id     BIGINT       NULL,
    use_count    INTEGER      NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FK indexes
CREATE INDEX idx_saved_searches_owner_id ON saved_searches(owner_id);

-- Partial index for shared searches
CREATE INDEX idx_saved_searches_shared ON saved_searches(is_shared) WHERE is_shared = true;

-- Updated_at trigger
CREATE TRIGGER trg_saved_searches_updated_at
    BEFORE UPDATE ON saved_searches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
