-- Migration 000075: Create presets table (PRD-27)
--
-- Stores parameter presets that can be applied to scenes or generation jobs.
-- Presets carry a usage counter and can be shared at personal, project, or
-- studio scope for marketplace discovery.

CREATE TABLE presets (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope           TEXT NOT NULL DEFAULT 'personal',
    project_id      BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    parameters      JSONB NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_presets_owner_id ON presets(owner_id);
CREATE INDEX idx_presets_project_id ON presets(project_id);
CREATE INDEX idx_presets_scope ON presets(scope);

CREATE TRIGGER trg_presets_updated_at BEFORE UPDATE ON presets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
