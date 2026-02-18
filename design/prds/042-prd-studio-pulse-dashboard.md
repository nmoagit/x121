# PRD-042: Studio Pulse Dashboard

## 1. Introduction/Overview
The Studio Pulse Dashboard is the "Command Center" for the whole studio — providing real-time visibility into active tasks, disk health, project progress, and activity feed. It consumes events from PRD-10 to deliver a live, always-current overview that keeps everyone aligned on studio status without requiring navigation to individual project views.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for real-time event consumption)
- **Depended on by:** PRD-53 (First-Run Onboarding checklist widget), PRD-56 (Studio Wiki pinned articles), PRD-57 (Batch Orchestrator status), PRD-73 (Production Reporting widgets), PRD-89 (Dashboard Widget Customization)
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Provide real-time visibility into studio-wide activity and health.
- Display customizable widgets for active tasks, disk health, project progress, and activity.
- Consume and display events from the event bus in real-time.
- Serve as the default landing page for all users.

## 4. User Stories
- As an Admin, I want a real-time overview of all active generation jobs so that I can monitor studio throughput at a glance.
- As a Creator, I want to see my active projects' progress so that I know which characters are complete and which need attention.
- As an Admin, I want disk health indicators so that I can prevent storage issues before they block generation.
- As a Reviewer, I want an activity feed showing recent approvals and submissions so that I stay current on team progress.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Active Tasks Widget
**Description:** Real-time job status overview.
**Acceptance Criteria:**
- [ ] Show all running, queued, and recently completed jobs
- [ ] Per-job: name, status, progress percentage, elapsed time, worker assignment
- [ ] Click to navigate to job detail view
- [ ] Real-time updates via PRD-10 event bus

#### Requirement 1.2: Project Progress Widget
**Description:** Per-project completion tracking.
**Acceptance Criteria:**
- [ ] Progress bar per project showing: scenes approved / total scenes
- [ ] Color-coded status: green (on track), yellow (delayed), red (blocked)
- [ ] Click to navigate to project detail view

#### Requirement 1.3: Disk Health Widget
**Description:** Storage capacity monitoring.
**Acceptance Criteria:**
- [ ] Current disk usage vs. capacity with visual gauge
- [ ] Warning thresholds: yellow at 80%, red at 90%
- [ ] Breakdown: by project, by file type (videos, images, temp files)
- [ ] Link to PRD-15 disk reclamation when threshold exceeded

#### Requirement 1.4: Activity Feed Widget
**Description:** Chronological event stream.
**Acceptance Criteria:**
- [ ] Recent events: job completions, approvals, rejections, comments, system events
- [ ] Filterable by event type, project, or user
- [ ] Real-time updates (new events appear at the top)
- [ ] Click any event to navigate to the relevant entity

#### Requirement 1.5: Dashboard Layout
**Description:** Default widget arrangement.
**Acceptance Criteria:**
- [ ] Responsive grid layout fitting common screen resolutions
- [ ] Default layout shows all core widgets (Active Tasks, Progress, Disk, Activity)
- [ ] Layout serves as the platform's landing page after login

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Widget Auto-Refresh
**Description:** Configurable refresh intervals.
**Acceptance Criteria:**
- [ ] Per-widget configurable refresh interval (10s, 30s, 1min, real-time)
- [ ] Manual refresh button per widget

## 6. Non-Goals (Out of Scope)
- Dashboard widget customization and drag-and-drop (covered by PRD-89)
- Performance benchmarking metrics (covered by PRD-41)
- Production reporting and export (covered by PRD-73)

## 7. Design Considerations
- Dashboard should feel alive — real-time updates, not static snapshots.
- Widget cards should use consistent styling from PRD-29 design system.
- Information density should be high but not overwhelming (progressive disclosure for details).

## 8. Technical Considerations
- **Stack:** React widget components, WebSocket subscription to PRD-10 events, PRD-29 design system
- **Existing Code to Reuse:** PRD-10 event bus for real-time data, PRD-29 Card/Grid components
- **New Infrastructure Needed:** Dashboard widget framework, widget data aggregators, event stream filter
- **Database Changes:** `dashboard_config` table (user_id, layout_json, widget_settings_json) — extended by PRD-89
- **API Changes:** GET /dashboard/widgets/active-tasks, GET /dashboard/widgets/project-progress, GET /dashboard/widgets/disk-health, GET /dashboard/widgets/activity-feed

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Dashboard loads in <2 seconds with all widgets
- Real-time updates appear within 1 second of event occurrence
- Dashboard serves as effective studio overview (validated by user feedback)

## 11. Open Questions
- Should the dashboard support full-screen "TV mode" for wall-mounted studio monitors?
- How many events should the activity feed retain before pagination?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
