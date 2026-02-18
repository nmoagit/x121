# PRD-073: Production Reporting & Data Export

## 1. Introduction/Overview
Producers and studio managers who don't use the platform daily need visibility into production progress and resource consumption. Without reporting, status updates require manually counting scenes and asking creators. This PRD provides aggregated production metrics and exportable reports — delivery summaries, throughput metrics, GPU utilization, quality metrics, cost per character, and reviewer productivity — enabling data-driven decisions about resource allocation and process improvement.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-12 (External API for programmatic report access), PRD-41 (Performance Dashboard for metric data), PRD-42 (Studio Pulse for widget integration), PRD-49 (Quality Gates for QA metrics), PRD-61 (Cost Estimation for cost data)
- **Depended on by:** None
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Provide aggregated production reports for management visibility.
- Support multiple export formats (CSV, PDF, JSON).
- Enable scheduled report generation and delivery.
- Surface key metrics as dashboard widgets.

## 4. User Stories
- As an Admin, I want a monthly delivery summary so that I can report to stakeholders how many characters were delivered.
- As an Admin, I want GPU utilization reports so that I can optimize hardware allocation and justify infrastructure costs.
- As an Admin, I want cost-per-character breakdowns so that I can identify which scene types are most expensive and optimize accordingly.
- As a Creator, I want quality trend reports so that I can track whether my workflow changes are improving pass rates.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Delivery Summary
**Description:** Characters delivered per period.
**Acceptance Criteria:**
- [ ] Characters delivered per period, broken down by project
- [ ] "This month: 45 characters across 3 projects"
- [ ] Comparison with previous periods (trend)

#### Requirement 1.2: Throughput Metrics
**Description:** Production velocity tracking.
**Acceptance Criteria:**
- [ ] Average turnaround time from character onboarding to delivery
- [ ] Trend over time to measure process improvement
- [ ] Breakdown by project, scene type, and resolution tier

#### Requirement 1.3: GPU Utilization
**Description:** Resource consumption reporting.
**Acceptance Criteria:**
- [ ] Total GPU hours consumed, broken down by project, scene type, and resolution tier (PRD-59)
- [ ] Idle time vs. active generation time
- [ ] Per-worker utilization comparison

#### Requirement 1.4: Quality Metrics
**Description:** QA and quality trend reporting.
**Acceptance Criteria:**
- [ ] Auto-QA pass rates (PRD-49) over time
- [ ] Average retry count (PRD-71)
- [ ] Most common failure types and failure rate trends
- [ ] Quality improvement tracking after workflow changes

#### Requirement 1.5: Cost per Character
**Description:** Resource cost breakdown.
**Acceptance Criteria:**
- [ ] Average GPU time and wall-clock time per character
- [ ] Breakdown by scene type
- [ ] Identify which scene types are most expensive

#### Requirement 1.6: Reviewer Productivity
**Description:** Review pipeline efficiency metrics.
**Acceptance Criteria:**
- [ ] Average review turnaround time
- [ ] Approval/rejection ratios
- [ ] Annotation density (notes per reviewed segment)
- [ ] Not for micromanagement — for identifying bottlenecks

#### Requirement 1.7: Export Formats
**Description:** Multiple output formats for different consumers.
**Acceptance Criteria:**
- [ ] CSV for data analysis
- [ ] PDF for stakeholder presentations
- [ ] JSON for programmatic consumption via PRD-12 API
- [ ] Custom date range filtering on all reports

#### Requirement 1.8: Scheduled Reports
**Description:** Automated report generation and delivery.
**Acceptance Criteria:**
- [ ] Configure reports to auto-generate at regular intervals (weekly, monthly)
- [ ] Email delivery to configured recipients
- [ ] Reports stored for historical access

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Report Builder
**Description:** User-defined reports with custom metrics.
**Acceptance Criteria:**
- [ ] Drag-and-drop report builder: select metrics, filters, grouping, and chart types
- [ ] Save custom report definitions for reuse

## 6. Non-Goals (Out of Scope)
- Performance benchmarking at the workflow/node level (covered by PRD-41)
- Studio Pulse real-time dashboard (covered by PRD-42)
- Budget and quota management (covered by PRD-93)

## 7. Design Considerations
- PDF reports should be professionally formatted with charts, tables, and executive summary.
- Dashboard widgets should show the most important metrics at a glance with drill-down capability.
- Date range selector should support quick presets (This Week, This Month, Last Quarter).

## 8. Technical Considerations
- **Stack:** Rust for data aggregation, React for report viewer, PDF generation library, CSV serializer
- **Existing Code to Reuse:** PRD-41 performance data, PRD-49 quality scores, PRD-61 cost data, PRD-42 widget framework
- **New Infrastructure Needed:** Report engine, PDF renderer, scheduled report runner, email delivery integration
- **Database Changes:** `reports` table (id, type, config_json, generated_at, file_path), `report_schedules` table (id, report_type, config_json, schedule, recipients_json)
- **API Changes:** POST /reports/generate, GET /reports/:id/download, CRUD /report-schedules, GET /reports/templates

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Report generation completes in <30 seconds for 30-day periods
- PDF reports are usable by non-technical stakeholders (validated by feedback)
- Scheduled reports deliver reliably with >99% uptime

## 11. Open Questions
- Should reviewer productivity metrics be opt-in per studio to avoid surveillance concerns?
- What retention policy should apply to historical report files?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
