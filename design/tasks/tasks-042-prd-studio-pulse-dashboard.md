# Task List: Studio Pulse Dashboard

**PRD Reference:** `design/prds/042-prd-studio-pulse-dashboard.md`
**Scope:** Build the studio "Command Center" -- a real-time dashboard with widgets for active tasks, project progress, disk health, and activity feed, serving as the default landing page and consuming live events from the event bus.

## Overview

The Studio Pulse Dashboard is the first thing every user sees after login. It provides real-time visibility into active generation jobs, per-project progress, disk health, and a chronological activity feed. It consumes events from the PRD-10 event bus via WebSocket to deliver live updates without manual refresh. This PRD establishes the widget framework that PRD-89 later extends with customization and drag-and-drop layout.

### What Already Exists
- PRD-10 Event Bus for real-time event streaming
- PRD-29 Design System for Card/Grid components
- Job, project, and worker tables from earlier PRDs

### What We're Building
1. Database table for per-user dashboard configuration
2. Rust API endpoints for each widget's data aggregation
3. WebSocket subscription layer for real-time widget updates
4. React widget framework with four core widgets
5. Responsive grid layout serving as the platform landing page

### Key Design Decisions
1. **Widget framework first** -- Even though this PRD has a fixed layout, the widget system is designed for extensibility. Each widget is a self-contained React component with a standard data interface.
2. **WebSocket for real-time** -- Widgets subscribe to relevant event bus channels via WebSocket. No polling.
3. **Server-side aggregation** -- Widget data is aggregated server-side per endpoint, not assembled from raw data on the client.
4. **Layout stored per-user** -- Even for the fixed MVP layout, the `dashboard_config` table stores the layout per user, ready for PRD-89 customization.

---

## Phase 1: Database Schema

### Task 1.1: Dashboard Configuration Table
**File:** `migrations/YYYYMMDDHHMMSS_create_dashboard_config.sql`

```sql
CREATE TABLE dashboard_configs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    layout_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    widget_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_dashboard_configs_user_id ON dashboard_configs(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One config row per user (unique constraint on `user_id`)
- [ ] `layout_json` stores widget positions and sizes
- [ ] `widget_settings_json` stores per-widget instance configuration
- [ ] Ready for PRD-89 to extend with presets and more settings

---

## Phase 2: Rust Backend -- Widget Data Endpoints

### Task 2.1: Active Tasks Widget Endpoint
**File:** `src/routes/dashboard.rs`

```
GET /dashboard/widgets/active-tasks
```

Returns all running, queued, and recently completed jobs.

```rust
#[derive(Serialize)]
pub struct ActiveTaskItem {
    pub job_id: DbId,
    pub name: String,
    pub status: String,
    pub progress_pct: Option<f32>,
    pub elapsed_seconds: i64,
    pub worker_name: Option<String>,
    pub project_name: String,
}
```

**Acceptance Criteria:**
- [ ] Returns running jobs with progress percentage and elapsed time
- [ ] Returns queued jobs with queue position
- [ ] Returns recently completed jobs (last N, configurable)
- [ ] Each item includes worker assignment and project name
- [ ] Response in <500ms

### Task 2.2: Project Progress Widget Endpoint
**File:** `src/routes/dashboard.rs`

```
GET /dashboard/widgets/project-progress
```

Returns per-project completion tracking.

```rust
#[derive(Serialize)]
pub struct ProjectProgressItem {
    pub project_id: DbId,
    pub project_name: String,
    pub scenes_approved: i32,
    pub scenes_total: i32,
    pub progress_pct: f32,
    pub status_color: String,          // "green", "yellow", "red"
}
```

**Acceptance Criteria:**
- [ ] Progress bar data: scenes approved / total scenes
- [ ] Color coding: green (>75% on track), yellow (50-75%), red (<50% or blocked)
- [ ] Only shows active projects (not archived/closed)

### Task 2.3: Disk Health Widget Endpoint
**File:** `src/routes/dashboard.rs`

```
GET /dashboard/widgets/disk-health
```

Returns storage capacity and usage breakdown.

```rust
#[derive(Serialize)]
pub struct DiskHealthData {
    pub total_bytes: i64,
    pub used_bytes: i64,
    pub usage_pct: f32,
    pub warning_threshold: f32,        // 0.8
    pub critical_threshold: f32,       // 0.9
    pub breakdown: Vec<DiskBreakdownItem>,
}

#[derive(Serialize)]
pub struct DiskBreakdownItem {
    pub category: String,              // "videos", "images", "temp", "other"
    pub bytes: i64,
}
```

**Acceptance Criteria:**
- [ ] Current disk usage vs. capacity with percentage
- [ ] Warning at 80%, critical at 90%
- [ ] Breakdown by file type (videos, images, temp files)
- [ ] Reads from filesystem stats, not database

### Task 2.4: Activity Feed Widget Endpoint
**File:** `src/routes/dashboard.rs`

```
GET /dashboard/widgets/activity-feed?limit=50&type=all&project_id=
```

Returns chronological event stream.

```rust
#[derive(Serialize)]
pub struct ActivityFeedItem {
    pub id: DbId,
    pub event_type: String,
    pub message: String,
    pub actor_name: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub project_name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Recent events: job completions, approvals, rejections, comments, system events
- [ ] Filterable by event type, project, or user
- [ ] Paginated with cursor-based pagination
- [ ] Each event includes navigation context (entity type/id for click-through)

### Task 2.5: Dashboard Config CRUD
**File:** `src/routes/dashboard.rs`

```
GET /user/dashboard                    -- Get current user's dashboard config
PUT /user/dashboard                    -- Save dashboard config
```

**Acceptance Criteria:**
- [ ] Returns default layout if no config exists for user
- [ ] Saves layout and widget settings per user
- [ ] Validation of layout_json structure

---

## Phase 3: WebSocket Real-Time Layer

### Task 3.1: Dashboard WebSocket Channel
**File:** `src/websocket/dashboard_channel.rs`

WebSocket subscription for real-time dashboard updates.

```rust
pub enum DashboardEvent {
    JobStatusChanged { job_id: DbId, status: String, progress_pct: Option<f32> },
    JobCompleted { job_id: DbId, project_name: String },
    SceneApproved { scene_id: DbId, project_name: String },
    ActivityEvent { event: ActivityFeedItem },
    DiskHealthUpdate { usage_pct: f32 },
}
```

**Acceptance Criteria:**
- [ ] Clients connect via WebSocket and receive dashboard events
- [ ] Events mapped from PRD-10 event bus to dashboard-specific types
- [ ] Client can subscribe to specific widget channels (active-tasks, activity-feed, etc.)
- [ ] Connection cleanup on disconnect
- [ ] Events delivered within 1 second of occurrence

### Task 3.2: Event Bus to Dashboard Bridge
**File:** `src/services/dashboard_event_bridge.rs`

Translates PRD-10 events into dashboard widget updates.

**Acceptance Criteria:**
- [ ] Subscribes to relevant PRD-10 event types
- [ ] Maps events to dashboard-specific event format
- [ ] Broadcasts to connected WebSocket clients
- [ ] Handles client filtering (only send events relevant to user's widget configuration)

---

## Phase 4: React Frontend

### Task 4.1: Dashboard Layout Container
**File:** `frontend/src/pages/Dashboard.tsx`

The main dashboard page with responsive grid layout.

**Acceptance Criteria:**
- [ ] Responsive grid layout fitting common screen resolutions
- [ ] Default layout shows all four core widgets
- [ ] Serves as the platform landing page after login
- [ ] Uses design system Grid/Card components (PRD-29)

### Task 4.2: Active Tasks Widget
**File:** `frontend/src/components/dashboard/ActiveTasksWidget.tsx`

**Acceptance Criteria:**
- [ ] Shows running, queued, and recently completed jobs
- [ ] Per-job: name, status badge, progress bar, elapsed time, worker
- [ ] Click navigates to job detail view
- [ ] Real-time updates via WebSocket (new jobs appear, progress updates)

### Task 4.3: Project Progress Widget
**File:** `frontend/src/components/dashboard/ProjectProgressWidget.tsx`

**Acceptance Criteria:**
- [ ] Progress bar per active project
- [ ] Color-coded status indicator (green/yellow/red)
- [ ] Click navigates to project detail view
- [ ] Fraction display: "12/18 scenes approved"

### Task 4.4: Disk Health Widget
**File:** `frontend/src/components/dashboard/DiskHealthWidget.tsx`

**Acceptance Criteria:**
- [ ] Visual gauge showing usage percentage
- [ ] Color changes at warning (80%) and critical (90%) thresholds
- [ ] Breakdown chart by file type
- [ ] Link to disk reclamation (PRD-15) when threshold exceeded

### Task 4.5: Activity Feed Widget
**File:** `frontend/src/components/dashboard/ActivityFeedWidget.tsx`

**Acceptance Criteria:**
- [ ] Chronological list of recent events
- [ ] Event type icons (completion, approval, rejection, system)
- [ ] Filter controls by event type and project
- [ ] New events animate in at the top via WebSocket
- [ ] Click any event navigates to the relevant entity

### Task 4.6: Widget Base Component
**File:** `frontend/src/components/dashboard/WidgetBase.tsx`

Shared widget container component that all widgets extend.

```tsx
interface WidgetBaseProps {
    title: string;
    icon?: ReactNode;
    loading?: boolean;
    error?: string;
    headerActions?: ReactNode;
    children: ReactNode;
}
```

**Acceptance Criteria:**
- [ ] Consistent header with title, optional icon, and action buttons
- [ ] Loading state with skeleton
- [ ] Error state with retry button
- [ ] Standard card styling from design system
- [ ] Provides foundation for PRD-89 widget customization

---

## Phase 5: Testing

### Task 5.1: Widget Endpoint Tests
**File:** `tests/dashboard_widgets_test.rs`

**Acceptance Criteria:**
- [ ] Test active tasks returns correct job statuses
- [ ] Test project progress calculation accuracy
- [ ] Test disk health threshold detection
- [ ] Test activity feed pagination and filtering
- [ ] All endpoints respond in <500ms

### Task 5.2: WebSocket Integration Tests
**File:** `tests/dashboard_websocket_test.rs`

**Acceptance Criteria:**
- [ ] Test WebSocket connection establishment
- [ ] Test event delivery for job status changes
- [ ] Test client disconnection cleanup
- [ ] Test event appears within 1 second of occurrence

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_dashboard_config.sql` | Per-user dashboard configuration |
| `src/routes/dashboard.rs` | Widget data endpoints and config CRUD |
| `src/websocket/dashboard_channel.rs` | WebSocket real-time layer |
| `src/services/dashboard_event_bridge.rs` | Event bus to dashboard translation |
| `frontend/src/pages/Dashboard.tsx` | Main dashboard page |
| `frontend/src/components/dashboard/WidgetBase.tsx` | Shared widget container |
| `frontend/src/components/dashboard/ActiveTasksWidget.tsx` | Active tasks widget |
| `frontend/src/components/dashboard/ProjectProgressWidget.tsx` | Project progress widget |
| `frontend/src/components/dashboard/DiskHealthWidget.tsx` | Disk health widget |
| `frontend/src/components/dashboard/ActivityFeedWidget.tsx` | Activity feed widget |

## Dependencies

### Upstream PRDs
- PRD-10: Event Bus for real-time events
- PRD-29: Design System for UI components

### Downstream PRDs
- PRD-53: First-Run Onboarding checklist widget
- PRD-56: Studio Wiki pinned articles
- PRD-57: Batch Orchestrator status widget
- PRD-73: Production Reporting widgets
- PRD-89: Dashboard Widget Customization

## Implementation Order

### MVP
1. Phase 1: Database Schema (Task 1.1)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: WebSocket Real-Time Layer (Tasks 3.1-3.2)
4. Phase 4: React Frontend (Tasks 4.1-4.6)

**MVP Success Criteria:**
- Dashboard loads in <2 seconds with all widgets
- Real-time updates appear within 1 second of event occurrence
- Dashboard serves as the effective studio command center
- Widget framework is extensible for PRD-89

### Post-MVP Enhancements
1. Phase 5: Testing (Tasks 5.1-5.2)
2. Widget auto-refresh configuration (PRD Requirement 2.1)

## Notes

1. **Widget framework extensibility** -- The `WidgetBase` component and data endpoint pattern must be designed for PRD-89 to add new widgets without modifying existing code.
2. **Default layout** -- The default grid layout should be: Active Tasks (top-left, 2 columns), Project Progress (top-right, 2 columns), Disk Health (bottom-left, 1 column), Activity Feed (bottom-right, 3 columns).
3. **Activity feed retention** -- The activity feed widget should show the most recent 50 events by default, with scroll-to-load-more pagination.
4. **Disk health polling** -- Disk usage cannot be pushed via event bus (it is filesystem state). Poll every 60 seconds and push updates via WebSocket.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-042
