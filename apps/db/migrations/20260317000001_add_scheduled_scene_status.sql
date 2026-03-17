-- Add "Scheduled" scene status for deferred generation (PRD-134).
-- Also extends the schedules.action_type CHECK to allow 'schedule_generation'
-- and schedule_history.status CHECK to allow 'cancelled'.

INSERT INTO scene_statuses (id, name) VALUES (8, 'Scheduled')
ON CONFLICT (id) DO NOTHING;

-- Widen the action_type CHECK on schedules to include schedule_generation.
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_action_type_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_action_type_check
    CHECK (action_type IN ('submit_job', 'submit_batch', 'schedule_generation'));

-- Widen the status CHECK on schedule_history to include 'cancelled'.
ALTER TABLE schedule_history DROP CONSTRAINT IF EXISTS schedule_history_status_check;
ALTER TABLE schedule_history ADD CONSTRAINT schedule_history_status_check
    CHECK (status IN ('success', 'failed', 'skipped', 'cancelled'));
