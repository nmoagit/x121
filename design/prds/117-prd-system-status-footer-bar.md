# PRD-117: System Status Footer Bar

## 1. Introduction/Overview

The platform currently scatters operational awareness across multiple full-page dashboards (PRD-42 Studio Pulse, PRD-80 System Health, PRD-46 Worker Dashboard) and a header tray icon (PRD-54 Job Tray). When a creator is working on a character, they have no passive awareness of whether the ComfyUI server is down, how many RunPod GPUs are active, or whether a pipeline is stalled — they must navigate away from their work to check.

This PRD introduces a **System Status Footer Bar** — a persistent, single-line bar pinned to the bottom of every page (like an IDE status bar). It shows four compact segments: **service health**, **cloud GPU state**, **active jobs**, and **running workflows**. Each segment is clickable, navigating to the relevant detail view. The footer complements the existing Job Tray (PRD-54) and dashboards without replacing them.

Role-based visibility: all users see job and workflow segments; only admins see infrastructure/server segments.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-02 (Backend Foundation — health endpoint, API layer)
  - PRD-10 (Event Bus — real-time status events via WebSocket)
  - PRD-29 (Design System — tokens, primitives, layout)
- **Extends:**
  - PRD-54 (Background Job Tray) — footer shows compact job summary, clicking opens existing tray panel
  - PRD-80 (System Health Page) — footer shows compact service indicators, clicking navigates to health page
- **Integrates with:**
  - PRD-42 (Studio Pulse Dashboard) — footer workflow segment links to dashboard active tasks widget
  - PRD-46 (Worker Pool Management) — worker online/offline counts displayed in footer
  - PRD-114 (Cloud GPU Provider Integration) — RunPod pod count and cost-per-hour in footer
  - PRD-05 (ComfyUI WebSocket Bridge) — ComfyUI instance connection status in footer
  - PRD-07 (Parallel Task Execution Engine) — pipeline/workflow status events

## 3. Goals

- Provide persistent, at-a-glance operational awareness without navigating away from the current view.
- Show service health (green/yellow/red) for ComfyUI, database, workers, and cloud GPUs in a compact format.
- Display active job count and overall progress alongside running workflow/pipeline status.
- Enable one-click navigation from any footer segment to its detailed dashboard or panel.
- Respect role-based visibility — creators see jobs and workflows, admins see everything.

## 4. User Stories

- **As a creator**, I want to see how many jobs are running and their overall progress at the bottom of every page, so I always know my generation status without navigating away.
- **As a creator**, I want to see active workflow/pipeline status in the footer, so I know if my production run is progressing.
- **As an admin**, I want to see at a glance whether ComfyUI instances, workers, and cloud GPUs are healthy, so I can catch infrastructure issues immediately without opening a dashboard.
- **As an admin**, I want to click the service health indicator in the footer to jump directly to the System Health page, so I can investigate issues quickly.
- **As a reviewer**, I want to see job progress in the footer while reviewing videos, so I know when new content will be ready.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Footer Bar Layout & Positioning
**Description:** A persistent, single-line footer bar pinned to the bottom of the app shell, below the main content area.

**Acceptance Criteria:**
- [ ] Footer bar renders inside `AppShell` below `<main>`, always visible regardless of scroll position
- [ ] Height is compact: 28–32px (matching IDE status bar conventions)
- [ ] Background uses `--color-surface-secondary` with a top border (`--color-border-default`)
- [ ] Bar is divided into left-aligned and right-aligned segment groups
- [ ] Footer does not overlap or obscure content — `<main>` height adjusts to accommodate it
- [ ] Responsive: on mobile (<768px), footer collapses to icon-only mode with tooltips

#### Requirement 1.2: Service Health Segment (Admin Only)
**Description:** Compact indicators showing the status of core platform services.

**Acceptance Criteria:**
- [ ] Shows status for: ComfyUI (via PRD-05 connection state), Database (via `/health` endpoint), Workers (via PRD-46 fleet stats)
- [ ] Each service displays: colored dot (green = healthy, yellow = degraded, red = down) + abbreviated label
- [ ] Format example: `● ComfyUI  ● DB  ● Workers 3/4`
- [ ] Segment only renders for users with admin role (via RBAC from PRD-03)
- [ ] Clicking the segment navigates to `/admin/health` (PRD-80 System Health Page)
- [ ] Tooltip on hover shows last-checked timestamp and latency
- [ ] Status updates via PRD-10 event bus (`service.health_changed` event) and/or polling (30s fallback)

#### Requirement 1.3: Cloud GPU Segment (Admin Only)
**Description:** Compact display of active cloud GPU resources (RunPod pods, serverless endpoints).

**Acceptance Criteria:**
- [ ] Shows: active pod count, total GPU cost rate (e.g., `☁ 2 pods · $1.24/hr`)
- [ ] When no pods are active: `☁ No GPUs`
- [ ] Segment only renders for admin role
- [ ] Clicking navigates to `/admin/cloud-gpu` (PRD-114 Cloud GPU dashboard)
- [ ] Consumes data from PRD-114 APIs (`/admin/cloud/pods?status=running` summary)
- [ ] Updates via event bus (`cloud.pod_status_changed`) or polling (30s fallback)
- [ ] Color coding: green = within budget, yellow = approaching budget cap, red = budget exceeded or pod error

#### Requirement 1.4: Active Jobs Segment (All Roles)
**Description:** Compact job count and progress indicator visible to all authenticated users.

**Acceptance Criteria:**
- [ ] Shows: running job count, queued count, overall progress (e.g., `⚡ 3 running · 5 queued · 72%`)
- [ ] When idle: `⚡ No active jobs`
- [ ] Progress renders as a mini progress bar (thin inline bar, ~60px wide) next to the percentage
- [ ] Clicking opens the existing Job Tray panel (PRD-54) or navigates to job detail view
- [ ] Reuses the existing `useJobStatusAggregator` hook from `features/job-tray/` — no data duplication
- [ ] Visible to all roles (admin, creator, reviewer)

#### Requirement 1.5: Active Workflows Segment (All Roles)
**Description:** Compact indicator of running workflows and production pipelines.

**Acceptance Criteria:**
- [ ] Shows: active workflow/pipeline count and current stage (e.g., `⟳ 2 workflows · generating`)
- [ ] When idle: `⟳ No active workflows`
- [ ] Clicking navigates to the Studio Pulse dashboard (PRD-42) or the active production run view
- [ ] Consumes data from PRD-07 (Task Engine) job status events filtered to pipeline/workflow types
- [ ] Visible to all roles

#### Requirement 1.6: Status Summary API Endpoint
**Description:** A single lightweight API endpoint that returns all footer data in one request, avoiding N+1 API calls on page load.

**Acceptance Criteria:**
- [ ] `GET /api/v1/status/footer` — returns a JSON envelope with all footer segments
- [ ] Response shape:
  ```json
  {
    "data": {
      "services": {
        "comfyui": { "status": "healthy", "instances": 2, "checked_at": "..." },
        "database": { "status": "healthy", "latency_ms": 3, "checked_at": "..." },
        "workers": { "status": "healthy", "online": 3, "total": 4, "checked_at": "..." }
      },
      "cloud_gpu": {
        "active_pods": 2,
        "cost_per_hour_cents": 124,
        "budget_status": "within_budget"
      },
      "jobs": {
        "running": 3,
        "queued": 5,
        "overall_progress": 72
      },
      "workflows": {
        "active": 2,
        "current_stage": "generating"
      }
    }
  }
  ```
- [ ] `services` and `cloud_gpu` fields omitted (or null) when requester is not admin
- [ ] Endpoint responds in <50ms (aggregates cached health data, no live probes on each request)
- [ ] Frontend fetches on mount, then relies on event bus for real-time updates with 30s polling fallback

#### Requirement 1.7: Collapsible Footer
**Description:** Allow users to minimize the footer bar to reclaim vertical space.

**Acceptance Criteria:**
- [ ] Small toggle button (chevron) at the right edge of the footer to collapse/expand
- [ ] Collapsed state shows only a thin 4px line with a hover expand affordance
- [ ] Collapse preference persisted to localStorage (`x121:footer-collapsed`)
- [ ] Keyboard shortcut to toggle (registered in PRD-52 shortcut system)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Error Flash Animation
**Description:** Brief attention-grabbing animation when a service transitions to degraded/down.
**Acceptance Criteria:**
- [ ] Footer segment background briefly flashes red/amber on status transition from healthy → degraded/down
- [ ] Animation is subtle (200ms pulse) and does not persist

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Footer History Popover
**Description:** Click-and-hold (or right-click) any segment to see a mini timeline of recent status changes.
**Acceptance Criteria:**
- [ ] Shows last 5 status transitions with timestamps
- [ ] Useful for understanding intermittent issues without navigating away

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Custom Segment Ordering
**Description:** Admin can reorder footer segments via drag-and-drop in platform settings.
**Acceptance Criteria:**
- [ ] Segment order saved per-user in localStorage
- [ ] Default order: services → cloud GPU → workflows → jobs

#### **[OPTIONAL - Post-MVP]** Requirement 2.4: Notification Dot on Collapsed Footer
**Description:** When footer is collapsed, show a colored dot on the expand handle if any service is degraded/down.
**Acceptance Criteria:**
- [ ] Red dot = any service down; yellow dot = any service degraded; green = all healthy
- [ ] Draws attention without requiring the full footer to be visible

## 6. Non-Goals (Out of Scope)

- **Full service dashboard** — Detailed service health is covered by PRD-80 (System Health Page). Footer is a compact summary only.
- **Job management** — Pause/cancel/retry controls remain in the Job Tray panel (PRD-54) and Queue view (PRD-08). Footer only shows counts.
- **GPU hardware metrics** — Detailed GPU temperature, VRAM, utilization graphs are in PRD-06 (Hardware Monitoring). Footer shows online/offline counts only.
- **Log viewing** — The footer does not display log output. Logs are accessed via the health page (PRD-80).
- **Dashboard customization** — Widget arrangement and custom dashboards are covered by PRD-89.

## 7. Design Considerations

- **IDE Status Bar Pattern:** Follow VS Code / JetBrains status bar conventions — compact single-line bar with segmented regions, left/right alignment, clickable segments with hover effects.
- **Color Language:** Use the same green/yellow/red severity palette established in PRD-06 and PRD-46 for consistency.
- **Density:** Text uses `--font-size-xs` (11px). Icons at 14px. No vertical padding beyond 4px top/bottom.
- **Contrast:** Footer should be subtly distinct from the main content area but not visually dominant. Use `--color-surface-secondary` background (one step darker than main content).
- **Segment Separators:** Thin vertical dividers (`--color-border-subtle`) between segments.
- **Existing Components:** Reuse `Badge` (variant-based coloring), `Tooltip` (hover details), and design system tokens throughout.

## 8. Technical Considerations

### Existing Code to Reuse
- **`useJobStatusAggregator`** (`features/job-tray/useJobStatusAggregator.ts`) — already provides `runningCount`, `queuedCount`, `overallProgress` via Zustand store. Footer's job segment reads from the same store. Zero duplication.
- **`useEventBus`** (`hooks/useEventBus.ts`) — subscribe to `service.health_changed`, `cloud.pod_status_changed`, `workflow.status_changed` events.
- **Worker types & status constants** (`features/workers/types.ts`) — `WORKER_STATUS`, `FleetStats` types already defined.
- **Design system tokens** — `--color-status-success`, `--color-status-warning`, `--color-status-danger` for health dot colors.
- **`useAuthStore`** — role check for admin-only segments.

### New Infrastructure Needed
- **`StatusFooter` component** — `apps/frontend/src/app/StatusFooter.tsx` (part of app shell, not a feature)
- **`useFooterStatus` hook** — aggregates data from existing stores + the new summary API endpoint
- **`GET /api/v1/status/footer`** — lightweight backend endpoint aggregating cached health data from existing service checks
- **Backend health aggregator** — collects latest health state from ComfyUI bridge (PRD-05), DB pool, worker pool (PRD-46), cloud GPU (PRD-114) into a cache refreshed every 30s

### Database Changes
- **None.** All data is sourced from existing tables and services. The footer summary endpoint reads from in-memory caches and existing query results.

### API Changes
- **New:** `GET /api/v1/status/footer` — returns aggregated footer data (Req 1.6)
- **No modifications** to existing endpoints.

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

### Critical DRY Checks
- Footer job segment MUST reuse `useJobStatusAggregator` — must NOT create a parallel job status store.
- Worker status types MUST import from `features/workers/types.ts` — must NOT redefine status constants.
- Health status dot coloring MUST use design system status tokens — must NOT hardcode hex values.

## 10. Success Metrics

- Footer renders within 200ms of app shell mount (no layout shift)
- Status updates appear within 2 seconds of a real event via WebSocket
- Footer summary API (`/status/footer`) responds in <50ms
- Footer occupies no more than 32px of vertical space when expanded
- No duplicate data fetching — job data shared with PRD-54 tray via the same Zustand store

## 11. Open Questions

- Should the footer show a cumulative ETA for all running jobs (e.g., "~12 min remaining")?
- Should workflow segment differentiate between production runs (PRD-57) and individual pipeline jobs (PRD-07)?

## 12. Version History

- **v1.0** (2026-02-24): Initial PRD creation
