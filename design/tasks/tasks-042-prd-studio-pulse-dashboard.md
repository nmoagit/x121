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

## Phase 1: Database Schema [COMPLETE]

### Task 1.1: Dashboard Configuration Table [COMPLETE]
**File:** `apps/db/migrations/20260221000024_create_dashboard_configs.sql`

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
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [x] One config row per user (unique constraint on `user_id`)
- [x] `layout_json` stores widget positions and sizes
- [x] `widget_settings_json` stores per-widget instance configuration
- [x] Ready for PRD-89 to extend with presets and more settings

---

## Phase 2: Rust Backend -- Widget Data Endpoints [COMPLETE]

### Task 2.1: Active Tasks Widget Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/dashboard.rs`

```
GET /dashboard/widgets/active-tasks
```

Returns all running, queued, and recently completed jobs.

**Acceptance Criteria:**
- [x] Returns running jobs with progress percentage and elapsed time
- [x] Returns queued jobs with queue position
- [x] Returns recently completed jobs (last N, configurable via `recent_completed` param)
- [x] Each item includes worker assignment and submission info
- [x] Response in <500ms

### Task 2.2: Project Progress Widget Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/dashboard.rs`

```
GET /dashboard/widgets/project-progress
```

Returns per-project completion tracking.

**Acceptance Criteria:**
- [x] Progress bar data: scenes approved / total scenes
- [x] Color coding: green (>75% on track), yellow (50-75%), red (<50% or blocked)
- [x] Only shows active projects (not archived/closed)

### Task 2.3: Disk Health Widget Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/dashboard.rs`

```
GET /dashboard/widgets/disk-health
```

Returns storage capacity and usage.

**Acceptance Criteria:**
- [x] Current disk usage vs. capacity with percentage
- [x] Warning at 80%, critical at 90%
- [x] Reads from filesystem stats (libc::statvfs), not database

### Task 2.4: Activity Feed Widget Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/dashboard.rs`

```
GET /dashboard/widgets/activity-feed?limit=50&category=job&project_id=1
```

Returns chronological event stream.

**Acceptance Criteria:**
- [x] Recent events: job completions, approvals, rejections, comments, system events
- [x] Filterable by event category and project
- [x] Paginated with limit/offset
- [x] Each event includes navigation context (entity type/id for click-through)

### Task 2.5: Dashboard Config CRUD [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/dashboard.rs`

```
GET /user/dashboard                    -- Get current user's dashboard config
PUT /user/dashboard                    -- Save dashboard config
```

**Acceptance Criteria:**
- [x] Returns default layout if no config exists for user
- [x] Saves layout and widget settings per user (upsert)
- [x] Default layout follows PRD grid spec

---

## Phase 3: WebSocket Real-Time Layer

> **Note:** Phase 3 is deferred. The MVP uses polling (30s widget data, 60s disk health) via
> TanStack Query `refetchInterval`. WebSocket real-time push will be added in a follow-up
> when PRD-89 (Dashboard Widget Customization) is implemented, as that PRD requires the
> same WebSocket infrastructure.

### Task 3.1: Dashboard WebSocket Channel
**File:** `src/websocket/dashboard_channel.rs` (deferred)

**Acceptance Criteria:**
- [ ] Clients connect via WebSocket and receive dashboard events
- [ ] Events mapped from PRD-10 event bus to dashboard-specific types
- [ ] Client can subscribe to specific widget channels (active-tasks, activity-feed, etc.)
- [ ] Connection cleanup on disconnect
- [ ] Events delivered within 1 second of occurrence

### Task 3.2: Event Bus to Dashboard Bridge
**File:** `src/services/dashboard_event_bridge.rs` (deferred)

**Acceptance Criteria:**
- [ ] Subscribes to relevant PRD-10 event types
- [ ] Maps events to dashboard-specific event format
- [ ] Broadcasts to connected WebSocket clients
- [ ] Handles client filtering (only send events relevant to user's widget configuration)

---

## Phase 4: React Frontend [COMPLETE]

### Task 4.1: Dashboard Layout Container [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/StudioPulse.tsx`

The main dashboard page with responsive grid layout.

**Acceptance Criteria:**
- [x] Responsive grid layout fitting common screen resolutions (1/2/4 column breakpoints)
- [x] Default layout shows all four core widgets
- [x] Serves as the platform landing page after login
- [x] Uses design system Card/Stack components (PRD-29)

### Task 4.2: Active Tasks Widget [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/widgets/ActiveTasksWidget.tsx`

**Acceptance Criteria:**
- [x] Shows running, queued, and recently completed jobs
- [x] Per-job: type, status badge, progress bar, elapsed time, worker
- [x] Auto-refresh via polling (30s interval)

### Task 4.3: Project Progress Widget [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/widgets/ProjectProgressWidget.tsx`

**Acceptance Criteria:**
- [x] Progress bar per active project
- [x] Color-coded status indicator (green/yellow/red)
- [x] Fraction display: "8/10 scenes"

### Task 4.4: Disk Health Widget [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/widgets/DiskHealthWidget.tsx`

**Acceptance Criteria:**
- [x] Visual SVG gauge showing usage percentage
- [x] Color changes at warning (80%) and critical (90%) thresholds
- [x] Used/free/total capacity display with formatBytes

### Task 4.5: Activity Feed Widget [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/widgets/ActivityFeedWidget.tsx`

**Acceptance Criteria:**
- [x] Chronological list of recent events
- [x] Event type icons (completion, approval, rejection, system)
- [x] Filter controls by event category via Select dropdown
- [x] Auto-refresh via polling (30s interval)

### Task 4.6: Widget Base Component [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/WidgetBase.tsx`

**Acceptance Criteria:**
- [x] Consistent header with title, optional icon, and action buttons
- [x] Loading state with Spinner
- [x] Error state with retry button
- [x] Standard card styling from design system
- [x] Provides foundation for PRD-89 widget customization

---

## Phase 5: Testing [PARTIAL]

### Task 5.1: Frontend Widget Tests [COMPLETE]
**File:** `apps/frontend/src/features/dashboard/__tests__/StudioPulse.test.tsx`

**Acceptance Criteria:**
- [x] Test dashboard renders title and all four widget headers
- [x] Test active task data renders when loaded
- [x] Test project progress data renders with scene counts
- [x] Test disk health gauge renders usage percentage
- [x] Test activity feed events render
- [x] Test loading spinners appear initially
- [x] All 7 tests pass

### Task 5.2: Backend Endpoint Tests (deferred)
**File:** `tests/dashboard_widgets_test.rs`

**Acceptance Criteria:**
- [ ] Test active tasks returns correct job statuses
- [ ] Test project progress calculation accuracy
- [ ] Test disk health threshold detection
- [ ] Test activity feed pagination and filtering

### Task 5.3: WebSocket Integration Tests (deferred)
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
| `apps/db/migrations/20260221000024_create_dashboard_configs.sql` | Per-user dashboard config table |
| `apps/backend/crates/db/src/models/dashboard.rs` | DashboardConfig model + SaveDashboardConfig DTO |
| `apps/backend/crates/db/src/repositories/dashboard_repo.rs` | DashboardRepo (find_by_user, upsert) |
| `apps/backend/crates/api/src/handlers/dashboard.rs` | Widget data endpoints + config CRUD |
| `apps/backend/crates/api/src/routes/dashboard.rs` | Route definitions (/dashboard/*, /user/dashboard) |
| `apps/frontend/src/features/dashboard/StudioPulse.tsx` | Main dashboard page |
| `apps/frontend/src/features/dashboard/WidgetBase.tsx` | Shared widget container |
| `apps/frontend/src/features/dashboard/widgets/ActiveTasksWidget.tsx` | Active tasks widget |
| `apps/frontend/src/features/dashboard/widgets/ProjectProgressWidget.tsx` | Project progress widget |
| `apps/frontend/src/features/dashboard/widgets/DiskHealthWidget.tsx` | Disk health widget |
| `apps/frontend/src/features/dashboard/widgets/ActivityFeedWidget.tsx` | Activity feed widget |
| `apps/frontend/src/features/dashboard/hooks/use-dashboard.ts` | TanStack Query hooks for all endpoints |
| `apps/frontend/src/features/dashboard/__tests__/StudioPulse.test.tsx` | 7 frontend tests (all passing) |

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
- **v2.0** (2026-02-21): MVP implementation complete (Phases 1, 2, 4, 5.1). Phase 3 (WebSocket) deferred to PRD-89.
