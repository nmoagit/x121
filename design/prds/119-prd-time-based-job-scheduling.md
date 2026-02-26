# PRD-119: Time-Based Job Scheduling

## 1. Introduction/Overview

PRD-08 provides the foundation for queue management -- priority tiers, job state machine, GPU quotas, `scheduled_start_at` on individual jobs, and off-peak policies via generic JSONB config. However, it treats scheduling as a secondary concern: a simple future timestamp on a job. Real production studios need richer time-based scheduling: cron-style recurring schedules, one-time deferred runs, a visual calendar to plan GPU usage across days and weeks, timezone-aware display, and the ability to schedule entire production runs (not just individual jobs).

This PRD extends PRD-08's scheduling primitives into a full time-based scheduling system. It introduces schedule definitions (one-time and recurring), a calendar UI for planning and visualization, smart off-peak slot selection based on queue load and power windows, per-user timezone handling, batch scheduling for production runs, and a complete schedule management lifecycle (create, edit, pause, cancel, history). It integrates with PRD-87's power windows to wake sleeping workers for scheduled work, and with PRD-10's event bus for notifications on schedule lifecycle events.

## 2. Related PRDs & Dependencies

- **Depends on:** PRD-08 (Queue Management -- job state machine, `scheduled_start_at`, priority tiers, off-peak policy), PRD-07 (Parallel Task Execution Engine -- job dispatcher), PRD-10 (Event Bus -- notifications on schedule events), PRD-03 (User Identity -- per-user timezone preference)
- **Extends:** PRD-08 (adds recurring schedules, calendar UI, timezone handling, smart off-peak slot selection on top of existing scheduling primitives)
- **Integrates with:** PRD-87 (GPU Power Management -- wake-on-demand for scheduled jobs, power window awareness), PRD-57 (Batch Production Orchestrator -- schedule entire production runs), PRD-54 (Background Job Tray -- scheduled job status in tray), PRD-97 (Job Dependency Chains -- scheduled jobs can be trigger sources)
- **Depended on by:** None
- **Part:** Part 1 -- Infrastructure & System Core

## 3. Goals

### Primary Goals
- Provide cron-style schedule definitions supporting both one-time ("run at 2am tomorrow") and recurring ("every weekday at 3am") patterns.
- Deliver a calendar UI showing upcoming scheduled work, allowing drag-to-reschedule and visual planning across days and weeks.
- Enable smart off-peak scheduling where the system selects the optimal execution slot based on queue load and PRD-87 power windows.
- Support per-user timezone preferences with correct local-time display throughout the scheduling UI.
- Allow scheduling of entire production runs (PRD-57), not just individual jobs.
- Provide full schedule lifecycle management: create, edit, pause, resume, cancel, and history.

### Secondary Goals
- Integrate with PRD-87 wake-on-demand so scheduled jobs can wake sleeping workers.
- Emit events via PRD-10 when schedules fire, complete, or fail, enabling toast/email notifications.
- Track schedule execution history for auditability and capacity planning.

## 4. User Stories

- As a Creator, I want to schedule a batch generation to run at 2am so that it executes during off-peak hours without me staying awake.
- As a Creator, I want to set up a recurring schedule ("every Monday at 6am") so that weekly character refreshes happen automatically.
- As a Creator, I want a calendar view of all upcoming scheduled work so that I can plan my GPU usage across the week.
- As a Creator, I want to drag a scheduled job to a different time slot on the calendar so that I can reschedule without editing a form.
- As a Creator, I want times displayed in my local timezone so that I do not have to mentally convert from UTC.
- As a Creator, I want to mark a job as "run during off-peak" and let the system pick the best slot so that I get optimal GPU utilization without manual planning.
- As a Creator, I want to schedule an entire production run (PRD-57 matrix) to start at a specific time so that large batches execute on a predictable timeline.
- As an Admin, I want to pause all recurring schedules during maintenance windows so that no jobs fire while the system is being updated.
- As an Admin, I want to see a history of past scheduled runs with their outcomes so that I can identify patterns in schedule failures.
- As a Creator, I want notifications when my scheduled job starts, completes, or fails so that I stay informed without checking manually.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Schedule Definition Model
**Description:** A schedule defines when a job or production run should execute. Schedules can be one-time (single future timestamp) or recurring (cron expression).
**Acceptance Criteria:**
- [ ] Schedule entity stores: name, description, schedule type (one_time | recurring), cron expression (for recurring), next_run_at (computed), timezone (IANA string, e.g. "America/New_York"), priority tier, target type (job | production_run), target config (JSONB with job_type + parameters or production_run_id), created_by user, is_enabled flag
- [ ] One-time schedules have a single `run_at` timestamp; recurring schedules have a cron expression
- [ ] Cron expressions support: minute, hour, day-of-month, month, day-of-week (standard 5-field cron)
- [ ] `next_run_at` is automatically computed from the cron expression and timezone on create/update
- [ ] Schedules can target either a single job submission (job_type + parameters) or a production run (production_run_id + optional cell subset)

**Technical Notes:**
- Use the `croner` or `cron` Rust crate for parsing and computing next execution times from cron expressions.
- Store `next_run_at` as `TIMESTAMPTZ` (always UTC internally). Convert to/from the schedule's timezone for display.
- Reuse existing `SubmitJob` DTO structure for the job target config to avoid duplication with PRD-08.

#### Requirement 1.2: Schedule Executor (Background Service)
**Description:** A background Tokio task that polls for schedules whose `next_run_at` has passed and fires them.
**Acceptance Criteria:**
- [ ] Executor runs as a background task within the API server (similar to PRD-10 EventPersistence pattern)
- [ ] Polls every 15 seconds for schedules where `next_run_at <= now()` and `is_enabled = true`
- [ ] For one-time schedules: submits the job via existing PRD-08 job submission, then sets `is_enabled = false`
- [ ] For recurring schedules: submits the job, then computes and stores the next `next_run_at`
- [ ] For production run targets: calls the existing PRD-57 submit endpoint internally
- [ ] Jobs submitted by the executor carry the schedule's configured priority and a `scheduled_by_id` reference
- [ ] Executor uses row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`) to prevent duplicate firing in multi-instance deployments
- [ ] Publishes `schedule.fired`, `schedule.completed`, `schedule.failed` events via PRD-10 EventBus

**Technical Notes:**
- Model after the `DigestScheduler` pattern in the events crate (periodic `tokio::time::interval` task).
- Use `FOR UPDATE SKIP LOCKED` on the schedules table to ensure exactly-once execution even with multiple API server instances.

#### Requirement 1.3: Off-Peak Smart Slot Selection
**Description:** When a user selects "run during off-peak," the system automatically picks the optimal execution slot based on queue load and PRD-87 power windows.
**Acceptance Criteria:**
- [ ] "Off-peak" option available when creating a schedule -- user does not pick a specific time
- [ ] System reads the active off-peak scheduling policy from PRD-08's `scheduling_policies` table to determine off-peak hours
- [ ] System reads PRD-87's `power_schedules` table (when available) to identify when workers are powered on
- [ ] Optimal slot = intersection of (off-peak hours) AND (workers powered on) AND (lowest predicted queue depth)
- [ ] Selected slot is stored as the schedule's `next_run_at` and displayed to the user for confirmation
- [ ] If PRD-87 is not yet implemented, falls back to off-peak hours only from PRD-08 policy
- [ ] User can accept or override the suggested slot

**Technical Notes:**
- Queue depth prediction can use a simple heuristic initially: count scheduled + queued jobs per hour bucket for the next 24-48 hours, pick the bucket with the fewest jobs.

#### Requirement 1.4: Per-User Timezone Handling
**Description:** Each user has a timezone preference. All schedule times are displayed in the user's local timezone.
**Acceptance Criteria:**
- [ ] Add `timezone` column (TEXT, default 'UTC') to the `users` table via migration
- [ ] Schedule creation API accepts timezone; defaults to the creating user's timezone preference
- [ ] All schedule-related API responses include both UTC timestamp and the schedule's timezone for client-side formatting
- [ ] Frontend displays all schedule times in the viewing user's timezone preference
- [ ] Timezone selector available in user profile settings (IANA timezone database)
- [ ] Cron expressions are evaluated relative to the schedule's configured timezone

**Technical Notes:**
- Use `chrono-tz` crate for timezone conversions in Rust.
- Frontend uses `Intl.DateTimeFormat` or `date-fns-tz` for client-side timezone display.
- Store all timestamps in UTC internally; timezone is purely a display/computation concern.

#### Requirement 1.5: Schedule Management API
**Description:** Full CRUD plus lifecycle actions for schedules.
**Acceptance Criteria:**
- [ ] `POST /api/v1/schedules` -- create a new schedule (one-time or recurring)
- [ ] `GET /api/v1/schedules` -- list schedules with filters (type, enabled, target_type, created_by)
- [ ] `GET /api/v1/schedules/:id` -- get schedule details including next_run_at and recent history
- [ ] `PATCH /api/v1/schedules/:id` -- update schedule (name, cron, priority, target config, timezone)
- [ ] `DELETE /api/v1/schedules/:id` -- soft-delete a schedule (sets `deleted_at`)
- [ ] `POST /api/v1/schedules/:id/actions/pause` -- pause a schedule (sets `is_enabled = false`, preserves cron)
- [ ] `POST /api/v1/schedules/:id/actions/resume` -- resume a paused schedule (recomputes `next_run_at`)
- [ ] `POST /api/v1/schedules/:id/actions/trigger-now` -- manually trigger a schedule immediately (for testing)
- [ ] `GET /api/v1/schedules/calendar?start=DATE&end=DATE` -- returns scheduled events for the date range (for calendar view)
- [ ] `PATCH /api/v1/schedules/:id/reschedule` -- update `next_run_at` only (for drag-to-reschedule from calendar)
- [ ] Admin can pause/resume any schedule; creators can only manage their own

**Technical Notes:**
- Follow existing API conventions: `/api/v1/{resource}` with `DataResponse` envelope.
- Soft delete uses `deleted_at` column per project conventions.
- Calendar endpoint returns expanded occurrences for recurring schedules within the date range (limited to 200 occurrences per request).

#### Requirement 1.6: Schedule History & Execution Log
**Description:** Every schedule execution (fired, completed, failed, skipped) is logged for auditability.
**Acceptance Criteria:**
- [ ] `schedule_executions` table stores: schedule_id, job_id (if job was created), production_run_id (if applicable), status (fired, completed, failed, skipped), started_at, completed_at, error_message, duration_secs
- [ ] Execution is linked to the resulting job or production run for traceability
- [ ] `GET /api/v1/schedules/:id/history` returns paginated execution log
- [ ] `GET /api/v1/schedules/history` returns global execution log (admin) with filters
- [ ] Failed executions include error details (e.g., "quota exceeded", "no workers available")
- [ ] Skipped executions are logged when a recurring schedule fires but the previous execution is still running

**Technical Notes:**
- Use `ON DELETE CASCADE` from `schedule_executions` to `schedules` since execution history is owned by the schedule.

#### Requirement 1.7: Calendar UI
**Description:** Visual calendar showing upcoming and past scheduled work.
**Acceptance Criteria:**
- [ ] Week view (default) and month view with day cells showing scheduled items
- [ ] Each calendar item shows: schedule name, target type icon (job vs. production run), priority badge, time
- [ ] Click an item to view/edit the schedule detail
- [ ] Drag an item to a different time slot to reschedule (calls `PATCH /schedules/:id/reschedule`)
- [ ] "Add Schedule" button on any time slot to create a new schedule pre-filled with that time
- [ ] Color coding: pending (blue), running (green), completed (gray), failed (red), paused (orange)
- [ ] Current time indicator line on the calendar
- [ ] Timezone selector in the calendar header (defaults to user's preference)
- [ ] Responsive: collapses to day view on narrow screens

**Technical Notes:**
- Build as a new feature module: `apps/frontend/src/features/scheduling/`.
- Consider using a lightweight calendar library (e.g., `@schedule-x/react` or custom grid) to avoid heavy dependencies.
- Data fetching via TanStack Query calling the `/schedules/calendar` endpoint.

#### Requirement 1.8: Integration with PRD-08 Job Queue
**Description:** When a schedule fires, the resulting job enters the existing PRD-08 queue system seamlessly.
**Acceptance Criteria:**
- [ ] Scheduled jobs are submitted through the same `JobRepo::create` path as manually submitted jobs
- [ ] The schedule's priority tier is applied to the resulting job
- [ ] Jobs carry a `schedule_id` reference for traceability (new nullable FK on `jobs` table)
- [ ] Scheduled jobs appear in the existing queue view (PRD-08) with a "Scheduled" badge
- [ ] If a scheduled job cannot be submitted (quota exceeded, validation error), the schedule execution is logged as failed with the reason

**Technical Notes:**
- Add `schedule_id BIGINT REFERENCES schedules(id) ON DELETE SET NULL` to the `jobs` table via migration.

#### Requirement 1.9: Notification Integration
**Description:** Schedule lifecycle events are published to PRD-10's event bus for notification delivery.
**Acceptance Criteria:**
- [ ] `schedule.fired` event when a schedule triggers and submits a job
- [ ] `schedule.completed` event when the submitted job completes successfully
- [ ] `schedule.failed` event when the submitted job fails or the schedule itself fails to fire
- [ ] Events include schedule_id, schedule name, job_id (if applicable), and error details (if failed)
- [ ] Users can configure notification preferences for schedule events (via PRD-10 notification preferences)
- [ ] Schedule events appear in the PRD-54 job tray for the schedule owner

**Technical Notes:**
- Use existing `PlatformEvent::new("schedule.fired").with_source("schedule", schedule_id).with_actor(user_id)` pattern.

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Integration with PRD-87 Wake-on-Demand
**Description:** Scheduled jobs can wake sleeping workers in advance of their execution time.
**Acceptance Criteria:**
- [ ] When a schedule's `next_run_at` is within a configurable lead time (default: 5 minutes), wake sleeping workers via PRD-87's wake-on-demand mechanism
- [ ] Workers are woken only if no online workers have capacity for the scheduled job
- [ ] Wake lead time is configurable per schedule

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Schedule Templates
**Description:** Save and reuse common schedule configurations.
**Acceptance Criteria:**
- [ ] Save a schedule configuration as a named template
- [ ] Apply a template when creating a new schedule (pre-fills cron, priority, target config)
- [ ] Share templates across the team

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Queue Load Heatmap
**Description:** Visual heatmap on the calendar showing predicted queue load per hour.
**Acceptance Criteria:**
- [ ] Background shading on calendar cells indicating predicted GPU load (light = low, dark = high)
- [ ] Helps users pick optimal scheduling windows visually
- [ ] Based on scheduled jobs + historical queue data

#### **[OPTIONAL - Post-MVP]** Requirement 2.4: Recurring Schedule with End Date
**Description:** Recurring schedules that automatically disable after a specified end date.
**Acceptance Criteria:**
- [ ] Optional `ends_at` timestamp on recurring schedules
- [ ] Schedule auto-disables when `next_run_at > ends_at`
- [ ] "Run N times" option as an alternative to end date

## 6. Non-Goals (Out of Scope)

- **Job execution mechanics** -- covered by PRD-07 (Parallel Task Execution Engine)
- **Queue ordering and priority algorithms** -- covered by PRD-08 (Queue Management)
- **GPU power management and idle scheduling** -- covered by PRD-87 (GPU Power Management); this PRD only reads power window data, it does not manage hardware
- **Event-driven triggers ("when X completes, start Y")** -- covered by PRD-97 (Job Dependency Chains); this PRD is purely time-driven
- **Cost estimation for scheduled jobs** -- covered by PRD-61 (Cost & Resource Estimation)
- **Worker pool scaling decisions** -- covered by PRD-46 (Worker Pool Management) and PRD-114 (Cloud GPU Integration)
- **Render queue Gantt/timeline visualization** -- covered by PRD-90 (Render Queue Timeline)

## 7. Design Considerations

- The calendar should be the primary scheduling interface, not a settings form with a date picker. Users should see their GPU schedule like they see their meeting schedule.
- Use consistent color coding with the existing queue view (PRD-08): Urgent = red, Normal = blue, Background = gray.
- The schedule creation flow should offer three paths: (1) pick a specific time, (2) set up a recurring cron, (3) "auto-pick off-peak" -- each with progressive disclosure.
- Drag-to-reschedule on the calendar should show a ghost preview and confirmation before committing.
- Calendar time labels should adapt to the user's timezone automatically, with a clear indicator of which timezone is active.
- The schedule detail panel should show the execution history inline so users can see if their recurring schedule has been reliable.

## 8. Technical Considerations

### Existing Code to Reuse
- **PRD-08 `SubmitJob` DTO and `JobRepo::create`** -- job submission path for when schedules fire.
- **PRD-08 `SchedulingPolicy` model** -- off-peak hours configuration.
- **PRD-08 `scheduling_policies` table and repo** -- read off-peak policy config for smart slot selection.
- **PRD-10 `EventBus` and `PlatformEvent`** -- publish schedule lifecycle events.
- **PRD-10 `DigestScheduler` pattern** -- background periodic task model for the schedule executor.
- **PRD-57 `ProductionRun` model** -- target reference for batch scheduling.
- **PRD-03 `users` table** -- extend with timezone preference column.

### New Infrastructure Needed
- **Schedule executor** -- background Tokio task polling for due schedules.
- **Cron parser** -- Rust crate (`croner` or `cron`) for evaluating cron expressions.
- **Timezone conversion** -- `chrono-tz` crate for IANA timezone handling.
- **Calendar component** -- React calendar grid (custom or lightweight library).

### Database Changes

New tables follow project conventions: `id BIGSERIAL PRIMARY KEY`, `created_at`/`updated_at` with trigger, soft delete via `deleted_at`.

**Table: `schedule_statuses`** (lookup table)
```sql
CREATE TABLE schedule_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO schedule_statuses (name, label) VALUES
    ('active', 'Active'),
    ('paused', 'Paused'),
    ('completed', 'Completed'),
    ('disabled', 'Disabled');
```

**Table: `schedules`**
```sql
CREATE TABLE schedules (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    schedule_type   TEXT NOT NULL CHECK (schedule_type IN ('one_time', 'recurring')),
    cron_expression TEXT,                     -- NULL for one_time
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    run_at          TIMESTAMPTZ,              -- for one_time schedules
    next_run_at     TIMESTAMPTZ,              -- computed; NULL when disabled or completed
    last_run_at     TIMESTAMPTZ,
    priority        INTEGER NOT NULL DEFAULT 1, -- 0=urgent, 1=normal, 2=background
    target_type     TEXT NOT NULL CHECK (target_type IN ('job', 'production_run')),
    target_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_id       SMALLINT NOT NULL REFERENCES schedule_statuses(id) DEFAULT 1,
    is_off_peak     BOOLEAN NOT NULL DEFAULT false,
    created_by_id   BIGINT NOT NULL REFERENCES users(id),
    total_runs      INTEGER NOT NULL DEFAULT 0,
    failed_runs     INTEGER NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_next_run_at ON schedules (next_run_at)
    WHERE next_run_at IS NOT NULL AND status_id = 1 AND deleted_at IS NULL;
CREATE INDEX idx_schedules_created_by_id ON schedules (created_by_id);
CREATE INDEX idx_schedules_target_type ON schedules (target_type);
CREATE INDEX idx_schedules_status_id ON schedules (status_id);
CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Table: `schedule_execution_statuses`** (lookup table)
```sql
CREATE TABLE schedule_execution_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO schedule_execution_statuses (name, label) VALUES
    ('fired', 'Fired'),
    ('completed', 'Completed'),
    ('failed', 'Failed'),
    ('skipped', 'Skipped');
```

**Table: `schedule_executions`**
```sql
CREATE TABLE schedule_executions (
    id                BIGSERIAL PRIMARY KEY,
    schedule_id       BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    job_id            BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    production_run_id BIGINT REFERENCES production_runs(id) ON DELETE SET NULL,
    status_id         SMALLINT NOT NULL REFERENCES schedule_execution_statuses(id),
    fired_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ,
    duration_secs     INTEGER,
    error_message     TEXT,
    error_details     JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_executions_schedule_id ON schedule_executions (schedule_id);
CREATE INDEX idx_schedule_executions_job_id ON schedule_executions (job_id);
CREATE INDEX idx_schedule_executions_fired_at ON schedule_executions (fired_at);
CREATE TRIGGER trg_schedule_executions_updated_at
    BEFORE UPDATE ON schedule_executions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Alter: `jobs` table** (add schedule reference)
```sql
ALTER TABLE jobs ADD COLUMN schedule_id BIGINT REFERENCES schedules(id) ON DELETE SET NULL;
CREATE INDEX idx_jobs_schedule_id ON jobs (schedule_id) WHERE schedule_id IS NOT NULL;
```

**Alter: `users` table** (add timezone preference)
```sql
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
```

### API Changes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/schedules` | Creator+ | Create a new schedule |
| GET | `/api/v1/schedules` | Creator+ | List schedules (filtered) |
| GET | `/api/v1/schedules/:id` | Creator+ | Get schedule detail |
| PATCH | `/api/v1/schedules/:id` | Owner/Admin | Update schedule |
| DELETE | `/api/v1/schedules/:id` | Owner/Admin | Soft-delete schedule |
| POST | `/api/v1/schedules/:id/actions/pause` | Owner/Admin | Pause schedule |
| POST | `/api/v1/schedules/:id/actions/resume` | Owner/Admin | Resume schedule |
| POST | `/api/v1/schedules/:id/actions/trigger-now` | Owner/Admin | Manually fire schedule |
| PATCH | `/api/v1/schedules/:id/reschedule` | Owner/Admin | Update next_run_at (drag-to-reschedule) |
| GET | `/api/v1/schedules/calendar` | Creator+ | Calendar events for date range |
| GET | `/api/v1/schedules/:id/history` | Creator+ | Execution history for one schedule |
| GET | `/api/v1/schedules/history` | Admin | Global execution history |
| PATCH | `/api/v1/users/me/timezone` | Creator+ | Update own timezone preference |

## 9. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Schedule fires but user has exceeded GPU quota (PRD-08) | Log execution as "failed" with reason "quota_exceeded"; do not submit job; notify user |
| Schedule fires but no workers available | Log execution as "failed" with reason "no_workers"; attempt again at next poll (for recurring); for one-time, mark failed and notify user |
| Recurring schedule fires while previous execution is still running | Log as "skipped" with reason "previous_still_running"; compute next_run_at normally |
| User deletes a production run that is referenced by a schedule | `ON DELETE SET NULL` clears the reference; schedule fires but target_config validation fails; logged as "failed" with "target_not_found" |
| Cron expression produces no next occurrence (e.g., Feb 30) | Validation rejects invalid cron expressions at creation; edge-case cron patterns that skip months are handled by computing next valid occurrence |
| DST transition causes ambiguous local time | `chrono-tz` handles DST: for ambiguous times (fall-back), use the first occurrence; for non-existent times (spring-forward), use the next valid minute |
| Multiple API server instances try to fire the same schedule | `SELECT ... FOR UPDATE SKIP LOCKED` ensures only one instance processes each due schedule |
| Schedule timezone is removed from IANA database | Validation checks timezone against a known list at creation; existing schedules with removed timezones fall back to UTC with a warning |
| User changes their timezone preference | Existing schedules retain their configured timezone; only new schedules default to the new preference |

## 10. Success Metrics

- Scheduled jobs fire within 30 seconds of their `next_run_at` time (inheriting PRD-08's target).
- Calendar view renders in under 2 seconds for a month with 100+ scheduled items.
- Zero duplicate schedule firings across multi-instance deployments (verified by execution log).
- Off-peak smart slot selection reduces average queue wait time by 20% compared to random scheduling.
- Recurring schedules maintain 99.5% on-time execution rate (excluding system downtime).
- Drag-to-reschedule completes optimistically in under 500ms client-side.

## 11. Testing Requirements

### Backend
- Unit tests for cron expression parsing and next-occurrence computation (including DST edge cases).
- Unit tests for off-peak slot selection algorithm.
- Integration tests for schedule CRUD endpoints.
- Integration tests for the schedule executor (mock clock, verify job creation).
- Integration test for `FOR UPDATE SKIP LOCKED` concurrency guarantee.
- Integration test for recurring schedule with skip-on-overlap logic.

### Frontend
- Component tests for the calendar grid (render, navigation, drag-to-reschedule).
- Component tests for schedule creation form (one-time vs. recurring mode).
- Component tests for timezone selector and time display.
- Hook tests for schedule data fetching and mutation hooks.

## 12. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** -- no PR should be merged without a DRY-GUY audit of the changed files.

## 13. Open Questions

- Should admin users be able to create schedules on behalf of other users?
- Should there be a global limit on the number of active schedules per user to prevent schedule sprawl?
- How should the calendar interact with PRD-90 (Render Queue Timeline / Gantt View) -- are they separate views or should they be unified?
- Should the off-peak smart slot selection consider estimated job duration when picking slots, or just start time?
- Should schedule templates (Post-MVP Req 2.2) be project-scoped or user-scoped?

## 14. Version History

- **v1.0** (2026-02-25): Initial PRD generation
