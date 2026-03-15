-- Add "Failed" scene status for generation failures after max retries.
INSERT INTO scene_statuses (id, name, label)
VALUES (7, 'failed', 'Failed')
ON CONFLICT (id) DO NOTHING;

-- Track how many times a job has been retried due to instance death.
-- Used by the reconciliation service to enforce max retry limit.
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS orphan_retry_count SMALLINT NOT NULL DEFAULT 0;
