-- Users table: authenticated user accounts (PRD-03).

CREATE TABLE users (
    id                 BIGSERIAL PRIMARY KEY,
    username           TEXT        NOT NULL UNIQUE,
    email              TEXT        NOT NULL UNIQUE,
    password_hash      TEXT        NOT NULL,
    role_id            BIGINT      NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    is_active          BOOLEAN     NOT NULL DEFAULT true,
    last_login_at      TIMESTAMPTZ,
    failed_login_count INTEGER     NOT NULL DEFAULT 0,
    locked_until       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes
CREATE INDEX idx_users_role_id ON users(role_id);

-- Column indexes for auth lookups
CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Updated_at trigger
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
