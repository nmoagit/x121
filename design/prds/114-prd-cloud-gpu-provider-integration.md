# PRD-114: Cloud GPU Provider Integration (RunPod)

## 1. Introduction/Overview

The platform currently assumes all GPU workers are locally managed — physically provisioned machines with direct NVML access, local filesystem storage, and persistent WebSocket connections to ComfyUI instances. This limits scalability: adding capacity requires procuring hardware, installing software, and manually registering workers.

Cloud GPU providers like RunPod offer on-demand GPU instances that can be provisioned programmatically in seconds. RunPod specifically offers two products:

1. **RunPod Pods** — persistent GPU instances with full SSH/WebSocket access. ComfyUI runs as a standard server with the existing WebSocket bridge.
2. **RunPod Serverless** — stateless request/response endpoints (`/run`, `/runsync`, `/status/{id}`) where ComfyUI workflows execute as serverless functions. No persistent connection — the platform submits jobs via REST and polls or receives webhooks for results.

This PRD introduces a **Cloud GPU Provider integration layer** with RunPod as the first implementation. The architecture uses a provider trait so additional providers (Vast.ai, Lambda Labs, etc.) can be added without refactoring. The integration covers the full lifecycle: provisioning, auto-scaling, job dispatch, file transfer, cost tracking, monitoring, and teardown.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-02 (Backend Foundation — Axum server, middleware)
  - PRD-05 (ComfyUI WebSocket Bridge — Pod-mode workers connect via existing bridge)
  - PRD-07 (Parallel Task Execution Engine — job dispatch)
  - PRD-08 (Queue Management — scheduling, priority, queue depth for auto-scaling signals)
  - PRD-46 (Worker Pool — worker registration, health, load scoring)
- **Extends:**
  - PRD-05 — adds a REST-based "serverless adapter" alongside the existing WebSocket bridge
  - PRD-46 — adds cloud-provisioned workers as a new worker source with provider metadata
  - PRD-06 — cloud workers report metrics via provider API instead of NVML agent
  - PRD-61 — cost estimation includes cloud provider pricing ($/GPU-hr)
- **Integrates with:**
  - PRD-08 (Queue) — queue depth drives auto-scaling decisions
  - PRD-48 (External Storage) — S3 buckets for file transfer between platform and cloud workers
  - PRD-87 (GPU Power Management) — cloud pods can be stopped/started instead of idling
  - PRD-93 (Budget & Quotas) — budget caps prevent runaway cloud spend
  - PRD-10 (Event Bus) — provisioning/teardown events broadcast for dashboard updates
- **Depended on by:** Any future cloud provider integration (Vast.ai, Lambda Labs, etc.)

## 3. Goals

- Enable the platform to use RunPod GPU instances (Pods and Serverless) for video generation alongside local workers.
- Provide auto-scaling that provisions/terminates cloud pods based on job queue depth, with configurable limits and budget caps.
- Design a provider-agnostic trait so adding new cloud GPU providers requires only implementing an interface — no changes to job dispatch, monitoring, or the UI.
- Integrate cloud worker costs into the existing estimation system for accurate production cost forecasting.
- Ensure cloud workers are transparent to the rest of the platform — once provisioned, they appear and behave like any other worker in the pool.

## 4. User Stories

- **As an admin**, I want to configure my RunPod API credentials so the platform can provision GPU instances on my behalf.
- **As an admin**, I want to create pod templates (GPU type, VRAM, container image, volume size) so I can quickly provision standardized workers.
- **As an admin**, I want to set auto-scaling rules (min/max pods, queue depth thresholds, cooldown timers, budget caps) so the platform automatically scales capacity to match demand without runaway costs.
- **As a creator**, I want my generation jobs to run on cloud GPUs transparently — I shouldn't need to know whether a local or cloud worker processed my job.
- **As an admin**, I want to see cloud worker costs alongside local worker utilization so I can make informed capacity decisions.
- **As an admin**, I want to manually provision or terminate individual cloud pods for testing or debugging.
- **As an admin**, I want to use RunPod Serverless endpoints for burst capacity without maintaining persistent pods.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Provider Configuration & Credential Management

**Description:** The system must allow admins to register cloud GPU provider configurations (starting with RunPod). Each configuration stores encrypted API credentials, provider type, and provider-specific settings. Multiple configurations per provider are supported (e.g., separate RunPod accounts for different teams or billing).

**Database Schema:**

```sql
CREATE TABLE cloud_provider_statuses (
    id SMALLINT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);
INSERT INTO cloud_provider_statuses (id, name) VALUES
    (1, 'active'),
    (2, 'disabled'),
    (3, 'error');

CREATE TABLE cloud_provider_configs (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    provider_type TEXT NOT NULL,              -- 'runpod', 'lambda', 'vastai', etc.
    api_key_encrypted TEXT NOT NULL,          -- encrypted at rest (AES-256-GCM)
    status_id SMALLINT NOT NULL DEFAULT 1 REFERENCES cloud_provider_statuses(id),
    config JSONB NOT NULL DEFAULT '{}',      -- provider-specific settings
    last_validated_at TIMESTAMPTZ,           -- last successful API ping
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cloud_provider_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**RunPod-specific `config` JSONB:**
```json
{
  "default_region": "us-east",
  "default_cloud_type": "SECURE",
  "s3_bucket": "x121-runpod-transfer",
  "s3_region": "us-east-1",
  "s3_access_key_id": "...",
  "s3_secret_access_key_encrypted": "...",
  "webhook_base_url": "https://api.x121.example.com/webhooks/runpod"
}
```

**Acceptance Criteria:**
- [ ] Admin can create, update, disable, and delete provider configurations via API
- [ ] API keys are encrypted at rest using AES-256-GCM with a server-managed key
- [ ] `POST /admin/cloud-providers/:id/validate` pings the provider API and updates `last_validated_at`
- [ ] Provider type is validated against known types (`runpod`); unknown types rejected with 400
- [ ] Config JSONB is validated against a provider-specific schema (required fields per type)

---

#### Requirement 1.2: Cloud GPU Provider Trait (Abstraction Layer)

**Description:** The system must define a Rust trait `CloudGpuProvider` that abstracts cloud GPU operations. RunPod is the first implementation. The trait lives in `crates/core` (types only) with implementations in `crates/api` or a new `crates/cloud` crate.

**Trait Definition:**

```rust
/// Core trait for cloud GPU provider operations.
/// Implementations live outside `core` (in `cloud` or `api` crate).
#[async_trait]
pub trait CloudGpuProvider: Send + Sync {
    /// Validate provider-specific configuration.
    fn validate_config(&self, config: &serde_json::Value) -> Result<(), CoreError>;

    /// List available GPU types with pricing and stock status.
    async fn list_gpu_types(&self) -> Result<Vec<GpuTypeInfo>, CloudProviderError>;

    /// Provision a new GPU instance (Pod).
    async fn provision_pod(&self, request: ProvisionRequest) -> Result<ProvisionResult, CloudProviderError>;

    /// Start a stopped pod.
    async fn start_pod(&self, pod_id: &str) -> Result<PodStatus, CloudProviderError>;

    /// Stop a running pod (retains volume).
    async fn stop_pod(&self, pod_id: &str) -> Result<PodStatus, CloudProviderError>;

    /// Terminate a pod (destroys all resources).
    async fn terminate_pod(&self, pod_id: &str) -> Result<(), CloudProviderError>;

    /// Get current pod status and runtime info.
    async fn get_pod_status(&self, pod_id: &str) -> Result<PodStatus, CloudProviderError>;

    /// Submit a workflow to a serverless endpoint.
    async fn submit_serverless(
        &self,
        endpoint_id: &str,
        input: serde_json::Value,
        webhook_url: Option<&str>,
    ) -> Result<ServerlessJobResult, CloudProviderError>;

    /// Check status of a serverless job.
    async fn get_serverless_status(
        &self,
        endpoint_id: &str,
        job_id: &str,
    ) -> Result<ServerlessJobResult, CloudProviderError>;

    /// Cancel a serverless job.
    async fn cancel_serverless_job(
        &self,
        endpoint_id: &str,
        job_id: &str,
    ) -> Result<(), CloudProviderError>;

    /// Get provider health/availability.
    async fn health_check(&self) -> Result<ProviderHealth, CloudProviderError>;
}
```

**Core Types (in `crates/core`):**

```rust
pub struct GpuTypeInfo {
    pub id: String,               // e.g., "NVIDIA A100 80GB"
    pub display_name: String,
    pub vram_gb: u32,
    pub price_per_hour_spot: Option<f64>,
    pub price_per_hour_ondemand: Option<f64>,
    pub stock_status: StockStatus, // High, Medium, Low, Unavailable
}

pub struct ProvisionRequest {
    pub name: String,
    pub gpu_type_id: String,
    pub gpu_count: u32,
    pub volume_gb: u32,
    pub container_image: String,
    pub env_vars: HashMap<String, String>,
    pub cloud_type: CloudType,    // OnDemand, Spot
    pub template_id: Option<DbId>,
}

pub struct ProvisionResult {
    pub pod_id: String,
    pub name: String,
    pub gpu_type: String,
    pub ip_address: Option<String>,
    pub ports: HashMap<String, u16>,
    pub status: PodStatus,
}

pub struct PodStatus {
    pub pod_id: String,
    pub status: PodState,          // Running, Stopped, Starting, Error, Terminated
    pub gpu_utilization_pct: Option<f64>,
    pub uptime_secs: Option<u64>,
    pub cost_so_far: Option<f64>,
}

pub struct ServerlessJobResult {
    pub job_id: String,
    pub status: ServerlessJobStatus, // InQueue, InProgress, Completed, Failed, TimedOut, Cancelled
    pub delay_time_ms: Option<u64>,
    pub execution_time_ms: Option<u64>,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub enum CloudType { OnDemand, Spot }
pub enum StockStatus { High, Medium, Low, Unavailable }
pub enum PodState { Running, Stopped, Starting, Stopping, Error, Terminated }
pub enum ServerlessJobStatus { InQueue, InProgress, Completed, Failed, TimedOut, Cancelled }
```

**Acceptance Criteria:**
- [ ] `CloudGpuProvider` trait is defined in `crates/core` (or `crates/cloud`)
- [ ] `RunPodProvider` implements the trait using RunPod's GraphQL API (pods) and REST API (serverless)
- [ ] All provider operations return structured errors via `CloudProviderError` enum
- [ ] Adding a new provider requires only implementing the trait — no changes to job dispatch or UI

---

#### Requirement 1.3: RunPod Provider Implementation

**Description:** The `RunPodProvider` struct implements `CloudGpuProvider` using RunPod's APIs:
- **Pods:** GraphQL API at `https://api.runpod.io/graphql` (mutations: `podFindAndDeployOnDemand`, `podResume`, `podStop`, `podTerminate`; queries: `pod`, `pods`, `gpuTypes`)
- **Serverless:** REST API at `https://api.runpod.ai/v2/{endpoint_id}` (endpoints: `/run`, `/runsync`, `/status/{id}`, `/cancel/{id}`, `/stream/{id}`, `/health`)

**Authentication:** Bearer token via `Authorization: Bearer {API_KEY}` header.

**Acceptance Criteria:**
- [ ] Pod operations use RunPod GraphQL API with proper error mapping
- [ ] Serverless operations use RunPod REST API with proper error mapping
- [ ] GPU types query returns pricing (spot + on-demand), VRAM, and stock status
- [ ] Pod provisioning supports `SECURE` and `COMMUNITY` cloud types
- [ ] Spot/interruptible pods supported via `podRentInterruptable` mutation
- [ ] Serverless submissions support both `/run` (async) and `/runsync` (sync, with configurable timeout)
- [ ] Webhook URL passed in serverless requests for completion callbacks
- [ ] HTTP client uses exponential backoff on 429 (rate limit) responses
- [ ] All API calls log request/response at DEBUG level for troubleshooting

---

#### Requirement 1.4: Pod Template Management

**Description:** Admins can create reusable pod templates that define the GPU type, volume size, container image, ports, and environment variables for a standardized deployment. Templates speed up manual provisioning and are referenced by auto-scaling rules.

**Database Schema:**

```sql
CREATE TABLE cloud_pod_templates (
    id BIGSERIAL PRIMARY KEY,
    provider_config_id BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    gpu_type_id TEXT NOT NULL,                -- RunPod GPU type ID (e.g., "NVIDIA A100 80GB")
    gpu_count SMALLINT NOT NULL DEFAULT 1,
    volume_gb INTEGER NOT NULL DEFAULT 50,
    container_disk_gb INTEGER NOT NULL DEFAULT 20,
    container_image TEXT NOT NULL,             -- Docker image (e.g., "runpod/worker-comfyui:latest")
    ports TEXT,                                -- Port mapping string (e.g., "8188/http,22/tcp")
    volume_mount_path TEXT DEFAULT '/workspace',
    env_vars JSONB NOT NULL DEFAULT '{}',     -- {"COMFYUI_PORT": "8188", ...}
    cloud_type TEXT NOT NULL DEFAULT 'SECURE', -- SECURE or COMMUNITY
    is_spot BOOLEAN NOT NULL DEFAULT false,    -- Use spot/interruptible pricing
    max_bid_per_gpu NUMERIC(10,4),             -- Spot bid ceiling (NULL = market rate)
    tags JSONB NOT NULL DEFAULT '[]',          -- Worker tags applied on registration
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_config_id, name)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cloud_pod_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Admin can CRUD pod templates via API
- [ ] Templates are scoped to a provider config (different accounts can have different templates)
- [ ] `container_image` defaults to the standard ComfyUI RunPod worker image
- [ ] `env_vars` supports arbitrary key-value pairs for workflow-specific configuration
- [ ] `tags` are applied to the worker when it registers in the worker pool
- [ ] Templates are validated against the provider's available GPU types on create/update

---

#### Requirement 1.5: Pod Provisioning & Worker Registration

**Description:** When a pod is provisioned (manually or via auto-scaling), the system creates the cloud instance, waits for it to become ready, creates a corresponding ComfyUI instance record, registers it as a worker in the pool, and begins health monitoring. The reverse flow (teardown) decommissions the worker, removes the ComfyUI instance, and terminates the pod.

**Database Schema (pod lease tracking):**

```sql
CREATE TABLE cloud_pod_leases (
    id BIGSERIAL PRIMARY KEY,
    provider_config_id BIGINT NOT NULL REFERENCES cloud_provider_configs(id),
    template_id BIGINT REFERENCES cloud_pod_templates(id),
    worker_id BIGINT REFERENCES workers(id),
    comfyui_instance_id BIGINT REFERENCES comfyui_instances(id),
    pod_id TEXT NOT NULL,                      -- Provider's pod identifier
    gpu_type TEXT NOT NULL,
    gpu_count SMALLINT NOT NULL DEFAULT 1,
    cloud_type TEXT NOT NULL,                  -- SECURE, COMMUNITY
    is_spot BOOLEAN NOT NULL DEFAULT false,
    hourly_cost NUMERIC(10,4),                 -- Actual $/hr at provision time
    status TEXT NOT NULL DEFAULT 'provisioning', -- provisioning, running, stopping, stopped, terminating, terminated, error
    provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at TIMESTAMPTZ,                      -- Pod ready + ComfyUI responding
    stopped_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,
    last_cost_sync_at TIMESTAMPTZ,
    total_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cloud_pod_leases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_cloud_pod_leases_status ON cloud_pod_leases(status) WHERE terminated_at IS NULL;
```

**Provisioning Flow:**

```
1. Admin/autoscaler triggers provision(template_id)
2. Load template → call provider.provision_pod(request)
3. Insert cloud_pod_leases row (status: provisioning)
4. Poll provider.get_pod_status(pod_id) until Running
5. Determine pod's ComfyUI endpoint (ip:port)
6. Insert comfyui_instances row (ws_url, api_url)
7. Register worker in workers table (auto-approved, tagged "cloud", link to comfyui_instance)
8. ComfyUI bridge connects via WebSocket
9. Update lease (status: running, ready_at: now)
10. Emit CloudPodReady event
```

**Teardown Flow:**

```
1. Admin/autoscaler triggers terminate(lease_id)
2. Set worker to Draining → wait for active jobs to complete (or timeout)
3. Disconnect ComfyUI bridge
4. Call provider.terminate_pod(pod_id)
5. Decommission worker, disable ComfyUI instance
6. Update lease (status: terminated, terminated_at: now, final total_cost)
7. Emit CloudPodTerminated event
```

**Acceptance Criteria:**
- [ ] Provisioning creates linked records: cloud_pod_lease → worker → comfyui_instance
- [ ] Worker auto-registers with `is_approved = true` and tags from template + `["cloud", "runpod"]`
- [ ] Worker metadata stores provider type, pod ID, lease ID for traceability
- [ ] Teardown gracefully drains the worker before terminating the pod
- [ ] If provisioning fails (no stock, API error), lease status is set to `error` with message
- [ ] Pod readiness polling has a configurable timeout (default 5 minutes) before marking as error
- [ ] Events emitted: `CloudPodProvisioning`, `CloudPodReady`, `CloudPodStopping`, `CloudPodTerminated`, `CloudPodError`

---

#### Requirement 1.6: Serverless Endpoint Configuration

**Description:** The system must support RunPod Serverless endpoints as an alternative to persistent pods. Serverless endpoints use a different communication model: REST request/response instead of WebSocket. The platform submits ComfyUI workflow JSON via `/run`, receives a job ID, and either polls `/status/{id}` or receives a webhook callback.

**Database Schema:**

```sql
CREATE TABLE cloud_serverless_endpoints (
    id BIGSERIAL PRIMARY KEY,
    provider_config_id BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,                 -- RunPod endpoint ID
    gpu_type TEXT,                             -- GPU type backing the endpoint
    max_workers INTEGER,                       -- Max concurrent workers on this endpoint
    idle_timeout_secs INTEGER,                 -- Auto-scale-to-zero timeout
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    tags JSONB NOT NULL DEFAULT '[]',          -- Used for job routing
    config JSONB NOT NULL DEFAULT '{}',        -- Endpoint-specific settings
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_config_id, endpoint_id)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cloud_serverless_endpoints
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Serverless Job Flow:**

```
1. Job dispatcher selects a serverless endpoint (based on tags, availability)
2. Upload input files to S3 bucket (shared between platform and RunPod)
3. Submit workflow JSON to POST /v2/{endpoint_id}/run with:
   - input: { workflow_json, images: [...], s3_config: {...} }
   - webhook: platform callback URL
   - policy: { executionTimeout, ttl }
4. Receive job_id, store in comfyui_executions (status: pending)
5. Option A: Webhook callback → RunPod POSTs result to platform
   Option B: Poll GET /v2/{endpoint_id}/status/{job_id} at interval
6. On completion: download outputs from S3, update execution status
7. On failure: log error, trigger retry logic (PRD-28)
```

**Acceptance Criteria:**
- [ ] Admin can register serverless endpoints with their RunPod endpoint ID
- [ ] Serverless endpoints appear as a dispatch target alongside pod-based workers
- [ ] Jobs submitted to serverless use `/run` (async) by default
- [ ] Webhook callback URL is included in all serverless submissions
- [ ] Fallback to polling at 5-second intervals if webhook is not received within 30 seconds
- [ ] `/health` endpoint checked periodically to track serverless worker availability
- [ ] Input images are uploaded to S3 with presigned URLs; S3 config passed in the request
- [ ] Outputs are downloaded from S3 after completion and stored in the platform's asset registry
- [ ] Serverless jobs map to existing `comfyui_executions` table (with `endpoint_type: 'serverless'` in metadata)

---

#### Requirement 1.7: File Transfer (S3 Bridge)

**Description:** Cloud workers (both pods and serverless) cannot access the platform's local filesystem. An S3-compatible bucket serves as the transfer layer. Input files (source images, metadata) are uploaded before job submission; output files (generated videos, images) are downloaded after completion.

**Integration with PRD-48 (External Storage):**

The platform already has `storage_backends` and `storage_locations` tables (PRD-48). The cloud provider's S3 bucket is registered as a storage backend, and the transfer logic reuses existing S3 upload/download utilities.

**Transfer Flow:**

```
Input Transfer (platform → cloud worker):
1. Job prepared with local file references
2. For each input file: upload to S3 bucket under /inputs/{job_id}/{filename}
3. Replace local paths with S3 URLs in workflow JSON
4. Submit modified workflow to cloud worker

Output Transfer (cloud worker → platform):
1. Cloud worker writes outputs to S3 under /outputs/{job_id}/
2. Platform downloads outputs to local storage
3. Register outputs in asset registry (PRD-17)
4. Clean up S3 transfer files after configurable retention period
```

**Acceptance Criteria:**
- [ ] S3 bucket configured per provider config (reuses PRD-48 storage backend registration)
- [ ] Input files uploaded with presigned PUT URLs (5-minute expiry)
- [ ] Output files downloaded with presigned GET URLs
- [ ] S3 transfer directory cleaned up after configurable retention (default 24 hours)
- [ ] Large files (>100 MB) use multipart upload
- [ ] Transfer failures retry 3 times with exponential backoff
- [ ] Pod-mode workers can optionally use volume mounting instead of S3 (configured per template)

---

#### Requirement 1.8: Auto-Scaling Engine

**Description:** The system automatically scales cloud pod count based on job queue depth. An auto-scaling rule defines thresholds, limits, and budget constraints. The engine runs as a periodic background task (every 30 seconds) that evaluates rules and triggers provisioning or teardown.

**Database Schema:**

```sql
CREATE TABLE cloud_scaling_rules (
    id BIGSERIAL PRIMARY KEY,
    provider_config_id BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE CASCADE,
    template_id BIGINT NOT NULL REFERENCES cloud_pod_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Thresholds
    scale_up_queue_depth INTEGER NOT NULL DEFAULT 5,   -- Provision when pending jobs >= N
    scale_down_idle_secs INTEGER NOT NULL DEFAULT 300,  -- Terminate when idle >= N seconds

    -- Limits
    min_pods INTEGER NOT NULL DEFAULT 0,                -- Always keep at least N pods running
    max_pods INTEGER NOT NULL DEFAULT 5,                -- Never exceed N pods
    cooldown_secs INTEGER NOT NULL DEFAULT 120,         -- Wait N seconds between scaling actions

    -- Budget
    daily_budget_usd NUMERIC(10,2),                     -- Max spend per day (NULL = unlimited)
    monthly_budget_usd NUMERIC(10,2),                   -- Max spend per month (NULL = unlimited)

    -- Schedule (optional)
    active_schedule JSONB,                              -- Cron-like schedule for when rule is active

    last_scale_action_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cloud_scaling_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Scaling Algorithm:**

```
Every 30 seconds:
  For each enabled scaling rule:
    1. Check cooldown: skip if last_scale_action_at + cooldown > now
    2. Check schedule: skip if outside active_schedule window
    3. Count active pods for this template
    4. Count pending jobs matching template tags

    Scale UP if:
      - pending_jobs >= scale_up_queue_depth
      - active_pods < max_pods
      - daily/monthly spend < budget cap
      → Provision 1 pod from template

    Scale DOWN if:
      - active_pods > min_pods
      - pods exist that have been idle > scale_down_idle_secs
      → Terminate longest-idle pod (drain first)
```

**Acceptance Criteria:**
- [ ] Scaling engine runs as a background Tokio task with 30-second evaluation interval
- [ ] Scale-up triggered when pending job count >= `scale_up_queue_depth`
- [ ] Scale-down triggered when a pod has been idle >= `scale_down_idle_secs`
- [ ] Pod count never exceeds `max_pods` or drops below `min_pods`
- [ ] Cooldown period prevents thrashing (no two actions within `cooldown_secs`)
- [ ] Budget caps checked before provisioning: daily and monthly spend calculated from `cloud_pod_leases.total_cost`
- [ ] Budget exceeded → no new pods provisioned; existing pods continue running
- [ ] Events emitted: `CloudScaleUp`, `CloudScaleDown`, `CloudBudgetWarning` (at 80% spend), `CloudBudgetExceeded`
- [ ] Scale-down drains the worker (waits for active jobs) before terminating

---

#### Requirement 1.9: Cloud Worker Monitoring

**Description:** Cloud workers cannot run the NVML-based hardware agent (PRD-06). Instead, GPU metrics are fetched from the provider's API. For RunPod Pods, the `pod` GraphQL query returns GPU utilization. For Serverless, the `/health` endpoint returns worker counts and queue depth. These metrics are stored in the existing `gpu_metrics` table.

**Monitoring Loop:**

```
Every 60 seconds, for each active cloud pod lease:
  1. Call provider.get_pod_status(pod_id)
  2. Extract GPU utilization, uptime, cost
  3. Insert into gpu_metrics table (reuses existing schema)
  4. Update cloud_pod_leases.total_cost (hourly_cost × uptime)
  5. Evaluate thresholds (PRD-06 threshold engine — same logic)
```

**Acceptance Criteria:**
- [ ] Cloud pods report GPU utilization via provider API (not NVML agent)
- [ ] Metrics stored in existing `gpu_metrics` table with `worker_id` FK
- [ ] Monitoring interval configurable per provider (default 60 seconds)
- [ ] Pod cost tracked in `cloud_pod_leases.total_cost`, updated each monitoring cycle
- [ ] Threshold evaluation reuses existing `evaluate()` function from PRD-06
- [ ] Serverless endpoints monitored via `/health` — worker count and queue depth stored as metadata
- [ ] If pod becomes unreachable: worker marked `Offline`, lease status set to `error`

---

#### Requirement 1.10: Cost Tracking & Budget Integration

**Description:** Cloud provider costs are tracked per pod lease and aggregated for dashboard display. Integration with PRD-61 (Cost Estimation) adds cloud pricing to generation cost forecasts.

**Cost Data Model:**

The `cloud_pod_leases` table already tracks `hourly_cost` and `total_cost`. Aggregation queries provide:
- Daily/weekly/monthly spend per provider
- Spend per GPU type
- Spend per project (via job → worker → lease chain)
- Cost per generated video (actual cloud cost / output count)

**Estimation Integration:**

```rust
// Extend existing estimate_scene to include cloud cost
pub struct SceneEstimate {
    pub segments_needed: u32,
    pub gpu_seconds: f64,
    pub disk_mb: f64,
    pub cloud_cost_usd: Option<f64>,   // NEW: estimated cloud GPU cost
    pub confidence: EstimateConfidence,
}

// cloud_cost_usd = (gpu_seconds / 3600) * hourly_rate_for_gpu_type
```

**Acceptance Criteria:**
- [ ] Per-lease cost tracked automatically via monitoring loop
- [ ] API endpoint: `GET /admin/cloud-providers/costs?period=daily|weekly|monthly`
- [ ] Cost breakdown by provider, GPU type, and project
- [ ] PRD-61 estimation includes `cloud_cost_usd` field when cloud workers are available
- [ ] Budget alerts emitted at 80% and 100% of daily/monthly caps
- [ ] Cost data retained indefinitely (even after pod termination) for historical reporting

---

#### Requirement 1.11: Admin API Endpoints

**Description:** API endpoints for managing cloud provider configurations, templates, scaling rules, and pod operations.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/admin/cloud-providers` | Register provider config |
| `GET` | `/admin/cloud-providers` | List provider configs |
| `GET` | `/admin/cloud-providers/:id` | Get provider config |
| `PUT` | `/admin/cloud-providers/:id` | Update provider config |
| `DELETE` | `/admin/cloud-providers/:id` | Delete provider config |
| `POST` | `/admin/cloud-providers/:id/validate` | Validate API credentials |
| `GET` | `/admin/cloud-providers/:id/gpu-types` | List available GPU types + pricing |
| `GET` | `/admin/cloud-providers/costs` | Aggregated cost report |
| `POST` | `/admin/cloud-providers/templates` | Create pod template |
| `GET` | `/admin/cloud-providers/templates` | List pod templates |
| `PUT` | `/admin/cloud-providers/templates/:id` | Update pod template |
| `DELETE` | `/admin/cloud-providers/templates/:id` | Delete pod template |
| `POST` | `/admin/cloud-providers/pods/provision` | Manually provision a pod |
| `POST` | `/admin/cloud-providers/pods/:lease_id/stop` | Stop a pod (retain volume) |
| `POST` | `/admin/cloud-providers/pods/:lease_id/start` | Start a stopped pod |
| `POST` | `/admin/cloud-providers/pods/:lease_id/terminate` | Terminate a pod |
| `GET` | `/admin/cloud-providers/pods` | List active pod leases |
| `GET` | `/admin/cloud-providers/pods/:lease_id` | Get pod lease details |
| `POST` | `/admin/cloud-providers/serverless` | Register serverless endpoint |
| `GET` | `/admin/cloud-providers/serverless` | List serverless endpoints |
| `PUT` | `/admin/cloud-providers/serverless/:id` | Update serverless endpoint |
| `DELETE` | `/admin/cloud-providers/serverless/:id` | Delete serverless endpoint |
| `POST` | `/admin/cloud-providers/scaling-rules` | Create scaling rule |
| `GET` | `/admin/cloud-providers/scaling-rules` | List scaling rules |
| `PUT` | `/admin/cloud-providers/scaling-rules/:id` | Update scaling rule |
| `DELETE` | `/admin/cloud-providers/scaling-rules/:id` | Delete scaling rule |
| `POST` | `/admin/cloud-providers/emergency-kill` | Terminate ALL cloud pods immediately |
| `POST` | `/admin/cloud-providers/scaling-rules/disable-all` | Disable all scaling rules |
| `POST` | `/admin/cloud-providers/scaling-rules/enable-all` | Re-enable all scaling rules |
| `GET` | `/admin/cloud-providers/reconciliation/status` | Last reconciliation results |

**Acceptance Criteria:**
- [ ] All endpoints require `admin` role
- [ ] Standard envelope: `{ data }` on success, `{ error }` on failure
- [ ] Provider config list excludes decrypted API keys (returns `api_key_masked: "rp_...***"`)
- [ ] Pod operations validate provider connectivity before executing
- [ ] Pagination on list endpoints (limit/offset)

---

#### Requirement 1.12: Frontend — Cloud Provider Management Page

**Description:** Admin UI for managing cloud GPU providers, accessible from the sidebar under a new "Cloud GPUs" item in the Infrastructure/Admin section.

**Page Structure:**

```
Cloud GPU Management
├── [🔴 Emergency: Terminate All Cloud Pods] (top-right, always visible)
├── Provider Configs (list + add/edit)
├── Pod Templates (list + add/edit, max_runtime_hours field)
├── Active Pods (table with status, GPU, cost, uptime, runtime bar, actions)
├── Serverless Endpoints (list + add/edit)
├── Scaling Rules (list + add/edit, enable/disable toggle, max runtime)
├── Cost Overview (daily/monthly spend chart, budget utilization bar)
└── Reconciliation Status (last run, orphans found, auto-terminated count)
```

**Active Pods Table Columns:**
- Name | GPU Type | Status (badge) | Uptime | Cost ($) | Worker ID (link) | Actions (Stop/Start/Terminate)

**Cost Overview:**
- Bar chart: daily spend over last 30 days
- Budget utilization: progress bar (green/yellow/red at 60/80/100%)
- Breakdown by GPU type (pie chart)

**Acceptance Criteria:**
- [ ] Cloud GPU Management page accessible at `/admin/cloud-gpus`
- [ ] Provider config form with masked API key input
- [ ] Pod template form with GPU type dropdown (populated from provider API)
- [ ] Active pods table with real-time status updates (polling every 30 seconds)
- [ ] Manual provision button with template selection
- [ ] Scaling rule editor with enable/disable toggle
- [ ] Cost overview with daily spend chart and budget utilization

**Frontend Hooks:**
- `useCloudProviders()` — list/CRUD provider configs
- `useCloudTemplates(providerId)` — list/CRUD templates
- `useCloudPods()` — list active pods, provision/stop/start/terminate
- `useServerlessEndpoints(providerId)` — list/CRUD endpoints
- `useScalingRules(providerId)` — list/CRUD rules
- `useCloudCosts(period)` — cost aggregation

---

#### Requirement 1.13: Job Dispatch Integration

**Description:** The job dispatcher (PRD-07/PRD-08) must be extended to consider cloud workers and serverless endpoints as dispatch targets alongside local workers. The routing decision considers worker tags, load score, cloud/local preference, and cost.

**Dispatch Priority (configurable):**

```
1. Local workers (if available and idle)
2. Cloud pod workers (if running)
3. Cloud serverless endpoints (if configured)
4. Auto-scale: provision new cloud pod (if rules allow)
```

**Tag-Based Routing:**

Jobs can specify preferred worker tags:
- `["local-only"]` → never dispatch to cloud
- `["cloud-only"]` → prefer cloud workers
- `["high-vram"]` → match workers with high VRAM (local or cloud)
- No tags → any available worker

**Acceptance Criteria:**
- [ ] Dispatcher checks cloud workers alongside local workers
- [ ] Serverless endpoints are a valid dispatch target for jobs without `local-only` tag
- [ ] Tag matching works for cloud workers (tags inherited from template + ["cloud", "runpod"])
- [ ] If no workers available and auto-scaling rules exist, trigger scale-up
- [ ] Cloud worker selection considers hourly cost (prefer cheaper GPU if sufficient)
- [ ] Job record stores `worker_type: 'local' | 'cloud_pod' | 'cloud_serverless'` for reporting

---

#### Requirement 1.14: Orphan Pod Reconciliation

**Description:** If the platform crashes, restarts, or loses connectivity while cloud pods are running, those pods continue incurring charges with no oversight. A reconciliation process runs on startup and periodically to detect and manage orphaned pods.

**Reconciliation Flow:**

```
On platform startup + every 5 minutes:
  1. Load all cloud_pod_leases WHERE status IN ('provisioning', 'running', 'stopping')
  2. For each lease:
     a. Call provider.get_pod_status(pod_id)
     b. If provider says "terminated" but lease says "running":
        → Update lease to terminated, decommission worker
     c. If provider says "running" but no worker heartbeat in 5 min:
        → Re-register worker + ComfyUI instance, reconnect bridge
     d. If provider says "running" but lease not in DB (true orphan):
        → Log warning, emit CloudOrphanDetected event
        → Auto-terminate if orphan_auto_terminate is enabled
     e. If provider API unreachable:
        → Mark lease as status 'unknown', retry next cycle
  3. Emit CloudReconciliationComplete event with counts
```

**Database Change:**

```sql
-- Add to cloud_provider_configs.config JSONB:
-- "orphan_auto_terminate": true    -- Auto-terminate detected orphans
-- "reconciliation_interval_secs": 300  -- Check frequency (default 5 min)
```

**Acceptance Criteria:**
- [ ] Reconciliation runs on platform startup (immediately after loading cloud provider configs)
- [ ] Reconciliation runs periodically (configurable interval, default 5 minutes)
- [ ] Orphaned pods (running at provider, not tracked in DB) detected and logged
- [ ] Option to auto-terminate orphans (`orphan_auto_terminate` in provider config)
- [ ] Stale leases (terminated at provider, still "running" in DB) cleaned up automatically
- [ ] Disconnected pods (running but no heartbeat) trigger worker re-registration
- [ ] Events emitted: `CloudReconciliationComplete`, `CloudOrphanDetected`, `CloudOrphanTerminated`
- [ ] Reconciliation results visible in the Cloud GPU Management dashboard

---

#### Requirement 1.15: Hard Maximum Runtime Limit

**Description:** A safety cap that terminates any cloud pod that has been running longer than a configurable maximum duration, regardless of whether it is idle or actively processing jobs. This prevents runaway costs from stuck or forgotten pods.

**Configuration:**

```sql
-- Add columns to cloud_pod_templates:
ALTER TABLE cloud_pod_templates ADD COLUMN max_runtime_hours INTEGER;  -- NULL = no limit
```

Also configurable per scaling rule:

```sql
-- Add column to cloud_scaling_rules:
ALTER TABLE cloud_scaling_rules ADD COLUMN max_pod_runtime_hours INTEGER;  -- NULL = no limit
```

**Enforcement:**

```
In the monitoring loop (Req 1.9), for each running pod:
  1. Calculate runtime = now() - lease.ready_at
  2. Check max_runtime from template or scaling rule (whichever is lower)
  3. If runtime > max_runtime:
     a. Emit CloudMaxRuntimeReached event
     b. Initiate graceful teardown (drain → terminate)
     c. If pod was processing a job: requeue the job to another worker
```

**Acceptance Criteria:**
- [ ] `max_runtime_hours` configurable per template and per scaling rule
- [ ] If both template and rule specify a limit, the lower value is used
- [ ] Pods exceeding max runtime are gracefully drained then terminated
- [ ] Active jobs on terminated pods are requeued (status reset to `Pending`)
- [ ] Warning event emitted 30 minutes before max runtime reached
- [ ] `CloudMaxRuntimeReached` event emitted when limit is hit
- [ ] Runtime displayed in Active Pods table with progress bar (green/yellow/red at 60/80/100% of max)
- [ ] `NULL` max_runtime means no limit (opt-in safety feature)

---

#### Requirement 1.16: Emergency Kill Switch

**Description:** A one-click action that immediately terminates ALL running cloud pods across all providers. This is the "panic button" for runaway costs, unexpected behavior, or incident response. Available as both an API endpoint and a prominent UI button.

**Kill Switch Flow:**

```
1. Admin triggers emergency kill
2. For each active cloud_pod_lease (status: running, stopping, provisioning):
   a. Skip graceful drain — immediately call provider.terminate_pod(pod_id)
   b. Update lease status to 'terminated', set terminated_at
   c. Decommission worker, disconnect ComfyUI bridge
   d. Requeue all active jobs from terminated workers
3. Disable all scaling rules (set is_enabled = false) to prevent auto-reprovisioning
4. Emit CloudEmergencyKill event with total pods terminated and jobs requeued
5. Log the action in audit trail (PRD-45) with admin user ID
```

**API:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/admin/cloud-providers/emergency-kill` | Terminate ALL cloud pods immediately |
| `POST` | `/admin/cloud-providers/scaling-rules/disable-all` | Disable all scaling rules |
| `POST` | `/admin/cloud-providers/scaling-rules/enable-all` | Re-enable all scaling rules |

**UI:**

Red emergency button at the top of the Cloud GPU Management page:
```
[🔴 Emergency: Terminate All Cloud Pods]
  → Confirmation dialog: "This will immediately terminate N running pods,
     requeue M active jobs, and disable auto-scaling. Continue?"
```

**Acceptance Criteria:**
- [ ] Emergency kill terminates ALL running/provisioning/stopping pods in one action
- [ ] No graceful drain — immediate termination (speed over cleanliness)
- [ ] Active jobs requeued to local workers or back to pending queue
- [ ] All scaling rules auto-disabled to prevent re-provisioning
- [ ] Confirmation dialog required in UI (not a single click)
- [ ] Action logged in audit trail with admin user ID and reason
- [ ] Event emitted: `CloudEmergencyKill` with pod count and job count
- [ ] API requires admin role + explicit confirmation parameter (`{"confirm": true}`)
- [ ] After kill, dashboard shows "All cloud pods terminated. Scaling disabled." banner

---

#### Requirement 1.17: Production Run Lifecycle Binding

**Description:** Cloud pods can be bound to a specific production run (PRD-57). When the run completes (all cells approved or failed), bound pods are automatically terminated. This ensures pods provisioned for a batch job don't linger after the work is done.

**Database Change:**

```sql
-- Add optional production run binding to pod leases
ALTER TABLE cloud_pod_leases ADD COLUMN production_run_id BIGINT REFERENCES production_runs(id);
```

**Binding Flow:**

```
Option A: Manual binding during provision
  Admin provisions pod with production_run_id → pod terminates when run completes

Option B: Auto-binding via scaling rules
  Scaling rule has optional production_run_id → all pods provisioned by this rule
  are bound to that run

Option C: Batch provisioning from production run UI
  "Provision cloud GPUs for this run" button → provisions N pods bound to the run
```

**Lifecycle Integration:**

```
When a production run reaches terminal state (completed, cancelled, failed):
  1. Find all cloud_pod_leases WHERE production_run_id = run.id AND status = 'running'
  2. For each: initiate graceful teardown (drain → terminate)
  3. Emit CloudPodsReleasedFromRun event
```

**Acceptance Criteria:**
- [ ] Pod leases can optionally be bound to a production run
- [ ] When a production run completes/cancels/fails, bound pods are automatically terminated
- [ ] Graceful drain before termination (wait for in-progress jobs to finish, with 5-min timeout)
- [ ] "Provision for this run" button in production run detail page (PRD-57)
- [ ] Bound pods shown in production run detail with status and cost
- [ ] Scaling rules can optionally scope to a production run
- [ ] Pods without production_run_id are unaffected (managed by normal scaling rules)
- [ ] API: `POST /admin/cloud-providers/pods/provision` accepts optional `production_run_id`

---

### Phase 2: Post-MVP Enhancements

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Multi-Provider Support

**Description:** Implement `CloudGpuProvider` trait for Vast.ai and/or Lambda Labs. The provider abstraction from Req 1.2 ensures this is a clean addition.

---

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Spot Instance Preemption Handling

**Description:** RunPod spot instances can be preempted. The platform should detect preemption, automatically requeue the interrupted job, and provision a replacement pod (or fall back to on-demand).

---

#### Requirement 2.3: **[OPTIONAL — Post-MVP]** Serverless Streaming

**Description:** Use RunPod's `/stream/{id}` endpoint for real-time progress updates from serverless jobs, providing a UX closer to the WebSocket-based pod experience.

---

#### Requirement 2.4: **[OPTIONAL — Post-MVP]** GPU Type Recommendation Engine

**Description:** Based on historical job data (execution time, cost per GPU type), recommend the most cost-effective GPU type for a given workflow. Display recommendations in the template editor and auto-scaling rule config.

---

#### Requirement 2.5: **[OPTIONAL — Post-MVP]** Provider Health Dashboard

**Description:** Real-time dashboard showing RunPod region availability, GPU stock levels, pricing trends, and outage status. Uses RunPod's `gpuTypes` query for stock status and pricing.

## 6. Non-Goals (Out of Scope)

- **Multi-cloud orchestration** — no simultaneous deployment across providers for redundancy. One provider at a time per job.
- **Custom container image building** — admins provide pre-built Docker images. The platform does not build or push images.
- **SSH access to pods** — the platform manages pods via API only. Direct SSH is available through RunPod's dashboard.
- **RunPod volume management** — volumes are configured at pod creation (via templates) and not managed independently.
- **Billing integration** — the platform tracks costs based on hourly rates and uptime. It does not integrate with RunPod's billing API for invoices or payment management.

## 7. Design Considerations

- **Cloud GPU Management page** follows the existing admin page pattern (PRD-06 Hardware Dashboard, PRD-46 Worker Dashboard).
- **Active Pods table** reuses the `StatusBadge` component from the design system with cloud-specific status colors.
- **Cost charts** use the same chart library as PRD-41 Performance Dashboard (if implemented, otherwise use a lightweight chart component).
- **Pod template form** mirrors the worker registration form pattern from PRD-46.
- **Real-time updates** via 30-second polling (consistent with worker health check interval). WebSocket push is a post-MVP enhancement.

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Source | Usage |
|-----------|--------|-------|
| Worker registration | `x121_db::repositories::WorkerRepo` | Cloud pods register as workers |
| ComfyUI instance management | `x121_comfyui::manager::ComfyUIManager` | Pod-mode workers use existing bridge |
| GPU metrics storage | `x121_db::repositories::GpuMetricRepo` | Cloud metrics stored in same table |
| Threshold evaluation | `x121_core::hardware::thresholds::evaluate()` | Cloud worker alerts |
| Load scoring | `x121_core::worker_pool::calculate_load_score()` | Cloud worker load balancing |
| S3 operations | `x121_core::storage` (PRD-48) | File transfer bridge |
| Cost estimation | `x121_core::estimation` | Extended with cloud pricing |
| Event bus | `x121_events` | Scaling and lifecycle events |

### New Infrastructure Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| `CloudGpuProvider` trait | `crates/core/src/cloud_provider.rs` | Provider abstraction |
| `RunPodProvider` struct | `crates/cloud/src/runpod.rs` (new crate) or `crates/api` | RunPod implementation |
| Auto-scaling engine | `crates/core/src/cloud_scaling.rs` | Scaling algorithm + rule evaluation |
| Serverless adapter | `crates/cloud/src/serverless.rs` | REST-based job submission + polling |
| API key encryption | `crates/core/src/crypto.rs` | AES-256-GCM encrypt/decrypt |
| Cloud API handlers | `crates/api/src/handlers/cloud_providers.rs` | All admin endpoints |
| Frontend feature | `apps/frontend/src/features/cloud-gpus/` | Management UI |

### Database Changes

5 new tables: `cloud_provider_statuses`, `cloud_provider_configs`, `cloud_pod_templates`, `cloud_pod_leases`, `cloud_serverless_endpoints`, `cloud_scaling_rules`

1 extended table: `workers.metadata` (stores provider type, pod ID — no schema change, just convention)

### API Changes

~29 new admin endpoints under `/admin/cloud-providers/` (see Req 1.11).

Extension to job dispatch logic to consider cloud workers and serverless endpoints.

## 9. Success Metrics

- Cloud pods can be provisioned and ready to accept jobs within 3 minutes of request.
- Auto-scaling responds to queue depth changes within 60 seconds (1 evaluation cycle + provisioning).
- Cloud workers are transparent — the rest of the platform (job dispatch, monitoring, cost estimation) treats them identically to local workers.
- Serverless jobs complete with latency overhead of <5 seconds compared to pod-based execution (excluding cold start).
- Budget caps prevent overspend — no cloud spending exceeds configured daily/monthly limits.
- Adding a new cloud provider requires implementing the trait only — no changes to dispatch, monitoring, or UI.

## 10. Open Questions

1. **Encryption key management** — where is the AES-256-GCM key for API key encryption stored? Environment variable? Should we integrate with a secrets manager?
2. **Serverless cold start** — RunPod Serverless has cold starts when no workers are warm. Should the platform pre-warm endpoints by sending a lightweight health check job?
3. **Volume persistence** — when a pod is stopped (not terminated), its volume persists and incurs storage charges. Should the scaling engine stop pods (faster restart, storage cost) or terminate them (no cost, slower restart)?
4. **Agent crate** — should RunPod implementation live in a new `crates/cloud` crate or inside `crates/api`? A separate crate keeps the API layer thin but adds a workspace member.
5. **Webhook security** — RunPod POSTs to our webhook URL. Should we validate these callbacks with a shared secret or just accept any POST to the callback path?

## 11. Version History

- **v1.0** (2026-02-24): Initial PRD creation. Full RunPod integration (Pods + Serverless), provider trait, auto-scaling, cost tracking, admin UI.
- **v1.1** (2026-02-24): Added pod safety mechanisms — orphan pod reconciliation (Req 1.14), hard max runtime limit (Req 1.15), emergency kill switch (Req 1.16), production run lifecycle binding (Req 1.17). Total: 17 MVP requirements.
