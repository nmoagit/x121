# PRD-080: System Health Page

## 1. Introduction/Overview
PRD-06 monitors GPU hardware and PRD-46 monitors worker nodes, but neither provides a holistic view of whether the platform as a whole is healthy. When generation fails, the first question is always "Is everything running?" This PRD provides a unified infrastructure health dashboard with real-time status indicators for all platform services and dependencies, historical uptime tracking, alerting integration, quick actions, and a startup pre-flight checklist.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-05 (ComfyUI WebSocket Bridge), PRD-06 (Hardware Monitoring), PRD-10 (Event Bus for alerting), PRD-12 (External API/Webhooks for escalation), PRD-17 (Asset Registry for model file checks), PRD-46 (Worker Pool)
- **Depended on by:** PRD-81 (Backup & Disaster Recovery), PRD-105 (Platform Setup Wizard)
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Provide at-a-glance status of all platform services and dependencies.
- Track historical uptime with timeline visualization.
- Integrate alerting with the event bus and external webhooks.
- Enable quick actions for common administrative responses.
- Run startup pre-flight checks before allowing generation.

## 4. User Stories
- As an Admin, I want a single health page showing the status of all services so that I can answer "Is everything running?" in 2 seconds.
- As an Admin, I want alerting when a service goes down so that I'm notified immediately, not when a user reports a failure.
- As an Admin, I want quick action buttons (restart, view logs, diagnostics) so that I can respond without SSH access.
- As an Admin, I want a startup checklist so that the platform doesn't accept generation jobs while critical services are down.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Service Status Grid
**Description:** Real-time status for all core services.
**Acceptance Criteria:**
- [ ] Status indicators for: Rust backend, PostgreSQL, ComfyUI instance(s), worker nodes (PRD-46), filesystem/storage, event bus (PRD-10)
- [ ] Each shows: status (healthy/degraded/down), uptime since last restart, response latency, last health check timestamp
- [ ] Auto-refresh at configurable interval (default: 30 seconds)

#### Requirement 1.2: Dependency Checks
**Description:** External dependency verification.
**Acceptance Criteria:**
- [ ] Automated checks: disk space thresholds, database connection pool utilization, WebSocket health (PRD-05), model file accessibility (PRD-17)
- [ ] Configurable warning and critical thresholds per dependency
- [ ] Clear visual distinction between warning and critical states

#### Requirement 1.3: Historical Uptime
**Description:** Uptime tracking over time.
**Acceptance Criteria:**
- [ ] Rolling 7-day and 30-day uptime percentage per service
- [ ] Timeline visualization showing outage windows and degraded periods
- [ ] Click any outage window to see what happened (linked to audit log if available)

#### Requirement 1.4: Alerting Integration
**Description:** Automated alerting on status changes.
**Acceptance Criteria:**
- [ ] Event via PRD-10 when any service transitions from healthy to degraded or down
- [ ] Configurable escalation: first alert to admin dashboard, second alert after N minutes to external webhook (Slack/PagerDuty via PRD-12)
- [ ] Alert suppression: don't re-alert for the same ongoing issue

#### Requirement 1.5: Quick Actions
**Description:** Per-service administrative controls.
**Acceptance Criteria:**
- [ ] Restart service
- [ ] View logs (last 100 lines)
- [ ] Run diagnostic check
- [ ] Force health re-check
- [ ] Integrates with PRD-06 for GPU-specific controls

#### Requirement 1.6: Startup Checklist
**Description:** Pre-flight verification on platform boot.
**Acceptance Criteria:**
- [ ] On platform boot: verify database migrations current, ComfyUI reachable, at least one worker online, required model files present
- [ ] Block generation jobs until all critical checks pass
- [ ] Clear status page showing what's pending and what's ready
- [ ] Manual override for Admin to unblock specific checks

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Synthetic Monitoring
**Description:** Active health probes that simulate real operations.
**Acceptance Criteria:**
- [ ] Periodic synthetic test: submit a minimal generation job and verify completion
- [ ] Measures true end-to-end health (not just service reachability)

## 6. Non-Goals (Out of Scope)
- GPU hardware-level monitoring (covered by PRD-06)
- Worker pool scaling and management (covered by PRD-46)
- Performance benchmarking (covered by PRD-41)

## 7. Design Considerations
- Health page should be the Admin's first stop — bookmark-worthy.
- Color coding should follow established conventions (green/yellow/red).
- Quick actions should require confirmation for destructive operations (restart).

## 8. Technical Considerations
- **Stack:** React for health dashboard, Rust health check service, WebSocket for real-time updates
- **Existing Code to Reuse:** PRD-06 hardware monitoring, PRD-10 event bus for alerting, PRD-12 webhook for escalation, PRD-46 worker status
- **New Infrastructure Needed:** Health check orchestrator, uptime tracker, startup checklist runner, alert manager
- **Database Changes:** `health_checks` table (service_name, status, latency_ms, checked_at), `uptime_records` table (service_name, status, started_at, ended_at)
- **API Changes:** GET /admin/health, GET /admin/health/:service, POST /admin/health/:service/restart, POST /admin/health/:service/diagnose, GET /admin/health/startup-checklist

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Health page loads in <2 seconds with all service statuses
- Alerts fire within 30 seconds of a service status change
- Startup checklist correctly blocks generation when critical services are unavailable
- Historical uptime data accurately reflects actual service availability

## 11. Open Questions
- Should the health page be accessible without authentication (for monitoring systems)?
- How should the system handle transient failures vs. sustained outages in alerting?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
