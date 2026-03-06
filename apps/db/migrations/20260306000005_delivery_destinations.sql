-- Delivery destinations (PRD-039 Amendment A.1)
-- Configurable export destinations: local, S3, Google Drive.

CREATE TABLE delivery_destination_types (
    id SMALLINT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
INSERT INTO delivery_destination_types (id, name) VALUES
    (1, 'local'),
    (2, 's3'),
    (3, 'google_drive');

CREATE TABLE delivery_destinations (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id),
    destination_type_id SMALLINT NOT NULL REFERENCES delivery_destination_types(id),
    label TEXT NOT NULL DEFAULT '',
    config JSONB NOT NULL DEFAULT '{}',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_destinations_project
    ON delivery_destinations(project_id) WHERE deleted_at IS NULL;

-- Auto-deliver setting (PRD-039 Amendment A.2)
ALTER TABLE projects ADD COLUMN auto_deliver_on_final BOOLEAN NOT NULL DEFAULT false;
