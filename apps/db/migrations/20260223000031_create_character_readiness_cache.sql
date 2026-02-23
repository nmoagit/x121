-- PRD-107: Character Readiness & State View
-- Per-character readiness cache for performance. Source of truth is live data;
-- cache is invalidated on character data changes and recomputed on next read.

CREATE TABLE character_readiness_cache (
    character_id BIGINT PRIMARY KEY
        REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('ready', 'partially_ready', 'not_started')),
    missing_items JSONB NOT NULL DEFAULT '[]',
    -- missing_items format: ["source_image", "elevenlabs_voice", "metadata_complete"]
    readiness_pct INTEGER NOT NULL DEFAULT 0,  -- 0-100
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
