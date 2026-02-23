-- Shared prompt library (PRD-63).
--
-- A curated collection of reusable prompt templates that users can browse,
-- rate, and copy into their scene type prompt editors.

CREATE TABLE prompt_library (
    id                   BIGSERIAL        PRIMARY KEY,
    name                 TEXT             NOT NULL,
    description          TEXT,
    positive_prompt      TEXT             NOT NULL,
    negative_prompt      TEXT,
    tags                 TEXT[],
    model_compatibility  TEXT[],
    usage_count          INTEGER          NOT NULL DEFAULT 0,
    avg_rating           DOUBLE PRECISION,
    owner_id             BIGINT           NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_library_owner_id ON prompt_library(owner_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompt_library
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
