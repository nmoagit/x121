# PRD-046: Worker Pool Management

## 1. Introduction/Overview
Even a small studio with 2-4 GPUs benefits from managed orchestration. PRD-06 monitors individual hardware and PRD-08 schedules jobs, but neither manages the fleet itself. This PRD provides registration, monitoring, and orchestration of multiple GPU worker nodes as a managed fleet — including capability tagging, health checks, auto-failover, and load balancing. Without it, adding a second GPU means manual coordination of which machine runs what.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation), PRD-07 (Task Execution Engine), PRD-08 (Queue Management)
- **Depended on by:** PRD-24, PRD-61, PRD-67
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Enable registration and removal of GPU worker nodes via UI or API.
- Support capability-based job-to-worker matching through tagging.
- Implement health checks with automatic failover for dead workers.
- Balance load across workers based on utilization and capability fit.

## 4. User Stories
- As an Admin, I want to register new GPU workers through the UI so that expanding capacity doesn't require config file editing.
- As an Admin, I want workers tagged with capabilities so that high-VRAM jobs are automatically routed to high-VRAM workers.
- As a Creator, I want jobs to automatically move to a healthy worker if my assigned worker dies so that I don't lose progress.
- As an Admin, I want a real-time dashboard showing all workers' status and current jobs so that I have fleet-wide visibility.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Worker Registration
**Description:** Add/remove worker nodes with declared capabilities.
**Acceptance Criteria:**
- [ ] Workers register via UI or API with: hostname/IP, GPU model, VRAM capacity, and supported workflow types
- [ ] Registration validates connectivity to the worker before confirming
- [ ] Workers can be decommissioned (removed from pool) without losing job history
- [ ] Each worker has a unique identifier

#### Requirement 1.2: Capability Tags
**Description:** Tag workers with attributes for job-to-worker matching.
**Acceptance Criteria:**
- [ ] Workers can be tagged with attributes (e.g., `high-vram`, `fast-inference`, `high-res-capable`)
- [ ] The scheduler (PRD-08) uses tags for job-to-worker matching
- [ ] Jobs can specify required tags (must match) and preferred tags (best-effort match)
- [ ] Untagged workers accept any job type

#### Requirement 1.3: Health Checks & Heartbeat
**Description:** Periodic liveness probes with automatic degraded marking.
**Acceptance Criteria:**
- [ ] Workers send heartbeat signals at configurable intervals (default: 15 seconds)
- [ ] Workers that miss heartbeats are marked degraded after configurable threshold
- [ ] Degraded workers have their queued jobs re-assigned to healthy workers
- [ ] Health status transitions are logged

#### Requirement 1.4: Auto-Failover
**Description:** Automatic job recovery when a worker dies mid-job.
**Acceptance Criteria:**
- [ ] If a worker dies mid-job, the job resumes from the last checkpoint (PRD-28) on another worker
- [ ] Failover is automatic — no admin intervention required
- [ ] The user is notified that their job was moved to a different worker
- [ ] Failed worker is marked for investigation in the dashboard

#### Requirement 1.5: Load Balancing
**Description:** Distribute jobs based on utilization and capability fit.
**Acceptance Criteria:**
- [ ] New jobs are assigned to the least-loaded compatible worker
- [ ] Load calculation considers current GPU utilization, queue depth, and VRAM availability
- [ ] Workers at capacity are skipped until they have headroom
- [ ] Load balancing strategy is configurable (least-loaded, round-robin, capability-first)

#### Requirement 1.6: Worker Dashboard
**Description:** Real-time fleet management view.
**Acceptance Criteria:**
- [ ] Shows all workers with: status, current job, GPU utilization, uptime, and job history
- [ ] Integrated into PRD-42 (Studio Pulse Dashboard) as a widget
- [ ] Workers are color-coded by status (healthy=green, degraded=yellow, down=red)
- [ ] Admin actions (restart, decommission, re-tag) accessible from the dashboard

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Worker Groups
**Description:** Organize workers into named groups for fleet management.
**Acceptance Criteria:**
- [ ] Workers can be assigned to groups (e.g., "Production", "Testing", "Batch")
- [ ] Jobs can target specific groups

## 6. Non-Goals (Out of Scope)
- Individual GPU monitoring (covered by PRD-06)
- Job scheduling policy (covered by PRD-08)
- Remote auto-scaling (covered by M-08 — Maybe list)
- GPU power management (covered by PRD-87)

## 7. Design Considerations
- Worker registration should feel like "plugging in" a new resource — minimal configuration required.
- The worker dashboard should be a primary admin view, not buried in settings.
- Failover should be invisible to creators when possible.

## 8. Technical Considerations
- **Stack:** Rust worker agent, gRPC or REST for worker-to-backend communication, PostgreSQL for registry
- **Existing Code to Reuse:** PRD-02 API infrastructure, PRD-07 job execution, PRD-08 scheduling
- **New Infrastructure Needed:** Worker agent binary, registry service, health check scheduler, failover coordinator
- **Database Changes:** `workers` table (id, hostname, gpu_model, vram, tags, status, last_heartbeat)
- **API Changes:** CRUD /admin/workers, GET /admin/workers/:id/metrics, POST /admin/workers/:id/restart

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Worker registration completes in <30 seconds including connectivity validation
- Auto-failover triggers within 60 seconds of worker death detection
- Load balancing keeps utilization within 20% across workers during uniform workloads
- Health check false-positive rate <1% (healthy workers incorrectly marked degraded)

## 11. Open Questions
- Should workers self-register on startup, or require manual admin registration?
- What protocol should workers use for heartbeat (WebSocket, gRPC, HTTP polling)?
- How should the system handle network partitions (worker is alive but unreachable)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
