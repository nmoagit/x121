-- Pipeline Error Recovery & Checkpointing (PRD-28) — Failure diagnostics on jobs.
--
-- Adds columns to track which pipeline stage failed, structured diagnostics,
-- and links to checkpoints and original jobs for resume-from-checkpoint.

ALTER TABLE jobs
    ADD COLUMN failure_stage_index        INTEGER,
    ADD COLUMN failure_stage_name         TEXT,
    ADD COLUMN failure_diagnostics        JSONB,
    ADD COLUMN last_checkpoint_id         BIGINT REFERENCES checkpoints(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN resumed_from_checkpoint_id BIGINT REFERENCES checkpoints(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN original_job_id            BIGINT REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_jobs_last_checkpoint_id         ON jobs(last_checkpoint_id);
CREATE INDEX idx_jobs_resumed_from_checkpoint_id ON jobs(resumed_from_checkpoint_id);
CREATE INDEX idx_jobs_original_job_id            ON jobs(original_job_id);
