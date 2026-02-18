# Task List: Render Queue Timeline / Gantt View

**PRD Reference:** `design/prds/090-prd-render-queue-timeline-gantt-view.md`
**Scope:** Build a visual Gantt chart timeline of the job queue showing what is running on each GPU worker, what is queued with estimated start times, and admin-only interactive drag-and-drop priority reordering.

## Overview

PRD-08 defines queue policy and PRD-54 shows a badge count, but neither answers "When will my job run?" This feature provides a horizontal Gantt timeline with GPU workers as lanes (Y-axis) and time on the X-axis. Running jobs are shown as colored blocks, queued jobs appear as stacked blocks with estimated start times based on historical throughput, and admins can drag-and-drop to reorder priorities. The timeline updates in real time via WebSocket as jobs complete and new ones arrive.

### What Already Exists
- PRD-08 Queue Management for job data
- PRD-46 Worker Pool for worker data
- PRD-61 Cost & Resource Estimation for time estimates

### What We're Building
1. Rust timeline data aggregation service
2. Time estimation engine using historical throughput data
3. WebSocket channel for real-time timeline updates
4. React Gantt chart component (custom Canvas/SVG or library)
5. Admin drag-and-drop priority reordering
6. API endpoints for timeline data

### Key Design Decisions
1. **No new database tables** -- The Gantt view reads from existing job and worker tables. No data duplication.
2. **Estimates from history** -- Completion time estimates are based on historical averages for the same workflow and resolution tier.
3. **Canvas rendering for performance** -- With potentially 100+ jobs, Canvas/SVG rendering performs better than DOM-based chart libraries.
4. **Real-time via WebSocket** -- Job blocks grow, appear, and disappear in real time as the queue changes.

---

## Phase 1: Rust Backend -- Data Aggregation

### Task 1.1: Timeline Data Aggregator
**File:** `src/services/queue_timeline.rs`

Aggregate job and worker data into a timeline-friendly format.

```rust
pub struct TimelineData {
    pub workers: Vec<WorkerLane>,
    pub queued_jobs: Vec<QueuedJobBlock>,
    pub queue_drain_estimate_minutes: Option<f64>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct WorkerLane {
    pub worker_id: DbId,
    pub worker_name: String,
    pub status: String,
    pub current_job: Option<JobBlock>,
}

pub struct JobBlock {
    pub job_id: DbId,
    pub name: String,
    pub project_name: String,
    pub character_name: Option<String>,
    pub status: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub elapsed_seconds: i64,
    pub estimated_remaining_seconds: Option<i64>,
    pub progress_pct: Option<f32>,
    pub color: String,                 // based on project or priority
}

pub struct QueuedJobBlock {
    pub job_id: DbId,
    pub name: String,
    pub project_name: String,
    pub queue_position: i32,
    pub estimated_start: Option<chrono::DateTime<chrono::Utc>>,
    pub estimated_duration_seconds: Option<i64>,
    pub priority: i32,
}
```

**Acceptance Criteria:**
- [ ] Returns current state of all workers with running jobs
- [ ] Returns queued jobs with position and estimated start times
- [ ] Estimated queue drain time at current throughput
- [ ] Response in <500ms even with 100 queued jobs

### Task 1.2: Time Estimation Engine
**File:** `src/services/time_estimator.rs`

Predict job start and completion times based on historical data.

```rust
pub struct TimeEstimator {
    pool: PgPool,
}

impl TimeEstimator {
    pub async fn estimate_job_duration(
        &self,
        workflow_id: DbId,
        resolution_tier: &str,
    ) -> Option<Duration> {
        // Query historical averages for this workflow + resolution
        // Return median duration from last 30 days
    }

    pub async fn estimate_queue_start_time(
        &self,
        job_position: i32,
        current_jobs: &[JobBlock],
    ) -> Option<chrono::DateTime<chrono::Utc>> {
        // Sum estimated remaining times of all jobs ahead in queue
    }
}
```

**Acceptance Criteria:**
- [ ] Estimates based on historical averages for same workflow and resolution tier (PRD-61)
- [ ] Queue position message: "Your job is 4th in queue -- estimated start in ~12m"
- [ ] Aggregate estimate: "Queue will drain in ~2h 15m at current throughput"
- [ ] New workflows without history show "No estimate available"
- [ ] Estimates update in real time as jobs complete

---

## Phase 2: API Endpoints & WebSocket

### Task 2.1: Timeline Data Route
**File:** `src/routes/queue_timeline.rs`

```
GET /queue/timeline?zoom=6h
```

**Acceptance Criteria:**
- [ ] Returns full timeline data (workers, running jobs, queued jobs, estimates)
- [ ] Zoom parameter controls the time window (1h, 6h, 24h)
- [ ] Supports optional project filter

### Task 2.2: Priority Reorder Route
**File:** `src/routes/queue_timeline.rs`

```
POST /queue/reorder
```

Request body: `{ job_id: i64, new_position: i32 }`

**Acceptance Criteria:**
- [ ] Admin-only access
- [ ] Reorders the job in the queue
- [ ] Other jobs shift accordingly
- [ ] Broadcasts update to WebSocket subscribers
- [ ] Reorder takes effect within 1 second

### Task 2.3: Timeline WebSocket Channel
**File:** `src/websocket/queue_timeline_channel.rs`

Real-time updates for the timeline view.

```rust
pub enum TimelineEvent {
    JobStarted { job: JobBlock, worker_id: DbId },
    JobProgress { job_id: DbId, progress_pct: f32, elapsed_seconds: i64 },
    JobCompleted { job_id: DbId, worker_id: DbId },
    JobQueued { job: QueuedJobBlock },
    JobCancelled { job_id: DbId },
    WorkerStatusChanged { worker_id: DbId, status: String },
    QueueReordered { queue: Vec<QueuedJobBlock> },
}
```

**Acceptance Criteria:**
- [ ] Clients subscribe via WebSocket for live updates
- [ ] Events sent for: job start, progress, completion, queue, cancel, reorder
- [ ] Worker status changes reflected immediately
- [ ] Updates appear within 2 seconds of state changes

---

## Phase 3: React Frontend

### Task 3.1: Gantt Chart Component
**File:** `frontend/src/components/queue/GanttTimeline.tsx`

The main Gantt chart visualization.

**Acceptance Criteria:**
- [ ] Y-axis: GPU workers as separate lanes
- [ ] X-axis: time with configurable zoom (1h, 6h, 24h)
- [ ] Running jobs as colored blocks with name, elapsed, and remaining time
- [ ] "Now" line clearly visible
- [ ] Smooth horizontal scrolling with inertia
- [ ] Renders within 1 second for up to 100 jobs

### Task 3.2: Job Block Component
**File:** `frontend/src/components/queue/JobBlock.tsx`

Individual job block within the Gantt chart.

**Acceptance Criteria:**
- [ ] Color coding by project or priority (configurable)
- [ ] Shows: job name, scene/character, elapsed time, estimated remaining
- [ ] Click to see full job details (segment, workflow, parameters)
- [ ] Running jobs grow as segments complete (real-time animation)
- [ ] Completed jobs slide off the left edge

### Task 3.3: Queue Depth Panel
**File:** `frontend/src/components/queue/QueueDepthPanel.tsx`

Shows queued jobs with estimated start times.

**Acceptance Criteria:**
- [ ] Queued jobs as stacked blocks to the right of the "now" line
- [ ] Each block shows position, name, estimated start
- [ ] Queue drain estimate: "Queue will drain in ~2h 15m"
- [ ] Your job highlighted with position message

### Task 3.4: Admin Drag-and-Drop Controls
**File:** `frontend/src/components/queue/QueueReorderControls.tsx`

**Acceptance Criteria:**
- [ ] Admins can drag queued job blocks to reorder priority
- [ ] Right-click context menu: pause, cancel, re-prioritize
- [ ] Non-admin users see read-only timeline
- [ ] Drag feedback shows new estimated start times
- [ ] Reorder persists immediately via API call

### Task 3.5: Timeline Controls
**File:** `frontend/src/components/queue/TimelineControls.tsx`

**Acceptance Criteria:**
- [ ] Zoom controls: 1h, 6h, 24h buttons
- [ ] Color coding toggle: by project vs. by priority
- [ ] Auto-scroll toggle: follow "now" line
- [ ] Project filter dropdown

---

## Phase 4: Testing

### Task 4.1: Timeline Aggregation Tests
**File:** `tests/queue_timeline_test.rs`

**Acceptance Criteria:**
- [ ] Test timeline data includes all running and queued jobs
- [ ] Test time estimation returns reasonable values from historical data
- [ ] Test queue drain estimate calculation
- [ ] Test reorder updates queue positions correctly

### Task 4.2: WebSocket Update Tests
**File:** `tests/queue_timeline_ws_test.rs`

**Acceptance Criteria:**
- [ ] Test job start event updates timeline
- [ ] Test job completion removes from timeline
- [ ] Test reorder event updates all positions
- [ ] Test updates arrive within 2 seconds

---

## Relevant Files

| File | Description |
|------|-------------|
| `src/services/queue_timeline.rs` | Timeline data aggregator |
| `src/services/time_estimator.rs` | Duration and start time estimation |
| `src/routes/queue_timeline.rs` | Timeline API and reorder endpoint |
| `src/websocket/queue_timeline_channel.rs` | Real-time WebSocket events |
| `frontend/src/components/queue/GanttTimeline.tsx` | Main Gantt chart |
| `frontend/src/components/queue/JobBlock.tsx` | Job block rendering |
| `frontend/src/components/queue/QueueDepthPanel.tsx` | Queue depth display |
| `frontend/src/components/queue/QueueReorderControls.tsx` | Admin drag-and-drop |
| `frontend/src/components/queue/TimelineControls.tsx` | Zoom and filter controls |

## Dependencies

### Upstream PRDs
- PRD-08: Queue Management, PRD-46: Worker Pool, PRD-61: Cost Estimation

### Downstream PRDs
- PRD-89: Dashboard Widgets (compact mode), PRD-93: Budget Management

## Implementation Order

### MVP
1. Phase 1: Rust Backend (Tasks 1.1-1.2)
2. Phase 2: API & WebSocket (Tasks 2.1-2.3)
3. Phase 3: React Frontend (Tasks 3.1-3.5)

**MVP Success Criteria:**
- Timeline renders within 1 second for up to 100 jobs
- Estimated start times within 20% of actual
- Live updates appear within 2 seconds
- Drag-and-drop reordering takes effect within 1 second

### Post-MVP Enhancements
1. Phase 4: Testing (Tasks 4.1-4.2)
2. Historical view (PRD Requirement 2.1)
3. Compact mode as dashboard widget (PRD Requirement 2.2)

## Notes

1. **Canvas vs. SVG** -- For 100+ jobs, Canvas rendering will perform better than SVG. Consider using a library like `@nivo/gantt` or a custom Canvas renderer.
2. **Estimation accuracy** -- Estimates improve with more historical data. For the first week of operation, estimates will be rough. Display confidence indicators.
3. **Multi-GPU workers** -- The open question about vertical stacking for multi-GPU workers is deferred. Initially, each worker gets one lane regardless of GPU count.
4. **Timezone** -- The timeline should display in the user's local timezone, not UTC.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-090
