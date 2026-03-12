# PRD-132: Queue Manager & Intelligent Job Allocation

## 1. Introduction/Overview

The platform's current queue system has a solid foundation — a 9-state job state machine with validated transitions, pause/resume/cancel support, priority ordering, GPU quotas, and scheduling policies. However, it lacks **operational control** over how jobs are distributed across workers and provides no tools for admins to actively manage the queue beyond basic priority changes.

Key gaps:

1. **Naive allocation** — `pick_instance()` takes the first available ComfyUI instance. No load balancing, no VRAM awareness, no affinity.
2. **No job reassignment** — once a job is dispatched to an instance, it cannot be moved to a different one. If an instance goes down, in-flight jobs are lost.
3. **No running job visibility** — the queue UI only shows pending/scheduled jobs. Running and dispatched jobs are invisible in the queue view.
4. **No admin queue manipulation** — admins can change priority but can't move jobs to the front, drain a worker, or redistribute the queue.
5. **No graceful worker drain** — stopping an instance kills in-flight jobs instead of letting them complete first.

This PRD creates a **Queue Manager** that gives admins full operational control over job lifecycle, allocation, and distribution across the worker pool.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-07 (Parallel Task Execution Engine — job infrastructure)
  - PRD-08 (Queue Management — state machine, scheduling, quotas)
  - PRD-05 (ComfyUI WebSocket Bridge — instance connections)
  - PRD-46 (Worker Pool — worker registration, health)
- **Extends:**
  - PRD-08 — adds intelligent allocation, reassignment, admin queue manipulation
  - PRD-46 — adds worker drain mode
- **Integrates with:**
  - PRD-130 (Unified Cloud Orchestration — worker lifecycle affects queue)
  - PRD-131 (Infrastructure Control Panel — "graceful stop" uses worker drain)
  - PRD-10 (Event Bus — queue state changes broadcast for real-time UI)
  - PRD-28 (Pipeline Error Recovery — failed jobs can be requeued to different workers)

## 3. Goals

- Give admins a complete view of the queue including running and dispatched jobs, not just pending ones.
- Implement intelligent job allocation that considers worker load, VRAM capacity, and job requirements.
- Enable job reassignment — cancel a job on one instance and requeue it to a different one.
- Support worker drain mode — mark an instance as "draining" so it finishes current work but accepts no new jobs.
- Provide admin queue manipulation — move jobs to front, hold jobs, bulk cancel, redistribute across workers.
- Enable job cancellation that properly cleans up ComfyUI-side executions.

## 4. User Stories

- **As an admin**, I want to see ALL jobs in the queue (pending, dispatched, running, scheduled) so I have complete visibility into what's happening.
- **As an admin**, I want to move a job to the front of the queue so urgent work gets processed first.
- **As an admin**, I want to cancel a running job and have it properly cleaned up on the ComfyUI instance.
- **As an admin**, I want to reassign a job from a slow/failing instance to a healthy one without losing progress.
- **As an admin**, I want to drain a worker before stopping it, so current jobs finish before the instance shuts down.
- **As an admin**, I want the system to intelligently distribute jobs across workers based on current load rather than just picking the first available one.
- **As an admin**, I want to bulk cancel all pending jobs for a specific scene or character when priorities change.
- **As a creator**, I want to cancel my own generation jobs if I realize the configuration was wrong.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Complete Queue Visibility

**Description:** The queue view must show ALL jobs across all states, not just pending/scheduled. Jobs are displayed in a table with filtering and sorting.

**Queue Table Columns:**
- Job ID
- Job type (segment_generation, etc.)
- Entity (scene name, character name — resolved from job parameters)
- Status (with color-coded badge)
- Priority (with inline edit for admins)
- Assigned worker (instance name, or "unassigned")
- Submitted at
- Started at (when dispatched)
- Duration (running time for active jobs)
- Submitted by (user name)

**Filters:**
- Status: pending, dispatched, running, scheduled, paused, failed, completed, cancelled
- Worker: filter by assigned instance
- Job type: segment_generation, etc.
- Submitted by: filter by user
- Entity: filter by scene/character/project

**Sorting:**
- By priority (default)
- By submitted time
- By status
- By duration

**Acceptance Criteria:**
- [ ] Queue view shows jobs in ALL states (not just pending/scheduled)
- [ ] Running jobs show which instance they're executing on
- [ ] Dispatched jobs show which instance claimed them
- [ ] Failed jobs show error message and failure reason
- [ ] Completed jobs are shown (with configurable retention, default: last 100)
- [ ] Filters and sorting work combinatorially
- [ ] Job count summary bar shows counts per status
- [ ] Auto-refresh at 5-second interval (or SSE in post-MVP)

#### Requirement 1.2: Job Cancellation with ComfyUI Cleanup

**Description:** When a running job is cancelled, the system must also cancel the corresponding ComfyUI execution to free up the GPU. Currently, cancelling a job only updates the DB status — the ComfyUI workflow continues running and wasting GPU time.

**Cancellation Flow:**
1. Admin/user clicks "Cancel" on a running job
2. Backend updates job status to `cancelled` in DB
3. Backend sends cancel/interrupt request to the ComfyUI instance via API (`POST /interrupt` or `POST /queue` with delete)
4. ComfyUI stops the workflow execution
5. Event loop receives `GenerationCancelled` event and cleans up

**Acceptance Criteria:**
- [ ] Cancelling a running job sends interrupt to ComfyUI instance
- [ ] ComfyUI stops processing the cancelled workflow within 5 seconds
- [ ] GPU is freed immediately after cancellation (next job can start)
- [ ] Cancelled jobs show "cancelled" status with cancellation reason and who cancelled
- [ ] If ComfyUI interrupt fails (instance unreachable), job is still marked cancelled and the orphaned execution is cleaned up on next reconciliation
- [ ] Users can cancel their own jobs; admins can cancel any job

#### Requirement 1.3: Job Reassignment

**Description:** Admin can move a job from one worker to another. This cancels the job on the current instance and requeues it to a specific target instance (or back to the general queue for automatic allocation).

**Reassignment Flow:**
1. Admin selects "Reassign" on a dispatched/running job
2. Modal shows available target instances (healthy + connected)
3. Admin selects target (or "Auto-assign" for general queue)
4. System cancels job on current instance (interrupt ComfyUI)
5. Job is requeued with `target_instance_id` (or null for auto)
6. If the job was a segment in a multi-segment generation, the segment is reset and re-submitted

**Acceptance Criteria:**
- [ ] Reassignment available for dispatched and running jobs
- [ ] Target instance picker shows only healthy, connected instances
- [ ] "Auto-assign" option requeues to general pool
- [ ] Job retains its priority and parameters after reassignment
- [ ] Job transition log records the reassignment (from_instance → to_instance)
- [ ] Segment state is properly reset (output cleared, status back to pending)
- [ ] If target instance is specified, `pick_instance()` respects the affinity

#### Requirement 1.4: Worker Drain Mode

**Description:** Before stopping a cloud instance (PRD-131), admins should be able to put it in "drain" mode — the worker finishes its current job(s) but accepts no new ones. Once drained, the instance can be safely stopped without losing work.

**Drain States:**
- `active` — accepting and processing jobs (default)
- `draining` — finishing current work, rejecting new dispatches
- `drained` — no active jobs, safe to stop

**Drain Flow:**
1. Admin clicks "Drain" on an active worker
2. Worker state set to `draining` in DB
3. `pick_instance()` skips draining instances for new job allocation
4. Current jobs continue to completion
5. When last job completes, state transitions to `drained`
6. Admin can then safely stop/terminate the instance
7. "Undrain" action returns worker to `active` if admin changes mind

**Acceptance Criteria:**
- [ ] Drain action available on active worker instances
- [ ] Draining workers are excluded from `pick_instance()` allocation
- [ ] Current jobs on draining workers complete normally
- [ ] Worker transitions to `drained` automatically when last job finishes
- [ ] Drained workers show "Ready to stop" indicator in Infrastructure Panel
- [ ] "Undrain" returns worker to active state
- [ ] PRD-131 "Stop Instance" integrates: offers "Drain first" vs "Force stop"
- [ ] Drain state persisted in `comfyui_instances.metadata` JSONB (or new column)

#### Requirement 1.5: Intelligent Job Allocation

**Description:** Replace the naive `pick_instance()` (first available) with an intelligent allocator that considers worker load and availability.

**Allocation Strategy (Least-Loaded):**
1. Get all connected, non-draining ComfyUI instances
2. For each instance, count currently dispatched + running jobs
3. Select the instance with the fewest active jobs
4. If tied, prefer the instance that has been idle longest (least recent job completion)

**Future Considerations (not in MVP):**
- VRAM-aware allocation (match job VRAM requirements to instance capacity)
- Affinity rules (keep segments of the same scene on the same worker for cache locality)
- Priority lanes (high-priority jobs bypass queue and go to fastest available worker)

**Acceptance Criteria:**
- [ ] `pick_instance()` considers active job count per instance
- [ ] Instances with fewer active jobs are preferred
- [ ] Draining instances are excluded
- [ ] Disabled instances are excluded
- [ ] If all instances are equally loaded, falls back to round-robin
- [ ] Allocation decision is logged (which instance was selected and why)

#### Requirement 1.6: Admin Queue Manipulation

**Description:** Admin-level controls for direct queue manipulation beyond priority changes.

**Actions:**
- **Move to Front** — sets job priority to highest in queue (lower number = higher priority)
- **Hold Job** — prevents a pending job from being dispatched until manually released (new state: `held`)
- **Release Hold** — transitions held job back to pending
- **Bulk Cancel** — cancel all pending jobs matching a filter (by scene, character, project, or user)
- **Redistribute Queue** — for all pending jobs assigned to a specific worker, reassign them to auto-allocation (useful when removing a worker)

**State Machine Addition:**
```
Pending (1) → Held (new)
Held (new) → Pending (1)
Held (new) → Cancelled (5)
```

**Acceptance Criteria:**
- [ ] "Move to Front" sets priority to `min(existing_priorities) - 1`
- [ ] "Hold" action available on pending jobs, transitions to held state
- [ ] Held jobs are visible in queue with "held" badge and are skipped by dispatcher
- [ ] "Release" transitions held job back to pending
- [ ] Bulk cancel accepts filter criteria and cancels all matching pending jobs
- [ ] "Redistribute" reassigns pending jobs from specified worker to auto-allocation
- [ ] All admin actions are logged in job transition history with admin user ID and reason

#### Requirement 1.7: Queue Statistics Dashboard

**Description:** Summary statistics at the top of the queue view for operational awareness.

**Metrics:**
- Total jobs by status (pending, running, dispatched, scheduled, paused, held)
- Average wait time (submission to dispatch for last 50 jobs)
- Average execution time (dispatch to completion for last 50 jobs)
- Throughput (jobs completed per hour, rolling 1-hour window)
- Queue depth trend (sparkline of pending count over last hour)
- Per-worker load (bar chart showing active jobs per instance)

**Acceptance Criteria:**
- [ ] Statistics panel at top of queue page
- [ ] Metrics calculated from real data (not hardcoded)
- [ ] Per-worker load chart shows all connected instances
- [ ] Sparkline updates with queue depth changes
- [ ] Throughput metric visible for capacity planning

#### Requirement 1.8: Curated Activity Logging for Queue Events

**Description:** All queue lifecycle events must emit **curated** (user-friendly) activity log entries via `ActivityLogBroadcaster`. The existing scene-specific `GenerationTerminal` (via `gen_log`) handles per-scene output, but the queue manager needs system-wide operational logging so admins can follow job flow across all workers in the Activity Console.

**Curated Events to Emit (source: `Pipeline`):**

| Event | Level | Message Example |
|-------|-------|-----------------|
| Job submitted | Info | "Job #1234 submitted: segment_generation for Scene 'Smile' (priority: 0)" |
| Job dispatched | Info | "Job #1234 dispatched to runpod-abc123 (queue wait: 12s)" |
| Job started | Info | "Job #1234 started executing on runpod-abc123" |
| Job completed | Info | "Job #1234 completed on runpod-abc123 (duration: 45s)" |
| Job failed | Error | "Job #1234 failed on runpod-abc123: CUDA out of memory" |
| Job cancelled | Warn | "Job #1234 cancelled by admin (john@example.com) — ComfyUI interrupt sent" |
| Job cancelled (ComfyUI interrupt failed) | Error | "Job #1234 cancelled but ComfyUI interrupt failed on runpod-abc123 — GPU may still be in use" |
| Job reassigned | Info | "Job #1234 reassigned: runpod-abc123 → runpod-def456 (admin: john@example.com)" |
| Job held | Info | "Job #1234 held by admin (john@example.com)" |
| Job released | Info | "Job #1234 released from hold by admin (john@example.com)" |
| Job moved to front | Info | "Job #1234 moved to front of queue (admin: john@example.com)" |
| Bulk cancel | Warn | "Bulk cancel: 15 pending jobs cancelled for Scene 'Walk' (admin: john@example.com)" |
| Worker drain started | Info | "Worker runpod-abc123 entering drain mode (1 active job remaining)" |
| Worker drained | Info | "Worker runpod-abc123 fully drained — safe to stop" |
| Worker undrained | Info | "Worker runpod-abc123 returned to active (admin: john@example.com)" |
| Allocation decision | Debug | "Job #1234 allocated to runpod-abc123 (load: 1 job, lightest of 3 workers)" |
| Queue redistributed | Info | "Redistributed 5 pending jobs from runpod-abc123 to auto-allocation" |

**Implementation Pattern:**
```rust
broadcaster.publish(
    ActivityLogEntry::curated(ActivityLogLevel::Info, ActivityLogSource::Pipeline,
        &format!("Job #{} dispatched to {} (queue wait: {}s)", job_id, instance_name, wait_secs))
        .with_job(job_id)
        .with_entity("scene", scene_id)
        .with_fields(json!({ "instance": instance_name, "wait_secs": wait_secs }))
);
```

**Embedded Log Panel:**
The Queue Manager page must include an embedded, filtered Activity Console panel showing only queue-related events (source: `Pipeline`). This gives admins live visibility into job flow, allocation decisions, and errors without navigating away.

**Acceptance Criteria:**
- [ ] All lifecycle events in the table above emit curated activity log entries
- [ ] Entries include `job_id`, `entity_type`/`entity_id` (scene), and `user_id` where applicable
- [ ] Entries include structured `fields` JSONB with instance names, durations, queue metrics
- [ ] Queue Manager page has an embedded Activity Console panel filtered to Pipeline source
- [ ] Admin identity included in all manually-triggered actions (cancel, reassign, hold, etc.)
- [ ] Error entries include ComfyUI error messages when available
- [ ] Allocation decisions logged at Debug level (visible in verbose mode only)
- [ ] Per-scene generation logs (`GenerationTerminal` / `gen_log`) continue to work for scene-specific view — this requirement is for the system-wide queue view

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL - Post-MVP]** VRAM-Aware Allocation

**Description:** Match job VRAM requirements to instance VRAM capacity. Some workflows require more VRAM than others.

**Acceptance Criteria:**
- [ ] Workflows tagged with estimated VRAM requirement
- [ ] Instances report available VRAM
- [ ] Allocator only assigns jobs to instances with sufficient VRAM

#### Requirement 2.2: **[OPTIONAL - Post-MVP]** Priority Lanes

**Description:** Multiple priority lanes with dedicated worker allocation. High-priority lane always gets the fastest available worker.

**Acceptance Criteria:**
- [ ] Configurable priority lanes (e.g., urgent, normal, batch)
- [ ] Workers can be assigned to specific lanes
- [ ] Urgent jobs bypass normal queue ordering

#### Requirement 2.3: **[OPTIONAL - Post-MVP]** Job Dependencies & Chaining

**Description:** Define job dependencies so job B automatically starts when job A completes. Already partially covered by PRD-97 but not connected to the queue UI.

**Acceptance Criteria:**
- [ ] Queue view shows dependency chains
- [ ] Dependent jobs show "waiting for X" status
- [ ] Chain visualization in queue

#### Requirement 2.4: **[OPTIONAL - Post-MVP]** Queue Real-Time via SSE

**Description:** Replace polling with Server-Sent Events for queue state changes.

**Acceptance Criteria:**
- [ ] SSE endpoint streams job state transitions
- [ ] Frontend updates instantly on job status changes
- [ ] No polling required

## 6. Non-Goals (Out of Scope)

- **Infrastructure management** (start/stop instances, provider config) — covered by PRD-131
- **Auto-scaling decisions** — covered by PRD-130's scaling service
- **Job creation/submission** — the generation pipeline creates jobs; this PRD manages them after creation
- **Cost optimization** — this PRD focuses on operational control, not cost algorithms
- **Multi-tenant job isolation** — all admins see all jobs

## 7. Design Considerations

- The queue page should feel like a real-time operations dashboard, not a static list.
- Use the existing `QueueStatusView` as the starting point but significantly expand it.
- Worker load visualization should use horizontal bar charts (one bar per instance).
- Job reassignment modal should show instance health/load to help admin choose the best target.
- Bulk actions should use the same select-and-act pattern as PRD-131 (checkboxes + toolbar).
- Consider keyboard shortcuts for common queue operations (J/K to navigate, C to cancel, P to pause).

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| Queue UI | `features/queue/QueueStatusView.tsx` | Extend with full visibility and admin controls |
| Queue hooks | `features/queue/hooks/use-queue.ts` | Extend with new endpoints |
| Job handlers | `handlers/jobs.rs` | Extend with reassign, hold, bulk cancel |
| Job state machine | `core/src/scheduling/state_machine.rs` | Add `held` state |
| Job repo | `repositories/job_repo.rs` | Add filter queries, bulk operations |
| Submitter | `pipeline/src/submitter.rs` | Replace `pick_instance()` with intelligent allocator |
| ComfyUI client | `comfyui/src/client.rs` | Add `interrupt()` method for cancellation |
| ComfyUI manager | `comfyui/src/manager.rs` | Add drain mode support, active job tracking |

### New Infrastructure Needed

- **Intelligent allocator** — replace `pick_instance()` with load-aware selection in `submitter.rs`
- **ComfyUI interrupt API** — `POST /interrupt` to cancel running workflow
- **Drain mode** — new field on `comfyui_instances` (or metadata), checked by allocator
- **Held state** — new job status in `job_statuses` lookup table
- **Job-instance tracking** — track which instance a job was dispatched to (may need `jobs.instance_id` column)
- **Queue statistics service** — calculates rolling metrics for dashboard

### Database Changes

```sql
-- Add held status to job_statuses
INSERT INTO job_statuses (name, description) VALUES
    ('held', 'Job is held by admin and will not be dispatched');

-- Add drain mode to comfyui_instances
ALTER TABLE comfyui_instances
    ADD COLUMN drain_mode BOOLEAN NOT NULL DEFAULT false;

-- Track which instance is executing a job
ALTER TABLE jobs
    ADD COLUMN comfyui_instance_id BIGINT REFERENCES comfyui_instances(id) ON DELETE SET NULL;
CREATE INDEX idx_jobs_comfyui_instance ON jobs(comfyui_instance_id) WHERE comfyui_instance_id IS NOT NULL;

-- Track reassignment history
ALTER TABLE job_state_transitions
    ADD COLUMN from_instance_id BIGINT REFERENCES comfyui_instances(id),
    ADD COLUMN to_instance_id BIGINT REFERENCES comfyui_instances(id);
```

### API Changes

**New Endpoints:**
- `POST /api/v1/admin/jobs/:id/reassign` — reassign job to different instance
- `POST /api/v1/admin/jobs/:id/hold` — hold a pending job
- `POST /api/v1/admin/jobs/:id/release` — release a held job
- `POST /api/v1/admin/jobs/:id/move-to-front` — set highest priority
- `POST /api/v1/admin/jobs/bulk-cancel` — cancel jobs matching filter
- `POST /api/v1/admin/jobs/redistribute` — reassign jobs from one instance to auto
- `GET /api/v1/admin/queue/stats` — queue statistics (throughput, wait times, load)
- `POST /api/v1/admin/comfyui/:id/drain` — enable drain mode
- `POST /api/v1/admin/comfyui/:id/undrain` — disable drain mode

**Modified Endpoints:**
- `POST /api/v1/jobs/:id/cancel` — enhanced to send ComfyUI interrupt
- `GET /api/v1/queue` — enhanced to return all job states, not just pending

## 9. Success Metrics

- Admins can see all jobs (pending, running, completed) in one view.
- Cancelling a running job frees the GPU within 5 seconds.
- Job reassignment works without losing job parameters or context.
- Worker drain completes gracefully (no jobs killed).
- Intelligent allocation distributes jobs evenly across workers (no instance idle while others have queued work).
- Bulk cancel processes 100 jobs in under 2 seconds.

## 10. Open Questions

1. **Segment-level vs scene-level reassignment** — when reassigning a job that's part of a multi-segment generation, should we reassign just the current segment or the entire remaining generation?
2. **Job history retention** — how many completed/cancelled jobs should the queue view show? Configurable per admin?
3. **Drain timeout** — should draining workers have a maximum drain time? After which the current job is force-cancelled?
4. **ComfyUI interrupt reliability** — need to verify that ComfyUI's `/interrupt` API reliably stops execution. If not, we may need to use `/queue` delete instead.

## 11. Version History

- **v1.0** (2026-03-10): Initial PRD creation
- **v1.1** (2026-03-10): Added Requirement 1.8 — curated activity logging for all queue lifecycle events, embedded Activity Console panel filtered to Pipeline source
