# PRD-006: Hardware Monitoring & Direct Control

## 1. Introduction/Overview
GPU-intensive generation workloads require real-time visibility into hardware health. This PRD provides GPU vitals monitoring (VRAM usage, temperature, utilization) and "One-Click Restart" capabilities for hanging services. It reduces downtime by allowing Admins to diagnose and fix GPU issues directly from the platform UI without needing terminal access to individual worker machines.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-08 (Queue Management for job-aware restarts)
- **Depended on by:** None directly (consumed by PRD-80 System Health Page)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Provide real-time GPU metrics (VRAM, temperature, utilization, power draw) per worker.
- Enable one-click service restart for hanging ComfyUI instances or worker processes.
- Alert Admins when hardware metrics exceed configurable thresholds.
- Reduce mean time to recovery (MTTR) for GPU-related issues.

## 4. User Stories
- As an Admin, I want to see GPU temperature and VRAM usage for all workers in one view so that I can spot overheating or memory issues before they cause failures.
- As an Admin, I want to restart a hanging ComfyUI instance with one click so that I don't need to SSH into the worker machine.
- As an Admin, I want automatic alerts when GPU temperature exceeds a threshold so that I can take preventive action.
- As a Creator, I want to see if a GPU is available and healthy before submitting a large batch so that I don't queue jobs to a degraded worker.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: GPU Vitals Collection
**Description:** Collect real-time hardware metrics from all registered GPU workers.
**Acceptance Criteria:**
- [ ] VRAM usage (used/total) is collected per GPU at configurable intervals (default: 5 seconds)
- [ ] GPU temperature is collected per GPU
- [ ] GPU utilization percentage is collected per GPU
- [ ] Power draw (watts) is collected if available
- [ ] Metrics are stored with timestamps for historical viewing

#### Requirement 1.2: Hardware Dashboard
**Description:** Real-time display of GPU metrics for all workers.
**Acceptance Criteria:**
- [ ] Dashboard shows all workers with their current GPU metrics
- [ ] Visual indicators (color-coded gauges) for temperature and VRAM usage
- [ ] Historical charts showing metrics over time (last 1h, 6h, 24h)
- [ ] Workers are sortable by status, temperature, or utilization

#### Requirement 1.3: One-Click Service Restart
**Description:** Restart hanging services on worker machines from the platform UI.
**Acceptance Criteria:**
- [ ] Admin can trigger a ComfyUI restart on any worker
- [ ] Restart waits for current job to complete (or force-kills after timeout)
- [ ] Restart status is shown in real-time (stopping, restarting, healthy)
- [ ] Restart action is logged in the audit trail (PRD-45)

#### Requirement 1.4: Threshold Alerts
**Description:** Configurable alerts when hardware metrics exceed defined thresholds.
**Acceptance Criteria:**
- [ ] Temperature warning and critical thresholds are configurable per worker
- [ ] VRAM usage threshold triggers alerts when approaching capacity
- [ ] Alerts are delivered via PRD-10 (Event Bus) to admin notification channels
- [ ] Alert history is viewable in the dashboard

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Automated Thermal Throttling
**Description:** Automatically pause job dispatch to workers exceeding temperature thresholds.
**Acceptance Criteria:**
- [ ] Workers above the critical temperature threshold are temporarily removed from the dispatch pool
- [ ] Jobs are re-routed to cooler workers automatically
- [ ] Workers re-enter the pool when temperature drops below the threshold

## 6. Non-Goals (Out of Scope)
- Worker pool registration and management (covered by PRD-46)
- Job scheduling decisions (covered by PRD-08)
- ComfyUI WebSocket communication (covered by PRD-05)
- GPU power management and idle scheduling (covered by PRD-87)

## 7. Design Considerations
- GPU temperature should use intuitive color coding: green (<70C), yellow (70-85C), red (>85C).
- VRAM usage bars should show used/total with percentage labels.
- Restart buttons should require confirmation to prevent accidental clicks.

## 8. Technical Considerations
- **Stack:** nvidia-smi or NVML for GPU metrics collection, Rust agent on workers, WebSocket for real-time relay
- **Existing Code to Reuse:** PRD-02 WebSocket infrastructure, PRD-10 Event Bus for alerts
- **New Infrastructure Needed:** Worker agent binary for metrics collection, metrics storage table
- **Database Changes:** `gpu_metrics` table (worker_id, timestamp, vram_used, vram_total, temperature, utilization, power_draw)
- **API Changes:** GET /admin/workers/:id/metrics, POST /admin/workers/:id/restart

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- GPU metrics update in the UI within 5 seconds of collection
- One-click restart completes within 60 seconds for a typical ComfyUI instance
- Threshold alerts fire within 10 seconds of a metric exceeding the configured value
- 100% of restart actions are captured in the audit log

## 11. Open Questions
- Should metrics collection use a push model (worker agent sends) or pull model (backend polls)?
- What is the retention period for historical GPU metrics data?
- Should the restart capability extend to the entire worker OS, or only specific services?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
