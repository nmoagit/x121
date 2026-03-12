# PRD-130: Unified Cloud & ComfyUI Orchestration

## 1. Introduction/Overview

The platform currently has **two parallel systems** for managing cloud GPU instances:

1. **PodOrchestrator** — reads configuration from `.env` files, manages a single RunPod pod, handles SSH startup of custom ComfyUI, and verifies readiness. Config changes require a server restart. Only supports one pod at a time.

2. **Cloud Provider Registry** — a database-driven multi-provider system with `cloud_providers`, `cloud_instances`, `cloud_gpu_types`, `cloud_scaling_rules` tables, plus background scaling/monitoring/reconciliation services. Supports multiple providers and instances but has no SSH startup automation and no bridge to the ComfyUI WebSocket manager.

These systems operate independently. The PodOrchestrator bypasses the cloud provider tables entirely. The Cloud Provider Registry provisions pods but doesn't automate ComfyUI startup or register them as ComfyUI instances. Neither system connects the full lifecycle: **provision pod → SSH startup → ComfyUI readiness → WebSocket connection → queue distribution → teardown**.

This PRD unifies both systems into a single, database-driven orchestration layer where:
- All configuration lives in the database (not `.env`)
- Multiple pods and providers are supported simultaneously
- Pod lifecycle is fully automated end-to-end
- The generation queue distributes work across all connected ComfyUI workers

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-02 (Backend Foundation — Axum server, middleware)
  - PRD-05 (ComfyUI WebSocket Bridge — WebSocket connection management)
  - PRD-114 (Cloud GPU Provider Integration — DB schema, provider trait, RunPod API client)
- **Extends:**
  - PRD-114 — merges PodOrchestrator SSH automation into the cloud provider lifecycle
  - PRD-05 — auto-bridges cloud instances to ComfyUI WebSocket manager
- **Integrates with:**
  - PRD-08 (Queue Management — queue depth drives auto-scaling)
  - PRD-87 (GPU Power Management — pod stop/start lifecycle)
  - PRD-93 (Budget & Quotas — budget caps prevent runaway spend)

## 3. Goals

- Eliminate `.env` dependency for all cloud GPU configuration — API keys, GPU types, template IDs, SSH key paths, network volume IDs all stored in database.
- Enable hot-reloading of cloud provider configuration without server restart.
- Automate the complete pod lifecycle: provision → SSH startup → ComfyUI verification → WebSocket registration → queue distribution → teardown.
- Support multiple simultaneous pods across multiple providers, with the generation queue distributed across all connected ComfyUI workers.
- Provide a migration path from `.env`-based configuration to database-driven configuration.

## 4. User Stories

- **As an admin**, I want to add cloud provider credentials via the Admin UI so I don't need to edit `.env` files and restart the server.
- **As an admin**, I want to start a pod and have it automatically become a connected ComfyUI worker ready for video generation — no manual SSH or DB row manipulation needed.
- **As an admin**, I want to run multiple pods simultaneously so the generation queue is processed faster.
- **As an admin**, I want to stop a pod and have it automatically disconnected from the ComfyUI manager so no jobs are sent to it.
- **As an admin**, I want auto-scaling to automatically provision and configure pods based on queue depth.
- **As an admin**, I want to configure provider settings (SSH key path, startup script, template ID, network volume) per provider in the database.
- **As a creator**, I want my generation jobs to be distributed across all available workers transparently.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Database-Driven Provider Configuration

**Description:** Move all RunPod configuration from `.env` to the `cloud_providers.settings` JSONB column. The PodOrchestrator must load configuration from the database instead of environment variables.

**RunPod `settings` JSONB schema:**
```json
{
  "template_id": "cw3nka7d08",
  "network_volume_id": "glhxpn3tgb",
  "gpu_type_id": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "ssh_key_path": "~/.ssh/id_ed25520",
  "startup_script": "/workspace/start_comfyui.sh",
  "default_region": "EU-CZ-1",
  "default_cloud_type": "SECURE",
  "comfyui_port": 8188
}
```

**Acceptance Criteria:**
- [ ] PodOrchestrator loads all config from `cloud_providers` table (API key from `api_key_encrypted`/`api_key_nonce`, settings from `settings` JSONB)
- [ ] No RunPod-specific environment variables are required at runtime (after initial seed migration)
- [ ] Provider settings can be updated via admin API without server restart
- [ ] `PodOrchestratorConfig::from_env()` is replaced with `PodOrchestratorConfig::from_provider(provider: &CloudProvider)`

#### Requirement 1.2: Env-to-Database Migration Seeder

**Description:** On first boot, if no `cloud_providers` row exists with `provider_type = 'runpod'`, auto-create one from the legacy `.env` variables (`RUNPOD_API_KEY`, `RUNPOD_TEMPLATE_ID`, `RUNPOD_GPU_TYPE_ID`, etc.). After migration, `.env` vars are ignored in favor of DB config.

**Acceptance Criteria:**
- [ ] On startup, check if any `cloud_providers` with `provider_type = 'runpod'` exist
- [ ] If none exist and `RUNPOD_API_KEY` env var is set, create a `cloud_providers` row with encrypted API key and settings populated from env vars
- [ ] If a row already exists, env vars are ignored entirely
- [ ] Migration is logged at `info` level so admin can verify it ran
- [ ] Seed creates a corresponding `cloud_gpu_types` row for the configured GPU type

#### Requirement 1.3: Unified Pod Lifecycle Orchestration

**Description:** When a cloud instance is provisioned (manually or by auto-scaler), the system must automatically execute the full startup sequence: wait for runtime → SSH startup → ComfyUI verification → register `comfyui_instances` row → connect WebSocket. When a cloud instance is terminated, the reverse: disconnect WebSocket → disable `comfyui_instances` row → terminate pod.

**Startup sequence:**
1. Provision/resume pod via RunPod API → `cloud_instances` row created with `status = provisioning`
2. Wait for pod runtime ready (SSH port available) → update `cloud_instances.ip_address`, `ssh_port`
3. SSH into pod, run startup script (kill template ComfyUI, install deps, start custom ComfyUI)
4. Poll ComfyUI health endpoint until ready
5. Upsert `comfyui_instances` row with correct `ws_url` and `api_url`
6. Call `ComfyUIManager::refresh_instances()` to establish WebSocket connection
7. Update `cloud_instances.status = running`

**Teardown sequence:**
1. Disconnect WebSocket for the instance
2. Disable `comfyui_instances` row (`is_enabled = false`)
3. Stop/terminate pod via RunPod API
4. Update `cloud_instances.status = stopped/terminated`

**Acceptance Criteria:**
- [ ] Starting a pod from the admin UI results in a fully connected ComfyUI worker within ~3 minutes (without manual intervention)
- [ ] Stopping a pod from the admin UI disconnects the ComfyUI WebSocket and prevents new jobs being sent to it
- [ ] `comfyui_instances` rows are automatically created/disabled as pods start/stop
- [ ] SSH startup failures are retried once before marking the instance as errored
- [ ] All lifecycle events are logged with pod name, provider, and timing information
- [ ] `cloud_instances` status accurately reflects the current state at all times

#### Requirement 1.4: Multi-Instance Support

**Description:** Multiple pods can run simultaneously. The `ComfyUIManager` already supports multiple WebSocket connections. The pipeline's `pick_instance()` function already distributes work across connected instances. This requirement ensures the orchestration layer correctly manages N concurrent pods.

**Acceptance Criteria:**
- [ ] Admin can start multiple pods from the same provider
- [ ] Each pod gets a unique `comfyui_instances` entry (named `runpod-{external_id}`)
- [ ] All running pods appear as connected instances in `ComfyUIManager`
- [ ] Pipeline `pick_instance()` distributes jobs across all connected instances
- [ ] Stopping one pod does not affect other running pods
- [ ] Instance count is limited by `cloud_scaling_rules.max_instances` when auto-scaling

#### Requirement 1.5: Auto-Scaling with Full Lifecycle

**Description:** The existing scaling service (30s interval) should trigger the full lifecycle when scaling. Currently it can provision/terminate pods via the provider API but doesn't automate SSH startup or ComfyUI registration.

**Scale-up flow:**
1. Scaling service detects `pending_jobs > queue_threshold`
2. Checks `current_instances < max_instances` and cooldown timer
3. Provisions a new pod → triggers Requirement 1.3 startup sequence
4. Pod becomes a connected worker, starts processing queue items

**Scale-down flow:**
1. Scaling service detects `pending_jobs < queue_threshold` for `cooldown_secs`
2. Checks `current_instances > min_instances`
3. Selects least-busy instance
4. Triggers Requirement 1.3 teardown sequence

**Acceptance Criteria:**
- [ ] Scaling service provisions pods that automatically become connected ComfyUI workers
- [ ] Scaling service terminates pods that are automatically disconnected from ComfyUI manager
- [ ] Cooldown timer prevents rapid scale-up/scale-down oscillation
- [ ] Budget limits in `cloud_scaling_rules` or `cloud_providers` are respected
- [ ] Manual start/stop is still possible alongside auto-scaling

#### Requirement 1.6: Admin API for Provider Management

**Description:** Admin endpoints to CRUD cloud providers, including encrypted API key storage. Provider settings can be updated without server restart.

**Endpoints:**
- `POST /api/v1/admin/cloud-providers` — create provider with API key + settings
- `GET /api/v1/admin/cloud-providers` — list all providers (API key masked)
- `PUT /api/v1/admin/cloud-providers/:id` — update provider settings
- `DELETE /api/v1/admin/cloud-providers/:id` — delete provider (must have no active instances)
- `POST /api/v1/admin/cloud-providers/:id/validate` — test API key validity

**Acceptance Criteria:**
- [ ] API keys are encrypted before storage using the existing encryption mechanism (`api_key_encrypted` + `api_key_nonce`)
- [ ] API keys are never returned in GET responses (replaced with `"***"`)
- [ ] Updating provider settings takes effect immediately (no restart)
- [ ] Provider deletion is blocked if active `cloud_instances` exist
- [ ] Validation endpoint calls the provider's health check API

#### Requirement 1.7: Link cloud_instances to comfyui_instances

**Description:** Add a foreign key from `comfyui_instances` to `cloud_instances` so the system can track which ComfyUI WebSocket connection corresponds to which cloud pod.

**Database Change:**
```sql
ALTER TABLE comfyui_instances
    ADD COLUMN cloud_instance_id BIGINT REFERENCES cloud_instances(id) ON DELETE SET NULL;

CREATE INDEX idx_comfyui_instances_cloud_instance ON comfyui_instances(cloud_instance_id);
```

**Acceptance Criteria:**
- [ ] `comfyui_instances` rows created by the orchestrator have `cloud_instance_id` set
- [ ] Manually added local ComfyUI instances have `cloud_instance_id = NULL`
- [ ] Admin UI can show which ComfyUI connection belongs to which cloud pod
- [ ] When a `cloud_instances` row is deleted, the linked `comfyui_instances.cloud_instance_id` is set to NULL (not cascaded)

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL - Post-MVP]** Multi-Provider Support

**Description:** Extend the admin UI and orchestration to support providers beyond RunPod (Vast.ai, Lambda Labs, etc.). Each provider implements the `CloudGpuProvider` trait with provider-specific SSH startup logic.

**Acceptance Criteria:**
- [ ] Provider-specific startup scripts configurable per provider in `settings` JSONB
- [ ] Different providers can run simultaneously with jobs distributed across all
- [ ] Provider-specific GPU type catalogs are synced automatically

#### Requirement 2.2: **[OPTIONAL - Post-MVP]** Cost Dashboard

**Description:** Real-time cost tracking per pod, per provider, and per generation job. Uses `cloud_cost_events` table that already exists.

**Acceptance Criteria:**
- [ ] Running cost displayed per active pod in admin UI
- [ ] Monthly cost summary per provider
- [ ] Cost-per-generation attribution (link cost events to generation jobs)

#### Requirement 2.3: **[OPTIONAL - Post-MVP]** SSH Key Management via UI

**Description:** Allow admins to upload SSH keys through the admin UI instead of referencing filesystem paths. Keys stored encrypted in the database.

**Acceptance Criteria:**
- [ ] SSH key upload via admin UI
- [ ] Keys encrypted at rest in database
- [ ] Filesystem path fallback still supported

## 6. Non-Goals (Out of Scope)

- **Serverless endpoints** — RunPod Serverless mode is architecturally different (stateless REST) and is shelved per previous investigation. This PRD focuses on pod-based workers only.
- **Custom Docker image building** — pods use existing RunPod templates; custom image management is out of scope.
- **Worker load balancing algorithms** — the existing `pick_instance()` round-robin is sufficient. Advanced load balancing (VRAM-aware, latency-based) is a separate concern.
- **Multi-tenant provider isolation** — all providers share the same admin context; per-team provider access is out of scope.

## 7. Design Considerations

- The Infrastructure panel in the admin UI already has start/stop/refresh controls — extend it with provider configuration and multi-instance views.
- Instance cards should show: pod name, provider, GPU type, status (provisioning/starting ComfyUI/connected/stopping), uptime, and cost.
- Provider configuration form should include: name, API key (password field), and a JSON/form editor for provider-specific settings.

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Location | Purpose |
|-----------|----------|---------|
| `PodOrchestrator` | `crates/cloud/src/runpod/orchestrator.rs` | SSH startup, ComfyUI verification — keep automation logic, replace config source |
| `CloudGpuProvider` trait | `crates/cloud/src/traits.rs` | Provider abstraction — add lifecycle hooks for SSH startup |
| `RunPodProvider` | `crates/cloud/src/runpod/provider.rs` | RunPod API calls (provision, start, stop, terminate, status) |
| `ProviderRegistry` | `crates/cloud/src/registry.rs` | In-memory runtime provider registry |
| `ComfyUIManager` | `crates/comfyui/src/manager.rs` | WebSocket connection management, `refresh_instances()` |
| `ComfyUIInstanceRepo` | `crates/db/src/repositories/comfyui_instance_repo.rs` | DB operations for ComfyUI instances, `upsert_by_name()` |
| `ScalingService` | `crates/cloud/src/services/scaling.rs` | 30s interval auto-scaling loop |
| `MonitoringService` | `crates/cloud/src/services/monitoring.rs` | 60s health check loop |
| Admin API handlers | `crates/api/src/handlers/infrastructure.rs` | Existing start/stop/refresh endpoints |
| Encryption utilities | `crates/core/` or `crates/cloud/` | API key encryption/decryption (AES-256-GCM) |

### New Infrastructure Needed

- **`PodOrchestratorConfig::from_provider()`** — construct config from `CloudProvider` DB row instead of env vars
- **Lifecycle hooks on `CloudGpuProvider` trait** — `post_provision()` hook that runs SSH startup + ComfyUI registration after pod is provisioned
- **Bridge function** — connects `cloud_instances` lifecycle events to `comfyui_instances` management and `ComfyUIManager`
- **Env seed migration** — one-time migration of `.env` values to `cloud_providers` table on startup

### Database Changes

```sql
-- Link comfyui_instances to cloud_instances
ALTER TABLE comfyui_instances
    ADD COLUMN cloud_instance_id BIGINT REFERENCES cloud_instances(id) ON DELETE SET NULL;
CREATE INDEX idx_comfyui_instances_cloud_instance ON comfyui_instances(cloud_instance_id);
```

### API Changes

- `POST /api/v1/admin/cloud-providers` — new
- `GET /api/v1/admin/cloud-providers` — new
- `PUT /api/v1/admin/cloud-providers/:id` — new
- `DELETE /api/v1/admin/cloud-providers/:id` — new
- `POST /api/v1/admin/cloud-providers/:id/validate` — new
- `POST /api/v1/admin/cloud-instances/:provider_id/start` — modify existing to trigger full lifecycle
- `POST /api/v1/admin/cloud-instances/:id/stop` — modify existing to trigger full teardown

## 9. Success Metrics

- Admin can go from zero pods to a connected, job-processing ComfyUI worker in under 5 minutes via the UI.
- No `.env` restart required to change any cloud provider setting.
- Multiple pods process queue items concurrently with no manual intervention.
- Auto-scaling correctly provisions and tears down pods based on queue depth.

## 10. Open Questions

1. **SSH key storage** — For MVP, should we keep the filesystem path approach (`ssh_key_path` in provider settings), or should we store the private key encrypted in the database? Filesystem path is simpler but less portable.
2. **Startup script customization** — Should different providers/GPU types support different startup scripts, or is one script per provider sufficient for MVP?
3. **Instance naming** — Current naming is `runpod-{external_id}`. Should we support user-defined names for easier identification in the UI?
4. **Encryption key management** — The existing encryption for `api_key_encrypted` uses what key derivation? Need to verify this works correctly before building provider CRUD.

## 11. Version History

- **v1.0** (2026-03-10): Initial PRD creation — unifying PodOrchestrator with cloud provider infrastructure
