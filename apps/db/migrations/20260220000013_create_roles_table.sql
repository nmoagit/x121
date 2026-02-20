-- Roles lookup table: RBAC role definitions (PRD-03).

CREATE TABLE roles (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default roles
INSERT INTO roles (name, description) VALUES
    ('admin',    'Full access — user management, system configuration, all permissions'),
    ('creator',  'Project and character management, generation, final approval'),
    ('reviewer', 'View content, flag issues, add review notes, suggest rejections');
