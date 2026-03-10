# Task List: Infrastructure Control Panel

**PRD Reference:** `design/prds/131-prd-infrastructure-control-panel.md`
**Scope:** Unified admin page for managing all cloud GPU instances and ComfyUI connections, replacing both the existing Infrastructure Panel (generation page) and Cloud GPU Dashboard (admin page).

## Overview

This PRD merges two existing UIs into a single Infrastructure Control Panel at `/admin/infrastructure`. The backend already has substantial infrastructure: `cloud_providers` handlers with full CRUD, `infrastructure` handlers for pod start/stop, `ComfyUIManager` for WebSocket connections, `PodOrchestrator` for SSH-based ComfyUI startup, and `reconciliation` service for drift detection. The new work adds orphan scanning, bulk operations, restart/reconnect/reset-state endpoints, curated activity logging, and a unified frontend page.

### What Already Exists
- **Cloud GPU Dashboard** (`features/admin/cloud-gpus/`) — provider list, instance list, scaling rules, cost, emergency stop. Hooks in `use-cloud-providers.ts` cover CRUD for providers, instances, GPU types, scaling rules, costs.
- **Infrastructure Panel** (`features/generation/InfrastructurePanel.tsx`) — compact pod start/stop/refresh widget embedded in generation page.
- **Infrastructure hooks** (`features/generation/hooks/use-infrastructure.ts`) — `useInfrastructureStatus`, `useStartPod`, `useStopPod`, `useRefreshInstances`.
- **Infrastructure handlers** (`handlers/infrastructure.rs`) — `get_status`, `start_pod`, `stop_pod`, `list_gpu_types`, `refresh_instances`.
- **Cloud provider handlers** (`handlers/cloud_providers.rs`) — full CRUD for providers, instances (provision/start/stop/terminate), GPU types, scaling rules, cost, emergency stop.
- **PodOrchestrator** (`cloud/src/runpod/orchestrator.rs`) — full lifecycle: resolve pod ID, resume/provision, SSH startup, ComfyUI health poll.
- **ComfyUIManager** (`comfyui/src/manager.rs`) — multi-instance WebSocket connection management, `refresh_instances()`, `connected_instance_ids()`.
- **Reconnect module** (`comfyui/src/reconnect.rs`) — exponential backoff reconnection with `ReconnectConfig`.
- **Reconciliation service** (`cloud/src/services/reconciliation.rs`) — periodic DB-vs-provider drift detection (marks terminated instances).
- **Activity Console** (`features/activity-console/`) — `ActivityConsolePanel`, `ConsoleFilterToolbar`, WebSocket streaming, source filtering.
- **ActivityLogBroadcaster** (`events/src/activity.rs`) — pub/sub for `ActivityLogEntry` with curated entry support.
- **CloudInstanceList** (`features/admin/cloud-gpus/components/CloudInstanceList.tsx`) — table with status labels/colors, action buttons.

### What We're Building
1. Backend: orphan scan endpoint (compare provider instances vs DB), orphan cleanup, bulk start/stop/terminate
2. Backend: restart-comfyui, force-reconnect, reset-state per-instance endpoints
3. Backend: curated activity log entries for all infrastructure lifecycle events
4. Frontend: unified `/admin/infrastructure` page with provider-grouped instance cards
5. Frontend: individual instance action buttons (state-dependent)
6. Frontend: multi-select bulk operations toolbar
7. Frontend: orphan detection panel with import/terminate/remove actions
8. Frontend: failed connection recovery UI
9. Frontend: inline provider management (add/edit/remove from the same page)
10. Frontend: instance provisioning wizard (multi-step modal)
11. Frontend: embedded Activity Console filtered to infrastructure sources

### Key Design Decisions
1. **Extend, don't duplicate** — new backend endpoints go into `handlers/infrastructure.rs` (operations) while provider CRUD stays in `handlers/cloud_providers.rs`. Frontend hooks from both `use-infrastructure.ts` and `use-cloud-providers.ts` are reused in the new page.
2. **Orphan scan returns data, cleanup is a separate call** — the scan endpoint is read-only; the admin reviews findings then explicitly requests cleanup, matching the PRD's "admin approval" model.
3. **Bulk operations use concurrent execution** — `futures::join_all` on the backend, progress streamed via invalidation + polling on frontend.
4. **Activity logging uses `ActivityLogBroadcaster::publish` with curated entries** — not just `tracing::info!`. Source is `Comfyui` for pod/connection events, `Worker` for background service events.
5. **ComfyUI force reconnect** — manager gets a `force_reconnect(instance_id)` method that cancels the existing connection task and respawns it with reset backoff.

---

## Phase 1: Backend — New Endpoints [COMPLETE]

### Task 1.1: Add `restart_comfyui` method to PodOrchestrator [COMPLETE]
**File:** `apps/backend/crates/cloud/src/runpod/orchestrator.rs`

Add a public method `restart_comfyui(pool, pod_id)` that:
1. Looks up the pod status to verify it's running
2. Extracts SSH info from the pod
3. Calls the existing `start_custom_comfyui(host, port)` to re-run `/workspace/start_comfyui.sh`
4. Polls ComfyUI health until responsive

This reuses the existing private `start_custom_comfyui` and `wait_for_comfyui` methods. The method should be public so the API handler can call it.

**Acceptance Criteria:**
- [x] `restart_comfyui(&self, pool: &PgPool, pod_id: &str) -> Result<PodReady, CloudProviderError>` is public
- [x] Method verifies pod is in Running state before attempting SSH
- [x] Returns error if pod is not running or SSH info unavailable
- [x] Reuses existing `start_custom_comfyui` and `wait_for_comfyui` internals
- [x] Does not terminate or re-provision the pod

### Task 1.2: Add `force_reconnect` method to ComfyUIManager [COMPLETE]
**File:** `apps/backend/crates/comfyui/src/manager.rs`

Add a public method `force_reconnect(instance_id)` that:
1. Cancels the existing connection task for that instance (via its per-instance `CancellationToken`)
2. Removes the `ManagedInstance` from the connections map
3. Looks up the instance from DB to get ws_url/api_url
4. Calls `spawn_connection` to create a fresh connection task with reset backoff

This gives admins a way to force a WebSocket reconnect without waiting for the exponential backoff timer.

**Acceptance Criteria:**
- [x] `force_reconnect(&self, instance_id: DbId) -> Result<(), ComfyUIManagerError>` is public
- [x] Cancels existing connection task's `CancellationToken`
- [x] Removes old `ManagedInstance` and spawns new connection
- [x] Returns error if instance not found in DB
- [x] Resets backoff (new connection starts fresh)

### Task 1.3: Add orphan scan endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Add `POST /admin/infrastructure/scan-orphans` handler that:
1. Iterates all registered providers via `cloud_registry`
2. For each provider, calls a new `list_all_instances` trait method (or uses existing provider API) to get all instances at the provider
3. Compares against `cloud_instances` DB table to find:
   - **Cloud orphans**: instances at provider but not in DB
   - **DB orphans**: DB rows marked running/starting but provider reports terminated/not-found
   - **ComfyUI orphans**: `comfyui_instances` rows pointing to non-existent cloud instances
4. Returns structured `OrphanScanResult` with all three lists

**Acceptance Criteria:**
- [x] Handler returns `OrphanScanResult { cloud_orphans, db_orphans, comfyui_orphans }`
- [x] Cloud orphans include external_id, provider_id, cost_per_hour if available
- [x] DB orphans include instance_id, external_id, DB status vs actual status
- [x] ComfyUI orphans include comfyui_instance_id, name, cloud_instance reference
- [x] Requires admin role
- [x] Each provider is queried independently; one provider failure doesn't block others

### Task 1.4: Add `list_all_instances` to CloudGpuProvider trait [COMPLETE]
**File:** `apps/backend/crates/core/src/cloud.rs`

Add a trait method to list all instances from the provider, needed for orphan detection:

```rust
async fn list_all_instances(&self) -> Result<Vec<InstanceInfo>, CloudProviderError>;
```

Implement for RunPod provider using the existing GraphQL `getPods` query.

**Files:**
- `apps/backend/crates/core/src/cloud.rs` — trait method
- `apps/backend/crates/cloud/src/runpod/provider.rs` — RunPod implementation
- `apps/backend/crates/cloud/src/runpod/graphql.rs` — GraphQL query for listing all pods

**Acceptance Criteria:**
- [x] `list_all_instances` added to `CloudGpuProvider` trait with default impl returning empty vec
- [x] RunPod implementation queries `getPods` GraphQL and returns all pods
- [x] Each returned `InstanceInfo` includes `external_id`, `name`, `status`, `cost_per_hour_cents`
- [x] Existing trait implementors compile without changes (default impl)

### Task 1.5: Add orphan cleanup endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Add `POST /admin/infrastructure/cleanup-orphans` handler that accepts a body specifying which orphans to clean up and what action to take:

```rust
struct OrphanCleanupRequest {
    cloud_orphans: Vec<CloudOrphanAction>,   // { external_id, provider_id, action: "import" | "terminate" }
    db_orphans: Vec<DbOrphanAction>,         // { instance_id, action: "remove" | "resync" }
    comfyui_orphans: Vec<i64>,               // comfyui_instance_ids to auto-disable
}
```

**Acceptance Criteria:**
- [x] "import" action creates `cloud_instances` + `comfyui_instances` DB rows for cloud orphans
- [x] "terminate" action calls provider's `terminate_instance` for cloud orphans
- [x] "remove" action deletes DB row for DB orphans
- [x] "resync" action queries provider for actual status and updates DB
- [x] ComfyUI orphans are disabled via `ComfyUIInstanceRepo::disable`
- [x] Returns summary of actions taken (counts per action type)

### Task 1.6: Add bulk operation endpoints [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Add three bulk endpoints:
- `POST /admin/infrastructure/bulk/start` — accepts `{ instance_ids: Vec<i64> }`
- `POST /admin/infrastructure/bulk/stop` — accepts `{ instance_ids: Vec<i64>, force: bool }`
- `POST /admin/infrastructure/bulk/terminate` — accepts `{ instance_ids: Vec<i64> }`

Each endpoint:
1. Loads all requested instances from DB
2. Groups by provider
3. Executes operations concurrently using `futures::join_all`
4. Returns per-instance results `{ instance_id, success: bool, error: Option<String> }`

**Acceptance Criteria:**
- [x] All three endpoints accept `{ instance_ids: Vec<i64> }`
- [x] Operations execute concurrently, not sequentially
- [x] Individual failures don't block other instances
- [x] Returns `BulkResult { results: Vec<InstanceActionResult> }` with per-instance status
- [x] Stop endpoint supports `force` flag (immediate vs graceful)
- [x] Requires admin role

### Task 1.7: Add restart-comfyui, force-reconnect, reset-state per-instance endpoints [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Add three per-instance endpoints:
- `POST /admin/cloud-instances/:id/restart-comfyui` — calls `PodOrchestrator::restart_comfyui`
- `POST /admin/cloud-instances/:id/force-reconnect` — calls `ComfyUIManager::force_reconnect`
- `POST /admin/cloud-instances/:id/reset-state` — queries provider for actual status, updates DB

**Acceptance Criteria:**
- [x] `restart-comfyui` resolves pod_id from cloud_instance, calls orchestrator, returns updated status
- [x] `force-reconnect` finds matching comfyui_instance for the cloud_instance, calls manager
- [x] `reset-state` queries provider via `get_instance_status`, updates DB `status_id` accordingly
- [x] All three require admin role
- [x] All three return the updated instance state after the action

### Task 1.8: Wire new routes [COMPLETE]
**File:** `apps/backend/crates/api/src/routes/infrastructure.rs`

Add all new routes to the infrastructure router:

```rust
.route("/scan-orphans", post(infrastructure::scan_orphans))
.route("/cleanup-orphans", post(infrastructure::cleanup_orphans))
.route("/bulk/start", post(infrastructure::bulk_start))
.route("/bulk/stop", post(infrastructure::bulk_stop))
.route("/bulk/terminate", post(infrastructure::bulk_terminate))
```

And add instance-level routes (possibly in a separate sub-router or alongside cloud-instances):

```rust
.route("/cloud-instances/:id/restart-comfyui", post(infrastructure::restart_comfyui))
.route("/cloud-instances/:id/force-reconnect", post(infrastructure::force_reconnect))
.route("/cloud-instances/:id/reset-state", post(infrastructure::reset_state))
```

**Acceptance Criteria:**
- [x] All 8 new endpoints are routable and return correct responses
- [x] Routes are under `/admin/` prefix with admin RBAC guard
- [x] Existing routes (`/status`, `/pod/start`, `/pod/stop`, `/gpu-types`, `/comfyui/refresh`) remain working
- [x] `cargo check` passes with no errors

---

## Phase 2: Backend — Curated Activity Logging [COMPLETE]

### Task 2.1: Add curated activity log entries to PodOrchestrator [COMPLETE]
**File:** `apps/backend/crates/cloud/src/runpod/orchestrator.rs`

The orchestrator currently uses `tracing::info!` for lifecycle events. Add `ActivityLogBroadcaster` as an optional dependency (passed during construction or via a method) and emit curated entries at key lifecycle points:

- Pod provisioning started
- Pod runtime ready (with IP and port)
- SSH startup started / completed (with duration) / failed (with error)
- ComfyUI health check passed

Since the orchestrator lives in the `cloud` crate and `ActivityLogBroadcaster` is in `events`, pass it as a parameter or add it to the orchestrator struct. Alternatively, emit these from the API handler that calls the orchestrator methods, since the handler has access to `AppState.activity_broadcaster`.

**Acceptance Criteria:**
- [x] At least 6 curated activity log entries emitted (provisioning, runtime ready, SSH start/complete/fail, ComfyUI healthy)
- [x] Entries use `ActivityLogSource::Comfyui` and appropriate `ActivityLogLevel`
- [x] Entries include structured fields: pod_id, provider, IP, port, duration_secs where applicable
- [x] Error entries include the error message

### Task 2.2: Add curated activity log entries to infrastructure handlers [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Emit curated entries for admin-triggered actions:
- Instance stop/terminate requested (include admin user identity)
- Instance terminated (include uptime and cost)
- Bulk operation started (include count and admin)
- Orphan detected / cleaned up (include cost info)
- Recovery attempted / failed (include attempt count)

**Acceptance Criteria:**
- [x] All manually-triggered actions emit curated log entries
- [x] Entries include admin user identity (from `RequireAdmin` extractor)
- [x] Cost information included in termination/cleanup entries
- [x] Bulk operation entries include instance count
- [x] Source is `ActivityLogSource::Comfyui` for pod events, `ActivityLogSource::Worker` for background events

### Task 2.3: Add curated activity log entries to reconciliation service [COMPLETE]
**File:** `apps/backend/crates/cloud/src/services/reconciliation.rs`

The reconciliation service currently uses `tracing::info`/`warn`. Add `ActivityLogBroadcaster` as a parameter and emit curated entries:
- Orphan detected (with pod ID and cost info)
- Instance state corrected (DB updated to match provider)

**Acceptance Criteria:**
- [x] Reconciliation function accepts `ActivityLogBroadcaster` reference
- [x] Orphan detection emits curated warn-level entry with pod ID and cost
- [x] State correction emits curated info-level entry
- [x] Source is `ActivityLogSource::Worker`

### Task 2.4: Add curated activity log entries to ComfyUIManager [COMPLETE]
**File:** `apps/backend/crates/comfyui/src/manager.rs`

Emit curated entries for connection lifecycle:
- WebSocket connected (with instance name and URL)
- WebSocket disconnected (with reconnect intention)
- Force reconnect triggered

**Acceptance Criteria:**
- [x] WebSocket connected/disconnected emit curated entries
- [x] Source is `ActivityLogSource::Comfyui`
- [x] Entries include instance_id and name in structured fields
- [x] Force reconnect logs the trigger reason

---

## Phase 3: Frontend — Unified Dashboard Page [COMPLETE]

### Task 3.1: Create infrastructure control panel page component [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/InfrastructureControlPanel.tsx`

Create the main page component that:
1. Fetches all providers (reuse `useCloudProviders` from cloud-gpus hooks)
2. Fetches all instances across providers (reuse `useInstances` per provider, or create a new hook for all instances)
3. Groups instances by provider with collapsible sections
4. Shows provider health indicator in each section header
5. Handles empty state ("No providers configured")

**Acceptance Criteria:**
- [x] Page shows all instances from all providers in a single view
- [x] Instances grouped by provider with collapsible sections
- [x] Provider health indicator (dot) in section header
- [x] Empty state with "No providers configured" message and link to add provider
- [x] Loading state with spinner while data fetches
- [x] Status updates via polling at 10s interval

### Task 3.2: Create instance card component [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/InstanceCard.tsx`

Create a card component for each instance showing:
- Instance name and external ID (truncated)
- Provider name and type
- GPU type and count
- Status badge (color-coded, reuse `INSTANCE_STATUS` constants from `CloudInstanceList.tsx`)
- ComfyUI connection status (connected/disconnected/reconnecting/not registered)
- IP address and SSH port
- Uptime (calculated from `started_at`)
- Session cost (cost_per_hour * uptime hours)
- Cumulative cost (`total_cost_cents`)
- Last health check timestamp
- Checkbox for multi-select

**Acceptance Criteria:**
- [x] All fields from PRD 1.1 are displayed
- [x] Status badge uses design system `Badge` with appropriate variant
- [x] Uptime is calculated client-side from `started_at` and auto-updates
- [x] Cost displayed using `formatCents` from `lib/format.ts`
- [x] Checkbox integrated for bulk selection
- [x] Card layout is responsive (grid on desktop, stack on mobile)

### Task 3.3: Create instance action buttons component [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/InstanceActions.tsx`

Create state-dependent action buttons per the PRD matrix:

| State | Actions |
|-------|---------|
| Provisioning | Cancel |
| Starting | Cancel, View Logs |
| Connected (running) | Stop, Terminate, Restart ComfyUI |
| Disconnected (pod running) | Retry Connection, Restart ComfyUI, Stop, Terminate |
| Error | Retry, Terminate, View Error |
| Stopped | Start, Terminate |
| Terminated | Remove from DB |

**Acceptance Criteria:**
- [x] Only valid actions shown for current state
- [x] Destructive actions (terminate) show confirmation dialog
- [x] Actions use design system `Button` components
- [x] Loading state shown while action is pending
- [x] Toast notification on success/error
- [x] "View Error" shows error message in a popover or modal

### Task 3.4: Create infrastructure hooks for new endpoints [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/hooks/use-infrastructure-ops.ts`

Create TanStack Query hooks for the new backend endpoints:
- `useOrphanScan()` — mutation for `POST /admin/infrastructure/scan-orphans`
- `useOrphanCleanup()` — mutation for `POST /admin/infrastructure/cleanup-orphans`
- `useBulkStart()` — mutation for `POST /admin/infrastructure/bulk/start`
- `useBulkStop()` — mutation for `POST /admin/infrastructure/bulk/stop`
- `useBulkTerminate()` — mutation for `POST /admin/infrastructure/bulk/terminate`
- `useRestartComfyui(instanceId)` — mutation for `POST /admin/cloud-instances/:id/restart-comfyui`
- `useForceReconnect(instanceId)` — mutation for `POST /admin/cloud-instances/:id/force-reconnect`
- `useResetState(instanceId)` — mutation for `POST /admin/cloud-instances/:id/reset-state`

All mutations should invalidate the relevant query keys on success.

**Acceptance Criteria:**
- [x] All 8 hooks implemented with correct endpoint paths
- [x] Mutations invalidate `cloud-providers` and `infrastructure` query keys on success
- [x] Toast notifications on success/error
- [x] TypeScript types for all request/response shapes
- [x] Query key factory follows existing `cloudKeys` pattern

### Task 3.5: Create combined instances query hook [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/hooks/use-all-instances.ts`

Create a hook that fetches instances from all providers and merges them into a single list with provider metadata attached:

```typescript
interface EnrichedInstance extends CloudInstance {
  provider_name: string;
  provider_type: string;
  comfyui_status: "connected" | "disconnected" | "reconnecting" | "not_registered";
}
```

This hook combines data from:
- `useCloudProviders()` — provider list
- `useInstances(providerId)` — per-provider instances (can use `useQueries` for parallel fetching)
- `useInfrastructureStatus()` — ComfyUI connection status

**Acceptance Criteria:**
- [x] Returns a flat list of all instances across all providers
- [x] Each instance enriched with provider name/type
- [x] ComfyUI connection status matched by correlating instance names
- [x] Auto-refreshes at 10s interval
- [x] Loading state aggregated across all provider queries

---

## Phase 4: Frontend — Bulk Operations [COMPLETE]

### Task 4.1: Create multi-select state management [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/hooks/use-instance-selection.ts`

Create a custom hook for managing multi-select state:
- `selectedIds: Set<number>` — currently selected instance IDs
- `toggle(id)` — toggle single selection
- `selectAll(ids)` / `deselectAll()` — bulk selection
- `isSelected(id)` — check if selected
- `selectedCount` — number selected

**Acceptance Criteria:**
- [x] Hook manages a `Set<number>` of selected instance IDs
- [x] `toggle`, `selectAll`, `deselectAll`, `isSelected` methods
- [x] `selectedCount` derived from set size
- [x] Selection state resets when instances data changes (e.g., instance terminated)

### Task 4.2: Create bulk action toolbar [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/BulkActionToolbar.tsx`

Sticky toolbar that appears when 1+ instances are selected:
- Shows count: "N instances selected"
- Buttons: Start Selected, Stop Selected, Terminate Selected
- Stop has dropdown: "Graceful" vs "Force"
- Terminate shows confirmation with instance count and estimated savings

**Acceptance Criteria:**
- [x] Toolbar visible when `selectedCount >= 1`, hidden otherwise
- [x] Sticky positioning at top of instance list
- [x] "Stop Selected" dropdown with graceful/force options
- [x] "Terminate Selected" confirmation shows instance count
- [x] Bulk operations call the hooks from Task 3.4
- [x] Progress indication while operation executes
- [x] Individual failures shown as toast errors (don't block success toasts for others)

---

## Phase 5: Frontend — Orphan Detection & Recovery [COMPLETE]

### Task 5.1: Create orphan scan panel [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/OrphanPanel.tsx`

UI for orphan detection and cleanup:
- "Scan for Orphans" button triggers scan
- Results grouped by type: Cloud Orphans, DB Orphans, ComfyUI Orphans
- Each orphan item shows details and available actions
- Cloud orphans: "Import" or "Terminate" buttons, show cost/hr
- DB orphans: "Remove" or "Re-sync" buttons
- ComfyUI orphans: auto-cleaned indicator
- "Clean Up Selected" button for batch cleanup

**Acceptance Criteria:**
- [x] Scan button triggers `useOrphanScan` mutation
- [x] Results displayed in three collapsible sections
- [x] Cloud orphans show external_id, provider, and cost_per_hour
- [x] Action buttons per orphan item
- [x] Batch cleanup supported (select multiple + single action)
- [x] Loading state during scan and cleanup
- [x] Empty state: "No orphans detected" with check mark

### Task 5.2: Create failed connection recovery section [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/RecoveryActions.tsx`

Within each instance card (or a dedicated section), show recovery options for instances in error/disconnected states:
- Error instances: show error message, "Retry" button
- Disconnected instances (pod running): "Restart ComfyUI", "Retry Connection"
- Stuck instances (>10 min in provisioning/starting): "Reset State"

**Acceptance Criteria:**
- [x] Error message displayed for error-state instances
- [x] Retry button calls appropriate endpoint based on instance state
- [x] Stuck detection: timestamp comparison against `created_at` or `started_at` (10 min threshold)
- [x] "Reset State" button for stuck instances
- [x] Recovery attempt results shown as toast

---

## Phase 6: Frontend — Provider Management & Provisioning [COMPLETE]

### Task 6.1: Create inline provider management [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/ProviderManagement.tsx`

Provider configuration accessible directly from the Infrastructure Control Panel:
- "Add Provider" button opens a modal with provider form
- Each provider section header has "Edit" and "Remove" action buttons
- Provider form: name, API key (masked input), provider-specific settings
- "Test Connection" button in the form
- Removal blocked if active instances exist

Reuse `useCreateProvider`, `useUpdateProvider`, `useDeleteProvider`, `useTestConnection` from `use-cloud-providers.ts`.

**Acceptance Criteria:**
- [x] "Add Provider" button opens modal with provider form
- [x] Form fields: name, provider_type (select), API key (password input), base_url, settings
- [x] "Test Connection" validates API key and shows result
- [x] Edit/Remove actions on provider section headers
- [x] Removal blocked with warning if provider has active instances
- [x] Provider changes immediately reflected in the instance list
- [x] Reuses existing hooks from `use-cloud-providers.ts` (no new API calls)

### Task 6.2: Create instance provisioning wizard [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/ProvisionWizard.tsx`

Multi-step modal for provisioning new instances:
1. **Select provider** — dropdown of configured providers
2. **Select GPU type** — list from `useGpuTypes(providerId)` showing name, VRAM, cost/hr, availability
3. **Specify count** — number input (1-10)
4. **Review** — summary: provider, GPU type, count, estimated cost/hr total
5. **Confirm** — triggers provisioning

**Acceptance Criteria:**
- [x] Wizard has 4 visible steps with progress indicator
- [x] GPU type list shows only available types for selected provider
- [x] GPU type items show name, VRAM (formatted), cost/hr, availability badge
- [x] Cost estimate calculated: `cost_per_hour * count`
- [x] Provisioning calls `useProvisionInstance` for each instance
- [x] Progress shown for multi-instance provisioning
- [x] New instances appear in the dashboard immediately (via query invalidation)
- [x] Reuses `useGpuTypes` and `useProvisionInstance` from `use-cloud-providers.ts`

---

## Phase 7: Frontend — Embedded Activity Console & Page Integration [COMPLETE]

### Task 7.1: Create embedded activity console for infrastructure [COMPLETE]
**File:** `apps/frontend/src/features/infrastructure/components/InfrastructureActivityLog.tsx`

Embed a filtered `ActivityConsolePanel` that shows only infrastructure-related events (source: `comfyui` | `worker`):
- Uses existing `ActivityConsolePanel` component
- Pre-filters to `comfyui` and `worker` sources
- Collapsible panel at the bottom of the infrastructure page
- Shows in a fixed-height container (e.g., 300px) with scroll

Since `ActivityConsolePanel` uses a global Zustand store and WebSocket, this component should either:
- Pass source filter props to the store on mount/unmount, or
- Use a separate instance of the activity log WebSocket with source filters applied

**Acceptance Criteria:**
- [x] Activity console panel embedded at bottom of infrastructure page
- [x] Filtered to only show `comfyui` and `worker` source entries
- [x] Collapsible (expand/collapse toggle)
- [x] Fixed height with internal scroll
- [x] Shows curated entries from Tasks 2.1-2.4
- [x] Does not interfere with the full Activity Console page's state

### Task 7.2: Create page wrapper and route [COMPLETE]
**Files:**
- `apps/frontend/src/app/pages/InfrastructureControlPanelPage.tsx` — page wrapper
- `apps/frontend/src/main.tsx` — route registration

Create page wrapper and register route at `/admin/infrastructure`.

**Acceptance Criteria:**
- [x] Route `/admin/infrastructure` renders the Infrastructure Control Panel
- [x] Page is lazy-loaded
- [x] Page accessible from admin navigation
- [x] Old `/admin/cloud-gpus` route redirects to `/admin/infrastructure` (or both coexist initially)

### Task 7.3: Replace generation page InfrastructurePanel with compact summary [COMPLETE]
**File:** `apps/frontend/src/features/generation/InfrastructurePanel.tsx`

Replace the existing InfrastructurePanel with a compact "Infrastructure Summary" widget that:
- Shows connected count and status dot (same as current)
- Shows a "Manage Infrastructure" link to `/admin/infrastructure`
- Removes the start/stop pod buttons (those live on the full panel now)

**Acceptance Criteria:**
- [x] Summary shows connected count and status indicator
- [x] "Manage Infrastructure" link navigates to `/admin/infrastructure`
- [x] Start/stop pod buttons removed from generation page
- [x] Component is significantly simpler than current implementation
- [x] No functionality regression — all controls available on the full panel

### Task 7.4: Create feature barrel file and types [COMPLETE]
**Files:**
- `apps/frontend/src/features/infrastructure/index.ts` — barrel exports
- `apps/frontend/src/features/infrastructure/types.ts` — TypeScript types

Define all types for the infrastructure feature:
- `OrphanScanResult`, `CloudOrphan`, `DbOrphan`, `ComfyuiOrphan`
- `OrphanCleanupRequest`, `CloudOrphanAction`, `DbOrphanAction`
- `BulkRequest`, `BulkResult`, `InstanceActionResult`
- `EnrichedInstance` (from Task 3.5)

**Acceptance Criteria:**
- [x] All API request/response types defined
- [x] Types match backend handler structs exactly
- [x] Barrel file exports all public components and hooks
- [x] No duplicate type definitions (reuse `CloudInstance`, `CloudProvider` from cloud-gpus)

---

## Relevant Files

| File | Description |
|------|-------------|
| `crates/cloud/src/runpod/orchestrator.rs` | PodOrchestrator — add `restart_comfyui` method |
| `crates/comfyui/src/manager.rs` | ComfyUIManager — add `force_reconnect` method |
| `crates/core/src/cloud.rs` | CloudGpuProvider trait — add `list_all_instances` |
| `crates/api/src/handlers/infrastructure.rs` | API handlers — orphan scan, bulk ops, recovery |
| `crates/api/src/routes/infrastructure.rs` | Route registration for new endpoints |
| `crates/cloud/src/services/reconciliation.rs` | Reconciliation — add activity logging |
| `crates/events/src/activity.rs` | ActivityLogBroadcaster (existing, no changes) |
| `crates/core/src/activity.rs` | ActivityLogEntry types (existing, no changes) |
| `features/infrastructure/InfrastructureControlPanel.tsx` | Main page component |
| `features/infrastructure/components/InstanceCard.tsx` | Instance card with all fields |
| `features/infrastructure/components/InstanceActions.tsx` | State-dependent action buttons |
| `features/infrastructure/components/BulkActionToolbar.tsx` | Multi-select toolbar |
| `features/infrastructure/components/OrphanPanel.tsx` | Orphan detection & cleanup UI |
| `features/infrastructure/components/RecoveryActions.tsx` | Failed connection recovery |
| `features/infrastructure/components/ProviderManagement.tsx` | Inline provider CRUD |
| `features/infrastructure/components/ProvisionWizard.tsx` | Multi-step provisioning wizard |
| `features/infrastructure/components/InfrastructureActivityLog.tsx` | Embedded activity console |
| `features/infrastructure/hooks/use-infrastructure-ops.ts` | Hooks for new endpoints |
| `features/infrastructure/hooks/use-all-instances.ts` | Combined instances query |
| `features/infrastructure/hooks/use-instance-selection.ts` | Multi-select state |
| `features/infrastructure/types.ts` | TypeScript types |
| `features/infrastructure/index.ts` | Barrel exports |
| `features/generation/InfrastructurePanel.tsx` | Simplified to compact summary |
| `app/pages/InfrastructureControlPanelPage.tsx` | Page wrapper |
| `main.tsx` | Route registration |

---

## Dependencies

### Existing Components to Reuse
- `useCloudProviders`, `useInstances`, `useGpuTypes`, `useProvisionInstance`, `useCreateProvider`, `useUpdateProvider`, `useDeleteProvider`, `useTestConnection` from `features/admin/cloud-gpus/hooks/use-cloud-providers.ts`
- `useInfrastructureStatus`, `useStartPod`, `useStopPod`, `useRefreshInstances` from `features/generation/hooks/use-infrastructure.ts`
- `ActivityConsolePanel` from `features/activity-console/ActivityConsolePanel.tsx`
- `INSTANCE_STATUS`, `STATUS_LABELS`, `STATUS_COLORS` from `features/admin/cloud-gpus/components/CloudInstanceList.tsx` (extract to shared constants)
- `formatCents` from `lib/format.ts`
- `Badge`, `Button`, `Spinner` from `components/primitives`
- `EmptyState` from `components/domain`
- `CollapsibleSection` from `components/composite`
- `ActivityLogBroadcaster` from `events/src/activity.rs`
- `ActivityLogEntry::curated()` from `core/src/activity.rs`

### New Infrastructure Needed
- `PodOrchestrator::restart_comfyui()` method
- `ComfyUIManager::force_reconnect()` method
- `CloudGpuProvider::list_all_instances()` trait method + RunPod impl
- 8 new API endpoints (orphan scan/cleanup, bulk start/stop/terminate, restart-comfyui, force-reconnect, reset-state)
- `features/infrastructure/` — new frontend feature directory with all components and hooks

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Backend endpoints — Tasks 1.1-1.8
2. Phase 2: Curated activity logging — Tasks 2.1-2.4
3. Phase 3: Unified dashboard page — Tasks 3.1-3.5
4. Phase 4: Bulk operations — Tasks 4.1-4.2
5. Phase 5: Orphan detection & recovery — Tasks 5.1-5.2
6. Phase 6: Provider management & provisioning — Tasks 6.1-6.2
7. Phase 7: Activity console & page integration — Tasks 7.1-7.4

**MVP Success Criteria:**
- Admin can see all instances across all providers in a single view at `/admin/infrastructure`
- Admin can start/stop/terminate individual instances with state-dependent controls
- Admin can select multiple instances and bulk start/stop/terminate
- Admin can scan for orphans and clean them up
- Admin can retry failed connections and restart ComfyUI without re-provisioning
- Admin can add/edit/remove providers inline
- Admin can provision new instances via a guided wizard
- All infrastructure events are logged as curated activity entries and visible in an embedded console
- Generation page shows compact infrastructure summary with link to full panel

### Post-MVP Enhancements
- Phase 8: Real-time SSE status updates (PRD Req 2.1)
- Phase 9: Cost alerts and budget enforcement (PRD Req 2.2)
- Phase 10: Instance SSH log viewer (PRD Req 2.3)

---

## Notes

1. **Status constants duplication** — `INSTANCE_STATUS`, `STATUS_LABELS`, `STATUS_COLORS` are defined in `CloudInstanceList.tsx`. These should be extracted to a shared constants file (`features/infrastructure/constants.ts` or similar) and reused by both the old cloud-gpus component (if kept) and the new infrastructure panel.
2. **Activity log filtering** — the embedded activity console needs to filter by source (`comfyui`, `worker`). Check if the existing `ConsoleFilterToolbar` supports external control of filters, or if the WebSocket subscription filter (via `WsClientAction`) should be set programmatically.
3. **CloudGpuProvider trait change** — adding `list_all_instances` is a breaking trait change. Use a default implementation returning `Ok(vec![])` so existing test/mock implementors don't break.
4. **ComfyUI connection status correlation** — matching `comfyui_instances` to `cloud_instances` requires joining on instance name (e.g., `runpod-{pod_id}` maps to `cloud_instances.external_id`). This correlation logic should be centralized in the backend status endpoint rather than duplicated on the frontend.
5. **Force parameter for graceful stop** — "graceful stop" (waiting for current job) ties into PRD-132 queue management. For MVP, "graceful" means just calling `stop_instance` and "force" means `terminate_instance`. More nuanced job-aware stopping can be added when PRD-132 is implemented.

---

## Version History

- **v1.0** (2026-03-10): Initial task list creation from PRD-131
