-- Migration 000078: Create delivery_export_statuses lookup table (PRD-39)
--
-- Status lookup table for delivery export pipeline stages.

CREATE TABLE IF NOT EXISTS delivery_export_statuses (
    id          SMALLSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_delivery_export_statuses_updated_at
    BEFORE UPDATE ON delivery_export_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO delivery_export_statuses (name, label) VALUES
    ('pending',     'Pending'),
    ('assembling',  'Assembling'),
    ('transcoding', 'Transcoding'),
    ('packaging',   'Packaging'),
    ('validating',  'Validating'),
    ('completed',   'Completed'),
    ('failed',      'Failed');
