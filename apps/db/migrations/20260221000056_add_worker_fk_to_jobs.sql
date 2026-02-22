-- Add foreign key from jobs.worker_id to workers.id (PRD-46).
--
-- The jobs table already has a worker_id BIGINT column and idx_jobs_worker_id
-- index. This migration adds the FK constraint and a partial index for
-- active-job lookups on a worker.

ALTER TABLE jobs ADD CONSTRAINT fk_jobs_worker_id
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial index for quickly finding active jobs assigned to a worker.
-- Covers Pending(1), Running(2), and Dispatched(9) statuses.
CREATE INDEX idx_jobs_worker_id_active ON jobs(worker_id)
    WHERE status_id IN (1, 2, 9);
