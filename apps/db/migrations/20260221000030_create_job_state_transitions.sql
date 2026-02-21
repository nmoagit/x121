-- Job state transitions log (PRD-08).
-- Append-only audit trail recording every job status change.
-- No updated_at trigger: rows are immutable once written.

CREATE TABLE job_state_transitions (
    id              BIGSERIAL   PRIMARY KEY,
    job_id          BIGINT      NOT NULL REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    from_status_id  SMALLINT    NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    to_status_id    SMALLINT    NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    triggered_by    BIGINT      REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    reason          TEXT,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_state_transitions_job_id ON job_state_transitions(job_id);
