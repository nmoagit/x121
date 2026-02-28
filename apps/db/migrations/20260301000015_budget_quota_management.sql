-- Generation Budget & Quota Management (PRD-93)
-- Per-project GPU hour budgets, per-user quotas, append-only consumption
-- ledger, and named exemption rules.

-- ---------------------------------------------------------------------------
-- Project budgets (unique per project)
-- ---------------------------------------------------------------------------

CREATE TABLE project_budgets (
    id                      BIGSERIAL    PRIMARY KEY,
    project_id              BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    budget_gpu_hours        DOUBLE PRECISION NOT NULL CHECK (budget_gpu_hours > 0),
    period_type             TEXT         NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'unlimited')),
    period_start            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    warning_threshold_pct   INTEGER      NOT NULL DEFAULT 75 CHECK (warning_threshold_pct BETWEEN 1 AND 99),
    critical_threshold_pct  INTEGER      NOT NULL DEFAULT 90 CHECK (critical_threshold_pct BETWEEN 1 AND 99),
    hard_limit_enabled      BOOLEAN      NOT NULL DEFAULT true,
    rollover_enabled        BOOLEAN      NOT NULL DEFAULT false,
    created_by              BIGINT       NOT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_budgets_project UNIQUE (project_id),
    CONSTRAINT ck_project_budgets_thresholds CHECK (critical_threshold_pct > warning_threshold_pct)
);

CREATE INDEX idx_project_budgets_project ON project_budgets(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_budgets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- User quotas (unique per user)
-- ---------------------------------------------------------------------------

CREATE TABLE user_quotas (
    id                      BIGSERIAL    PRIMARY KEY,
    user_id                 BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    quota_gpu_hours         DOUBLE PRECISION NOT NULL CHECK (quota_gpu_hours > 0),
    period_type             TEXT         NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'unlimited')),
    period_start            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    hard_limit_enabled      BOOLEAN      NOT NULL DEFAULT true,
    created_by              BIGINT       NOT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_quotas_user UNIQUE (user_id)
);

CREATE INDEX idx_user_quotas_user ON user_quotas(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_quotas
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Budget consumption ledger (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE budget_consumption_ledger (
    id                BIGSERIAL    PRIMARY KEY,
    project_id        BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    job_id            BIGINT,
    gpu_hours         DOUBLE PRECISION NOT NULL CHECK (gpu_hours > 0),
    job_type          TEXT         NOT NULL,
    resolution_tier   TEXT,
    is_exempt         BOOLEAN      NOT NULL DEFAULT false,
    exemption_reason  TEXT,
    recorded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consumption_project     ON budget_consumption_ledger(project_id);
CREATE INDEX idx_consumption_user        ON budget_consumption_ledger(user_id);
CREATE INDEX idx_consumption_recorded_at ON budget_consumption_ledger(recorded_at);
CREATE INDEX idx_consumption_project_period ON budget_consumption_ledger(project_id, recorded_at) WHERE is_exempt = false;
CREATE INDEX idx_consumption_user_period    ON budget_consumption_ledger(user_id, recorded_at) WHERE is_exempt = false;

-- ---------------------------------------------------------------------------
-- Budget exemptions (unique name)
-- ---------------------------------------------------------------------------

CREATE TABLE budget_exemptions (
    id               BIGSERIAL    PRIMARY KEY,
    name             TEXT         NOT NULL,
    description      TEXT,
    job_type         TEXT         NOT NULL,
    resolution_tier  TEXT,
    is_enabled       BOOLEAN      NOT NULL DEFAULT true,
    created_by       BIGINT       NOT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_budget_exemptions_name UNIQUE (name)
);

CREATE INDEX idx_budget_exemptions_enabled ON budget_exemptions(is_enabled) WHERE is_enabled = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON budget_exemptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
