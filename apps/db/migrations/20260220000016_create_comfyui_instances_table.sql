-- ComfyUI instance registry and connection status tracking (PRD-05).

-- Lookup table for ComfyUI instance connection statuses.
CREATE TABLE comfyui_instance_statuses (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_comfyui_instance_statuses_updated_at
    BEFORE UPDATE ON comfyui_instance_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO comfyui_instance_statuses (name, description) VALUES
    ('connected',    'Instance is connected and healthy'),
    ('disconnected', 'Instance is not connected'),
    ('reconnecting', 'Instance is attempting to reconnect'),
    ('disabled',     'Instance has been manually disabled');

-- ComfyUI server instances managed by the bridge.
CREATE TABLE comfyui_instances (
    id                   BIGSERIAL   PRIMARY KEY,
    name                 TEXT        NOT NULL,
    ws_url               TEXT        NOT NULL,
    api_url              TEXT        NOT NULL,
    status_id            BIGINT      NOT NULL REFERENCES comfyui_instance_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    last_connected_at    TIMESTAMPTZ,
    last_disconnected_at TIMESTAMPTZ,
    reconnect_attempts   INTEGER     NOT NULL DEFAULT 0,
    is_enabled           BOOLEAN     NOT NULL DEFAULT true,
    metadata             JSONB       NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on instance name.
CREATE UNIQUE INDEX uq_comfyui_instances_name ON comfyui_instances(name);

-- FK indexes.
CREATE INDEX idx_comfyui_instances_status_id ON comfyui_instances(status_id);

CREATE TRIGGER trg_comfyui_instances_updated_at
    BEFORE UPDATE ON comfyui_instances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
