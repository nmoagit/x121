-- Script type lookup and script registry for the Multi-Runtime Script
-- Orchestrator (PRD-09).
--
-- script_types  -- lookup table: shell, python, binary
-- scripts       -- central registry of registered scripts with metadata,
--                  argument/output schemas, timeout, and venv configuration

--------------------------------------------------------------------------------
-- script_types: lookup table for supported script runtime types
--------------------------------------------------------------------------------

CREATE TABLE script_types (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    label      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_script_types_updated_at
    BEFORE UPDATE ON script_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO script_types (name, label) VALUES
    ('shell',  'Shell'),
    ('python', 'Python'),
    ('binary', 'Binary');

--------------------------------------------------------------------------------
-- scripts: central registry of all managed scripts
--
-- Each script has a runtime type (shell/python/binary), a file path, optional
-- working directory, and optional Python venv configuration. The argument_schema
-- and output_schema columns describe the expected input/output contract as JSONB,
-- allowing validation at execution time.
--------------------------------------------------------------------------------

CREATE TABLE scripts (
    id                BIGSERIAL   PRIMARY KEY,
    name              TEXT        NOT NULL UNIQUE,
    description       TEXT,
    script_type_id    SMALLINT    NOT NULL REFERENCES script_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    file_path         TEXT        NOT NULL,
    working_directory TEXT,
    requirements_path TEXT,
    requirements_hash TEXT,
    venv_path         TEXT,
    argument_schema   JSONB       NOT NULL DEFAULT '{}',
    output_schema     JSONB       NOT NULL DEFAULT '{}',
    timeout_secs      INTEGER     NOT NULL DEFAULT 300,
    is_enabled        BOOLEAN     NOT NULL DEFAULT true,
    version           TEXT,
    created_by        BIGINT      REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes.
CREATE INDEX idx_scripts_script_type_id ON scripts(script_type_id);
CREATE INDEX idx_scripts_created_by     ON scripts(created_by);

CREATE TRIGGER trg_scripts_updated_at
    BEFORE UPDATE ON scripts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
