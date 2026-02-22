-- Create the worker_health_log table for tracking worker status transitions (PRD-46).
--
-- Captures every status change (idle -> busy, busy -> offline, etc.)
-- with a reason and timestamp. Used for health dashboards and diagnostics.

CREATE TABLE worker_health_log (
    id              BIGSERIAL     PRIMARY KEY,
    worker_id       BIGINT        NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    from_status_id  SMALLINT      NOT NULL REFERENCES worker_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    to_status_id    SMALLINT      NOT NULL REFERENCES worker_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reason          TEXT,
    transitioned_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_health_log_worker_id ON worker_health_log(worker_id);
