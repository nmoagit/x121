-- Tags table for the cross-cutting tagging system (PRD-47).
--
-- Tags are freeform strings with optional namespace prefixes (e.g., "priority:urgent"),
-- optional colors, and denormalized usage counts for fast autocomplete sorting.
-- Tag names are stored lowercase for case-insensitive uniqueness.

CREATE TABLE tags (
    id              BIGSERIAL    PRIMARY KEY,
    name            TEXT         NOT NULL,                    -- lowercase, normalized
    display_name    TEXT         NOT NULL,                    -- original casing for display
    namespace       TEXT,                                     -- extracted namespace prefix (e.g., 'priority' from 'priority:urgent')
    color           TEXT,                                     -- hex color code (e.g., '#FF5733')
    usage_count     INTEGER      NOT NULL DEFAULT 0,          -- denormalized for fast sorting
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness on the normalized name.
CREATE UNIQUE INDEX uq_tags_name ON tags(name);

-- Fast filtering by namespace prefix.
CREATE INDEX idx_tags_namespace ON tags(namespace);

-- Fast autocomplete sorting by popularity.
CREATE INDEX idx_tags_usage_count ON tags(usage_count DESC);

-- Auto-update updated_at on row changes.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
