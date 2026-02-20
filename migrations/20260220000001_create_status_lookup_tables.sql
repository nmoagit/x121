-- Status lookup tables: all statuses use lookup tables, never raw text columns.
-- Convention: SMALLSERIAL PK, name (unique key), label (display text).

CREATE TABLE job_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_job_statuses_updated_at
    BEFORE UPDATE ON job_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE approval_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_approval_statuses_updated_at
    BEFORE UPDATE ON approval_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE worker_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_worker_statuses_updated_at
    BEFORE UPDATE ON worker_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_project_statuses_updated_at
    BEFORE UPDATE ON project_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE scene_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_scene_statuses_updated_at
    BEFORE UPDATE ON scene_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE segment_statuses (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_segment_statuses_updated_at
    BEFORE UPDATE ON segment_statuses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
