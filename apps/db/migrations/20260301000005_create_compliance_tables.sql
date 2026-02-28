-- Compliance rules: configurable per-project or global rules
CREATE TABLE compliance_rules (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('resolution', 'framerate', 'codec', 'duration', 'filesize', 'naming', 'custom')),
    config_json JSONB NOT NULL,
    is_global BOOLEAN NOT NULL DEFAULT false,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_rules_project_id ON compliance_rules(project_id);
CREATE INDEX idx_compliance_rules_created_by ON compliance_rules(created_by);
CREATE INDEX idx_compliance_rules_rule_type ON compliance_rules(rule_type);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON compliance_rules FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Compliance checks: results of running rules against videos
CREATE TABLE compliance_checks (
    id BIGSERIAL PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    rule_id BIGINT NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE ON UPDATE CASCADE,
    passed BOOLEAN NOT NULL,
    actual_value TEXT,
    expected_value TEXT,
    message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_checks_scene_id ON compliance_checks(scene_id);
CREATE INDEX idx_compliance_checks_rule_id ON compliance_checks(rule_id);
CREATE INDEX idx_compliance_checks_passed ON compliance_checks(passed);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON compliance_checks FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
