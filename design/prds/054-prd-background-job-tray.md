# PRD-054: Background Job Tray

## 1. Introduction/Overview
When a 20-minute generation is running and the user is editing metadata on a different character, they need passive awareness of job status without navigating to a separate dashboard. This PRD provides a persistent, always-visible lightweight status indicator for running and queued jobs, accessible from any view in the platform — the personal, glanceable companion to PRD-42's full studio-wide dashboard.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for job status events and toast notifications)
- **Depended on by:** None
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Provide always-visible job status from any view in the platform.
- Enable quick actions (pause/cancel) without navigating to a dashboard.
- Deliver notifications on job completion and failure.
- Extend awareness to browser tab titles and optional sound alerts.

## 4. User Stories
- As a Creator, I want a persistent tray icon showing my running and queued jobs so that I always know my generation status regardless of which view I'm in.
- As a Creator, I want toast notifications when jobs complete or fail so that I can react immediately.
- As a Creator, I want the browser tab title to show progress so that I know my job status even when working in another application.
- As a Creator, I want optional sound alerts on job completion so that I don't have to keep watching the screen.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Tray Icon
**Description:** Persistent status indicator in the top navigation bar.
**Acceptance Criteria:**
- [ ] Displays: number of running jobs, number of queued jobs, overall progress percentage
- [ ] Visible regardless of which view/panel the user is in
- [ ] Updates in real-time via PRD-10 event bus

#### Requirement 1.2: Expandable Panel
**Description:** Detailed job list on tray icon click.
**Acceptance Criteria:**
- [ ] Dropdown showing each active job with: name, progress bar, elapsed time, estimated remaining time
- [ ] Quick actions per job: pause, cancel
- [ ] Clicking a completed job navigates to the generated segment

#### Requirement 1.3: Toast Notifications
**Description:** Transient notifications on job events.
**Acceptance Criteria:**
- [ ] Toast appears when a job completes or fails
- [ ] Integrated with PRD-10 event bus
- [ ] Clicking the toast navigates to the completed or failed segment/job
- [ ] Toast auto-dismisses after configurable duration (default: 5 seconds)

#### Requirement 1.4: Browser Tab Title
**Description:** Progress indicator in the browser tab.
**Acceptance Criteria:**
- [ ] When the browser tab is not focused, page title updates to show progress
- [ ] Format: "[73%] X121 — Generating Scene 3"
- [ ] Reverts to normal title when no jobs are active or tab regains focus

#### Requirement 1.5: Sound Alerts
**Description:** Optional audio notification on job completion.
**Acceptance Criteria:**
- [ ] Configurable: on/off per user
- [ ] Custom sound selection (predefined set)
- [ ] Useful when the user is working in a different application

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Desktop Notifications
**Description:** Native OS notifications via browser API.
**Acceptance Criteria:**
- [ ] Browser notification permission request on first use
- [ ] Native OS notification on job completion/failure when the browser tab is not focused

## 6. Non-Goals (Out of Scope)
- Full studio-wide job dashboard (covered by PRD-42)
- Job scheduling and queue management (covered by PRD-08)
- Render queue timeline/Gantt view (covered by PRD-90)

## 7. Design Considerations
- Tray icon should be compact but immediately recognizable with a clear status signal (running/idle/error).
- Expandable panel should not obscure the main content area excessively.
- Toast notifications should stack without overlapping.

## 8. Technical Considerations
- **Stack:** React component subscribing to PRD-10 WebSocket events, Web Audio API for sounds
- **Existing Code to Reuse:** PRD-10 event bus subscription, PRD-29 design system Toast component
- **New Infrastructure Needed:** Tray icon component, job summary aggregator, tab title updater
- **Database Changes:** None (state is client-side, sourced from PRD-08/PRD-10 events)
- **API Changes:** None (consumes existing PRD-08 job status API and PRD-10 WebSocket events)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Tray icon updates within 1 second of job status change
- Toast notifications appear within 2 seconds of job completion/failure
- Browser tab title accurately reflects current job progress

## 11. Open Questions
- Should the tray show only "my" jobs or all studio jobs? (Configurable toggle?)
- What is the maximum number of jobs to display in the expandable panel before scrolling?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
