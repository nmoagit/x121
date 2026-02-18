# Task List: GPU Power Management & Idle Scheduling

**PRD Reference:** `design/prds/087-prd-gpu-power-management-idle-scheduling.md`
**Scope:** Implement automated GPU worker spin-down/wake-on-demand, scheduled power windows, graceful shutdown, and power consumption tracking.

## Overview

GPU hardware consumes significant power even when idle. Studios running multiple GPUs 24/7 for workloads active only 8 hours/day waste most of their energy budget. This feature automates GPU worker power management: configurable idle timeouts trigger spin-down, wake-on-demand brings sleeping workers online when jobs arrive, scheduled power windows define daily/weekly on/off periods, and power consumption is estimated and tracked for cost reporting.

### What Already Exists
- PRD-08 Queue Management for job awareness
- PRD-46 Worker Pool for fleet management

### What We're Building
1. Database tables for power schedules and consumption logs
2. Rust power management service with idle monitoring
3. Wake-on-LAN/SSH/API wake implementation
4. Scheduled power windows with override logic
5. Graceful shutdown coordinator
6. Power consumption tracker
7. API endpoints for power management
8. React power management UI

### Key Design Decisions
1. **Minimum fleet size** -- N workers always stay on regardless of idle timeout. This ensures immediate availability for new jobs.
2. **Graceful shutdown always** -- Never kill a worker mid-job. Shutdown waits for the current segment to complete.
3. **Override for pending jobs** -- Power-down schedules are overridden if jobs are queued. Workers shut down when the queue drains.
4. **TDP-based estimation** -- Power consumption estimates use GPU TDP ratings and active time, not direct power measurement.

---

## Phase 1: Database Schema

### Task 1.1: Power Schedules Table
**File:** `migrations/YYYYMMDDHHMMSS_create_power_schedules.sql`

```sql
CREATE TABLE power_schedules (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scope TEXT NOT NULL DEFAULT 'individual' CHECK (scope IN ('individual', 'fleet')),
    schedule_json JSONB NOT NULL,      -- weekly schedule: {"mon": {"on": "08:00", "off": "22:00"}, ...}
    timezone TEXT NOT NULL DEFAULT 'UTC',
    override_for_queued_jobs BOOLEAN NOT NULL DEFAULT true,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_power_schedules_worker_id ON power_schedules(worker_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON power_schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Supports per-worker or fleet-wide schedules
- [ ] Weekly schedule stored as JSON with day-of-week on/off times
- [ ] Timezone-aware scheduling
- [ ] Override flag for keeping workers alive when jobs are queued

### Task 1.2: Power State Column on Workers
**File:** `migrations/YYYYMMDDHHMMSS_add_power_state_to_workers.sql`

```sql
ALTER TABLE workers
    ADD COLUMN IF NOT EXISTS power_state TEXT NOT NULL DEFAULT 'on'
        CHECK (power_state IN ('on', 'idle', 'shutting_down', 'sleeping', 'waking')),
    ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS wake_method TEXT CHECK (wake_method IN ('wol', 'ssh', 'api')),
    ADD COLUMN IF NOT EXISTS wake_config_json JSONB,
    ADD COLUMN IF NOT EXISTS gpu_tdp_watts INTEGER,
    ADD COLUMN IF NOT EXISTS min_fleet_member BOOLEAN NOT NULL DEFAULT false;
```

**Acceptance Criteria:**
- [ ] Power state tracks current worker power lifecycle
- [ ] Per-worker idle timeout (NULL = use fleet default)
- [ ] Wake method and config per worker
- [ ] GPU TDP for power estimation
- [ ] `min_fleet_member` flag prevents shutdown of essential workers

### Task 1.3: Power Consumption Log Table
**File:** `migrations/YYYYMMDDHHMMSS_create_power_consumption_log.sql`

```sql
CREATE TABLE power_consumption_log (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    date DATE NOT NULL,
    active_minutes INTEGER NOT NULL DEFAULT 0,
    idle_minutes INTEGER NOT NULL DEFAULT 0,
    off_minutes INTEGER NOT NULL DEFAULT 0,
    estimated_kwh REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_power_consumption_log_worker_id ON power_consumption_log(worker_id);
CREATE INDEX idx_power_consumption_log_date ON power_consumption_log(date);
CREATE UNIQUE INDEX uq_power_consumption_log_worker_date ON power_consumption_log(worker_id, date);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON power_consumption_log
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Daily aggregation per worker
- [ ] Unique constraint on (worker_id, date)
- [ ] Tracks active, idle, and off time in minutes
- [ ] Estimated kWh based on TDP and active time

---

## Phase 2: Rust Backend

### Task 2.1: Idle Monitor Service
**File:** `src/services/power/idle_monitor.rs`

Background service tracking worker activity.

**Acceptance Criteria:**
- [ ] Monitors each worker's last job dispatch time
- [ ] After idle timeout: transitions worker to "shutting_down" state
- [ ] Respects minimum fleet size (N workers always on)
- [ ] Idle timeout only applies to workers above minimum
- [ ] Cancels shutdown if a new job arrives during cooldown

### Task 2.2: Shutdown Coordinator
**File:** `src/services/power/shutdown_coordinator.rs`

Graceful worker shutdown.

**Acceptance Criteria:**
- [ ] Waits for current segment to complete before powering down
- [ ] Sends drain signal to worker (stop accepting new jobs)
- [ ] Configurable graceful timeout (default: 10 minutes)
- [ ] After timeout: forced shutdown available as admin override
- [ ] Updates worker power_state through lifecycle

### Task 2.3: Wake-on-Demand Service
**File:** `src/services/power/wake_service.rs`

Wake sleeping workers when jobs need GPUs.

```rust
pub enum WakeMethod {
    WakeOnLan { mac_address: String },
    Ssh { host: String, command: String },
    Api { url: String, method: String, headers: HashMap<String, String> },
}
```

**Acceptance Criteria:**
- [ ] Triggers when a job enters the queue and no workers are online
- [ ] Wake-on-LAN: sends magic packet to configured MAC address
- [ ] SSH: executes configured wake command on remote host
- [ ] API: calls configured HTTP endpoint (for cloud workers)
- [ ] Job sits in "Waiting for Worker" state until a worker comes online

### Task 2.4: Schedule Enforcer
**File:** `src/services/power/schedule_enforcer.rs`

Enforce power-on/off windows.

**Acceptance Criteria:**
- [ ] Evaluates schedules at regular intervals (every minute)
- [ ] Outside power windows: sends shutdown signal
- [ ] Override: keeps workers alive if jobs are queued (configurable)
- [ ] Workers shut down when queue drains during override
- [ ] Timezone-aware schedule evaluation

### Task 2.5: Power Consumption Tracker
**File:** `src/services/power/consumption_tracker.rs`

Estimate and log power consumption.

**Acceptance Criteria:**
- [ ] Calculates daily kWh per worker: `(active_hours * TDP_watts + idle_hours * idle_watts) / 1000`
- [ ] Idle power estimated at 30% of TDP
- [ ] Daily, weekly, and monthly summaries
- [ ] Power savings from idle management calculated and displayed
- [ ] Feeds into PRD-73 Production Reporting

---

## Phase 3: API Endpoints

### Task 3.1: Worker Power Management Routes
**File:** `src/routes/power.rs`

```
PUT  /admin/workers/:id/power-schedule -- Set power schedule for a worker
POST /admin/workers/:id/wake           -- Manually wake a worker
POST /admin/workers/:id/shutdown       -- Manually shut down a worker
GET  /admin/workers/:id/power-status   -- Get current power state
GET  /admin/power/consumption          -- Fleet power consumption summary
```

**Acceptance Criteria:**
- [ ] Schedule accepts weekly schedule JSON with timezone
- [ ] Wake and shutdown require confirmation for manual actions
- [ ] Power status returns current state and time-in-state
- [ ] Consumption returns daily/weekly/monthly summaries

### Task 3.2: Fleet Power Settings
**File:** `src/routes/power.rs`

```
GET  /admin/power/settings             -- Get fleet-wide power settings
PUT  /admin/power/settings             -- Update fleet-wide settings
```

**Acceptance Criteria:**
- [ ] Fleet-wide idle timeout default
- [ ] Minimum fleet size setting
- [ ] Default power schedule for new workers
- [ ] Power estimation configuration (TDP values)

---

## Phase 4: React Frontend

### Task 4.1: Worker Power Dashboard
**File:** `frontend/src/components/power/PowerDashboard.tsx`

**Acceptance Criteria:**
- [ ] Worker cards showing power state: "On", "Idle (shutting down in 5m)", "Sleeping", "Waking"
- [ ] Color-coded states (green=on, yellow=idle, grey=sleeping, blue=waking)
- [ ] Manual wake/shutdown buttons per worker
- [ ] Fleet-wide power summary

### Task 4.2: Power Schedule Calendar
**File:** `frontend/src/components/power/ScheduleCalendar.tsx`

**Acceptance Criteria:**
- [ ] Weekly grid interface for defining on/off times
- [ ] Per-worker or fleet-wide schedule
- [ ] Timezone selector
- [ ] Override toggle for queued jobs

### Task 4.3: Power Consumption Charts
**File:** `frontend/src/components/power/ConsumptionCharts.tsx`

**Acceptance Criteria:**
- [ ] Daily/weekly/monthly kWh per worker and fleet-wide
- [ ] Power savings vs. always-on baseline
- [ ] Active vs. idle vs. off time breakdown
- [ ] Cost estimates when electricity rate is configured

---

## Phase 5: Testing

### Task 5.1: Power Management Tests
**File:** `tests/power_management_test.rs`

**Acceptance Criteria:**
- [ ] Test idle timeout triggers shutdown after configured period
- [ ] Test minimum fleet size prevents shutdown of essential workers
- [ ] Test graceful shutdown waits for current job
- [ ] Test wake-on-demand triggers on job arrival
- [ ] Test schedule enforcer respects power windows
- [ ] Test override keeps workers alive when jobs are queued

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_power_schedules.sql` | Schedule table |
| `migrations/YYYYMMDDHHMMSS_add_power_state_to_workers.sql` | Worker power columns |
| `migrations/YYYYMMDDHHMMSS_create_power_consumption_log.sql` | Consumption tracking |
| `src/services/power/idle_monitor.rs` | Idle detection |
| `src/services/power/shutdown_coordinator.rs` | Graceful shutdown |
| `src/services/power/wake_service.rs` | Wake-on-demand |
| `src/services/power/schedule_enforcer.rs` | Schedule enforcement |
| `src/services/power/consumption_tracker.rs` | Power estimation |
| `src/routes/power.rs` | Power API endpoints |
| `frontend/src/components/power/PowerDashboard.tsx` | Power status UI |
| `frontend/src/components/power/ScheduleCalendar.tsx` | Schedule editor |
| `frontend/src/components/power/ConsumptionCharts.tsx` | Consumption charts |

## Dependencies

### Upstream PRDs
- PRD-08: Queue Management, PRD-46: Worker Pool

### Downstream PRDs
- PRD-73: Production Reporting (power cost data)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)

**MVP Success Criteria:**
- Idle workers shut down within 30 seconds of timeout
- Wake-on-demand brings a worker online within 3 minutes
- Zero jobs killed by power management
- Power tracking accuracy within 10% of actual

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.3)
2. Phase 5: Testing (Task 5.1)
3. Power cost calculator with electricity rates (PRD Requirement 2.1)

## Notes

1. **Wake-on-LAN requirements** -- WoL requires: network card configured for WoL, BIOS settings enabled, workers on the same LAN segment (or a WoL relay).
2. **Cloud workers** -- For cloud-based workers, use the cloud provider's API for start/stop instead of WoL. The API wake method handles this.
3. **Idle watts estimation** -- Default idle power at 30% TDP is a rough estimate. Studios with power meters should calibrate this value.
4. **Power state recovery** -- On platform restart, all worker power states should be re-evaluated by attempting connectivity checks.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-087
