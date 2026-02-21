-- GPU quotas table (PRD-08).
-- Per-user and/or per-project GPU time limits.
-- Both user_id and project_id are optional: either, both, or neither can be set.

CREATE TABLE gpu_quotas (
    id               BIGSERIAL   PRIMARY KEY,
    user_id          BIGINT      REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_id       BIGINT      REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    daily_limit_secs INTEGER,
    weekly_limit_secs INTEGER,
    is_enabled       BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gpu_quotas_user_id    ON gpu_quotas(user_id);
CREATE INDEX idx_gpu_quotas_project_id ON gpu_quotas(project_id);

CREATE TRIGGER trg_gpu_quotas_updated_at
    BEFORE UPDATE ON gpu_quotas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
