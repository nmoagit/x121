-- Search analytics table (PRD-20).
-- Append-only log of search queries for analytics and content gap analysis.
-- No updated_at column or trigger needed (immutable log).

CREATE TABLE search_queries (
    id           BIGSERIAL    PRIMARY KEY,
    query_text   TEXT         NOT NULL,
    filters      JSONB        NOT NULL DEFAULT '{}',
    result_count INTEGER      NOT NULL DEFAULT 0,
    duration_ms  INTEGER      NOT NULL DEFAULT 0,
    user_id      BIGINT       NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for time-range queries on analytics
CREATE INDEX idx_search_queries_created_at ON search_queries(created_at);

-- Partial index for zero-result queries (content gap analysis)
CREATE INDEX idx_search_queries_zero_results ON search_queries(result_count)
    WHERE result_count = 0;
