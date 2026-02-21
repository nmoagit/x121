-- Pipeline Error Recovery & Checkpointing (PRD-28) — Checkpoints table.
--
-- Stores checkpoint metadata for pipeline stages. Actual checkpoint data
-- (intermediate frames, latents) lives on the filesystem at `data_path`.
-- One checkpoint per pipeline stage per job.

CREATE TABLE checkpoints (
    id          BIGSERIAL    PRIMARY KEY,
    job_id      BIGINT       NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    stage_index INTEGER      NOT NULL,
    stage_name  TEXT         NOT NULL,
    data_path   TEXT         NOT NULL,
    metadata    JSONB,
    size_bytes  BIGINT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_job_id ON checkpoints(job_id);
CREATE UNIQUE INDEX uq_checkpoints_job_stage ON checkpoints(job_id, stage_index);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON checkpoints
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
