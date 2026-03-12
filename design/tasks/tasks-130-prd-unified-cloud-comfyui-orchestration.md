# Task List: Unified Cloud & ComfyUI Orchestration

**PRD Reference:** `design/prds/130-prd-unified-cloud-comfyui-orchestration.md`
**Scope:** Unify the env-driven PodOrchestrator and DB-driven Cloud Provider Registry into a single database-driven orchestration layer with full lifecycle automation (provision -> SSH startup -> ComfyUI verification -> WebSocket registration -> queue distribution -> teardown).

## Overview

The platform currently has two parallel systems for managing cloud GPU instances that operate independently. This task list implements Phase 1 (MVP) of PRD-130, merging the PodOrchestrator's SSH automation into the cloud provider lifecycle, linking `comfyui_instances` to `cloud_instances`, and enabling multi-instance support with auto-scaling lifecycle hooks.

The approach is incremental: first add the DB migration to link tables, then refactor config loading, seed from env, build the unified lifecycle bridge, extend multi-instance support, wire auto-scaling to full lifecycle, and finally clean up the admin API.

### What Already Exists
- `PodOrchestrator` (`crates/cloud/src/runpod/orchestrator.rs`) — SSH startup, ComfyUI verification, pod provision/resume/terminate logic
- `CloudGpuProvider` trait (`crates/core/src/cloud.rs`) — provider abstraction with provision/start/stop/terminate/status
- `RunPodProvider` (`crates/cloud/src/runpod/provider.rs`) — RunPod GraphQL API client
- `ProviderRegistry` (`crates/cloud/src/registry.rs`) — in-memory `HashMap<DbId, Arc<dyn CloudGpuProvider>>`
- `ComfyUIManager` (`crates/comfyui/src/manager.rs`) — multi-instance WebSocket management with `refresh_instances()`
- `ComfyUIInstanceRepo` (`crates/db/src/repositories/comfyui_instance_repo.rs`) — `upsert_by_name()`, `find_by_name_prefix()`, `disable_by_name_prefix()`
- `ScalingService` (`crates/cloud/src/services/scaling.rs`) — 30s interval auto-scaling loop
- Cloud provider admin handlers (`crates/api/src/handlers/cloud_providers.rs`) — full CRUD, GPU type sync, instance management
- Infrastructure handlers (`crates/api/src/handlers/infrastructure.rs`) — start/stop pod, refresh ComfyUI

### What We're Building
1. Database migration linking `comfyui_instances` to `cloud_instances`
2. `PodOrchestratorConfig::from_provider()` — load config from DB instead of env
3. Env-to-DB seed migration on startup
4. Unified lifecycle bridge: cloud instance events trigger SSH startup + ComfyUI registration + WebSocket connection
5. Multi-instance lifecycle management (N concurrent pods)
6. Auto-scaling with full lifecycle hooks (not just provision/terminate)
7. Admin API consolidation (merge infrastructure + cloud-provider endpoints)

### Key Design Decisions
1. **Bridge module, not trait extension** — lifecycle orchestration lives in a new `crates/cloud/src/lifecycle.rs` module rather than adding hooks to the `CloudGpuProvider` trait, keeping the trait pure for provider API calls
2. **`comfyui_instances.cloud_instance_id` FK with ON DELETE SET NULL** — allows manual local ComfyUI instances to coexist with cloud-managed ones
3. **Env vars as bootstrap-only** — after the seed migration runs, `.env` RunPod vars are ignored; the DB is the source of truth
4. **PodOrchestrator reused, not rewritten** — the SSH startup logic is battle-tested; we refactor its config source and call it from the lifecycle bridge

---

## Phase 1: Database Migration [COMPLETE]

### Task 1.1: Add `cloud_instance_id` FK to `comfyui_instances` [COMPLETE]
**File:** `apps/db/migrations/20260311000001_link_comfyui_to_cloud_instances.sql`

Add a nullable foreign key from `comfyui_instances` to `cloud_instances` so the system can track which ComfyUI WebSocket connection belongs to which cloud pod.

```sql
ALTER TABLE comfyui_instances
    ADD COLUMN cloud_instance_id BIGINT REFERENCES cloud_instances(id) ON DELETE SET NULL;

CREATE INDEX idx_comfyui_instances_cloud_instance ON comfyui_instances(cloud_instance_id);

COMMENT ON COLUMN comfyui_instances.cloud_instance_id IS
    'Links to the cloud_instances row when this ComfyUI instance is managed by a cloud pod. NULL for manually added local instances.';
```

**Acceptance Criteria:**
- [x] Migration adds `cloud_instance_id BIGINT` column to `comfyui_instances`
- [x] FK references `cloud_instances(id)` with `ON DELETE SET NULL`
- [x] Index `idx_comfyui_instances_cloud_instance` created
- [x] Existing `comfyui_instances` rows have `cloud_instance_id = NULL` (no data loss)
- [x] Migration is idempotent (can be rolled back and reapplied)

### Task 1.2: Update `ComfyUIInstance` model to include `cloud_instance_id` [COMPLETE]
**File:** `apps/backend/crates/db/src/models/comfyui.rs`

Add the new column to the `ComfyUIInstance` struct.

```rust
pub struct ComfyUIInstance {
    // ... existing fields ...
    pub cloud_instance_id: Option<DbId>,  // NEW
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}
```

**Acceptance Criteria:**
- [x] `ComfyUIInstance` struct has `pub cloud_instance_id: Option<DbId>` field
- [x] Field is positioned between `metadata` and `created_at` (matching column order)
- [x] `COLUMNS` constant in `ComfyUIInstanceRepo` updated to include `cloud_instance_id`

### Task 1.3: Update `ComfyUIInstanceRepo` to support `cloud_instance_id` [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/comfyui_instance_repo.rs`

Extend `upsert_by_name()` to accept an optional `cloud_instance_id` parameter and add a lookup method.

```rust
/// Upsert an instance by name with optional cloud instance link.
pub async fn upsert_by_name_with_cloud(
    pool: &PgPool,
    name: &str,
    ws_url: &str,
    api_url: &str,
    cloud_instance_id: Option<DbId>,
) -> Result<ComfyUIInstance, sqlx::Error> { ... }

/// Find the ComfyUI instance linked to a cloud instance.
pub async fn find_by_cloud_instance_id(
    pool: &PgPool,
    cloud_instance_id: DbId,
) -> Result<Option<ComfyUIInstance>, sqlx::Error> { ... }
```

**Acceptance Criteria:**
- [x] `upsert_by_name_with_cloud()` inserts/updates with `cloud_instance_id` set
- [x] `find_by_cloud_instance_id()` returns the ComfyUI instance linked to a cloud instance
- [x] Existing `upsert_by_name()` still works (passes `NULL` for `cloud_instance_id`)
- [x] `COLUMNS` constant includes `cloud_instance_id`

---

## Phase 2: PodOrchestratorConfig Refactor [COMPLETE]

### Task 2.1: Add `PodOrchestratorConfig::from_provider()` constructor [COMPLETE]
**File:** `apps/backend/crates/cloud/src/runpod/orchestrator.rs`

Add a constructor that builds `PodOrchestratorConfig` from a `CloudProvider` DB row + decrypted API key, reading settings from the `settings` JSONB column.

```rust
/// RunPod-specific settings stored in `cloud_providers.settings` JSONB.
#[derive(Debug, Clone, Deserialize)]
pub struct RunPodSettings {
    pub template_id: Option<String>,
    pub network_volume_id: Option<String>,
    pub gpu_type_id: Option<String>,
    pub ssh_key_path: Option<String>,
    pub startup_script: Option<String>,
    pub default_region: Option<String>,
    pub default_cloud_type: Option<String>,
    pub comfyui_port: Option<u16>,
}

impl PodOrchestratorConfig {
    /// Construct config from a cloud provider DB row and decrypted API key.
    pub fn from_provider(
        api_key: String,
        settings: &serde_json::Value,
    ) -> Result<Self, CloudProviderError> { ... }

    // Keep from_env() for backward compat during migration
}
```

The `RunPodSettings` struct deserializes the JSONB `settings` column. `from_provider()` maps these fields to `PodOrchestratorConfig` fields. The `startup_script` setting replaces the hardcoded `STARTUP_SCRIPT` constant (falling back to `/workspace/start_comfyui.sh` if not set). The `ssh_key_path` undergoes the same `~` expansion as `from_env()`.

**Acceptance Criteria:**
- [x] `RunPodSettings` struct with all fields from PRD (template_id, network_volume_id, gpu_type_id, ssh_key_path, startup_script, default_region, default_cloud_type, comfyui_port)
- [x] `from_provider()` constructs a valid `PodOrchestratorConfig` from decrypted API key + settings JSON
- [x] `ssh_key_path` `~` expansion works in `from_provider()` (reuse existing logic)
- [x] `startup_script` defaults to `/workspace/start_comfyui.sh` if not specified
- [x] `from_env()` is preserved but deprecated (doc comment says "Deprecated: use from_provider()")
- [x] Invalid/missing settings produce a descriptive `CloudProviderError::InvalidConfig`

### Task 2.2: Make `STARTUP_SCRIPT` configurable in PodOrchestrator [COMPLETE]
**File:** `apps/backend/crates/cloud/src/runpod/orchestrator.rs`

Add a `startup_script` field to `PodOrchestratorConfig` so it can be overridden per provider instead of using the hardcoded constant.

```rust
pub struct PodOrchestratorConfig {
    // ... existing fields ...
    /// Path to the startup script on the pod.
    /// Defaults to `/workspace/start_comfyui.sh`.
    pub startup_script: String,
}
```

Update `start_custom_comfyui()` to use `self.config.startup_script` instead of the `STARTUP_SCRIPT` constant.

**Acceptance Criteria:**
- [x] `startup_script` field added to `PodOrchestratorConfig`
- [x] `start_custom_comfyui()` uses `self.config.startup_script` instead of `STARTUP_SCRIPT` constant
- [x] `from_env()` sets `startup_script` to the constant's value (`/workspace/start_comfyui.sh`)
- [x] `from_provider()` reads `startup_script` from settings, falling back to the default
- [x] The `STARTUP_SCRIPT` constant can be removed or kept as the default value

### Task 2.3: Add `comfyui_port` to PodOrchestrator URL generation [COMPLETE]
**File:** `apps/backend/crates/cloud/src/runpod/orchestrator.rs`

Currently `comfyui_proxy_url()` and `comfyui_ws_url()` hardcode port 8188. Make this configurable via the `comfyui_port` setting.

```rust
pub struct PodOrchestratorConfig {
    // ... existing fields ...
    /// ComfyUI port on the pod (default: 8188).
    pub comfyui_port: u16,
}

impl PodOrchestrator {
    pub fn comfyui_proxy_url_for(&self, pod_id: &str) -> String {
        format!("https://{pod_id}-{}.proxy.runpod.net", self.config.comfyui_port)
    }
}
```

**Acceptance Criteria:**
- [x] `comfyui_port` field added to `PodOrchestratorConfig` (default 8188)
- [x] URL generation methods use configurable port
- [x] Static helper methods (`comfyui_proxy_url()`, `comfyui_ws_url()`) kept for backward compat but deprecated
- [x] Instance methods added that use `self.config.comfyui_port`

---

## Phase 3: Env-to-DB Seed Migration [COMPLETE]

### Task 3.1: Create env seeder function [COMPLETE]
**File:** `apps/backend/crates/cloud/src/seed.rs` (new file)

Write a function that checks if a RunPod provider exists in the DB. If not, and if `RUNPOD_API_KEY` is set in the environment, create a `cloud_providers` row with encrypted API key and settings from env vars.

```rust
/// Seed the database with cloud provider configuration from environment
/// variables. This is a one-time migration path from .env to DB config.
///
/// Does nothing if:
/// - A `cloud_providers` row with `provider_type = 'runpod'` already exists
/// - `RUNPOD_API_KEY` env var is not set
pub async fn seed_provider_from_env(
    pool: &PgPool,
    master_key: &[u8; 32],
) -> Result<Option<DbId>, CloudProviderError> { ... }
```

The function should:
1. Check `CloudProviderRepo::find_by_type(pool, "runpod")` — if any exist, return `None`
2. Read env vars: `RUNPOD_API_KEY`, `RUNPOD_TEMPLATE_ID`, `RUNPOD_GPU_TYPE_ID`, `RUNPOD_NETWORK_VOLUME_ID`, `SSH_KEY_PATH`
3. If `RUNPOD_API_KEY` is not set, return `None`
4. Encrypt the API key using `crypto::encrypt_api_key()`
5. Build the `RunPodSettings` JSON and insert via `CloudProviderRepo::create()`
6. Create a `cloud_gpu_types` row for the configured GPU type (if `RUNPOD_GPU_TYPE_ID` is set)
7. Log at `info` level: "Seeded RunPod provider from environment variables"

**Acceptance Criteria:**
- [x] Function creates a `cloud_providers` row with `provider_type = 'runpod'`
- [x] API key is encrypted before storage (uses `crypto::encrypt_api_key`)
- [x] Settings JSONB populated from env vars (template_id, network_volume_id, gpu_type_id, ssh_key_path)
- [x] If no `RUNPOD_API_KEY` env var, function returns `None` silently
- [x] If RunPod provider already exists in DB, function returns `None` without creating a duplicate
- [x] A `cloud_gpu_types` row is created for the configured GPU type ID
- [x] Info-level log emitted on successful seed
- [x] Provider name set to `"RunPod (auto-seeded)"`

### Task 3.2: Add `find_by_type()` to `CloudProviderRepo` [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/cloud_provider_repo.rs`

Add a repository method to check if any provider with a given type exists.

```rust
/// Find all providers of a given type (e.g. "runpod").
pub async fn find_by_type(
    pool: &PgPool,
    provider_type: &str,
) -> Result<Vec<CloudProviderSafe>, sqlx::Error> { ... }
```

**Acceptance Criteria:**
- [x] `find_by_type()` returns all providers matching the given `provider_type`
- [x] Uses the safe projection (no encrypted API key in results)
- [x] Works with the seed function to check for existing RunPod providers

### Task 3.3: Wire seed function into `main.rs` startup [COMPLETE]
**File:** `apps/backend/crates/api/src/main.rs`

Call the seed function during server startup, after DB migrations but before the cloud registry is populated.

```rust
// --- Env-to-DB seed migration (PRD-130) ---
if let Ok(master_hex) = std::env::var("CLOUD_ENCRYPTION_KEY") {
    if let Ok(master_key) = x121_core::crypto::parse_master_key(&master_hex) {
        match x121_cloud::seed::seed_provider_from_env(&pool, &master_key).await {
            Ok(Some(id)) => tracing::info!(provider_id = id, "Seeded RunPod provider from env"),
            Ok(None) => {} // Already exists or env not configured
            Err(e) => tracing::warn!(error = %e, "Failed to seed cloud provider from env"),
        }
    }
}
```

**Acceptance Criteria:**
- [x] Seed runs after `run_migrations()` and before cloud registry initialization
- [x] Seed only runs if `CLOUD_ENCRYPTION_KEY` is available
- [x] Failures are logged as warnings but don't prevent server startup
- [x] After seed, the cloud registry init loop picks up the new provider row

### Task 3.4: Register module in cloud crate [COMPLETE]
**File:** `apps/backend/crates/cloud/src/lib.rs`

Add `pub mod seed;` to expose the seed function.

**Acceptance Criteria:**
- [x] `seed` module is publicly exported from `x121_cloud`
- [x] No compilation errors

---

## Phase 4: Unified Lifecycle Orchestration [COMPLETE]

### Task 4.1: Create lifecycle bridge module [COMPLETE]
**File:** `apps/backend/crates/cloud/src/lifecycle.rs` (new file)

Create the core lifecycle orchestration module that connects cloud instance events to ComfyUI instance management. This module owns the startup and teardown sequences.

```rust
use std::sync::Arc;
use sqlx::PgPool;
use x121_core::types::DbId;
use crate::runpod::orchestrator::{PodOrchestrator, PodOrchestratorConfig, PodReady};

/// Orchestrates the full lifecycle of a cloud GPU instance,
/// bridging cloud provider operations with ComfyUI instance management.
pub struct LifecycleBridge {
    pool: PgPool,
    comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>,
}

impl LifecycleBridge {
    pub fn new(
        pool: PgPool,
        comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>,
    ) -> Self { ... }

    /// Execute the full startup sequence for a cloud instance.
    ///
    /// 1. Provision/resume pod via RunPod API -> cloud_instances status = provisioning
    /// 2. Wait for runtime (SSH reachable) -> update ip_address, ssh_port
    /// 3. SSH startup script (kill template ComfyUI, install deps, start custom)
    /// 4. Poll ComfyUI health endpoint
    /// 5. Upsert comfyui_instances row with ws_url and api_url
    /// 6. Call ComfyUIManager::refresh_instances()
    /// 7. Update cloud_instances status = running
    pub async fn startup(
        &self,
        provider_id: DbId,
        cloud_instance_id: DbId,
        orchestrator: &PodOrchestrator,
        external_id: &str,
    ) -> Result<PodReady, x121_core::cloud::CloudProviderError> { ... }

    /// Execute the full teardown sequence for a cloud instance.
    ///
    /// 1. Disconnect WebSocket for the instance
    /// 2. Disable comfyui_instances row (is_enabled = false)
    /// 3. Stop/terminate pod via RunPod API
    /// 4. Update cloud_instances status = stopped/terminated
    pub async fn teardown(
        &self,
        provider_id: DbId,
        cloud_instance_id: DbId,
        orchestrator: &PodOrchestrator,
        external_id: &str,
    ) -> Result<(), x121_core::cloud::CloudProviderError> { ... }
}
```

**Acceptance Criteria:**
- [x] `startup()` executes the full 7-step sequence from the PRD
- [x] `teardown()` executes the 4-step reverse sequence
- [x] `cloud_instances.status_id` is updated at each stage (provisioning -> starting -> running)
- [x] `cloud_instances.ip_address` and `ssh_port` are populated from pod runtime info
- [x] `comfyui_instances` row is upserted with correct `ws_url`, `api_url`, and `cloud_instance_id`
- [x] `ComfyUIManager::refresh_instances()` is called after ComfyUI is verified ready
- [x] SSH startup failures are retried once before marking as errored
- [x] All lifecycle events are logged with pod name, provider ID, and timing info
- [x] Teardown disables the `comfyui_instances` row before terminating the pod

### Task 4.2: Add `cloud_instances` status update helpers to `CloudInstanceRepo` [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/cloud_instance_repo.rs`

Add helper methods for updating IP/SSH info and transitioning status.

```rust
/// Update the IP address and SSH port for a cloud instance.
pub async fn update_network_info(
    pool: &PgPool,
    id: DbId,
    ip_address: &str,
    ssh_port: Option<i32>,
) -> Result<(), sqlx::Error> { ... }

/// Update status and set started_at timestamp.
pub async fn mark_running(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> { ... }

/// Update status to errored with metadata containing the error message.
pub async fn mark_errored(
    pool: &PgPool,
    id: DbId,
    error_msg: &str,
) -> Result<(), sqlx::Error> { ... }
```

**Acceptance Criteria:**
- [x] `update_network_info()` sets `ip_address` and `ssh_port` on the cloud instance
- [x] `mark_running()` sets status to Running and `started_at = NOW()`
- [x] `mark_errored()` sets status to Error and stores error in `metadata` JSONB
- [x] All methods return `Result<(), sqlx::Error>`

### Task 4.3: Register lifecycle module in cloud crate [COMPLETE]
**File:** `apps/backend/crates/cloud/src/lib.rs`

Add `pub mod lifecycle;` and ensure the `x121_comfyui` dependency is available in the cloud crate's `Cargo.toml`.

**Acceptance Criteria:**
- [x] `lifecycle` module is publicly exported
- [x] `x121_comfyui` added as dependency in `crates/cloud/Cargo.toml` (if not already present)
- [x] No circular dependency issues (cloud depends on comfyui, not vice versa)

### Task 4.4: Add `LifecycleBridge` to `AppState` [COMPLETE]
**File:** `apps/backend/crates/api/src/state.rs`

Add the lifecycle bridge to `AppState` so handlers can trigger startup/teardown.

```rust
pub struct AppState {
    // ... existing fields ...
    /// Lifecycle bridge for unified cloud + ComfyUI orchestration (PRD-130).
    pub lifecycle_bridge: Arc<x121_cloud::lifecycle::LifecycleBridge>,
}
```

**Acceptance Criteria:**
- [x] `lifecycle_bridge` field added to `AppState`
- [x] Field is `Arc<LifecycleBridge>` for cheap cloning
- [x] `AppState` construction in `main.rs` creates and stores the bridge

### Task 4.5: Wire `LifecycleBridge` creation into `main.rs` [COMPLETE]
**File:** `apps/backend/crates/api/src/main.rs`

Construct the `LifecycleBridge` after the ComfyUI manager is started and add it to `AppState`.

```rust
// --- Lifecycle bridge (PRD-130) ---
let lifecycle_bridge = Arc::new(x121_cloud::lifecycle::LifecycleBridge::new(
    pool.clone(),
    Arc::clone(&comfyui_manager),
));
tracing::info!("Cloud lifecycle bridge initialized");
```

**Acceptance Criteria:**
- [x] `LifecycleBridge` created after `ComfyUIManager::start()`
- [x] Added to `AppState` construction
- [x] Logged at info level

---

## Phase 5: Multi-Instance Support [COMPLETE]

### Task 5.1: Build `PodOrchestrator` from provider on demand [COMPLETE]
**File:** `apps/backend/crates/cloud/src/lifecycle.rs`

The lifecycle bridge must create `PodOrchestrator` instances dynamically from provider DB rows (not from env). Add a helper to build an orchestrator from a provider ID.

```rust
impl LifecycleBridge {
    /// Create a PodOrchestrator configured from a cloud provider's DB settings.
    async fn build_orchestrator(
        &self,
        provider_id: DbId,
    ) -> Result<PodOrchestrator, CloudProviderError> {
        // 1. Load provider from DB (CloudProviderRepo::find_by_id)
        // 2. Decrypt API key
        // 3. PodOrchestratorConfig::from_provider(api_key, &provider.settings)
        // 4. PodOrchestrator::new(config)
    }
}
```

**Acceptance Criteria:**
- [x] Orchestrator is built from DB provider row, not env vars
- [x] API key is decrypted using `CLOUD_ENCRYPTION_KEY`
- [x] Settings JSONB is parsed into `RunPodSettings`
- [x] If provider not found or decryption fails, returns descriptive error
- [x] Multiple orchestrators can coexist (one per provider)

### Task 5.2: Support multiple pods per provider in startup/teardown [COMPLETE]
**File:** `apps/backend/crates/cloud/src/lifecycle.rs`

Ensure the `startup()` method creates unique `comfyui_instances` entries for each pod (named `runpod-{external_id}`) without disabling other running pods.

Current behavior in `infrastructure::start_pod()` calls `disable_by_name_prefix("runpod-")` which would kill all other pods. Replace this with targeted operations.

**Acceptance Criteria:**
- [x] `startup()` does NOT disable other running `runpod-*` instances
- [x] Each pod gets a unique `comfyui_instances` entry named `runpod-{external_id}`
- [x] `teardown()` only disables the specific `comfyui_instances` row linked to the cloud instance (via `cloud_instance_id`)
- [x] Multiple `PodOrchestrator::ensure_ready()` calls can run concurrently without interference
- [x] Each pod's ComfyUI URLs are unique (different pod IDs in the proxy URL)

### Task 5.3: Update `InfrastructureStatus` to show cloud instance links [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Add `cloud_instance_id` to the `ComfyUIInstanceInfo` response so the admin UI can correlate ComfyUI connections with cloud pods.

```rust
#[derive(Serialize)]
pub struct ComfyUIInstanceInfo {
    // ... existing fields ...
    pub cloud_instance_id: Option<i64>,  // NEW
}
```

**Acceptance Criteria:**
- [x] `cloud_instance_id` included in `ComfyUIInstanceInfo` response
- [x] Populated from the `ComfyUIInstance` model's new field
- [x] `NULL` for local/manual ComfyUI instances

---

## Phase 6: Auto-Scaling with Lifecycle Hooks [COMPLETE]

### Task 6.1: Refactor scaling service to use lifecycle bridge [COMPLETE]
**File:** `apps/backend/crates/cloud/src/services/scaling.rs`

Currently the scaling service directly calls `provider.provision_instance()` and `terminate_and_record()`. Refactor scale-up to trigger the full lifecycle startup sequence and scale-down to trigger the full teardown sequence.

The challenge is that `LifecycleBridge` needs the `ComfyUIManager`, but the scaling service currently only has `PgPool` and `ProviderRegistry`. We need to pass the lifecycle bridge to the scaling service.

```rust
/// Spawn the auto-scaling service with lifecycle bridge.
pub fn spawn_scaling_service(
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    lifecycle_bridge: Arc<LifecycleBridge>,
    interval_secs: Option<u64>,
) -> tokio::task::JoinHandle<()> { ... }
```

**Acceptance Criteria:**
- [x] Scale-up provisions a pod AND triggers the full startup sequence (SSH + ComfyUI registration)
- [x] Scale-down triggers the full teardown sequence (WebSocket disconnect + pod terminate)
- [x] `LifecycleBridge` is passed to the scaling service
- [x] Cooldown timer still prevents rapid oscillation
- [x] Budget limits in `cloud_scaling_rules` are still respected
- [x] Manual start/stop via admin API still works alongside auto-scaling

### Task 6.2: Update `spawn_periodic_service` signature (if needed) [COMPLETE]
**File:** `apps/backend/crates/cloud/src/services/mod.rs`

If the `spawn_periodic_service` helper's signature needs to be generalized to pass `LifecycleBridge` in addition to `ProviderRegistry`, update it here. Alternatively, the scaling service can capture the `LifecycleBridge` directly and not use the shared helper.

**Acceptance Criteria:**
- [x] Scaling service has access to `LifecycleBridge` at runtime
- [x] Monitoring and reconciliation services still compile and work unchanged
- [x] No unnecessary changes to services that don't need the lifecycle bridge

### Task 6.3: Wire lifecycle bridge into scaling service in `main.rs` [COMPLETE]
**File:** `apps/backend/crates/api/src/main.rs`

Update the scaling service spawn call to pass the lifecycle bridge.

```rust
let _scaling_handle = x121_cloud::services::scaling::spawn_scaling_service(
    pool.clone(),
    Arc::clone(&cloud_registry),
    Arc::clone(&lifecycle_bridge),
    None,
);
```

**Acceptance Criteria:**
- [x] Scaling service receives the lifecycle bridge
- [x] Server starts without errors
- [x] Other cloud services (monitoring, reconciliation) unchanged

---

## Phase 7: Admin API Consolidation [COMPLETE]

### Task 7.1: Update `provision_instance` handler to trigger full lifecycle [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs`

Modify the `provision_instance` handler to optionally trigger the full lifecycle startup sequence after provisioning. Add a `start_comfyui` boolean flag to the provision request.

```rust
#[derive(Debug, Deserialize)]
pub struct ProvisionRequest {
    // ... existing fields ...
    /// If true, trigger full lifecycle: SSH startup + ComfyUI registration.
    /// Default: false (provision only, for backward compat).
    #[serde(default)]
    pub auto_start: bool,
}
```

When `auto_start` is true, after creating the `cloud_instances` row, spawn the lifecycle startup sequence in a background task and return immediately with the cloud instance info.

**Acceptance Criteria:**
- [x] `auto_start` field added to `ProvisionRequest` (defaults to `false`)
- [x] When `auto_start = false`, behavior is unchanged (provision only)
- [x] When `auto_start = true`, lifecycle startup runs in background after provision
- [x] Response includes the `cloud_instances` row ID so the client can poll status
- [x] Background task updates `cloud_instances.status_id` as it progresses

### Task 7.2: Update `start_instance` handler to trigger lifecycle startup [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs`

Modify the existing `start_instance` handler to trigger the full lifecycle sequence (not just the provider API's `start_instance()`).

```rust
pub async fn start_instance(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path((provider_id, inst_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let inst = ensure_instance_exists(&state.pool, inst_id).await?;
    let provider = get_provider_impl(&state, provider_id).await?;

    // Start the pod via provider API
    provider.start_instance(&inst.external_id).await?;

    // Trigger full lifecycle in background
    let bridge = Arc::clone(&state.lifecycle_bridge);
    let external_id = inst.external_id.clone();
    tokio::spawn(async move {
        if let Err(e) = bridge.startup(provider_id, inst_id, /* ... */).await {
            tracing::error!(cloud_instance_id = inst_id, error = %e, "Lifecycle startup failed");
        }
    });

    Ok(StatusCode::ACCEPTED)  // 202 - async operation started
}
```

**Acceptance Criteria:**
- [x] `start_instance` triggers full lifecycle (SSH + ComfyUI + WebSocket)
- [x] Returns `202 Accepted` since the operation is async
- [x] Background task handles errors gracefully (logs + marks instance as errored)
- [x] Status transitions are tracked in `cloud_instances`

### Task 7.3: Update `stop_instance` and `terminate_instance` to trigger teardown [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs`

Modify stop/terminate handlers to trigger the full teardown sequence.

**Acceptance Criteria:**
- [x] `stop_instance` triggers lifecycle teardown (WebSocket disconnect + disable ComfyUI + stop pod)
- [x] `terminate_instance` triggers lifecycle teardown then terminates
- [x] ComfyUI WebSocket is disconnected before the pod is stopped
- [x] `comfyui_instances` row is disabled before pod shutdown

### Task 7.4: Update legacy `infrastructure::start_pod` to use lifecycle bridge [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Refactor the `start_pod` handler to use the lifecycle bridge instead of directly calling the PodOrchestrator + manual ComfyUI registration. This handler is used by the admin UI's "Start Pod" button.

**Acceptance Criteria:**
- [x] `start_pod` handler uses `LifecycleBridge::startup()` instead of manual orchestration
- [x] Response still includes `pod_id`, `comfyui_api_url`, `comfyui_ws_url`, `instance_registered`, `manager_refreshed`
- [x] No longer calls `disable_by_name_prefix("runpod-")` (multi-instance safe)
- [x] Falls back gracefully if no RunPod provider exists in DB

### Task 7.5: Update legacy `infrastructure::stop_pod` to use lifecycle bridge [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/infrastructure.rs`

Refactor the `stop_pod` handler to use the lifecycle bridge teardown.

**Acceptance Criteria:**
- [x] `stop_pod` handler uses `LifecycleBridge::teardown()` instead of manual orchestration
- [x] Only stops the specified pod (multi-instance safe)
- [x] WebSocket disconnected before pod termination

### Task 7.6: Add provider validation endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs`

The existing `test_connection` endpoint already calls `provider.health_check()`. Verify it meets the PRD's `POST /api/v1/admin/cloud-providers/:id/validate` requirement. If the route is already wired as `test-connection`, add an alias route or rename.

**Acceptance Criteria:**
- [x] `POST /api/v1/admin/cloud-providers/:id/validate` endpoint exists (or aliased from `test-connection`)
- [x] Returns provider health status from the provider's API
- [x] API keys are never returned in any GET response (already enforced by `CloudProviderSafe`)
- [x] Provider deletion is blocked if active `cloud_instances` exist

### Task 7.7: Block provider deletion with active instances [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs`

Update `delete_provider` to check for active instances before allowing deletion.

```rust
pub async fn delete_provider(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    // Check for active instances
    let active = CloudInstanceRepo::list_active_by_provider(&state.pool, id).await?;
    if !active.is_empty() {
        return Err(AppError::BadRequest(format!(
            "Cannot delete provider with {} active instances. Stop or terminate them first.",
            active.len()
        )));
    }
    // ... existing deletion logic ...
}
```

**Acceptance Criteria:**
- [x] Deletion blocked if any non-terminated `cloud_instances` exist for the provider
- [x] Error message includes the count of active instances
- [x] Deletion succeeds if all instances are terminated

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260311000001_link_comfyui_to_cloud_instances.sql` | Migration adding `cloud_instance_id` FK |
| `apps/backend/crates/db/src/models/comfyui.rs` | `ComfyUIInstance` model update |
| `apps/backend/crates/db/src/repositories/comfyui_instance_repo.rs` | New repo methods for cloud instance linking |
| `apps/backend/crates/db/src/repositories/cloud_provider_repo.rs` | `find_by_type()` method |
| `apps/backend/crates/db/src/repositories/cloud_instance_repo.rs` | Status update helpers |
| `apps/backend/crates/cloud/src/runpod/orchestrator.rs` | `from_provider()` constructor, configurable startup script/port |
| `apps/backend/crates/cloud/src/seed.rs` | Env-to-DB seed migration (new file) |
| `apps/backend/crates/cloud/src/lifecycle.rs` | Unified lifecycle bridge (new file) |
| `apps/backend/crates/cloud/src/lib.rs` | Module registration |
| `apps/backend/crates/cloud/src/services/scaling.rs` | Auto-scaling with lifecycle hooks |
| `apps/backend/crates/cloud/src/services/mod.rs` | Service helper updates |
| `apps/backend/crates/api/src/state.rs` | `AppState` with lifecycle bridge |
| `apps/backend/crates/api/src/main.rs` | Startup wiring (seed + lifecycle bridge) |
| `apps/backend/crates/api/src/handlers/infrastructure.rs` | Refactored start/stop handlers |
| `apps/backend/crates/api/src/handlers/cloud_providers.rs` | Provider management with lifecycle integration |

---

## Dependencies

### Existing Components to Reuse
- `PodOrchestrator` from `crates/cloud/src/runpod/orchestrator.rs` — SSH startup, ComfyUI verification
- `CloudGpuProvider` trait from `crates/core/src/cloud.rs` — provider abstraction
- `RunPodProvider` from `crates/cloud/src/runpod/provider.rs` — RunPod API calls
- `ProviderRegistry` from `crates/cloud/src/registry.rs` — runtime provider store
- `ComfyUIManager` from `crates/comfyui/src/manager.rs` — WebSocket connection management
- `ComfyUIInstanceRepo` from `crates/db/src/repositories/comfyui_instance_repo.rs` — instance CRUD
- `crypto::encrypt_api_key` / `decrypt_api_key` from `crates/core/` — API key encryption
- `CloudProviderRepo` from `crates/db/src/repositories/` — provider CRUD
- `CloudInstanceRepo` from `crates/db/src/repositories/` — instance lifecycle tracking
- `spawn_periodic_service` from `crates/cloud/src/services/mod.rs` — background task helper

### New Infrastructure Needed
- `LifecycleBridge` — connects cloud instance events to ComfyUI instance management
- `seed::seed_provider_from_env()` — one-time env-to-DB migration
- `PodOrchestratorConfig::from_provider()` — DB-driven config constructor
- `RunPodSettings` struct — typed deserialization of provider settings JSONB

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration — Tasks 1.1-1.3
2. Phase 2: Config Refactor — Tasks 2.1-2.3
3. Phase 3: Env Seed — Tasks 3.1-3.4
4. Phase 4: Lifecycle Bridge — Tasks 4.1-4.5
5. Phase 5: Multi-Instance — Tasks 5.1-5.3
6. Phase 6: Auto-Scaling — Tasks 6.1-6.3
7. Phase 7: Admin API — Tasks 7.1-7.7

**MVP Success Criteria:**
- Admin can start a pod from the UI and have it automatically become a connected ComfyUI worker (no manual SSH or DB manipulation)
- Multiple pods can run simultaneously, all processing queue items
- Stopping a pod automatically disconnects its WebSocket and prevents new jobs
- Auto-scaling provisions pods that automatically become connected workers
- No `.env` restart required to change cloud provider settings
- All config lives in the database (env vars only needed for initial seed)

### Post-MVP Enhancements
- Multi-provider support (Vast.ai, Lambda Labs)
- Cost dashboard with per-generation attribution
- SSH key management via UI (upload + encrypted DB storage)

---

## Notes

1. **Dependency direction:** `cloud` crate gains a dependency on `comfyui` crate (for `ComfyUIManager`). Verify this doesn't create circular dependencies — `comfyui` should not depend on `cloud`.
2. **Background tasks:** Lifecycle startup is a long-running operation (~3 min). The admin API should return `202 Accepted` and let the client poll `cloud_instances.status_id` for progress. Do not block the HTTP request.
3. **SSH key path:** For MVP, keep the filesystem path approach (`ssh_key_path` in provider settings). DB-stored encrypted keys are a post-MVP enhancement.
4. **Migration ordering:** The migration file timestamp (`20260311000001`) must be after all existing migrations. Verify against the latest migration file in `apps/db/migrations/`.
5. **Error recovery:** If SSH startup fails, retry once. If the retry fails, mark `cloud_instances.status_id = Error` and leave the pod running so an admin can SSH in manually to debug.
6. **Backward compatibility:** The `pod_orchestrator` field on `AppState` can be deprecated once the lifecycle bridge is working. For the transition period, both paths should work.

---

## Version History

- **v1.0** (2026-03-10): Initial task list creation from PRD-130