# Task List: System Status Footer Bar

**PRD Reference:** `design/prds/117-prd-system-status-footer-bar.md`
**Scope:** Build a persistent, IDE-style status footer bar pinned to the bottom of the app shell showing compact service health, cloud GPU state, active jobs, and running workflows. Includes a lightweight backend summary API, role-based segment visibility, collapsible state, and real-time updates via the event bus.

## Overview

Creators currently have no passive operational awareness while working — they must navigate away to dashboards (PRD-42, PRD-80, PRD-46) or open the Job Tray (PRD-54) to check status. This PRD adds a single-line footer bar (28–32px) at the bottom of every page with four compact segments: **service health** (admin only), **cloud GPU** (admin only), **active jobs** (all roles), and **active workflows** (all roles). Each segment is clickable, navigating to the relevant detail view. A single lightweight API endpoint (`GET /api/v1/status/footer`) returns all footer data to avoid N+1 calls.

### What Already Exists
- `AppShell.tsx` (`apps/frontend/src/app/AppShell.tsx`) — app shell layout with `<Header>`, `<Sidebar>`, `<main>`, no footer yet
- `useJobStatusAggregator` (`apps/frontend/src/features/job-tray/useJobStatusAggregator.ts`) — Zustand store providing `runningCount`, `queuedCount`, `overallProgress`
- `useEventBus` (`apps/frontend/src/hooks/useEventBus.ts`) — shared event bus subscription hook
- `useAuthStore` (`apps/frontend/src/stores/auth-store.ts`) — provides `user.role` for admin checks
- Worker types (`apps/frontend/src/features/workers/types.ts`) — `WORKER_STATUS`, `FleetStats`, `WORKER_STATUS_LABELS`
- Design system tokens — `--color-status-success`, `--color-status-warning`, `--color-status-danger`
- `Badge` and `Tooltip` components in `apps/frontend/src/components/primitives/`
- Health endpoint (`apps/backend/crates/api/src/routes/health.rs`) — `GET /health` with DB check
- `AppState` (`apps/backend/crates/api/src/state.rs`) — has `pool`, `comfyui_manager`, `event_bus`, `ws_manager`
- `RequireAdmin` middleware (`apps/backend/crates/api/src/middleware/rbac.rs`) — RBAC extractor for admin-only routes
- `DataResponse<T>` (`apps/backend/crates/api/src/response.rs`) — standard `{ data: T }` envelope

### What We're Building
1. Backend `GET /api/v1/status/footer` endpoint aggregating cached health data
2. Backend health aggregator service collecting service states every 30s
3. `StatusFooter` component in the app shell
4. `useFooterStatus` hook combining the summary API, existing job store, and event bus
5. Four footer segment components (ServiceHealth, CloudGpu, ActiveJobs, ActiveWorkflows)
6. Collapsible footer with localStorage persistence
7. Tests for backend endpoint and frontend components

### Key Design Decisions
1. **No new database tables** — All data is sourced from existing tables, in-memory caches, and service checks. The footer summary endpoint reads cached data, never live-probes on each request.
2. **Reuse `useJobStatusAggregator`** — The active jobs segment reads from the existing Zustand store, sharing state with PRD-54 Job Tray. Zero duplication.
3. **Single API call on mount** — Frontend fetches `GET /api/v1/status/footer` once on mount for initial state, then relies on event bus for real-time updates with 30s polling fallback.
4. **Role-based segment rendering** — Admin-only segments (services, cloud GPU) are conditionally rendered based on `useAuthStore` role. Backend also omits admin fields for non-admin requesters.
5. **Footer is part of app shell** — `StatusFooter.tsx` lives in `apps/frontend/src/app/`, not in `features/`, because it is a global layout component.

---

## Phase 1: Backend — Status Footer Endpoint

### Task 1.1: Create health aggregator service
**File:** `apps/backend/crates/api/src/engine/health_aggregator.rs`

Create an in-memory health aggregator that periodically polls platform services and caches their status. This runs as a background Tokio task, refreshing every 30 seconds.

```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::Serialize;
use chrono::{DateTime, Utc};

/// Cached status of a single service.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    pub status: &'static str,  // "healthy", "degraded", "down"
    pub latency_ms: Option<u32>,
    pub checked_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Cached cloud GPU summary.
#[derive(Debug, Clone, Serialize)]
pub struct CloudGpuStatus {
    pub active_pods: u32,
    pub cost_per_hour_cents: u32,
    pub budget_status: &'static str,  // "within_budget", "approaching_cap", "exceeded"
}

/// Cached workflow summary.
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowStatus {
    pub active: u32,
    pub current_stage: Option<String>,
}

/// All footer data, cached in memory.
#[derive(Debug, Clone, Serialize)]
pub struct FooterSnapshot {
    pub services: FooterServices,
    pub cloud_gpu: CloudGpuStatus,
    pub workflows: WorkflowStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct FooterServices {
    pub comfyui: ServiceStatus,
    pub database: ServiceStatus,
    pub workers: ServiceStatus,
}

/// In-memory cache refreshed by background task.
pub struct HealthAggregator {
    snapshot: Arc<RwLock<FooterSnapshot>>,
}

impl HealthAggregator {
    pub fn new() -> Self { /* ... */ }

    /// Read the current cached snapshot (lock-free read via RwLock).
    pub async fn snapshot(&self) -> FooterSnapshot { /* ... */ }

    /// Start background polling loop. Called once at server startup.
    pub fn start_polling(self: Arc<Self>, pool: DbPool, comfyui: Arc<ComfyUIManager>) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                self.refresh(&pool, &comfyui).await;
            }
        });
    }

    /// Single refresh cycle: probe DB, ComfyUI, workers, cloud GPU.
    async fn refresh(&self, pool: &DbPool, comfyui: &ComfyUIManager) { /* ... */ }
}
```

**Acceptance Criteria:**
- [ ] `HealthAggregator` stores a `FooterSnapshot` behind `Arc<RwLock<_>>`
- [ ] `snapshot()` returns the current cached data without blocking
- [ ] `refresh()` probes: DB (via `sqlx::query("SELECT 1")`), ComfyUI (via manager connection state), workers (via `WorkerRepo::fleet_stats`)
- [ ] Cloud GPU data stubbed (returns zeros) until PRD-114 is implemented
- [ ] Workflow data stubbed (returns zeros) until PRD-07 pipeline tracking is implemented
- [ ] Background polling starts on server boot via `start_polling()`
- [ ] Polling interval is 30 seconds
- [ ] Errors during probe result in `"degraded"` or `"down"` status, not panics

### Task 1.2: Register health aggregator in AppState
**File:** `apps/backend/crates/api/src/state.rs` (modify)

Add the `HealthAggregator` to `AppState` so handlers can access the cached snapshot.

```rust
pub struct AppState {
    pub pool: x121_db::DbPool,
    pub config: Arc<ServerConfig>,
    pub ws_manager: Arc<WsManager>,
    pub comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>,
    pub event_bus: Arc<x121_events::EventBus>,
    pub script_orchestrator: Option<Arc<ScriptOrchestrator>>,
    // NEW:
    pub health_aggregator: Arc<HealthAggregator>,
}
```

**Acceptance Criteria:**
- [ ] `AppState` includes `pub health_aggregator: Arc<HealthAggregator>`
- [ ] `HealthAggregator` initialized and polling started in `main.rs` before server bind
- [ ] All existing handlers unaffected (field addition only)
- [ ] Code compiles

### Task 1.3: Create footer status handler
**File:** `apps/backend/crates/api/src/handlers/status.rs` (new)

```rust
use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Response for GET /api/v1/status/footer.
#[derive(Debug, Serialize)]
pub struct FooterStatusResponse {
    /// Admin-only: service health indicators. Null for non-admin users.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub services: Option<FooterServices>,
    /// Admin-only: cloud GPU summary. Null for non-admin users.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_gpu: Option<CloudGpuStatus>,
    /// All roles: active job counts and overall progress.
    pub jobs: FooterJobsResponse,
    /// All roles: active workflow count and current stage.
    pub workflows: WorkflowStatus,
}

#[derive(Debug, Serialize)]
pub struct FooterJobsResponse {
    pub running: u32,
    pub queued: u32,
    pub overall_progress: u32,
}

/// GET /api/v1/status/footer
pub async fn get_footer_status(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<DataResponse<FooterStatusResponse>>> {
    let snapshot = state.health_aggregator.snapshot().await;
    let is_admin = auth.role == "admin";

    let jobs = get_job_counts(&state.pool).await?;

    let response = FooterStatusResponse {
        services: if is_admin { Some(snapshot.services) } else { None },
        cloud_gpu: if is_admin { Some(snapshot.cloud_gpu) } else { None },
        jobs,
        workflows: snapshot.workflows,
    };

    Ok(Json(DataResponse { data: response }))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/status/footer` requires authentication (via `AuthUser` extractor)
- [ ] `services` and `cloud_gpu` fields omitted (null) when requester is not admin
- [ ] `jobs` section populated from job counts (queried from job table or cached)
- [ ] `workflows` section populated from cached health aggregator snapshot
- [ ] Endpoint responds in <50ms (reads from cache, no live probes)
- [ ] Handler registered in `handlers/mod.rs` as `pub mod status;`
- [ ] Response follows `DataResponse<T>` envelope pattern

### Task 1.4: Create footer status route
**File:** `apps/backend/crates/api/src/lib.rs` (modify route tree)

Add the status footer route to the API route tree.

```rust
// Under /api/v1/status
.route("/api/v1/status/footer", get(handlers::status::get_footer_status))
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/status/footer` is registered in the route tree
- [ ] Route requires authentication (all authenticated users can access)
- [ ] Route does NOT require admin (admin-only filtering happens in handler logic)
- [ ] Route tree comment updated to include new endpoint

---

## Phase 2: Frontend — Footer Status Hook & Types

### Task 2.1: Create footer status types
**File:** `apps/frontend/src/app/footer/types.ts` (new)

Define TypeScript types matching the backend `FooterStatusResponse`.

```typescript
export type ServiceHealth = "healthy" | "degraded" | "down";

export interface ServiceStatusInfo {
  status: ServiceHealth;
  latency_ms: number | null;
  checked_at: string;
  detail?: string;
}

export interface FooterServices {
  comfyui: ServiceStatusInfo;
  database: ServiceStatusInfo;
  workers: ServiceStatusInfo;
}

export interface CloudGpuInfo {
  active_pods: number;
  cost_per_hour_cents: number;
  budget_status: "within_budget" | "approaching_cap" | "exceeded";
}

export interface FooterJobsInfo {
  running: number;
  queued: number;
  overall_progress: number;
}

export interface WorkflowInfo {
  active: number;
  current_stage: string | null;
}

export interface FooterStatusData {
  services: FooterServices | null;
  cloud_gpu: CloudGpuInfo | null;
  jobs: FooterJobsInfo;
  workflows: WorkflowInfo;
}
```

**Acceptance Criteria:**
- [ ] Types match the backend `FooterStatusResponse` shape exactly
- [ ] `services` and `cloud_gpu` are nullable (omitted for non-admin)
- [ ] All types exported for use by hook and components
- [ ] No duplicate type definitions (reuses nothing from worker types since the shape is different)

### Task 2.2: Create `useFooterStatus` hook
**File:** `apps/frontend/src/app/footer/useFooterStatus.ts` (new)

Aggregates data from the summary API, the existing job store, and event bus subscriptions.

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useJobStatusAggregator } from "@/features/job-tray/useJobStatusAggregator";
import { useAuthStore } from "@/stores/auth-store";
import { useEventBus } from "@/hooks/useEventBus";
import type { FooterStatusData } from "./types";

export function useFooterStatus() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const jobSummary = useJobStatusAggregator();

  // Fetch initial footer status from API, poll every 30s as fallback
  const { data: footerData } = useQuery({
    queryKey: ["status", "footer"],
    queryFn: () => api.get<FooterStatusData>("/status/footer"),
    refetchInterval: 30_000,
  });

  // Subscribe to real-time events for service health changes
  // (invalidate query on events for immediate updates)
  // useEventBus("service.health_changed", () => queryClient.invalidate...)

  return {
    services: footerData?.services ?? null,
    cloudGpu: footerData?.cloud_gpu ?? null,
    jobs: {
      running: jobSummary.runningCount,
      queued: jobSummary.queuedCount,
      overallProgress: jobSummary.overallProgress,
    },
    workflows: footerData?.workflows ?? { active: 0, current_stage: null },
    isAdmin,
  };
}
```

**Acceptance Criteria:**
- [ ] Reuses `useJobStatusAggregator()` from PRD-54 for job data — does NOT create a parallel store
- [ ] Fetches `GET /api/v1/status/footer` via TanStack Query with 30s refetch interval
- [ ] Subscribes to event bus for `service.health_changed` and `workflow.status_changed` events
- [ ] Returns combined object with `services`, `cloudGpu`, `jobs`, `workflows`, and `isAdmin`
- [ ] Non-admin users get `services: null` and `cloudGpu: null` from API (no client-side filtering needed)

---

## Phase 3: Frontend — Footer Bar Component

### Task 3.1: Create `StatusFooter` component
**File:** `apps/frontend/src/app/StatusFooter.tsx` (new)

The main footer bar component rendered inside `AppShell`.

```typescript
export function StatusFooter() {
  const status = useFooterStatus();
  const [collapsed, setCollapsed] = useFooterCollapse();

  if (collapsed) {
    return <CollapsedFooter onExpand={() => setCollapsed(false)} hasAlert={...} />;
  }

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t
      border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]
      px-2 text-[length:var(--font-size-xs)]">
      <div className="flex items-center gap-0">
        {status.isAdmin && <ServiceHealthSegment services={status.services} />}
        {status.isAdmin && <CloudGpuSegment cloudGpu={status.cloudGpu} />}
        <WorkflowSegment workflows={status.workflows} />
      </div>
      <div className="flex items-center gap-0">
        <JobSegment jobs={status.jobs} />
        <CollapseToggle onCollapse={() => setCollapsed(true)} />
      </div>
    </footer>
  );
}
```

**Acceptance Criteria:**
- [ ] Footer bar renders at 28px height (h-7), pinned below `<main>`
- [ ] Background uses `--color-surface-secondary` with top border `--color-border-default`
- [ ] Text uses `--font-size-xs` (11px)
- [ ] Left-aligned: service health, cloud GPU, workflows
- [ ] Right-aligned: active jobs, collapse toggle
- [ ] Admin-only segments conditionally rendered based on role
- [ ] Does not overlap or obscure content — `<main>` height adjusts via flex layout
- [ ] Named export, no default export

### Task 3.2: Create `ServiceHealthSegment` component
**File:** `apps/frontend/src/app/footer/ServiceHealthSegment.tsx` (new)

Compact service health indicators with colored dots.

```typescript
export function ServiceHealthSegment({ services }: { services: FooterServices | null }) {
  if (!services) return null;

  return (
    <FooterSegment href="/admin/health" tooltip="Service Health">
      <StatusDot status={services.comfyui.status} /> ComfyUI
      <Separator />
      <StatusDot status={services.database.status} /> DB
      <Separator />
      <StatusDot status={services.workers.status} /> Workers
    </FooterSegment>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows colored dot + label for ComfyUI, DB, and Workers
- [ ] Dot colors: green (`--color-status-success`) = healthy, yellow (`--color-status-warning`) = degraded, red (`--color-status-danger`) = down
- [ ] Uses design system status tokens — does NOT hardcode hex values
- [ ] Clicking navigates to `/admin/health` (PRD-80 System Health Page)
- [ ] Tooltip on hover shows last-checked timestamp and latency
- [ ] Only renders for admin users (parent handles this)

### Task 3.3: Create `CloudGpuSegment` component
**File:** `apps/frontend/src/app/footer/CloudGpuSegment.tsx` (new)

Compact cloud GPU resource display.

```typescript
export function CloudGpuSegment({ cloudGpu }: { cloudGpu: CloudGpuInfo | null }) {
  if (!cloudGpu) return null;

  const label = cloudGpu.active_pods > 0
    ? `${cloudGpu.active_pods} pods · $${(cloudGpu.cost_per_hour_cents / 100).toFixed(2)}/hr`
    : "No GPUs";

  return (
    <FooterSegment href="/admin/cloud-gpu" tooltip="Cloud GPU Status">
      <Cloud size={14} /> {label}
    </FooterSegment>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows active pod count and cost rate when pods are active
- [ ] Shows "No GPUs" when no pods are active
- [ ] Color coding: green = within budget, yellow = approaching cap, red = exceeded
- [ ] Clicking navigates to `/admin/cloud-gpu` (PRD-114 Cloud GPU dashboard)
- [ ] Only renders for admin users

### Task 3.4: Create `JobSegment` component
**File:** `apps/frontend/src/app/footer/JobSegment.tsx` (new)

Compact active jobs display with mini progress bar. Reuses data from the existing `useJobStatusAggregator`.

```typescript
export function JobSegment({ jobs }: { jobs: { running: number; queued: number; overallProgress: number } }) {
  const label = jobs.running > 0 || jobs.queued > 0
    ? `${jobs.running} running · ${jobs.queued} queued · ${jobs.overallProgress}%`
    : "No active jobs";

  return (
    <FooterSegment onClick={openJobTray} tooltip="Active Jobs">
      <Zap size={14} /> {label}
      {jobs.running > 0 && <MiniProgressBar value={jobs.overallProgress} />}
    </FooterSegment>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows running count, queued count, and overall progress percentage
- [ ] When idle: shows "No active jobs"
- [ ] Mini progress bar renders inline (~60px wide) when jobs are running
- [ ] Clicking opens the existing Job Tray panel (PRD-54)
- [ ] Reuses data from `useJobStatusAggregator` — does NOT create separate data fetching
- [ ] Visible to all roles (admin, creator, reviewer)

### Task 3.5: Create `WorkflowSegment` component
**File:** `apps/frontend/src/app/footer/WorkflowSegment.tsx` (new)

Compact active workflow/pipeline indicator.

```typescript
export function WorkflowSegment({ workflows }: { workflows: WorkflowInfo }) {
  const label = workflows.active > 0
    ? `${workflows.active} workflows${workflows.current_stage ? ` · ${workflows.current_stage}` : ""}`
    : "No active workflows";

  return (
    <FooterSegment href="/" tooltip="Active Workflows">
      <RefreshCw size={14} /> {label}
    </FooterSegment>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows active workflow count and current stage when workflows are running
- [ ] When idle: shows "No active workflows"
- [ ] Clicking navigates to Studio Pulse dashboard (PRD-42)
- [ ] Visible to all roles

### Task 3.6: Create shared footer primitives
**File:** `apps/frontend/src/app/footer/FooterSegment.tsx` (new)

Shared building blocks used by all segment components.

```typescript
/** Clickable segment wrapper with hover styling and separator. */
export function FooterSegment({ children, href, onClick, tooltip }: FooterSegmentProps) {
  // Wraps in <Link> if href provided, <button> if onClick provided
  // Applies hover background, segment separator, padding
}

/** Colored status dot (8px circle). */
export function StatusDot({ status }: { status: ServiceHealth }) {
  const colorClass = {
    healthy: "bg-[var(--color-status-success)]",
    degraded: "bg-[var(--color-status-warning)]",
    down: "bg-[var(--color-status-danger)]",
  }[status];
  return <span className={`inline-block h-2 w-2 rounded-full ${colorClass}`} />;
}

/** Thin vertical separator between segments. */
export function Separator() {
  return <span className="mx-2 h-3 w-px bg-[var(--color-border-subtle)]" />;
}

/** Inline mini progress bar (~60px wide). */
export function MiniProgressBar({ value }: { value: number }) {
  return (
    <span className="relative ml-1.5 inline-block h-1.5 w-15 rounded-full bg-[var(--color-surface-tertiary)]">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-action-primary)]"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </span>
  );
}
```

**Acceptance Criteria:**
- [ ] `FooterSegment` renders as `<Link>` (for navigation) or `<button>` (for actions like opening tray)
- [ ] Hover effect: subtle background change on segment
- [ ] `StatusDot` uses design system status tokens — no hardcoded hex colors
- [ ] `Separator` is a thin vertical divider using `--color-border-subtle`
- [ ] `MiniProgressBar` is ~60px wide with animated width transition
- [ ] All components use named exports
- [ ] Reuses existing `Tooltip` from design system for hover details

---

## Phase 4: Frontend — Collapsible Footer & AppShell Integration

### Task 4.1: Create `useFooterCollapse` hook
**File:** `apps/frontend/src/app/footer/useFooterCollapse.ts` (new)

Manages collapsed/expanded state with localStorage persistence.

```typescript
const STORAGE_KEY = "x121:footer-collapsed";

export function useFooterCollapse(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; }
    catch { return false; }
  });

  const toggle = useCallback((value: boolean) => {
    setCollapsed(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); }
    catch { /* storage unavailable */ }
  }, []);

  return [collapsed, toggle];
}
```

**Acceptance Criteria:**
- [ ] Collapse state persisted to `localStorage` with key `x121:footer-collapsed`
- [ ] Default state is expanded (not collapsed)
- [ ] Persists across page refreshes and sessions
- [ ] Gracefully handles localStorage unavailability (SSR, private browsing)

### Task 4.2: Create `CollapsedFooter` component
**File:** `apps/frontend/src/app/footer/CollapsedFooter.tsx` (new)

Minimal collapsed state showing only a thin line with hover expand affordance.

```typescript
export function CollapsedFooter({ onExpand, hasAlert }: { onExpand: () => void; hasAlert: boolean }) {
  return (
    <div
      className="group h-1 shrink-0 cursor-pointer bg-[var(--color-border-default)]
        transition-all hover:h-5 hover:bg-[var(--color-surface-secondary)]"
      onClick={onExpand}
      role="button"
      aria-label="Expand status footer"
    >
      <span className="hidden items-center justify-center text-[length:var(--font-size-xs)]
        text-[var(--color-text-muted)] group-hover:flex">
        Click to expand status bar
      </span>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Collapsed state shows a 4px thin line at the bottom of the viewport
- [ ] Hover expands the line slightly and shows "Click to expand" text
- [ ] Clicking expands the full footer
- [ ] Accessible: has `role="button"` and `aria-label`

### Task 4.3: Integrate `StatusFooter` into `AppShell`
**File:** `apps/frontend/src/app/AppShell.tsx` (modify)

Add the `StatusFooter` below `<main>` in the app shell layout.

```typescript
import { StatusFooter } from "@/app/StatusFooter";

export function AppShell() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <Outlet />
          </main>
          <StatusFooter />
        </div>
      </div>
    </ProtectedRoute>
  );
}
```

**Acceptance Criteria:**
- [ ] `StatusFooter` renders inside `AppShell` below `<main>`, above the viewport bottom
- [ ] Footer does not overlap content — `<main>` uses `flex-1` and footer uses `shrink-0`
- [ ] Footer visible on all authenticated pages (inside `ProtectedRoute`)
- [ ] `<main>` height correctly adjusts when footer is expanded vs collapsed
- [ ] No layout shift on page load

### Task 4.4: Create barrel export for footer module
**File:** `apps/frontend/src/app/footer/index.ts` (new)

```typescript
export { StatusFooter } from "../StatusFooter";
export { useFooterStatus } from "./useFooterStatus";
export { useFooterCollapse } from "./useFooterCollapse";
export type { FooterStatusData, ServiceHealth, FooterServices } from "./types";
```

**Acceptance Criteria:**
- [ ] All public footer types, hooks, and components exported from barrel
- [ ] Internal segment components not re-exported (implementation detail)

---

## Phase 5: Responsive & Accessibility

### Task 5.1: Mobile-responsive footer (icon-only mode)
**File:** `apps/frontend/src/app/StatusFooter.tsx` (modify), segment components (modify)

On screens narrower than 768px, footer collapses to icon-only mode with tooltips replacing text labels.

**Acceptance Criteria:**
- [ ] Below 768px viewport width, segment labels are hidden (`hidden md:inline`)
- [ ] Only icons and status dots are visible on mobile
- [ ] Tooltips provide full text on hover/tap
- [ ] Footer height remains 28px on all screen sizes
- [ ] No horizontal overflow or text truncation issues

### Task 5.2: Keyboard shortcut for footer toggle
**File:** Integration with PRD-52 shortcut system

Register a keyboard shortcut to toggle the footer bar collapsed/expanded state.

**Acceptance Criteria:**
- [ ] Shortcut registered in PRD-52 keymap system (e.g., `Ctrl+Shift+S` or configurable)
- [ ] Shortcut toggles footer collapse state
- [ ] Shortcut works from any view within the app shell
- [ ] If PRD-52 is not yet implemented, defer this task (mark as blocked)

---

## Phase 6: Integration Tests

### Task 6.1: Backend — footer status endpoint tests
**File:** `apps/backend/crates/api/tests/status_footer_api.rs` (new)

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_footer_status_returns_all_fields_for_admin(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_footer_status_omits_admin_fields_for_creator(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_footer_status_requires_auth(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_footer_status_responds_under_50ms(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Admin user receives `services` and `cloud_gpu` fields in response
- [ ] Non-admin user receives `services: null` and `cloud_gpu: null`
- [ ] Unauthenticated request returns 401
- [ ] Endpoint responds in <50ms (measured in test)
- [ ] `jobs` and `workflows` fields always present regardless of role
- [ ] All tests pass

### Task 6.2: Frontend — StatusFooter component tests
**File:** `apps/frontend/src/app/footer/__tests__/StatusFooter.test.tsx` (new)

```typescript
describe("StatusFooter", () => {
  test("renders all four segments for admin user");
  test("renders only jobs and workflows for creator user");
  test("renders collapsed state when localStorage preference is set");
  test("toggles collapse on button click");
  test("persists collapse state to localStorage");
  test("navigates to health page on service segment click");
  test("opens job tray on job segment click");
  test("shows correct status dot colors for service states");
  test("displays mini progress bar when jobs are running");
  test("shows idle message when no active jobs");
  test("responsive: hides labels below 768px");
});
```

**Acceptance Criteria:**
- [ ] Admin role renders all four segments (services, cloud GPU, workflows, jobs)
- [ ] Non-admin role renders only two segments (workflows, jobs)
- [ ] Collapse/expand toggles correctly and persists to localStorage
- [ ] Status dots use correct design token colors
- [ ] Mini progress bar renders with correct width percentage
- [ ] Navigation links point to correct routes
- [ ] All tests pass with `vitest run`

### Task 6.3: Frontend — useFooterStatus hook tests
**File:** `apps/frontend/src/app/footer/__tests__/useFooterStatus.test.ts` (new)

```typescript
describe("useFooterStatus", () => {
  test("fetches from /status/footer on mount");
  test("reuses job data from useJobStatusAggregator");
  test("refetches every 30 seconds");
  test("handles API error gracefully with default values");
});
```

**Acceptance Criteria:**
- [ ] Hook fetches from the correct API endpoint
- [ ] Job data comes from `useJobStatusAggregator`, not from the API response (DRY with PRD-54)
- [ ] Polling interval is 30 seconds
- [ ] API errors don't crash the component (graceful fallback)
- [ ] All tests pass

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/api/src/engine/health_aggregator.rs` | New: in-memory health cache with background polling |
| `apps/backend/crates/api/src/state.rs` | Modified: add `health_aggregator` field to `AppState` |
| `apps/backend/crates/api/src/main.rs` | Modified: initialize and start health aggregator |
| `apps/backend/crates/api/src/handlers/status.rs` | New: `get_footer_status` handler |
| `apps/backend/crates/api/src/handlers/mod.rs` | Modified: register `pub mod status;` |
| `apps/backend/crates/api/src/lib.rs` | Modified: add `/api/v1/status/footer` route |
| `apps/backend/crates/api/tests/status_footer_api.rs` | New: endpoint integration tests |
| `apps/frontend/src/app/StatusFooter.tsx` | New: main footer bar component |
| `apps/frontend/src/app/footer/types.ts` | New: TypeScript types for footer data |
| `apps/frontend/src/app/footer/useFooterStatus.ts` | New: data aggregation hook |
| `apps/frontend/src/app/footer/useFooterCollapse.ts` | New: collapse state with localStorage |
| `apps/frontend/src/app/footer/FooterSegment.tsx` | New: shared segment primitives (StatusDot, Separator, MiniProgressBar) |
| `apps/frontend/src/app/footer/ServiceHealthSegment.tsx` | New: admin-only service health display |
| `apps/frontend/src/app/footer/CloudGpuSegment.tsx` | New: admin-only cloud GPU display |
| `apps/frontend/src/app/footer/JobSegment.tsx` | New: active jobs display |
| `apps/frontend/src/app/footer/WorkflowSegment.tsx` | New: active workflows display |
| `apps/frontend/src/app/footer/CollapsedFooter.tsx` | New: minimal collapsed state |
| `apps/frontend/src/app/footer/index.ts` | New: barrel export |
| `apps/frontend/src/app/AppShell.tsx` | Modified: add `<StatusFooter />` below `<main>` |
| `apps/frontend/src/app/footer/__tests__/StatusFooter.test.tsx` | New: component tests |
| `apps/frontend/src/app/footer/__tests__/useFooterStatus.test.ts` | New: hook tests |

---

## Dependencies

### Existing Components to Reuse
- `useJobStatusAggregator` (`apps/frontend/src/features/job-tray/useJobStatusAggregator.ts`) — job counts and progress. MUST NOT duplicate.
- `useEventBus` (`apps/frontend/src/hooks/useEventBus.ts`) — event subscriptions for real-time updates
- `useAuthStore` (`apps/frontend/src/stores/auth-store.ts`) — role check for admin-only segments
- Worker types (`apps/frontend/src/features/workers/types.ts`) — reference for `FleetStats` shape
- Design system tokens (`--color-status-success`, `--color-status-warning`, `--color-status-danger`) — status dot colors
- `Tooltip` component (`apps/frontend/src/components/primitives/`) — hover details on segments
- `RequireAdmin` middleware (`apps/backend/crates/api/src/middleware/rbac.rs`) — not used directly (handler checks role instead), but pattern reference
- `DataResponse<T>` (`apps/backend/crates/api/src/response.rs`) — API response envelope
- `AppState` (`apps/backend/crates/api/src/state.rs`) — shared state for handler access
- Health check (`apps/backend/crates/api/src/routes/health.rs`) — DB probe pattern reference
- `api` client (`apps/frontend/src/lib/api.ts`) — TanStack Query data fetching

### New Infrastructure Needed
- `HealthAggregator` — in-memory cache with background polling for service health
- `StatusFooter` component — app shell layout addition
- `useFooterStatus` hook — aggregates API data, job store, and events
- `GET /api/v1/status/footer` — lightweight summary endpoint
- Footer segment sub-components

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Backend — Tasks 1.1-1.4 (health aggregator + API endpoint)
2. Phase 2: Frontend types & hook — Tasks 2.1-2.2
3. Phase 3: Footer bar & segments — Tasks 3.1-3.6
4. Phase 4: Collapsible footer & AppShell integration — Tasks 4.1-4.4
5. Phase 6: Integration tests — Tasks 6.1-6.3

**MVP Success Criteria:**
- Footer bar renders at the bottom of every authenticated page
- Admin users see all four segments; non-admin users see jobs and workflows only
- Job data shared with PRD-54 Job Tray via the same Zustand store (zero duplication)
- Status dots use design system tokens for consistent color language
- Footer collapses/expands with localStorage persistence
- `GET /api/v1/status/footer` responds in <50ms
- All backend and frontend tests pass

### Post-MVP Enhancements
- Task 5.1: Mobile-responsive icon-only mode — implement after MVP
- Task 5.2: Keyboard shortcut toggle — blocked on PRD-52 shortcut system
- PRD-117 Req 2.1: Error flash animation on status transitions — post-MVP
- PRD-117 Req 2.2: Footer history popover (right-click mini timeline) — post-MVP
- PRD-117 Req 2.3: Custom segment ordering via drag-and-drop — post-MVP
- PRD-117 Req 2.4: Notification dot on collapsed footer — post-MVP

---

## Notes

1. **No database migrations needed.** All footer data is sourced from existing tables, in-memory caches, and service health probes. This is a client-side UI feature with a thin backend aggregation layer.
2. **Cloud GPU and workflow data are stubs in MVP.** Until PRD-114 (Cloud GPU) and PRD-07 (Task Engine) are implemented, these segments show placeholder data (zeros/empty). The types and components are built now so integration is seamless later.
3. **DRY critical check:** The jobs segment MUST use `useJobStatusAggregator` from `features/job-tray/`. Creating a second job status store would be a DRY violation. The `dry-guy` agent must verify this after implementation.
4. **Health aggregator polling vs. event bus:** The backend aggregator uses polling (30s interval) as the primary mechanism. When PRD-10 event bus gains server-side health events, the aggregator can subscribe to those and reduce polling frequency. The current design is additive.
5. **Footer height budget:** The expanded footer must not exceed 32px (28px preferred). This matches IDE status bar conventions. All text is `--font-size-xs` (11px), icons at 14px, padding 4px top/bottom.
6. **`StatusFooter.tsx` lives in `app/` not `features/`** because it is a global layout component (part of the app shell), not a standalone feature module.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-117
