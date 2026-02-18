# Task List: System Health Page

**PRD Reference:** `design/prds/080-prd-system-health-page.md`
**Scope:** Build a unified infrastructure health dashboard with real-time service status, dependency checks, historical uptime tracking, alerting integration, quick administrative actions, and a startup pre-flight checklist.

## Overview

When generation fails, the first question is always "Is everything running?" This system health page provides a single view answering that question for all platform services: the Rust backend, PostgreSQL, ComfyUI instances, worker nodes, filesystem, and event bus. It tracks historical uptime, fires alerts on status changes, provides quick action buttons (restart, view logs, diagnostics), and runs a startup pre-flight checklist that blocks generation until all critical services are verified.

### What Already Exists
- PRD-05 ComfyUI WebSocket Bridge for connectivity
- PRD-06 Hardware Monitoring for GPU data
- PRD-10 Event Bus for alerting
- PRD-12 External API/Webhooks for escalation
- PRD-17 Asset Registry for model file checks
- PRD-46 Worker Pool for worker management

### What We're Building
1. Database tables for health checks and uptime records
2. Rust health check orchestrator polling all services
3. Historical uptime tracker with timeline storage
4. Alert manager with escalation rules
5. Startup pre-flight checklist runner
6. Quick action endpoints (restart, logs, diagnostics)
7. React health dashboard with real-time status grid

### Key Design Decisions
1. **Poll-based health checks** -- Each service is polled at a configurable interval. WebSocket notifications supplement but do not replace polling.
2. **Three-state status** -- Healthy, Degraded, Down. Degraded means the service is responding but slowly or with errors.
3. **Alert suppression** -- Once an alert fires for a service, no duplicate alerts until the status changes or a suppression window expires.
4. **Pre-flight blocks generation** -- The startup checklist sets a platform-wide flag. Job submission checks this flag before queuing.

---

## Phase 1: Database Schema

### Task 1.1: Health Checks Table
**File:** `migrations/YYYYMMDDHHMMSS_create_health_checks.sql`

```sql
CREATE TABLE health_checks (
    id BIGSERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    latency_ms INTEGER,
    error_message TEXT,
    details_json JSONB,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_checks_service_name ON health_checks(service_name);
CREATE INDEX idx_health_checks_checked_at ON health_checks(checked_at);
CREATE INDEX idx_health_checks_service_checked ON health_checks(service_name, checked_at DESC);
```

**Acceptance Criteria:**
- [ ] One row per check per service (time-series data)
- [ ] Status constrained to three valid values
- [ ] Composite index for efficient "latest status per service" queries
- [ ] No `updated_at` -- health checks are immutable point-in-time records

### Task 1.2: Uptime Records Table
**File:** `migrations/YYYYMMDDHHMMSS_create_uptime_records.sql`

```sql
CREATE TABLE uptime_records (
    id BIGSERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,              -- NULL = ongoing
    duration_seconds BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uptime_records_service_name ON uptime_records(service_name);
CREATE INDEX idx_uptime_records_started_at ON uptime_records(started_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON uptime_records
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks continuous status windows per service
- [ ] `ended_at` NULL means current ongoing status
- [ ] Duration computed on window close for fast aggregation

### Task 1.3: Alert Configuration Table
**File:** `migrations/YYYYMMDDHHMMSS_create_health_alert_config.sql`

```sql
CREATE TABLE health_alert_configs (
    id BIGSERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    escalation_delay_seconds INTEGER NOT NULL DEFAULT 300,
    webhook_url TEXT,
    notification_channels_json JSONB,   -- ["dashboard", "email", "slack"]
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_health_alert_configs_service ON health_alert_configs(service_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON health_alert_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One config per service
- [ ] Configurable escalation delay before external notification
- [ ] Multiple notification channels

---

## Phase 2: Rust Backend

### Task 2.1: Health Check Orchestrator
**File:** `src/services/health_check_orchestrator.rs`

Background service that polls all platform services.

```rust
pub struct HealthCheckOrchestrator {
    pool: PgPool,
    check_interval: Duration,
    checkers: Vec<Box<dyn ServiceChecker>>,
}

#[async_trait]
pub trait ServiceChecker: Send + Sync {
    fn service_name(&self) -> &str;
    async fn check(&self) -> ServiceStatus;
}

pub struct ServiceStatus {
    pub status: HealthStatus,
    pub latency_ms: Option<i32>,
    pub error_message: Option<String>,
    pub details: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] Checks: Rust backend (self), PostgreSQL, ComfyUI instances, workers, filesystem, event bus
- [ ] Configurable interval (default: 30 seconds)
- [ ] Each check records result in `health_checks` table
- [ ] Status transitions update `uptime_records` table
- [ ] Status transitions trigger alerts

### Task 2.2: Service Checkers
**File:** `src/services/health_checkers/*.rs`

Individual checker implementations for each service.

**Acceptance Criteria:**
- [ ] PostgreSQL checker: connection test, pool utilization, migration status
- [ ] ComfyUI checker: WebSocket ping (PRD-05), version check
- [ ] Worker checker: enumerate workers (PRD-46), check each is reachable
- [ ] Filesystem checker: disk space thresholds, write test
- [ ] Event bus checker: publish/subscribe test
- [ ] Each checker returns latency and diagnostic details

### Task 2.3: Alert Manager
**File:** `src/services/health_alert_manager.rs`

Fire alerts on status transitions with suppression.

**Acceptance Criteria:**
- [ ] Fires event via PRD-10 on any status transition (healthy->degraded, degraded->down, etc.)
- [ ] Escalation: first alert to dashboard, after N minutes to external webhook (Slack/PagerDuty via PRD-12)
- [ ] Suppression: no re-alert for the same ongoing issue
- [ ] Recovery notification: alert when service returns to healthy

### Task 2.4: Uptime Calculator
**File:** `src/services/uptime_calculator.rs`

Calculate rolling uptime percentages.

**Acceptance Criteria:**
- [ ] 7-day and 30-day uptime percentage per service
- [ ] Accounts for degraded as partial uptime (configurable weight)
- [ ] Returns timeline data for visualization

### Task 2.5: Startup Checklist Runner
**File:** `src/services/startup_checklist.rs`

Pre-flight verification on platform boot.

```rust
pub struct StartupCheckResult {
    pub all_passed: bool,
    pub checks: Vec<StartupCheck>,
}

pub struct StartupCheck {
    pub name: String,
    pub passed: bool,
    pub error: Option<String>,
    pub required: bool,                // critical vs. optional
}
```

**Acceptance Criteria:**
- [ ] Checks: database migrations current, ComfyUI reachable, at least one worker online, required model files present
- [ ] Blocks generation jobs until all critical checks pass
- [ ] Sets a platform-wide "ready" flag
- [ ] Manual Admin override to unblock specific checks

### Task 2.6: Quick Action Service
**File:** `src/services/quick_actions.rs`

Administrative actions per service.

**Acceptance Criteria:**
- [ ] Restart service (sends restart signal)
- [ ] View logs: returns last 100 lines of service logs
- [ ] Run diagnostic check: triggers on-demand health check
- [ ] Force health re-check: immediate check outside normal interval
- [ ] All actions logged in audit trail (PRD-45)

---

## Phase 3: API Endpoints

### Task 3.1: Health Status Routes
**File:** `src/routes/health.rs`

```
GET /admin/health                      -- All service statuses
GET /admin/health/:service             -- Specific service detail
GET /admin/health/uptime               -- Uptime percentages and timeline
GET /admin/health/startup-checklist    -- Startup check results
```

**Acceptance Criteria:**
- [ ] Overview returns latest status for all services
- [ ] Detail returns recent history and diagnostic information
- [ ] Uptime returns 7-day and 30-day percentages with timeline data

### Task 3.2: Quick Action Routes
**File:** `src/routes/health.rs`

```
POST /admin/health/:service/restart
POST /admin/health/:service/diagnose
POST /admin/health/:service/recheck
GET  /admin/health/:service/logs
```

**Acceptance Criteria:**
- [ ] Restart requires confirmation (destructive action)
- [ ] Diagnose runs extended health check with detailed output
- [ ] Logs returns last 100 lines for the service
- [ ] All actions admin-only

### Task 3.3: Alert Configuration Routes
**File:** `src/routes/health.rs`

```
GET /admin/health/alerts               -- List alert configs
PUT /admin/health/alerts/:service      -- Update alert config
```

**Acceptance Criteria:**
- [ ] List all service alert configurations
- [ ] Update escalation delay, webhook URL, channels

---

## Phase 4: React Frontend

### Task 4.1: Service Status Grid
**File:** `frontend/src/pages/SystemHealth.tsx`

**Acceptance Criteria:**
- [ ] Grid of service cards with color-coded status (green/yellow/red)
- [ ] Each card: service name, status, uptime since last restart, latency, last check time
- [ ] Auto-refresh at configurable interval (default: 30 seconds)
- [ ] Click card to expand to detail view

### Task 4.2: Service Detail Panel
**File:** `frontend/src/components/health/ServiceDetail.tsx`

**Acceptance Criteria:**
- [ ] Recent check history (last 24 hours)
- [ ] Quick action buttons (restart, logs, diagnose)
- [ ] Diagnostic output display
- [ ] Log viewer with auto-scroll

### Task 4.3: Uptime Timeline
**File:** `frontend/src/components/health/UptimeTimeline.tsx`

**Acceptance Criteria:**
- [ ] Horizontal timeline showing status windows per service
- [ ] Color blocks: green (healthy), yellow (degraded), red (down)
- [ ] Click any outage window to see details
- [ ] 7-day and 30-day uptime percentage display

### Task 4.4: Startup Checklist View
**File:** `frontend/src/components/health/StartupChecklist.tsx`

**Acceptance Criteria:**
- [ ] List of pre-flight checks with pass/fail indicators
- [ ] Pending checks show as loading
- [ ] Failed critical checks shown prominently with error details
- [ ] Admin override button for bypassing non-critical checks

---

## Phase 5: Testing

### Task 5.1: Health Check Tests
**File:** `tests/health_check_test.rs`

**Acceptance Criteria:**
- [ ] Test each service checker returns valid status
- [ ] Test status transition triggers alert
- [ ] Test alert suppression prevents duplicate alerts
- [ ] Test uptime calculation accuracy

### Task 5.2: Startup Checklist Tests
**File:** `tests/startup_checklist_test.rs`

**Acceptance Criteria:**
- [ ] Test checklist blocks generation when critical checks fail
- [ ] Test manual override unblocks generation
- [ ] Test all checks pass on healthy system

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_health_checks.sql` | Health check results |
| `migrations/YYYYMMDDHHMMSS_create_uptime_records.sql` | Uptime tracking |
| `migrations/YYYYMMDDHHMMSS_create_health_alert_config.sql` | Alert configuration |
| `src/services/health_check_orchestrator.rs` | Background health poller |
| `src/services/health_checkers/*.rs` | Per-service checkers |
| `src/services/health_alert_manager.rs` | Alert firing and suppression |
| `src/services/uptime_calculator.rs` | Uptime percentage calculation |
| `src/services/startup_checklist.rs` | Pre-flight check runner |
| `src/services/quick_actions.rs` | Admin quick actions |
| `src/routes/health.rs` | Health API endpoints |
| `frontend/src/pages/SystemHealth.tsx` | Health dashboard page |
| `frontend/src/components/health/ServiceDetail.tsx` | Service detail panel |
| `frontend/src/components/health/UptimeTimeline.tsx` | Uptime visualization |
| `frontend/src/components/health/StartupChecklist.tsx` | Startup checklist UI |

## Dependencies

### Upstream PRDs
- PRD-05, PRD-06, PRD-10, PRD-12, PRD-17, PRD-46

### Downstream PRDs
- PRD-81: Backup & Disaster Recovery
- PRD-105: Platform Setup Wizard

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.6)
3. Phase 3: API Endpoints (Tasks 3.1-3.3)

**MVP Success Criteria:**
- Health page loads in <2 seconds with all statuses
- Alerts fire within 30 seconds of status change
- Startup checklist blocks generation when critical services are unavailable

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Synthetic monitoring (PRD Requirement 2.1)

## Notes

1. **Health check table partitioning** -- With 30-second intervals across 6+ services, the health_checks table grows fast. Consider partitioning by week or month.
2. **Log access** -- Quick action "view logs" requires access to service log files. Configure log paths per service in the health check orchestrator.
3. **Restart capability** -- Restarting services requires appropriate system permissions. Use systemd API, Docker API, or SSH depending on deployment.
4. **Public health endpoint** -- Consider a `/health` endpoint (no admin auth) returning minimal status for monitoring systems. This is the open question from the PRD.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-080
