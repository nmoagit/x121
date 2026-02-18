# Task List: Production Reporting & Data Export

**PRD Reference:** `design/prds/073-prd-production-reporting-data-export.md`
**Scope:** Build aggregated production reporting with multiple export formats (CSV, PDF, JSON), scheduled report generation, and dashboard widgets for delivery summaries, throughput, GPU utilization, quality metrics, cost per character, and reviewer productivity.

## Overview

Producers and studio managers need visibility into production progress and resource consumption without using the platform daily. This PRD provides a report engine that aggregates data from generation, review, and quality systems, then outputs formatted reports for different audiences. CSV for data analysts, PDF for stakeholders, and JSON for programmatic consumption via the external API. Scheduled reports auto-generate and deliver via email on configurable intervals.

### What Already Exists
- PRD-41 Performance Dashboard for metric data
- PRD-42 Studio Pulse for widget integration
- PRD-49 Quality Gates for QA metrics
- PRD-61 Cost Estimation for cost data
- PRD-12 External API for programmatic report access

### What We're Building
1. Database tables for report definitions, generated reports, and schedules
2. Rust report engine with data aggregation from multiple sources
3. CSV, PDF, and JSON export formatters
4. Scheduled report runner with email delivery
5. API endpoints for report generation and download
6. React report viewer with date range selection and drill-down

### Key Design Decisions
1. **Report definitions are templates** -- Each report type (delivery summary, GPU utilization, etc.) is a named template with pre-configured aggregation logic.
2. **On-demand and scheduled** -- Reports can be generated on demand or on a schedule.
3. **PDF generation server-side** -- Rust generates PDFs directly; no browser-based PDF rendering.
4. **Date range is always required** -- Every report has a mandatory time window to prevent unbounded queries.

---

## Phase 1: Database Schema

### Task 1.1: Report Types Seed Data
**File:** `migrations/YYYYMMDDHHMMSS_seed_report_types.sql`

```sql
CREATE TABLE report_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    config_schema_json JSONB,         -- JSON schema for report configuration
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO report_types (name, description) VALUES
    ('delivery_summary', 'Characters delivered per period, broken down by project'),
    ('throughput_metrics', 'Average turnaround time from onboarding to delivery'),
    ('gpu_utilization', 'Total GPU hours by project, scene type, and resolution'),
    ('quality_metrics', 'Auto-QA pass rates, retry counts, and failure trends'),
    ('cost_per_character', 'Average GPU time and wall-clock time per character'),
    ('reviewer_productivity', 'Review turnaround time, approval ratios, annotation density');
```

**Acceptance Criteria:**
- [ ] Six report types seeded matching PRD requirements
- [ ] `config_schema_json` allows defining per-type configuration options
- [ ] Follows lookup table conventions

### Task 1.2: Generated Reports Table
**File:** `migrations/YYYYMMDDHHMMSS_create_reports.sql`

```sql
CREATE TABLE reports (
    id BIGSERIAL PRIMARY KEY,
    report_type_id BIGINT NOT NULL REFERENCES report_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    config_json JSONB NOT NULL,        -- date range, filters, groupings
    data_json JSONB,                   -- aggregated report data
    file_path TEXT,                    -- path to generated PDF/CSV file
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

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] All FK columns indexed
- [ ] `config_json` stores date range, filters, groupings
- [ ] `data_json` stores the aggregated report data
- [ ] `file_path` points to generated file for download

### Task 1.3: Report Schedules Table
**File:** `migrations/YYYYMMDDHHMMSS_create_report_schedules.sql`

```sql
CREATE TABLE report_schedules (
    id BIGSERIAL PRIMARY KEY,
    report_type_id BIGINT NOT NULL REFERENCES report_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    config_json JSONB NOT NULL,        -- report configuration template
    format TEXT NOT NULL CHECK (format IN ('json', 'csv', 'pdf')),
    schedule TEXT NOT NULL,            -- cron expression or 'weekly'/'monthly'
    recipients_json JSONB NOT NULL,    -- array of email addresses
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

CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Schedule supports cron expressions or named intervals
- [ ] Recipients stored as JSON array of email addresses
- [ ] `next_run_at` indexed for efficient scheduler queries
- [ ] `enabled` flag for pausing without deleting

---

## Phase 2: Rust Backend -- Report Engine

### Task 2.1: Delivery Summary Aggregator
**File:** `src/services/reports/delivery_summary.rs`

```rust
pub struct DeliverySummary {
    pub period: String,
    pub total_characters_delivered: i32,
    pub by_project: Vec<ProjectDeliveryRow>,
    pub comparison_previous_period: Option<PeriodComparison>,
}
```

**Acceptance Criteria:**
- [ ] Characters delivered per period, broken down by project
- [ ] Comparison with previous period (trend direction and percentage)
- [ ] Supports date range filtering

### Task 2.2: Throughput Metrics Aggregator
**File:** `src/services/reports/throughput_metrics.rs`

**Acceptance Criteria:**
- [ ] Average turnaround time from character onboarding to delivery
- [ ] Trend over time with breakdown by project, scene type, resolution
- [ ] Time-series data suitable for charting

### Task 2.3: GPU Utilization Aggregator
**File:** `src/services/reports/gpu_utilization.rs`

**Acceptance Criteria:**
- [ ] Total GPU hours by project, scene type, and resolution tier
- [ ] Idle time vs. active generation time
- [ ] Per-worker utilization comparison
- [ ] Sources data from PRD-41 performance metrics

### Task 2.4: Quality Metrics Aggregator
**File:** `src/services/reports/quality_metrics.rs`

**Acceptance Criteria:**
- [ ] Auto-QA pass rates over time (PRD-49)
- [ ] Average retry count (PRD-71)
- [ ] Most common failure types and failure rate trends
- [ ] Quality improvement tracking after workflow changes

### Task 2.5: Cost Per Character Aggregator
**File:** `src/services/reports/cost_per_character.rs`

**Acceptance Criteria:**
- [ ] Average GPU time and wall-clock time per character
- [ ] Breakdown by scene type
- [ ] Identifies most expensive scene types
- [ ] Sources data from PRD-61 cost estimation

### Task 2.6: Reviewer Productivity Aggregator
**File:** `src/services/reports/reviewer_productivity.rs`

**Acceptance Criteria:**
- [ ] Average review turnaround time
- [ ] Approval/rejection ratios
- [ ] Annotation density (notes per reviewed segment)
- [ ] Presented as efficiency metrics, not surveillance

### Task 2.7: Report Formatter -- CSV
**File:** `src/services/reports/formatter_csv.rs`

**Acceptance Criteria:**
- [ ] Converts aggregated report data to CSV format
- [ ] Proper header row with column names
- [ ] RFC 4180 compliant
- [ ] Handles nested data by flattening

### Task 2.8: Report Formatter -- PDF
**File:** `src/services/reports/formatter_pdf.rs`

**Acceptance Criteria:**
- [ ] Generates professionally formatted PDF with charts and tables
- [ ] Executive summary section at the top
- [ ] Date range and generation metadata in header/footer
- [ ] Uses Rust PDF library (e.g., `genpdf` or `printpdf`)

### Task 2.9: Scheduled Report Runner
**File:** `src/services/report_scheduler.rs`

Background service that executes scheduled reports.

**Acceptance Criteria:**
- [ ] Polls `report_schedules` for due reports (where `next_run_at <= NOW()`)
- [ ] Generates report with the schedule's configuration
- [ ] Delivers via email to configured recipients
- [ ] Updates `last_run_at` and calculates `next_run_at`
- [ ] Error handling: retries on failure, alerts on repeated failures

---

## Phase 3: API Endpoints

### Task 3.1: Report Generation Route
**File:** `src/routes/reports.rs`

```
POST /reports/generate
```

Request body: report type, format, config (date range, filters).

**Acceptance Criteria:**
- [ ] Async operation: returns report ID for polling
- [ ] Validates report type and configuration
- [ ] Generates report in requested format (csv, pdf, json)

### Task 3.2: Report Download Route
**File:** `src/routes/reports.rs`

```
GET /reports/:id/download
```

**Acceptance Criteria:**
- [ ] Returns the generated file with appropriate Content-Type
- [ ] 404 if report not yet generated or failed
- [ ] Supports Content-Disposition for browser download

### Task 3.3: Report History Routes
**File:** `src/routes/reports.rs`

```
GET /reports                           -- List generated reports
GET /reports/templates                 -- List available report types
```

**Acceptance Criteria:**
- [ ] Paginated list of past reports with type, date, format, status
- [ ] Templates endpoint returns available report types with descriptions

### Task 3.4: Report Schedule CRUD Routes
**File:** `src/routes/report_schedules.rs`

```
GET    /report-schedules
POST   /report-schedules
PUT    /report-schedules/:id
DELETE /report-schedules/:id
```

**Acceptance Criteria:**
- [ ] Standard CRUD for report schedules
- [ ] Validation: valid schedule expression, valid email addresses
- [ ] Enable/disable toggle without deletion

---

## Phase 4: React Frontend

### Task 4.1: Report Generator Page
**File:** `frontend/src/pages/Reports.tsx`

**Acceptance Criteria:**
- [ ] Select report type from available templates
- [ ] Date range selector with presets (This Week, This Month, Last Quarter)
- [ ] Format selection (CSV, PDF, JSON)
- [ ] Additional filters based on report type
- [ ] Generate button with progress indicator

### Task 4.2: Report Viewer
**File:** `frontend/src/components/reports/ReportViewer.tsx`

**Acceptance Criteria:**
- [ ] Renders report data in-browser with charts and tables
- [ ] Download buttons for each format
- [ ] Drill-down capability on aggregate numbers
- [ ] Print-friendly layout

### Task 4.3: Report Schedule Manager
**File:** `frontend/src/components/reports/ScheduleManager.tsx`

**Acceptance Criteria:**
- [ ] List active schedules with next run date
- [ ] Create/edit schedule with report type, format, recipients, interval
- [ ] Enable/disable toggle
- [ ] Preview of next N scheduled runs

### Task 4.4: Dashboard Report Widgets
**File:** `frontend/src/components/dashboard/ReportWidgets.tsx`

Summary widgets for PRD-42 Studio Pulse Dashboard integration.

**Acceptance Criteria:**
- [ ] Compact delivery summary widget
- [ ] GPU utilization gauge widget
- [ ] Click-through to full report from widget

---

## Phase 5: Testing

### Task 5.1: Aggregation Tests
**File:** `tests/report_aggregation_test.rs`

**Acceptance Criteria:**
- [ ] Test delivery summary with known data returns correct counts
- [ ] Test GPU utilization aggregation accuracy
- [ ] Test cost per character calculation
- [ ] Test date range filtering excludes out-of-range data
- [ ] Reports generate in <30 seconds for 30-day periods

### Task 5.2: Formatter Tests
**File:** `tests/report_formatter_test.rs`

**Acceptance Criteria:**
- [ ] Test CSV output is valid RFC 4180
- [ ] Test PDF output is valid and readable
- [ ] Test JSON output matches expected schema

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_seed_report_types.sql` | Report type definitions |
| `migrations/YYYYMMDDHHMMSS_create_reports.sql` | Generated reports table |
| `migrations/YYYYMMDDHHMMSS_create_report_schedules.sql` | Report schedule table |
| `src/services/reports/delivery_summary.rs` | Delivery summary aggregator |
| `src/services/reports/throughput_metrics.rs` | Throughput aggregator |
| `src/services/reports/gpu_utilization.rs` | GPU utilization aggregator |
| `src/services/reports/quality_metrics.rs` | Quality metrics aggregator |
| `src/services/reports/cost_per_character.rs` | Cost per character aggregator |
| `src/services/reports/reviewer_productivity.rs` | Reviewer productivity aggregator |
| `src/services/reports/formatter_csv.rs` | CSV export formatter |
| `src/services/reports/formatter_pdf.rs` | PDF export formatter |
| `src/services/report_scheduler.rs` | Scheduled report runner |
| `src/routes/reports.rs` | Report API endpoints |
| `src/routes/report_schedules.rs` | Schedule CRUD API |
| `frontend/src/pages/Reports.tsx` | Report generation page |
| `frontend/src/components/reports/ReportViewer.tsx` | In-browser report display |
| `frontend/src/components/reports/ScheduleManager.tsx` | Schedule management |

## Dependencies

### Upstream PRDs
- PRD-12: External API for programmatic report access
- PRD-41: Performance Dashboard for metric data
- PRD-42: Studio Pulse for widget integration
- PRD-49: Quality Gates for QA metrics
- PRD-61: Cost Estimation for cost data

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.9)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Report generation completes in <30 seconds for 30-day periods
- PDF reports are usable by non-technical stakeholders
- Scheduled reports deliver reliably
- All six report types produce accurate data

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Custom report builder (PRD Requirement 2.1)

## Notes

1. **Email delivery** -- Scheduled reports require SMTP configuration. The report scheduler should gracefully handle email delivery failures (retry, alert admin).
2. **Report retention** -- Generated report files should have a configurable retention period. Default: 90 days.
3. **Reviewer productivity sensitivity** -- Per the PRD, reviewer metrics are for identifying bottlenecks, not micromanagement. Consider making this report type opt-in per studio.
4. **Large date ranges** -- Reports spanning >90 days may be slow. Consider pre-aggregated tables for long-term reporting.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-073
