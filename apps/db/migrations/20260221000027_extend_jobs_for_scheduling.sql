-- Extend jobs table with scheduling columns (PRD-08).
-- Adds deferred start, off-peak-only flag, pause/resume tracking,
-- and queue position for admin reordering.

ALTER TABLE jobs ADD COLUMN scheduled_start_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN is_off_peak_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN resumed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN queue_position INTEGER;

-- Seed new job statuses: IDs will be 7, 8, 9 (SMALLSERIAL auto-increment).
INSERT INTO job_statuses (name, label) VALUES
    ('scheduled',  'Scheduled'),
    ('paused',     'Paused'),
    ('dispatched', 'Dispatched');
