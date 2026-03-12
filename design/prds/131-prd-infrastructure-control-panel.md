# PRD-131: Infrastructure Control Panel

## 1. Introduction/Overview

The platform currently has **two separate UIs** for managing cloud GPU infrastructure:

1. **Infrastructure Panel** (`/production/generation`) — a small panel embedded in the Generation page that can start/stop a single RunPod pod and refresh ComfyUI connections. Limited to one pod, one provider.

2. **Cloud GPU Dashboard** (`/admin/cloud-gpus`) — a full admin dashboard with provider CRUD, instance lists, scaling rules, cost summaries, and emergency stop. Has the data model for multi-provider/multi-instance but isn't connected to the pod orchestrator's SSH startup automation.

Neither UI provides:
- A unified view of **all** active connections across providers and services
- Bulk operations (start/stop/terminate multiple instances at once)
- Orphan detection and cleanup (instances that exist at the cloud provider but aren't tracked in DB, or DB rows pointing to terminated pods)
- Failed connection recovery (instances stuck in error/reconnecting states)
- Real-time connection health with actionable remediation

This PRD creates a single **Infrastructure Control Panel** that replaces both existing UIs with a unified, operational command center for all cloud GPU infrastructure.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-02 (Backend Foundation)
  - PRD-05 (ComfyUI WebSocket Bridge)
  - PRD-114 (Cloud GPU Provider Integration — DB schema, provider trait, background services)
  - PRD-130 (Unified Cloud & ComfyUI Orchestration — DB-driven config, full lifecycle automation)
- **Extends:**
  - PRD-114 — adds orphan cleanup, bulk operations, unified UI
  - PRD-130 — adds multi-select operations, connection health management
- **Integrates with:**
  - PRD-10 (Event Bus — real-time status updates via SSE/WebSocket)
  - PRD-118 (Activity Console — infrastructure events stream to activity log)

## 3. Goals

- Provide a single page where admins can see and manage every cloud instance and ComfyUI connection across all configured providers.
- Enable bulk operations: start, stop, or terminate multiple instances at once with a single action.
- Detect and clean up orphaned resources — instances that exist at the cloud provider but aren't in our database, and database rows pointing to non-existent pods.
- Recover from failed connections — retry stuck instances, force-disconnect stale WebSocket connections, re-trigger SSH startup on pods where ComfyUI didn't start.
- Surface real-time health and cost information to enable informed operational decisions.

## 4. User Stories

- **As an admin**, I want to see all active cloud instances and ComfyUI connections in one place, regardless of which provider they belong to, so I have a single pane of glass for infrastructure.
- **As an admin**, I want to select multiple instances and stop/terminate them all at once so I can quickly scale down at end of day.
- **As an admin**, I want the system to detect orphaned pods (running at RunPod but not tracked in our DB) so I can decide to import or terminate them and stop paying for forgotten resources.
- **As an admin**, I want to clean up stale database rows (instances marked "running" but actually terminated at the provider) so our state is accurate.
- **As an admin**, I want to retry a failed instance (re-run SSH startup, re-establish WebSocket) without having to terminate and re-provision from scratch.
- **As an admin**, I want to see per-instance cost (current session and cumulative) so I can make cost-aware decisions about which instances to keep running.
- **As an admin**, I want real-time status updates (not just polling) so I can see pods transitioning through startup stages without refreshing.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Unified Instance Dashboard

**Description:** A single-page view showing all cloud instances and ComfyUI connections. Each instance shows its provider, status, GPU type, connection state, uptime, and cost. Instances are grouped by provider with collapsible sections.

**Instance Card Information:**
- Instance name and external ID
- Provider name and type (RunPod, etc.)
- GPU type and count
- Status: provisioning → starting → SSH startup → ComfyUI starting → connected → stopping → terminated
- ComfyUI connection status: connected / disconnected / reconnecting / not registered
- IP address and SSH port (for debugging)
- Uptime (since `started_at`)
- Session cost (calculated from `cost_per_hour_cents * uptime_hours`)
- Cumulative cost (`total_cost_cents`)
- Last health check timestamp

**Acceptance Criteria:**
- [ ] Single page shows all instances from all providers
- [ ] Instances grouped by provider with provider health indicator
- [ ] Each instance card shows all fields listed above
- [ ] Status updates reflect real-time state (polling at 10s or SSE)
- [ ] Empty state shows "No providers configured" with link to provider setup
- [ ] Page accessible at `/admin/infrastructure` route

#### Requirement 1.2: Individual Instance Controls

**Description:** Each instance card has action buttons based on current state.

**Available Actions by State:**
| State | Actions |
|-------|---------|
| Provisioning | Cancel |
| Starting (SSH/ComfyUI) | Cancel, View Logs |
| Connected (running) | Stop, Terminate, Restart ComfyUI |
| Disconnected (pod running) | Retry Connection, Restart ComfyUI, Stop, Terminate |
| Error | Retry, Terminate, View Error |
| Stopped | Start, Terminate |
| Terminated | Remove from DB |

**"Restart ComfyUI" Action:**
Re-runs the SSH startup script on the pod without terminating/re-provisioning. Useful when ComfyUI crashes but the pod is still running.

**"Retry Connection" Action:**
Forces ComfyUI manager to re-attempt WebSocket connection to the instance. Useful when the connection dropped but ComfyUI is still running.

**Acceptance Criteria:**
- [ ] Each instance card shows only valid actions for its current state
- [ ] Actions execute with loading state and success/error feedback
- [ ] Destructive actions (terminate) require confirmation dialog
- [ ] "Restart ComfyUI" re-runs SSH startup script without pod termination
- [ ] "Retry Connection" forces WebSocket reconnect attempt
- [ ] All actions are logged in the activity console

#### Requirement 1.3: Bulk Operations

**Description:** Admin can select multiple instances (checkboxes) and perform bulk actions: start all, stop all, terminate all.

**Bulk Actions:**
- **Start Selected** — resumes stopped instances (triggers full lifecycle per PRD-130)
- **Stop Selected** — stops running instances (graceful: waits for current job to finish or offers force-stop)
- **Terminate Selected** — terminates instances (with confirmation showing cost implications)
- **Select All / Deselect All** — toggle all visible instances

**Acceptance Criteria:**
- [ ] Checkbox on each instance card for multi-select
- [ ] Bulk action toolbar appears when 1+ instances selected, showing count
- [ ] "Stop Selected" offers graceful (wait for job) vs force (immediate) option
- [ ] "Terminate Selected" shows confirmation with instance count and estimated savings
- [ ] Bulk operations execute concurrently (not sequentially)
- [ ] Progress indicator shows N/M instances processed
- [ ] Failed operations for individual instances don't block others

#### Requirement 1.4: Orphan Detection & Cleanup

**Description:** The system detects orphaned resources in both directions:
1. **Cloud orphans** — instances running at the provider that aren't tracked in our `cloud_instances` table
2. **DB orphans** — `cloud_instances` rows marked as running/starting but the actual pod is terminated or doesn't exist at the provider
3. **ComfyUI orphans** — `comfyui_instances` rows marked enabled but pointing to non-existent or terminated cloud instances

**Detection:**
- API endpoint that queries each provider for all instances, compares against `cloud_instances` table
- Runs on-demand (admin clicks "Scan for orphans") and as part of the reconciliation service (every 5 minutes)

**Cleanup Actions:**
- **Cloud orphan:** Admin can choose to "Import" (create DB row and register) or "Terminate" (kill at provider)
- **DB orphan:** Admin can choose to "Remove" (delete DB row) or "Re-sync" (query provider for current status)
- **ComfyUI orphan:** Auto-disable the `comfyui_instances` row and disconnect WebSocket

**Acceptance Criteria:**
- [ ] "Scan for Orphans" button triggers provider-side instance listing
- [ ] Orphan panel shows all three types with clear labeling
- [ ] Cloud orphans can be imported (creates cloud_instances + comfyui_instances rows) or terminated
- [ ] DB orphans can be removed or re-synced with provider
- [ ] ComfyUI orphans are auto-cleaned on scan (disable + disconnect)
- [ ] Reconciliation service logs orphan findings to activity console
- [ ] Scan results show provider-side cost for cloud orphans (so admin knows cost of forgotten pods)

#### Requirement 1.5: Failed Connection Recovery

**Description:** Instances in error or disconnected states get recovery options instead of requiring full terminate-and-reprovision cycles.

**Recovery Actions:**
- **Re-run SSH startup** — for pods where the SSH script failed or ComfyUI didn't start. Re-executes `/workspace/start_comfyui.sh` via SSH.
- **Force WebSocket reconnect** — for instances where ComfyUI is running but WebSocket dropped. Resets reconnect backoff timer and attempts immediate connection.
- **Reset instance state** — for instances stuck in transitional states (provisioning, starting). Queries provider for actual status and updates DB accordingly.

**Acceptance Criteria:**
- [ ] Error instances show the error message and a "Retry" button
- [ ] Disconnected instances with running pods show "Restart ComfyUI" and "Retry Connection"
- [ ] Stuck instances (>10 min in provisioning/starting) show "Reset State" action
- [ ] Recovery actions log their attempts and results
- [ ] Failed recovery increments a retry counter; after 3 failures, instance is marked as error with recommendation to terminate

#### Requirement 1.6: Provider Management Inline

**Description:** Provider configuration (add/edit/remove) is accessible directly from the Infrastructure Control Panel, not a separate page. This replaces the existing Cloud GPU Dashboard's provider management.

**Acceptance Criteria:**
- [ ] "Add Provider" button opens a modal/drawer with provider configuration form
- [ ] Each provider section header has an "Edit" and "Remove" action
- [ ] Provider edit form includes: name, API key (masked), provider-specific settings (template ID, GPU type, SSH key path, network volume, startup script path)
- [ ] "Test Connection" button validates API key against provider
- [ ] Provider removal is blocked if active instances exist
- [ ] New providers are immediately available for instance provisioning (no restart)

#### Requirement 1.7: Instance Provisioning Wizard

**Description:** "New Instance" button opens a wizard that guides the admin through provisioning a new cloud GPU instance.

**Wizard Steps:**
1. Select provider (from configured providers)
2. Select GPU type (from synced `cloud_gpu_types` for that provider)
3. Specify count (how many instances to provision)
4. Review estimated cost per hour
5. Confirm and provision

**Acceptance Criteria:**
- [ ] Wizard shows only GPU types available at the selected provider
- [ ] Cost estimate shown before confirmation
- [ ] Provisioning triggers full lifecycle (PRD-130: provision → SSH → ComfyUI → WebSocket)
- [ ] Progress shown in real-time on the new instance card
- [ ] Multiple instances can be provisioned in a single wizard flow

#### Requirement 1.8: Curated Activity Logging for Infrastructure Events

**Description:** All infrastructure lifecycle events must emit **curated** (user-friendly) activity log entries via `ActivityLogBroadcaster`, not just verbose tracing output. The existing `ActivityTracingLayer` captures `tracing::info!` calls as "verbose" entries, but infrastructure events need to be prominent, readable, and contextual so admins can follow what's happening in the Activity Console without wading through debug noise.

**Curated Events to Emit (source: `Comfyui` or `Worker`):**

| Event | Level | Message Example |
|-------|-------|-----------------|
| Pod provisioning started | Info | "Provisioning new RunPod instance (RTX PRO 6000, EU-CZ-1)" |
| Pod runtime ready | Info | "Pod runpod-abc123 is running (213.192.2.101:22345)" |
| SSH startup started | Info | "Starting ComfyUI on runpod-abc123 via SSH..." |
| SSH startup completed | Info | "ComfyUI started successfully on runpod-abc123 (took 47s)" |
| SSH startup failed | Error | "SSH startup failed on runpod-abc123: connection refused after 120s" |
| ComfyUI health check passed | Info | "ComfyUI on runpod-abc123 is healthy and ready for jobs" |
| WebSocket connected | Info | "WebSocket connected to runpod-abc123 (wss://...)" |
| WebSocket disconnected | Warn | "WebSocket disconnected from runpod-abc123, will retry" |
| Instance stop requested | Info | "Stopping instance runpod-abc123 (admin: john@example.com)" |
| Instance terminated | Info | "Instance runpod-abc123 terminated (ran 2h 15m, cost: $4.50)" |
| Orphan detected | Warn | "Orphan detected: pod xyz789 running at RunPod but not tracked in database" |
| Orphan cleaned up | Info | "Orphan pod xyz789 terminated (was costing $2.00/hr)" |
| Bulk operation started | Info | "Bulk terminate: stopping 3 instances (admin: john@example.com)" |
| Recovery attempted | Info | "Retrying ComfyUI startup on runpod-abc123 (attempt 2/3)" |
| Recovery failed | Error | "Recovery failed for runpod-abc123 after 3 attempts — marked as error" |
| Auto-scale triggered | Info | "Auto-scaling: provisioning 1 new instance (queue depth: 12, threshold: 5)" |
| Auto-scale down | Info | "Auto-scaling: terminating runpod-abc123 (queue empty for 5 minutes)" |

**Implementation Pattern:**
```rust
// Use curated entries (not just tracing::info!)
broadcaster.publish(
    ActivityLogEntry::curated(ActivityLogLevel::Info, ActivityLogSource::Comfyui,
        &format!("Pod {} is running ({}:{})", pod_name, ip, port))
        .with_fields(json!({ "pod_id": external_id, "provider": "runpod" }))
);
```

**Embedded Log Panel:**
The Infrastructure Control Panel page must include an embedded, filtered Activity Console panel that shows only infrastructure-related events (source: `Comfyui` | `Worker`). This gives admins immediate visibility into what's happening without navigating to the full Activity Console.

**Acceptance Criteria:**
- [ ] All lifecycle events in the table above emit curated activity log entries
- [ ] Entries include structured `fields` JSONB with pod ID, provider, instance name, IP, timing info
- [ ] Entries use correct `ActivityLogSource` (Comfyui for pod/connection events, Worker for background service events)
- [ ] Infrastructure Control Panel page has an embedded Activity Console panel filtered to infrastructure sources
- [ ] Cost information included in termination/cleanup log entries where available
- [ ] Admin user identity included in manually-triggered actions
- [ ] Auto-scaling events include queue depth and threshold that triggered the decision

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL - Post-MVP]** Real-Time Status via SSE

**Description:** Replace polling with Server-Sent Events for instance status updates. The backend broadcasts status changes as they happen.

**Acceptance Criteria:**
- [ ] SSE endpoint streams instance status changes
- [ ] Frontend receives updates without polling
- [ ] Startup stages (provisioning → SSH → ComfyUI → connected) update in real-time

#### Requirement 2.2: **[OPTIONAL - Post-MVP]** Cost Alerts & Budget Enforcement

**Description:** Configurable alerts when spending approaches budget limits. Automatic scale-down when budget is exceeded.

**Acceptance Criteria:**
- [ ] Alert thresholds configurable per provider (70%, 90%, 100% of budget)
- [ ] Notifications sent via event bus when thresholds crossed
- [ ] Optional auto-terminate when budget exceeded

#### Requirement 2.3: **[OPTIONAL - Post-MVP]** Instance Logs Viewer

**Description:** View SSH startup logs and ComfyUI startup logs directly in the UI, streamed from the pod via SSH.

**Acceptance Criteria:**
- [ ] Log viewer accessible per instance
- [ ] SSH logs captured during startup and stored
- [ ] ComfyUI stdout/stderr accessible via API

## 6. Non-Goals (Out of Scope)

- **Queue management / job allocation** — covered by PRD-132
- **Auto-scaling rule configuration** — existing cloud GPU dashboard scaling rules are sufficient; this PRD focuses on operational controls, not policy configuration
- **Multi-tenant provider isolation** — all providers shared across the platform
- **Serverless endpoint management** — RunPod Serverless is shelved

## 7. Design Considerations

- Replace the current split between Infrastructure Panel (generation page) and Cloud GPU Dashboard (admin) with a single `/admin/infrastructure` page
- The generation page should show a compact "Infrastructure Summary" widget that links to the full panel
- Instance cards should use color-coded status badges consistent with the design system
- Bulk action toolbar should be sticky at the top when instances are selected
- Orphan detection results should be shown in an alert banner, not buried in a sub-page

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| Cloud GPU Dashboard | `features/admin/cloud-gpus/` | Absorb and replace — reuse data hooks |
| Infrastructure Panel | `features/generation/InfrastructurePanel.tsx` | Replace with compact summary widget |
| Infrastructure hooks | `features/generation/hooks/use-infrastructure.ts` | Extend with bulk ops, orphan scan |
| Cloud provider handlers | `handlers/cloud_providers.rs` | Extend with orphan scan, bulk ops |
| Infrastructure handlers | `handlers/infrastructure.rs` | Merge into cloud provider handlers |
| Reconciliation service | `cloud/src/services/reconciliation.rs` | Extend to surface orphan findings |
| PodOrchestrator | `cloud/src/runpod/orchestrator.rs` | Add `restart_comfyui()` method |
| ComfyUIManager | `comfyui/src/manager.rs` | Add `force_reconnect(instance_id)` |

### New Infrastructure Needed

- **Orphan scan endpoint** — queries provider for all instances, diffs against DB
- **Bulk operation endpoints** — accept array of instance IDs
- **Restart ComfyUI endpoint** — re-runs SSH startup on a running pod
- **Force reconnect endpoint** — resets backoff and reconnects WebSocket
- **Instance state reset endpoint** — queries provider and corrects DB state

### Database Changes

None — existing `cloud_instances`, `cloud_providers`, `comfyui_instances` tables are sufficient.

### API Changes

**New Endpoints:**
- `POST /api/v1/admin/infrastructure/scan-orphans` — detect orphaned resources
- `POST /api/v1/admin/infrastructure/cleanup-orphans` — clean up selected orphans
- `POST /api/v1/admin/infrastructure/bulk/stop` — stop multiple instances
- `POST /api/v1/admin/infrastructure/bulk/terminate` — terminate multiple instances
- `POST /api/v1/admin/infrastructure/bulk/start` — start multiple instances
- `POST /api/v1/admin/cloud-instances/:id/restart-comfyui` — re-run SSH startup
- `POST /api/v1/admin/cloud-instances/:id/force-reconnect` — force WebSocket reconnect
- `POST /api/v1/admin/cloud-instances/:id/reset-state` — re-sync state from provider

## 9. Success Metrics

- Admin can see all instances across all providers in a single view.
- Admin can start 5 pods and have all 5 become connected workers within 5 minutes using bulk provisioning.
- Admin can terminate all instances with 2 clicks (select all + terminate).
- Orphan scan identifies forgotten pods within 30 seconds.
- Failed instances can be recovered without terminate-and-reprovision in >50% of cases.

## 10. Open Questions

1. **Should the Infrastructure Panel replace the Cloud GPU Dashboard entirely**, or should both coexist with the Infrastructure Panel being the operational view and Cloud GPU Dashboard being the configuration view?
2. **Graceful stop behavior** — when stopping a pod that has a running job, should we wait for the job to complete (potentially hours) or cancel the job and reassign? (Ties into PRD-132 queue management.)
3. **Orphan auto-cleanup** — should the reconciliation service automatically terminate cloud orphans after a configurable grace period, or always require admin approval?

## 11. Version History

- **v1.0** (2026-03-10): Initial PRD creation
- **v1.1** (2026-03-10): Added Requirement 1.8 — curated activity logging for all infrastructure lifecycle events, embedded Activity Console panel filtered to infrastructure sources
