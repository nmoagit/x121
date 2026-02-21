-- Jobs table for the parallel task execution engine (PRD-07).
-- Tracks background jobs through their full lifecycle: submission, dispatch,
-- execution, completion/failure, and manual retry.

CREATE TABLE jobs (
    id                     BIGSERIAL    PRIMARY KEY,
    job_type               TEXT         NOT NULL,
    status_id              SMALLINT     NOT NULL REFERENCES job_statuses(id)
                                           ON DELETE RESTRICT ON UPDATE CASCADE,
    submitted_by           BIGINT       NOT NULL REFERENCES users(id)
                                           ON DELETE RESTRICT ON UPDATE CASCADE,
    worker_id              BIGINT,
    priority               INTEGER      NOT NULL DEFAULT 0,
    parameters             JSONB        NOT NULL DEFAULT '{}',
    result                 JSONB,
    error_message          TEXT,
    error_details          JSONB,
    progress_percent       SMALLINT     NOT NULL DEFAULT 0,
    progress_message       TEXT,
    submitted_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    claimed_at             TIMESTAMPTZ,
    started_at             TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    estimated_duration_secs INTEGER,
    actual_duration_secs   INTEGER,
    retry_of_job_id        BIGINT       REFERENCES jobs(id)
                                           ON DELETE SET NULL ON UPDATE CASCADE,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FK column indexes for join performance.
CREATE INDEX idx_jobs_status_id        ON jobs(status_id);
CREATE INDEX idx_jobs_submitted_by     ON jobs(submitted_by);
CREATE INDEX idx_jobs_worker_id        ON jobs(worker_id);
CREATE INDEX idx_jobs_retry_of_job_id  ON jobs(retry_of_job_id);

-- Partial index for the dispatcher: unclaimed pending jobs ordered by
-- priority (descending) then submission time (ascending).
-- status_id = 1 corresponds to job_statuses "pending".
CREATE INDEX idx_jobs_pending_unclaimed
    ON jobs(priority DESC, submitted_at ASC)
    WHERE status_id = 1 AND claimed_at IS NULL;

CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
