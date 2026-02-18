# PRD-087: GPU Power Management & Idle Scheduling

## 1. Introduction/Overview
GPU hardware consumes significant power even when idle. Studios running 4+ GPUs 24/7 for a workload that's active 8 hours/day waste 67% of their energy budget. This PRD provides automated spin-down and wake-on-demand for idle GPU workers, scheduled power windows, and consumption tracking. It bridges the gap between job scheduling (PRD-08) and physical resource consumption, ensuring power savings don't come at the cost of responsiveness.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-08 (Queue Management for job awareness), PRD-46 (Worker Pool for fleet management)
- **Depended on by:** PRD-73 (Production Reporting for power cost data)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Implement configurable per-worker idle timeouts with automatic spin-down.
- Provide wake-on-demand when new jobs arrive and no workers are online.
- Support scheduled power windows (daily/weekly) with override logic for pending jobs.
- Track power consumption estimates for cost reporting.

## 4. User Stories
- As an Admin, I want GPUs to automatically shut down after 15 minutes of idle time so that we save power costs without manual intervention.
- As a Creator, I want my job to automatically wake a sleeping GPU so that I can submit work any time without worrying about worker availability.
- As an Admin, I want to schedule GPUs to be off overnight and weekends unless there are queued batch jobs so that off-peak work still runs automatically.
- As an Admin, I want to see power consumption estimates per worker and fleet-wide so that I can report on energy costs.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Idle Timeout
**Description:** Configurable per-worker idle timeout with automatic shutdown.
**Acceptance Criteria:**
- [ ] Idle timeout configurable per worker (default: disabled/always on)
- [ ] After no jobs dispatched for the timeout period, shutdown signal is sent
- [ ] Minimum fleet size is respected (N workers always stay on)
- [ ] Idle timeout only applies to workers above the minimum fleet size

#### Requirement 1.2: Wake-on-Demand
**Description:** Automatically wake sleeping workers when jobs need GPUs.
**Acceptance Criteria:**
- [ ] When a job enters the queue and no workers are online, wake sleeping workers
- [ ] Wake methods: Wake-on-LAN, SSH command, or cloud API
- [ ] Job sits in "Waiting for Worker" state until a worker comes online
- [ ] Wake-on-demand is configurable per worker (wake method and parameters)

#### Requirement 1.3: Scheduled Power Windows
**Description:** Daily/weekly power schedules per worker or fleet-wide.
**Acceptance Criteria:**
- [ ] Define power-on windows (e.g., Mon-Fri 8am-10pm)
- [ ] Outside windows, workers are sent shutdown signals
- [ ] Override: if off-peak jobs are queued (PRD-08), keep workers alive past the power-down window
- [ ] Workers power down when the queue drains during the override

#### Requirement 1.4: Graceful Shutdown
**Description:** Never kill a worker mid-job.
**Acceptance Criteria:**
- [ ] Shutdown waits for current segment to complete before powering down
- [ ] If a new job arrives during cooldown, shutdown is cancelled
- [ ] Graceful shutdown timeout is configurable (default: 10 minutes)
- [ ] Forced shutdown available as admin override

#### Requirement 1.5: Power Consumption Tracking
**Description:** Estimate and track power consumption per worker and fleet-wide.
**Acceptance Criteria:**
- [ ] Estimates based on GPU TDP and active time
- [ ] Daily, weekly, and monthly summaries per worker and fleet-wide
- [ ] Integrated into PRD-73 (Production Reporting) as a cost line item
- [ ] Power savings from idle management are calculated and displayed

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Power Cost Calculator
**Description:** Configure electricity rates to show actual dollar costs.
**Acceptance Criteria:**
- [ ] Admin sets electricity cost per kWh
- [ ] Power consumption is displayed as both kWh and estimated cost

## 6. Non-Goals (Out of Scope)
- Worker hardware monitoring (covered by PRD-06)
- Job scheduling policy (covered by PRD-08)
- Worker registration and fleet management (covered by PRD-46)
- Remote cloud auto-scaling (covered by M-08)

## 7. Design Considerations
- Power status should be visible on the worker dashboard: "On", "Idle (shutting down in 5m)", "Sleeping", "Waking".
- Power schedule configuration should use a weekly calendar grid interface.
- Power savings metrics should be prominently displayed in admin dashboards.

## 8. Technical Considerations
- **Stack:** Rust power management service, Wake-on-LAN (magic packet), SSH for remote commands
- **Existing Code to Reuse:** PRD-46 worker registry, PRD-08 queue awareness
- **New Infrastructure Needed:** Power scheduler, WoL sender, shutdown coordinator
- **Database Changes:** `power_schedules` table, `power_consumption_log` table, add power state to `workers` table
- **API Changes:** PUT /admin/workers/:id/power-schedule, POST /admin/workers/:id/wake, POST /admin/workers/:id/shutdown

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Idle workers shut down within 30 seconds of timeout expiry
- Wake-on-demand brings a worker online within 3 minutes
- Zero jobs killed by power management (graceful shutdown always completes)
- Power consumption tracking accuracy within 10% of actual measured consumption

## 11. Open Questions
- Should wake-on-demand wake all sleeping workers or just one?
- How should the system handle workers that fail to wake (hardware issue vs. configuration issue)?
- Should power scheduling integrate with external building management systems?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
