-- Cloud GPU provider statuses (PRD-114).
CREATE TABLE cloud_provider_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cloud_provider_statuses_updated_at
    BEFORE UPDATE ON cloud_provider_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO cloud_provider_statuses (name, label) VALUES
    ('active',   'Active'),
    ('disabled', 'Disabled'),
    ('error',    'Error');

-- Cloud instance statuses (PRD-114).
CREATE TABLE cloud_instance_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cloud_instance_statuses_updated_at
    BEFORE UPDATE ON cloud_instance_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO cloud_instance_statuses (name, label) VALUES
    ('provisioning', 'Provisioning'),
    ('starting',     'Starting'),
    ('running',      'Running'),
    ('stopping',     'Stopping'),
    ('stopped',      'Stopped'),
    ('terminating',  'Terminating'),
    ('terminated',   'Terminated'),
    ('error',        'Error');
