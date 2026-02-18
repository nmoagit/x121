# PRD-090: Render Queue Timeline / Gantt View

## 1. Introduction/Overview
PRD-08 defines queue policy and PRD-54 shows a badge count, but neither answers the question every creator asks: "When will my job run, and when will it finish?" This PRD provides a visual timeline (Gantt chart) of the job queue showing what's running on each GPU worker, what's queued, and estimated completion times. It makes the invisible queue visible and gives admins interactive controls for visual priority adjustment.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-08 (Queue Management), PRD-46 (Worker Pool), PRD-61 (Cost & Resource Estimation)
- **Depended on by:** PRD-89 (Dashboard Widgets), PRD-93 (Budget Management)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Display a horizontal Gantt timeline with GPU workers as lanes and time on the X-axis.
- Show queued jobs with estimated start times based on current throughput.
- Enable interactive drag-and-drop reordering of queue priority (Admin only).
- Provide historical view for utilization pattern analysis.

## 4. User Stories
- As a Creator, I want to see when my queued job will start and finish so that I can plan my review work around GPU availability.
- As an Admin, I want to visually reorder job priorities by dragging blocks on the timeline so that I can respond to urgent requests intuitively.
- As an Admin, I want to see historical GPU utilization patterns so that I can identify underused overnight capacity.
- As a Creator, I want a compact mode showing just the "now" state so that I have queue awareness without switching to a full dashboard.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Gantt Layout
**Description:** Horizontal timeline with worker lanes and job blocks.
**Acceptance Criteria:**
- [ ] Y-axis shows GPU workers as separate lanes
- [ ] X-axis shows time with configurable zoom (1 hour, 6 hours, 24 hours)
- [ ] Each job is a colored block showing: job name, scene/character, elapsed time, estimated remaining
- [ ] Color coding by project or priority level (configurable)

#### Requirement 1.2: Queue Depth Visualization
**Description:** Show queued jobs with estimated start times.
**Acceptance Criteria:**
- [ ] Queued jobs appear as stacked blocks to the right of the "now" line
- [ ] Estimated start times based on current worker throughput
- [ ] Queue position message: "Your job is 4th in queue — estimated start in ~12 minutes"
- [ ] Estimated drain time: "Queue will drain in ~2h 15m at current throughput"

#### Requirement 1.3: Interactive Controls
**Description:** Admin-only drag-and-drop queue reordering.
**Acceptance Criteria:**
- [ ] Admins can drag jobs to reorder queue priority
- [ ] Click a job block to see full details (segment, workflow, parameters)
- [ ] Right-click to pause, cancel, or re-prioritize
- [ ] Non-admin users see the timeline as read-only

#### Requirement 1.4: Time Estimates
**Description:** Per-job completion estimates based on historical data.
**Acceptance Criteria:**
- [ ] Estimates based on historical averages for the same workflow and resolution tier (PRD-61)
- [ ] Aggregate estimate: total queue drain time at current throughput
- [ ] Estimates update in real time as jobs complete and new jobs arrive
- [ ] New workflows without history show "No estimate available"

#### Requirement 1.5: Live Updates
**Description:** Real-time progress via WebSocket.
**Acceptance Criteria:**
- [ ] Job blocks grow as segments complete
- [ ] New submissions appear instantly on the timeline
- [ ] Completed jobs slide off the left edge
- [ ] Worker status changes (online/offline) reflect immediately

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Historical View
**Description:** Scrub backward in time to see completed jobs and utilization patterns.
**Acceptance Criteria:**
- [ ] Timeline is scrollable into the past (configurable retention)
- [ ] Identify patterns: "GPUs were idle between 2am–8am"
- [ ] Feeds into PRD-73 Production Reporting

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Compact Mode
**Description:** Minimized single-row view for embedding as a dashboard widget.
**Acceptance Criteria:**
- [ ] Single-row showing: which workers are busy, queue count, estimated drain time
- [ ] Embeddable as a PRD-89 dashboard widget

## 6. Non-Goals (Out of Scope)
- Queue scheduling policy (covered by PRD-08)
- Worker pool management (covered by PRD-46)
- Cost estimation logic (covered by PRD-61)

## 7. Design Considerations
- The Gantt chart should use smooth animations for real-time updates.
- Job blocks should be large enough to show essential information but compact enough to fit many jobs.
- The timeline should support horizontal scrolling with smooth inertia.

## 8. Technical Considerations
- **Stack:** React with a Gantt chart library (or custom Canvas/SVG renderer), WebSocket for live updates
- **Existing Code to Reuse:** PRD-08 queue data, PRD-46 worker data, PRD-61 estimation data
- **New Infrastructure Needed:** Timeline data aggregation service, real-time WebSocket channel
- **Database Changes:** None (reads from existing job and worker tables)
- **API Changes:** GET /queue/timeline (aggregated view), WebSocket channel for live updates

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Timeline renders within 1 second for queues with up to 100 jobs
- Estimated start times are within 20% of actual start times
- Live updates appear within 2 seconds of state changes
- Drag-and-drop reordering takes effect within 1 second

## 11. Open Questions
- Should the timeline support vertical stacking within a worker lane (for multi-GPU workers)?
- What is the maximum number of jobs the timeline can display without performance degradation?
- Should the timeline show tentative future recurring jobs (PRD-08)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
