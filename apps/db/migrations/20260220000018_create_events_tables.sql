-- Event bus core tables: event types lookup and append-only event log (PRD-10).

--------------------------------------------------------------------------------
-- event_types: lookup table for all event categories
--------------------------------------------------------------------------------

CREATE TABLE event_types (
    id          BIGSERIAL   PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    category    TEXT        NOT NULL,
    description TEXT,
    is_critical BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_event_types_updated_at
    BEFORE UPDATE ON event_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed event types

-- Job lifecycle events
INSERT INTO event_types (name, category, description, is_critical) VALUES
    ('job.submitted',  'job', 'A new job has been submitted for processing',    false),
    ('job.started',    'job', 'Job processing has started',                     false),
    ('job.progress',   'job', 'Job processing progress update',                 false),
    ('job.completed',  'job', 'Job processing completed successfully',          false),
    ('job.failed',     'job', 'Job processing failed',                          false),
    ('job.cancelled',  'job', 'Job was cancelled by user or system',            false);

-- Review workflow events
INSERT INTO event_types (name, category, description, is_critical) VALUES
    ('review.submitted', 'review', 'A review has been submitted',               false),
    ('review.approved',  'review', 'A review has been approved',                false),
    ('review.rejected',  'review', 'A review has been rejected',                false),
    ('review.comment',   'review', 'A comment was added to a review',           false);

-- System health events
INSERT INTO event_types (name, category, description, is_critical) VALUES
    ('system.disk_warning', 'system', 'Disk usage has exceeded warning threshold',  true),
    ('system.gpu_warning',  'system', 'GPU utilisation has exceeded warning level',  true),
    ('system.gpu_critical', 'system', 'GPU utilisation is critically high',          true),
    ('system.restart',      'system', 'A system service was restarted',              true);

-- Collaboration events
INSERT INTO event_types (name, category, description, is_critical) VALUES
    ('collab.mention', 'collaboration', 'A user was mentioned in a comment or note', false),
    ('collab.lock',    'collaboration', 'An entity was locked for editing',           false);

--------------------------------------------------------------------------------
-- events: append-only event log (no updated_at — immutable records)
--------------------------------------------------------------------------------

CREATE TABLE events (
    id                 BIGSERIAL   PRIMARY KEY,
    event_type_id      BIGINT      NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_entity_type TEXT,
    source_entity_id   BIGINT,
    actor_user_id      BIGINT      REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    payload            JSONB       NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_events_event_type_id  ON events(event_type_id);
CREATE INDEX idx_events_actor_user_id  ON events(actor_user_id);

-- Polymorphic source lookup
CREATE INDEX idx_events_source_entity  ON events(source_entity_type, source_entity_id);

-- Chronological queries (newest first)
CREATE INDEX idx_events_created_at     ON events(created_at DESC);
