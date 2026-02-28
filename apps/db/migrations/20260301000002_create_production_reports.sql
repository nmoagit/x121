-- Production Reporting & Data Export (PRD-73)
-- report_types lookup, reports, and report_schedules tables.

-- report_types lookup table
CREATE TABLE report_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    config_schema_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_types FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO report_types (name, description) VALUES
    ('delivery_summary', 'Characters delivered per period, broken down by project'),
    ('throughput_metrics', 'Average turnaround time from onboarding to delivery'),
    ('gpu_utilization', 'Total GPU hours by project, scene type, and resolution'),
    ('quality_metrics', 'Auto-QA pass rates, retry counts, and failure trends'),
    ('cost_per_character', 'Average GPU time and wall-clock time per character'),
    ('reviewer_productivity', 'Review turnaround time, approval ratios, annotation density'),
    ('video_technical', 'Per-video technical metadata: dimensions, duration, framerate, codec, file size');

-- reports table (generated reports)
CREATE TABLE reports (
    id BIGSERIAL PRIMARY KEY,
    report_type_id BIGINT NOT NULL REFERENCES report_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    config_json JSONB NOT NULL,
    data_json JSONB,
    file_path TEXT,
    format TEXT NOT NULL CHECK (format IN ('json', 'csv', 'pdf')),
    generated_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_report_type_id ON reports(report_type_id);
CREATE INDEX idx_reports_generated_by ON reports(generated_by);
CREATE INDEX idx_reports_status_id ON reports(status_id);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- report_schedules table
CREATE TABLE report_schedules (
    id BIGSERIAL PRIMARY KEY,
    report_type_id BIGINT NOT NULL REFERENCES report_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    config_json JSONB NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('json', 'csv', 'pdf')),
    schedule TEXT NOT NULL,
    recipients_json JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_schedules_report_type_id ON report_schedules(report_type_id);
CREATE INDEX idx_report_schedules_created_by ON report_schedules(created_by);
CREATE INDEX idx_report_schedules_next_run_at ON report_schedules(next_run_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
