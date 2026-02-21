-- Bug reports table for PRD-44 (Bug Reporting & App Config Export).
--
-- Stores user-submitted bug reports with browser context, console errors,
-- action history, and optional recording/screenshot file paths.

CREATE TABLE bug_reports (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    description TEXT,
    url         TEXT,
    browser_info TEXT,
    console_errors_json  JSONB,
    action_history_json  JSONB,
    context_json         JSONB,          -- visible panels, active project, etc.
    recording_path       TEXT,           -- path to session recording file
    screenshot_path      TEXT,           -- path to optional screenshot
    status      TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'triaged', 'resolved', 'closed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bug_reports_user_id    ON bug_reports(user_id);
CREATE INDEX idx_bug_reports_status     ON bug_reports(status);
CREATE INDEX idx_bug_reports_created_at ON bug_reports(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
