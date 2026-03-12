-- PRD-125: LLM-Driven Metadata Refinement Pipeline
--
-- Adds outdated tracking to character_metadata_versions and creates
-- the refinement_jobs table for managing LLM refinement runs.

-- Add outdated tracking to character_metadata_versions
ALTER TABLE character_metadata_versions
    ADD COLUMN IF NOT EXISTS outdated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS outdated_reason TEXT;

-- Refinement jobs table
CREATE TABLE refinement_jobs (
    id                  BIGSERIAL   PRIMARY KEY,
    uuid                UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    character_id        BIGINT      NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    status              TEXT        NOT NULL DEFAULT 'queued',
    source_bio          JSONB,
    source_tov          JSONB,
    llm_provider        TEXT        NOT NULL,
    llm_model           TEXT        NOT NULL,
    enrich              BOOLEAN     NOT NULL DEFAULT true,
    iterations          JSONB       NOT NULL DEFAULT '[]',
    final_metadata      JSONB,
    final_report        JSONB,
    error               TEXT,
    metadata_version_id BIGINT      REFERENCES character_metadata_versions(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_refinement_jobs_character ON refinement_jobs(character_id);
CREATE INDEX idx_refinement_jobs_status ON refinement_jobs(status);

CREATE TRIGGER trg_refinement_jobs_updated_at
    BEFORE UPDATE ON refinement_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
