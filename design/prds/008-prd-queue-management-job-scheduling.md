# PRD-008: Queue Management & Job Scheduling

## 1. Introduction/Overview
When multiple creators submit generation jobs simultaneously, scheduling policy determines who gets the GPU. This PRD defines the priority-based job ordering, cancellation/pause capabilities, GPU resource allocation policies, time-based scheduling, and queue visibility that sit on top of the execution engine (PRD-07). It solves the "submitted 160 scenes at 2pm, GPUs busy all afternoon" problem by enabling deferred scheduling, off-peak policies, and fair resource allocation.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-07 (Parallel Task Execution Engine)
- **Depended on by:** PRD-06, PRD-46, PRD-57, PRD-61, PRD-65
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Implement priority-based job ordering with Urgent, Normal, and Background tiers.
- Enable fair scheduling with configurable per-user or per-project GPU time quotas.
- Support job lifecycle management: Queued, Dispatched, Running, Paused, Cancelled, Failed, Complete.
- Provide time-based scheduling (future start times, off-peak policies, recurring schedules).
- Give users and admins visibility into queue state and estimated wait times.

## 4. User Stories
- As a Creator, I want to see my position in the queue and estimated start time so that I can plan my work around GPU availability.
- As an Admin, I want to set per-user GPU time quotas so that one creator cannot monopolize the entire fleet.
- As a Creator, I want to schedule a large batch to run overnight so that it doesn't interfere with interactive work during business hours.
- As a Creator, I want to cancel a queued job before it starts so that I can free up the GPU for higher-priority work.
- As an Admin, I want to drag-and-drop reorder the queue so that I can manually prioritize urgent requests.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Priority Levels
**Description:** Three-tier priority system for job ordering.
**Acceptance Criteria:**
- [ ] Urgent priority: review re-renders and interactive requests (processed first)
- [ ] Normal priority: standard generation jobs (default)
- [ ] Background priority: batch/speculative work (processed last)
- [ ] Within the same priority, jobs are ordered FIFO

#### Requirement 1.2: Job Lifecycle State Machine
**Description:** Strict state transitions enforced by the system.
**Acceptance Criteria:**
- [ ] Valid states: Queued, Scheduled, Dispatched, Running, Paused, Cancelled, Failed, Complete
- [ ] State transitions are validated (e.g., cannot go from Complete back to Running)
- [ ] Each state transition is timestamped and logged
- [ ] Invalid state transitions return clear error messages

#### Requirement 1.3: Cancellation with Partial Output Preservation
**Description:** Clean mid-run cancellation that keeps completed work.
**Acceptance Criteria:**
- [ ] Queued jobs can be cancelled instantly (removed from queue)
- [ ] Running jobs can be cancelled with a grace period for the current segment to complete
- [ ] Completed segments from cancelled jobs are preserved and accessible
- [ ] Cancelled status shows which segments completed before cancellation

#### Requirement 1.4: Fair Scheduling
**Description:** Configurable per-user or per-project GPU time quotas to prevent starvation.
**Acceptance Criteria:**
- [ ] Admin can set daily/weekly GPU hour quotas per user or per project
- [ ] The scheduler respects quotas when dispatching jobs
- [ ] Users approaching their quota see a warning before submitting
- [ ] Users who exceed their quota have new jobs held until the quota resets

#### Requirement 1.5: Scheduled Submission
**Description:** Submit jobs with a future start time.
**Acceptance Criteria:**
- [ ] Jobs can be submitted with a `start_after` timestamp
- [ ] Scheduled jobs sit in "Scheduled" state until the trigger time
- [ ] At the trigger time, scheduled jobs enter the queue at their assigned priority
- [ ] Scheduled jobs can be edited or cancelled before their start time

#### Requirement 1.6: Off-Peak Policy
**Description:** Mark jobs as "off-peak only" so they only dispatch during idle periods.
**Acceptance Criteria:**
- [ ] Jobs can be marked as "off-peak only" at submission
- [ ] Off-peak jobs only dispatch when no interactive/urgent jobs are queued
- [ ] Off-peak jobs automatically yield to higher-priority work
- [ ] Off-peak hours are configurable (e.g., 10pm-8am)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Recurring Schedules
**Description:** Schedule repeating jobs that auto-submit at configured intervals.
**Acceptance Criteria:**
- [ ] Jobs can be configured to repeat daily, weekly, or on a custom schedule
- [ ] Recurring jobs auto-submit at the configured time
- [ ] Failed recurring jobs are flagged but don't block the next occurrence

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Queue Analytics
**Description:** Historical queue depth and wait time analytics.
**Acceptance Criteria:**
- [ ] Average wait time per priority level tracked over time
- [ ] Queue depth over time visualized as a chart
- [ ] Peak usage hours identified for capacity planning

## 6. Non-Goals (Out of Scope)
- Task execution mechanics (covered by PRD-07)
- Worker pool management (covered by PRD-46)
- Cost estimation for jobs (covered by PRD-61)
- Budget enforcement (covered by PRD-93)

## 7. Design Considerations
- The queue view should show a clear ordered list with estimated start times.
- Priority is visually indicated by color or icon (Urgent=red, Normal=blue, Background=gray).
- Drag-and-drop reordering should be intuitive with visual feedback showing where the job will land.

## 8. Technical Considerations
- **Stack:** Rust scheduling service, PostgreSQL for queue persistence, WebSocket for real-time queue updates
- **Existing Code to Reuse:** PRD-07 job infrastructure, PRD-02 WebSocket relay
- **New Infrastructure Needed:** Priority queue data structure, scheduling service, quota tracking
- **Database Changes:** Add priority, scheduled_start, off_peak_only, quota_tracking columns to jobs table; `scheduling_policies` table
- **API Changes:** PUT /jobs/:id/priority, PUT /jobs/:id/pause, PUT /jobs/:id/resume, GET /queue/status, POST /admin/scheduling/policies

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Queue reordering takes effect within 1 second
- Scheduled jobs dispatch within 30 seconds of their scheduled time
- Fair scheduling prevents any single user from consuming >50% of GPU time when others are waiting
- Job cancellation completes within 5 seconds

## 11. Open Questions
- Should priority be user-adjustable or admin-only?
- How should the system handle quota conflicts when a project quota and user quota disagree?
- Should paused jobs hold their queue position or move to the end?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
