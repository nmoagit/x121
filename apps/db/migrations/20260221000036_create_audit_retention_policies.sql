-- Audit log retention policies per category (PRD-45).
--
-- Configures active and archive retention periods for each log category.

CREATE TABLE audit_retention_policies (
    id                      BIGSERIAL PRIMARY KEY,
    log_category            TEXT NOT NULL UNIQUE,
    active_retention_days   INTEGER NOT NULL DEFAULT 90,
    archive_retention_days  INTEGER NOT NULL DEFAULT 365,
    enabled                 BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON audit_retention_policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default retention policies for each log category.
INSERT INTO audit_retention_policies (log_category, active_retention_days, archive_retention_days) VALUES
    ('authentication', 90, 365),
    ('operations', 90, 365),
    ('configuration', 180, 730),
    ('system', 90, 365);
