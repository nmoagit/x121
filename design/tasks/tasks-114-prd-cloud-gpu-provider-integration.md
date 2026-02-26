# Task List: Cloud GPU Provider Integration (RunPod)

**PRD Reference:** `design/prds/114-prd-cloud-gpu-provider-integration.md`
**Scope:** Build a cloud GPU provider abstraction layer with RunPod as the first implementation, covering provisioning, auto-scaling, serverless dispatch, file transfer, cost tracking, monitoring, orphan reconciliation, safety controls, and an admin management UI.

## Overview

This PRD creates a provider-agnostic cloud GPU integration that enables on-demand GPU provisioning from RunPod (Pods and Serverless). The architecture uses a Rust trait (`CloudGpuProvider`) so additional providers can be added without refactoring. Cloud workers register as standard workers in the existing pool (PRD-46), connect via the ComfyUI bridge (PRD-05), and are dispatched jobs through the existing scheduler (PRD-08). An auto-scaling engine provisions/terminates pods based on queue depth, with budget caps and safety controls (max runtime, emergency kill, orphan reconciliation).

### What Already Exists
- PRD-002: Axum server, `AppState`, `AppError`, middleware
- PRD-003: RBAC middleware (`RequireAdmin` extractor)
- PRD-005: ComfyUI bridge (`comfyui_instances` table, WebSocket connection management)
- PRD-006: GPU metrics collection, `gpu_metrics` table, threshold evaluation engine
- PRD-007: `jobs` table, job dispatch, job lifecycle management
- PRD-008: Queue management, priority ordering, `job_statuses`
- PRD-010: Event bus (`x121_events`) for broadcasting events
- PRD-046: Worker pool (`workers` table, `WorkerRepo`, `FleetStats`, health log, load balancer)
- PRD-048: External storage (`storage_backends`, S3 utilities)
- PRD-061: Cost estimation (`SceneEstimate` struct, `estimate_scene`)

### What We're Building
1. Database tables: `cloud_provider_statuses`, `cloud_provider_configs`, `cloud_pod_templates`, `cloud_pod_leases`, `cloud_serverless_endpoints`, `cloud_scaling_rules`
2. Provider trait (`CloudGpuProvider`) and RunPod implementation
3. API key encryption (AES-256-GCM)
4. Auto-scaling engine (background task)
5. Cloud worker monitoring (metrics via provider API)
6. Orphan pod reconciliation
7. Safety controls (max runtime, emergency kill)
8. S3 file transfer bridge
9. Admin API endpoints (~29 endpoints)
10. Admin frontend: Cloud GPU Management page
11. Job dispatch integration (cloud workers + serverless)

### Key Design Decisions
1. **Provider trait in `core`** — Core types and the trait definition live in `crates/core/src/cloud_provider.rs`. The RunPod implementation lives in a new `crates/cloud/` crate to keep the API layer thin.
2. **Cloud workers are standard workers** — Once provisioned, a cloud pod registers as a regular worker in the `workers` table with tags `["cloud", "runpod"]`. The dispatcher and load balancer treat them identically to local workers.
3. **S3 as transfer layer** — Cloud workers access input/output files via an S3-compatible bucket. Reuses PRD-48 storage backend registration.
4. **Serverless as dispatch target** — Serverless endpoints are an alternative to persistent workers. The dispatcher routes jobs to serverless when configured, using REST instead of WebSocket.
5. **Budget caps are hard limits** — When a daily/monthly cap is reached, no new pods are provisioned. Existing running pods continue.
6. **Status lookup tables** — `cloud_provider_statuses` follows the project convention of lookup tables for all status columns.

---

## Phase 1: Database Schema

### Task 1.1: Create Cloud Provider Status and Config Tables
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_provider_tables.sql`

```sql
-- Cloud provider status lookup table (PRD-114 Req 1.1)
CREATE TABLE cloud_provider_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO cloud_provider_statuses (name, label) VALUES
    ('active', 'Active'),
    ('disabled', 'Disabled'),
    ('error', 'Error');

-- Cloud provider configurations (PRD-114 Req 1.1)
CREATE TABLE cloud_provider_configs (
    id                BIGSERIAL PRIMARY KEY,
    name              TEXT NOT NULL UNIQUE,
    provider_type     TEXT NOT NULL,               -- 'runpod', 'lambda', 'vastai', etc.
    api_key_encrypted TEXT NOT NULL,               -- AES-256-GCM encrypted
    status_id         SMALLINT NOT NULL DEFAULT 1 REFERENCES cloud_provider_statuses(id) ON DELETE RESTRICT,
    config            JSONB NOT NULL DEFAULT '{}', -- provider-specific settings
    last_validated_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cloud_provider_configs_status_id ON cloud_provider_configs(status_id);
CREATE INDEX idx_cloud_provider_configs_provider_type ON cloud_provider_configs(provider_type);

CREATE TRIGGER trg_cloud_provider_configs_updated_at
    BEFORE UPDATE ON cloud_provider_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] `cloud_provider_statuses` lookup table with active/disabled/error
- [ ] `cloud_provider_configs` table with encrypted API key column
- [ ] `status_id` FK references `cloud_provider_statuses(id)` with `ON DELETE RESTRICT`
- [ ] `config JSONB` for provider-specific settings (region, S3 config, etc.)
- [ ] `last_validated_at` for API health tracking
- [ ] `updated_at` trigger applied
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Create Cloud Pod Templates Table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_pod_templates.sql`

```sql
-- Cloud pod templates (PRD-114 Req 1.4)
CREATE TABLE cloud_pod_templates (
    id                   BIGSERIAL PRIMARY KEY,
    provider_config_id   BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                 TEXT NOT NULL,
    description          TEXT,
    gpu_type_id          TEXT NOT NULL,
    gpu_count            SMALLINT NOT NULL DEFAULT 1,
    volume_gb            INTEGER NOT NULL DEFAULT 50,
    container_disk_gb    INTEGER NOT NULL DEFAULT 20,
    container_image      TEXT NOT NULL,
    ports                TEXT,
    volume_mount_path    TEXT DEFAULT '/workspace',
    env_vars             JSONB NOT NULL DEFAULT '{}',
    cloud_type           TEXT NOT NULL DEFAULT 'SECURE',
    is_spot              BOOLEAN NOT NULL DEFAULT false,
    max_bid_per_gpu      NUMERIC(10,4),
    max_runtime_hours    INTEGER,                       -- NULL = no limit (Req 1.15)
    tags                 JSONB NOT NULL DEFAULT '[]',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_config_id, name)
);

CREATE INDEX idx_cloud_pod_templates_provider_config_id ON cloud_pod_templates(provider_config_id);
CREATE INDEX idx_cloud_pod_templates_tags ON cloud_pod_templates USING GIN(tags);

CREATE TRIGGER trg_cloud_pod_templates_updated_at
    BEFORE UPDATE ON cloud_pod_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Templates scoped to provider config via FK
- [ ] `gpu_type_id` stores RunPod GPU type string (e.g., "NVIDIA A100 80GB")
- [ ] `env_vars JSONB` for arbitrary environment variables
- [ ] `tags JSONB` with GIN index for worker tag assignment on registration
- [ ] `max_runtime_hours` nullable (NULL = no limit)
- [ ] `cloud_type` defaults to 'SECURE' (RunPod cloud types: SECURE, COMMUNITY)
- [ ] Unique constraint on `(provider_config_id, name)`

### Task 1.3: Create Cloud Pod Leases Table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_pod_leases.sql`

```sql
-- Cloud pod lease tracking (PRD-114 Req 1.5)
CREATE TABLE cloud_pod_leases (
    id                  BIGSERIAL PRIMARY KEY,
    provider_config_id  BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    template_id         BIGINT REFERENCES cloud_pod_templates(id) ON DELETE SET NULL ON UPDATE CASCADE,
    worker_id           BIGINT REFERENCES workers(id) ON DELETE SET NULL ON UPDATE CASCADE,
    comfyui_instance_id BIGINT REFERENCES comfyui_instances(id) ON DELETE SET NULL ON UPDATE CASCADE,
    production_run_id   BIGINT,                        -- Optional binding to production run (Req 1.17)
    pod_id              TEXT NOT NULL,
    gpu_type            TEXT NOT NULL,
    gpu_count           SMALLINT NOT NULL DEFAULT 1,
    cloud_type          TEXT NOT NULL,
    is_spot             BOOLEAN NOT NULL DEFAULT false,
    hourly_cost         NUMERIC(10,4),
    status              TEXT NOT NULL DEFAULT 'provisioning',
    provisioned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ready_at            TIMESTAMPTZ,
    stopped_at          TIMESTAMPTZ,
    terminated_at       TIMESTAMPTZ,
    last_cost_sync_at   TIMESTAMPTZ,
    total_cost          NUMERIC(12,4) NOT NULL DEFAULT 0,
    error_message       TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cloud_pod_leases_provider_config_id ON cloud_pod_leases(provider_config_id);
CREATE INDEX idx_cloud_pod_leases_worker_id ON cloud_pod_leases(worker_id);
CREATE INDEX idx_cloud_pod_leases_template_id ON cloud_pod_leases(template_id);
CREATE INDEX idx_cloud_pod_leases_status ON cloud_pod_leases(status) WHERE terminated_at IS NULL;
CREATE INDEX idx_cloud_pod_leases_production_run_id ON cloud_pod_leases(production_run_id)
    WHERE production_run_id IS NOT NULL;

CREATE TRIGGER trg_cloud_pod_leases_updated_at
    BEFORE UPDATE ON cloud_pod_leases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks full pod lifecycle: provisioning → running → stopping → stopped → terminating → terminated → error
- [ ] Links to `workers`, `comfyui_instances`, and `cloud_pod_templates` via FKs
- [ ] `production_run_id` for optional run binding (Req 1.17)
- [ ] `hourly_cost` and `total_cost` for cost tracking
- [ ] Partial index on `status` for active leases only
- [ ] `pod_id` stores the provider's external pod identifier

### Task 1.4: Create Cloud Serverless Endpoints Table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_serverless_endpoints.sql`

```sql
-- Cloud serverless endpoints (PRD-114 Req 1.6)
CREATE TABLE cloud_serverless_endpoints (
    id                  BIGSERIAL PRIMARY KEY,
    provider_config_id  BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                TEXT NOT NULL,
    endpoint_id         TEXT NOT NULL,
    gpu_type            TEXT,
    max_workers         INTEGER,
    idle_timeout_secs   INTEGER,
    is_enabled          BOOLEAN NOT NULL DEFAULT true,
    tags                JSONB NOT NULL DEFAULT '[]',
    config              JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_config_id, endpoint_id)
);

CREATE INDEX idx_cloud_serverless_endpoints_provider_config_id ON cloud_serverless_endpoints(provider_config_id);
CREATE INDEX idx_cloud_serverless_endpoints_tags ON cloud_serverless_endpoints USING GIN(tags);

CREATE TRIGGER trg_cloud_serverless_endpoints_updated_at
    BEFORE UPDATE ON cloud_serverless_endpoints
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Endpoints scoped to provider config via FK
- [ ] `endpoint_id` stores the RunPod endpoint identifier
- [ ] `tags JSONB` for job routing (same tag-matching as workers)
- [ ] Unique constraint on `(provider_config_id, endpoint_id)`
- [ ] `is_enabled` toggle for enabling/disabling dispatch

### Task 1.5: Create Cloud Scaling Rules Table
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_scaling_rules.sql`

```sql
-- Cloud auto-scaling rules (PRD-114 Req 1.8)
CREATE TABLE cloud_scaling_rules (
    id                     BIGSERIAL PRIMARY KEY,
    provider_config_id     BIGINT NOT NULL REFERENCES cloud_provider_configs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    template_id            BIGINT NOT NULL REFERENCES cloud_pod_templates(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                   TEXT NOT NULL,
    is_enabled             BOOLEAN NOT NULL DEFAULT true,

    -- Thresholds
    scale_up_queue_depth   INTEGER NOT NULL DEFAULT 5,
    scale_down_idle_secs   INTEGER NOT NULL DEFAULT 300,

    -- Limits
    min_pods               INTEGER NOT NULL DEFAULT 0,
    max_pods               INTEGER NOT NULL DEFAULT 5,
    cooldown_secs          INTEGER NOT NULL DEFAULT 120,
    max_pod_runtime_hours  INTEGER,                     -- NULL = no limit (Req 1.15)

    -- Budget
    daily_budget_usd       NUMERIC(10,2),
    monthly_budget_usd     NUMERIC(10,2),

    -- Schedule
    active_schedule        JSONB,

    last_scale_action_at   TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cloud_scaling_rules_provider_config_id ON cloud_scaling_rules(provider_config_id);
CREATE INDEX idx_cloud_scaling_rules_template_id ON cloud_scaling_rules(template_id);

CREATE TRIGGER trg_cloud_scaling_rules_updated_at
    BEFORE UPDATE ON cloud_scaling_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Rule links to a provider config and a pod template
- [ ] `scale_up_queue_depth` threshold for triggering provisioning
- [ ] `scale_down_idle_secs` threshold for triggering termination
- [ ] `min_pods` / `max_pods` bounds
- [ ] `cooldown_secs` prevents thrashing between scale actions
- [ ] `daily_budget_usd` / `monthly_budget_usd` nullable (NULL = unlimited)
- [ ] `max_pod_runtime_hours` nullable safety cap (Req 1.15)
- [ ] `active_schedule JSONB` for optional time-based activation

---

## Phase 2: Database Models

### Task 2.1: Create Cloud Provider Config Model
**File:** `apps/backend/crates/db/src/models/cloud_provider.rs`

Follow the three-struct pattern (entity/create/update) from `models/worker.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};
use crate::models::status::StatusId;

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudProviderConfig {
    pub id: DbId,
    pub name: String,
    pub provider_type: String,
    pub api_key_encrypted: String,
    pub status_id: StatusId,
    pub config: serde_json::Value,
    pub last_validated_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCloudProviderConfig {
    pub name: String,
    pub provider_type: String,
    pub api_key: String,          // plaintext — encrypted before storage
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCloudProviderConfig {
    pub name: Option<String>,
    pub api_key: Option<String>,  // if provided, re-encrypted
    pub status_id: Option<StatusId>,
    pub config: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] Entity struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create/Update DTOs derive `Debug, Clone, Deserialize`
- [ ] Uses `DbId`, `Timestamp`, `StatusId` from existing types
- [ ] `api_key_encrypted` is the stored column; Create DTO takes plaintext `api_key`
- [ ] Module registered in `models/mod.rs`

### Task 2.2: Create Cloud Pod Template Model
**File:** `apps/backend/crates/db/src/models/cloud_pod_template.rs`

```rust
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CloudPodTemplate {
    pub id: DbId,
    pub provider_config_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub gpu_type_id: String,
    pub gpu_count: i16,
    pub volume_gb: i32,
    pub container_disk_gb: i32,
    pub container_image: String,
    pub ports: Option<String>,
    pub volume_mount_path: Option<String>,
    pub env_vars: serde_json::Value,
    pub cloud_type: String,
    pub is_spot: bool,
    pub max_bid_per_gpu: Option<sqlx::types::BigDecimal>,
    pub max_runtime_hours: Option<i32>,
    pub tags: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}
```

**Acceptance Criteria:**
- [ ] All columns from `cloud_pod_templates` mapped to Rust types
- [ ] Create DTO includes all required fields
- [ ] Update DTO has all fields optional
- [ ] `max_bid_per_gpu` uses `BigDecimal` for NUMERIC column
- [ ] Module registered in `models/mod.rs`

### Task 2.3: Create Cloud Pod Lease Model
**File:** `apps/backend/crates/db/src/models/cloud_pod_lease.rs`

**Acceptance Criteria:**
- [ ] Entity struct covers all `cloud_pod_leases` columns
- [ ] `total_cost` and `hourly_cost` use `BigDecimal`
- [ ] `production_run_id` is `Option<DbId>`
- [ ] Create DTO for internal provisioning flow (not directly exposed as API input)
- [ ] Module registered in `models/mod.rs`

### Task 2.4: Create Cloud Serverless Endpoint Model
**File:** `apps/backend/crates/db/src/models/cloud_serverless_endpoint.rs`

**Acceptance Criteria:**
- [ ] Entity struct maps all `cloud_serverless_endpoints` columns
- [ ] Create/Update DTOs follow existing patterns
- [ ] `tags` is `serde_json::Value`
- [ ] Module registered in `models/mod.rs`

### Task 2.5: Create Cloud Scaling Rule Model
**File:** `apps/backend/crates/db/src/models/cloud_scaling_rule.rs`

**Acceptance Criteria:**
- [ ] Entity struct maps all `cloud_scaling_rules` columns
- [ ] Budget fields use `Option<BigDecimal>` for NUMERIC
- [ ] `active_schedule` is `Option<serde_json::Value>`
- [ ] Create/Update DTOs follow existing patterns
- [ ] Module registered in `models/mod.rs`

### Task 2.6: Add Cloud Provider Status Enum
**File:** `apps/backend/crates/db/src/models/status.rs` (extend)

Add `CloudProviderStatus` enum using the existing `define_status_enum!` macro:

```rust
define_status_enum! {
    /// Cloud GPU provider status.
    CloudProviderStatus {
        Active = 1,
        Disabled = 2,
        Error = 3,
    }
}
```

**Acceptance Criteria:**
- [ ] Uses existing `define_status_enum!` macro for consistency
- [ ] Variant IDs match seed data in migration
- [ ] Provides `.id()` method via macro-generated impl

---

## Phase 3: Repositories

### Task 3.1: Create Cloud Provider Config Repository
**File:** `apps/backend/crates/db/src/repositories/cloud_provider_config_repo.rs`

Follow the zero-sized struct + `COLUMNS` const pattern from `WorkerRepo`.

```rust
pub struct CloudProviderConfigRepo;

impl CloudProviderConfigRepo {
    pub async fn create(pool: &PgPool, input: &CreateCloudProviderConfig) -> Result<CloudProviderConfig, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudProviderConfig>, sqlx::Error>;
    pub async fn list(pool: &PgPool) -> Result<Vec<CloudProviderConfig>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateCloudProviderConfig) -> Result<Option<CloudProviderConfig>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn update_validated_at(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error>;
    pub async fn update_status(pool: &PgPool, id: DbId, status_id: StatusId) -> Result<(), sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all columns
- [ ] `create` stores the encrypted API key (encryption happens in handler/service layer)
- [ ] `list` returns all configs ordered by name
- [ ] `update_validated_at` touches `last_validated_at`
- [ ] `delete` checks for active leases before allowing deletion
- [ ] Module registered in `repositories/mod.rs` with `pub use`

### Task 3.2: Create Cloud Pod Template Repository
**File:** `apps/backend/crates/db/src/repositories/cloud_pod_template_repo.rs`

```rust
pub struct CloudPodTemplateRepo;

impl CloudPodTemplateRepo {
    pub async fn create(pool: &PgPool, input: &CreateCloudPodTemplate) -> Result<CloudPodTemplate, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudPodTemplate>, sqlx::Error>;
    pub async fn list_by_provider(pool: &PgPool, provider_config_id: DbId) -> Result<Vec<CloudPodTemplate>, sqlx::Error>;
    pub async fn list(pool: &PgPool) -> Result<Vec<CloudPodTemplate>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateCloudPodTemplate) -> Result<Option<CloudPodTemplate>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] `list_by_provider` filters by `provider_config_id`
- [ ] `list` returns all templates (admin overview)
- [ ] Follows `COLUMNS` const pattern
- [ ] Module registered in `repositories/mod.rs`

### Task 3.3: Create Cloud Pod Lease Repository
**File:** `apps/backend/crates/db/src/repositories/cloud_pod_lease_repo.rs`

```rust
pub struct CloudPodLeaseRepo;

impl CloudPodLeaseRepo {
    pub async fn create(pool: &PgPool, input: &CreateCloudPodLease) -> Result<CloudPodLease, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudPodLease>, sqlx::Error>;
    pub async fn find_by_pod_id(pool: &PgPool, pod_id: &str) -> Result<Option<CloudPodLease>, sqlx::Error>;
    pub async fn list_active(pool: &PgPool) -> Result<Vec<CloudPodLease>, sqlx::Error>;
    pub async fn list_by_provider(pool: &PgPool, provider_config_id: DbId) -> Result<Vec<CloudPodLease>, sqlx::Error>;
    pub async fn list_by_production_run(pool: &PgPool, run_id: DbId) -> Result<Vec<CloudPodLease>, sqlx::Error>;
    pub async fn update_status(pool: &PgPool, id: DbId, status: &str) -> Result<(), sqlx::Error>;
    pub async fn update_cost(pool: &PgPool, id: DbId, total_cost: BigDecimal) -> Result<(), sqlx::Error>;
    pub async fn set_ready(pool: &PgPool, id: DbId, worker_id: DbId, comfyui_instance_id: DbId) -> Result<(), sqlx::Error>;
    pub async fn set_terminated(pool: &PgPool, id: DbId, final_cost: BigDecimal) -> Result<(), sqlx::Error>;
    pub async fn count_active_for_template(pool: &PgPool, template_id: DbId) -> Result<i64, sqlx::Error>;

    // Cost aggregation
    pub async fn daily_spend(pool: &PgPool, provider_config_id: Option<DbId>) -> Result<BigDecimal, sqlx::Error>;
    pub async fn monthly_spend(pool: &PgPool, provider_config_id: Option<DbId>) -> Result<BigDecimal, sqlx::Error>;
    pub async fn cost_report(pool: &PgPool, period: &str) -> Result<Vec<CostReportRow>, sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] `list_active` returns leases WHERE `terminated_at IS NULL`
- [ ] `find_by_pod_id` looks up by provider's external pod ID
- [ ] `count_active_for_template` counts running pods for scaling decisions
- [ ] `daily_spend` / `monthly_spend` aggregate `total_cost` for budget checks
- [ ] `cost_report` returns breakdown by provider and GPU type
- [ ] `set_ready` links worker and comfyui_instance, sets `ready_at`
- [ ] Module registered in `repositories/mod.rs`

### Task 3.4: Create Cloud Serverless Endpoint Repository
**File:** `apps/backend/crates/db/src/repositories/cloud_serverless_endpoint_repo.rs`

**Acceptance Criteria:**
- [ ] CRUD operations following existing repo patterns
- [ ] `list_by_provider` filters by `provider_config_id`
- [ ] `list_enabled` returns only endpoints with `is_enabled = true`
- [ ] Module registered in `repositories/mod.rs`

### Task 3.5: Create Cloud Scaling Rule Repository
**File:** `apps/backend/crates/db/src/repositories/cloud_scaling_rule_repo.rs`

```rust
pub struct CloudScalingRuleRepo;

impl CloudScalingRuleRepo {
    pub async fn create(pool: &PgPool, input: &CreateCloudScalingRule) -> Result<CloudScalingRule, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudScalingRule>, sqlx::Error>;
    pub async fn list(pool: &PgPool) -> Result<Vec<CloudScalingRule>, sqlx::Error>;
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<CloudScalingRule>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateCloudScalingRule) -> Result<Option<CloudScalingRule>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn disable_all(pool: &PgPool) -> Result<u64, sqlx::Error>;
    pub async fn enable_all(pool: &PgPool) -> Result<u64, sqlx::Error>;
    pub async fn update_last_scale_action(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] `list_enabled` returns only `is_enabled = true` rules for the scaling engine
- [ ] `disable_all` / `enable_all` for emergency kill and recovery
- [ ] `update_last_scale_action` touches `last_scale_action_at` for cooldown tracking
- [ ] Module registered in `repositories/mod.rs`

---

## Phase 4: Core Domain Logic

### Task 4.1: Define Cloud Provider Trait and Core Types
**File:** `apps/backend/crates/core/src/cloud_provider.rs`

Define the `CloudGpuProvider` trait and all associated types in the `core` crate. The trait is `async_trait`-based. Implementations live outside `core`.

```rust
use async_trait::async_trait;

#[async_trait]
pub trait CloudGpuProvider: Send + Sync {
    fn validate_config(&self, config: &serde_json::Value) -> Result<(), CoreError>;
    async fn list_gpu_types(&self) -> Result<Vec<GpuTypeInfo>, CloudProviderError>;
    async fn provision_pod(&self, request: ProvisionRequest) -> Result<ProvisionResult, CloudProviderError>;
    async fn start_pod(&self, pod_id: &str) -> Result<PodStatus, CloudProviderError>;
    async fn stop_pod(&self, pod_id: &str) -> Result<PodStatus, CloudProviderError>;
    async fn terminate_pod(&self, pod_id: &str) -> Result<(), CloudProviderError>;
    async fn get_pod_status(&self, pod_id: &str) -> Result<PodStatus, CloudProviderError>;
    async fn submit_serverless(&self, endpoint_id: &str, input: serde_json::Value, webhook_url: Option<&str>) -> Result<ServerlessJobResult, CloudProviderError>;
    async fn get_serverless_status(&self, endpoint_id: &str, job_id: &str) -> Result<ServerlessJobResult, CloudProviderError>;
    async fn cancel_serverless_job(&self, endpoint_id: &str, job_id: &str) -> Result<(), CloudProviderError>;
    async fn health_check(&self) -> Result<ProviderHealth, CloudProviderError>;
}

pub struct GpuTypeInfo { /* see PRD */ }
pub struct ProvisionRequest { /* see PRD */ }
pub struct ProvisionResult { /* see PRD */ }
pub struct PodStatus { /* see PRD */ }
pub struct ServerlessJobResult { /* see PRD */ }
pub struct ProviderHealth { pub is_healthy: bool, pub message: Option<String> }

pub enum CloudType { OnDemand, Spot }
pub enum StockStatus { High, Medium, Low, Unavailable }
pub enum PodState { Running, Stopped, Starting, Stopping, Error, Terminated }
pub enum ServerlessJobStatus { InQueue, InProgress, Completed, Failed, TimedOut, Cancelled }

#[derive(Debug, thiserror::Error)]
pub enum CloudProviderError {
    #[error("Provider API error: {0}")]
    ApiError(String),
    #[error("Authentication failed")]
    AuthError,
    #[error("Resource not found: {0}")]
    NotFound(String),
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited { retry_after_secs: u64 },
    #[error("Budget exceeded: {0}")]
    BudgetExceeded(String),
    #[error("Timeout: {0}")]
    Timeout(String),
}
```

**Acceptance Criteria:**
- [ ] Trait defined with `async_trait` in `crates/core`
- [ ] All associated types are `Serialize` + `Debug`
- [ ] `CloudProviderError` enum covers API, auth, rate limit, budget, timeout cases
- [ ] Enums for `CloudType`, `PodState`, `ServerlessJobStatus`, `StockStatus`
- [ ] `core` crate gains `async-trait` dependency (it already uses `serde`, `thiserror`, `chrono`)
- [ ] Module registered in core's `lib.rs`

### Task 4.2: Implement API Key Encryption Utility
**File:** `apps/backend/crates/core/src/crypto.rs`

AES-256-GCM encryption/decryption for cloud provider API keys.

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit, OsRng};

pub fn encrypt_api_key(plaintext: &str, master_key: &[u8; 32]) -> Result<String, CoreError>;
pub fn decrypt_api_key(ciphertext: &str, master_key: &[u8; 32]) -> Result<String, CoreError>;
pub fn mask_api_key(key: &str) -> String;
```

**Acceptance Criteria:**
- [ ] `encrypt_api_key` returns base64-encoded nonce+ciphertext
- [ ] `decrypt_api_key` reverses the process
- [ ] `mask_api_key` returns first 3 chars + `***` (e.g., `rp_...***`)
- [ ] Master key sourced from `CLOUD_ENCRYPTION_KEY` env var (32 bytes, hex or base64)
- [ ] Unit tests for round-trip encrypt/decrypt
- [ ] `aes-gcm` + `base64` added to core's `Cargo.toml`

### Task 4.3: Implement Auto-Scaling Algorithm
**File:** `apps/backend/crates/core/src/cloud_scaling.rs`

Pure scaling logic (no DB access — takes inputs, returns decisions).

```rust
pub enum ScalingDecision {
    ScaleUp { template_id: DbId, reason: String },
    ScaleDown { lease_id: DbId, reason: String },
    NoAction { reason: String },
}

pub struct ScalingInput {
    pub pending_jobs: i64,
    pub active_pods: i64,
    pub idle_pods: Vec<IdlePodInfo>,
    pub rule: ScalingRuleSnapshot,
    pub daily_spend: f64,
    pub monthly_spend: f64,
    pub last_scale_action_at: Option<Timestamp>,
    pub now: Timestamp,
}

pub fn evaluate_scaling(input: &ScalingInput) -> ScalingDecision;
```

**Acceptance Criteria:**
- [ ] `evaluate_scaling` is a pure function (no async, no DB)
- [ ] Scale-up when `pending_jobs >= rule.scale_up_queue_depth` AND `active_pods < rule.max_pods`
- [ ] Scale-down when idle pod exists with `idle_secs >= rule.scale_down_idle_secs` AND `active_pods > rule.min_pods`
- [ ] Budget check: no scale-up if `daily_spend >= daily_budget_usd` or `monthly_spend >= monthly_budget_usd`
- [ ] Cooldown check: no action if `now - last_scale_action_at < cooldown_secs`
- [ ] Unit tests covering: scale-up trigger, scale-down trigger, budget block, cooldown block, no-action
- [ ] Longest-idle pod selected for scale-down

---

## Phase 5: RunPod Provider Implementation

### Task 5.1: Create Cloud Crate Scaffold
**Files:** `apps/backend/crates/cloud/Cargo.toml`, `apps/backend/crates/cloud/src/lib.rs`

Create a new `x121-cloud` crate in the Cargo workspace for cloud provider implementations.

```toml
[package]
name = "x121-cloud"
version = "0.1.0"
edition = "2024"

[dependencies]
x121-core = { path = "../core" }
reqwest = { workspace = true, features = ["json"] }
async-trait = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
tracing = { workspace = true }
thiserror = { workspace = true }
```

**Acceptance Criteria:**
- [ ] New crate `x121-cloud` added to workspace `Cargo.toml` members list
- [ ] Depends on `x121-core` for trait and types
- [ ] Uses `reqwest` for HTTP client (RunPod API calls)
- [ ] `lib.rs` exports `pub mod runpod;` and `pub mod serverless;`
- [ ] Crate compiles cleanly

### Task 5.2: Implement RunPod Provider (Pod Operations)
**File:** `apps/backend/crates/cloud/src/runpod.rs`

Implement `CloudGpuProvider` for RunPod using their GraphQL API for pod operations.

```rust
pub struct RunPodProvider {
    api_key: String,
    graphql_url: String,    // https://api.runpod.io/graphql
    http_client: reqwest::Client,
}

impl RunPodProvider {
    pub fn new(api_key: String) -> Self;
}

#[async_trait]
impl CloudGpuProvider for RunPodProvider {
    // GraphQL mutations: podFindAndDeployOnDemand, podResume, podStop, podTerminate
    // GraphQL queries: pod, pods, gpuTypes
}
```

**Acceptance Criteria:**
- [ ] `provision_pod` uses `podFindAndDeployOnDemand` (or `podRentInterruptable` for spot)
- [ ] `start_pod` uses `podResume` mutation
- [ ] `stop_pod` uses `podStop` mutation
- [ ] `terminate_pod` uses `podTerminate` mutation
- [ ] `get_pod_status` uses `pod` query
- [ ] `list_gpu_types` uses `gpuTypes` query with pricing and stock status
- [ ] `health_check` pings the GraphQL API with a simple query
- [ ] HTTP client uses exponential backoff on 429 (rate limit) responses
- [ ] All API calls log request/response at DEBUG level
- [ ] Bearer token auth via `Authorization: Bearer {API_KEY}` header

### Task 5.3: Implement RunPod Serverless Operations
**File:** `apps/backend/crates/cloud/src/serverless.rs`

RunPod serverless uses REST API at `https://api.runpod.ai/v2/{endpoint_id}`.

```rust
impl RunPodProvider {
    // REST endpoints: /run, /runsync, /status/{id}, /cancel/{id}, /health
    async fn submit_serverless_impl(&self, endpoint_id: &str, input: serde_json::Value, webhook_url: Option<&str>) -> Result<ServerlessJobResult, CloudProviderError>;
    async fn get_serverless_status_impl(&self, endpoint_id: &str, job_id: &str) -> Result<ServerlessJobResult, CloudProviderError>;
    async fn cancel_serverless_job_impl(&self, endpoint_id: &str, job_id: &str) -> Result<(), CloudProviderError>;
}
```

**Acceptance Criteria:**
- [ ] `/run` for async job submission (default)
- [ ] `/runsync` for sync submission (with configurable timeout)
- [ ] `/status/{id}` for polling job status
- [ ] `/cancel/{id}` for cancellation
- [ ] `/health` for endpoint health checks
- [ ] Webhook URL included in submission payload
- [ ] Proper error mapping from RunPod error codes to `CloudProviderError`

---

## Phase 6: Backend Services & Handlers

### Task 6.1: Cloud Provider Admin Handlers
**File:** `apps/backend/crates/api/src/handlers/cloud_providers.rs`

Implement all admin API endpoints from Req 1.11:

```rust
// Provider config CRUD
pub async fn create_provider(RequireAdmin, State, Json) -> AppResult<impl IntoResponse>;
pub async fn list_providers(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn get_provider(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn update_provider(RequireAdmin, State, Path, Json) -> AppResult<impl IntoResponse>;
pub async fn delete_provider(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn validate_provider(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn list_gpu_types(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn get_costs(RequireAdmin, State, Query) -> AppResult<impl IntoResponse>;

// Template CRUD
pub async fn create_template(RequireAdmin, State, Json) -> AppResult<impl IntoResponse>;
pub async fn list_templates(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn update_template(RequireAdmin, State, Path, Json) -> AppResult<impl IntoResponse>;
pub async fn delete_template(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;

// Pod operations
pub async fn provision_pod(RequireAdmin, State, Json) -> AppResult<impl IntoResponse>;
pub async fn stop_pod(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn start_pod(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn terminate_pod(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;
pub async fn list_pods(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn get_pod(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;

// Serverless endpoint CRUD
pub async fn create_serverless_endpoint(RequireAdmin, State, Json) -> AppResult<impl IntoResponse>;
pub async fn list_serverless_endpoints(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn update_serverless_endpoint(RequireAdmin, State, Path, Json) -> AppResult<impl IntoResponse>;
pub async fn delete_serverless_endpoint(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;

// Scaling rule CRUD
pub async fn create_scaling_rule(RequireAdmin, State, Json) -> AppResult<impl IntoResponse>;
pub async fn list_scaling_rules(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn update_scaling_rule(RequireAdmin, State, Path, Json) -> AppResult<impl IntoResponse>;
pub async fn delete_scaling_rule(RequireAdmin, State, Path) -> AppResult<impl IntoResponse>;

// Safety controls
pub async fn emergency_kill(RequireAdmin, State, Json) -> AppResult<impl IntoResponse>;
pub async fn disable_all_scaling(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn enable_all_scaling(RequireAdmin, State) -> AppResult<impl IntoResponse>;
pub async fn reconciliation_status(RequireAdmin, State) -> AppResult<impl IntoResponse>;
```

**Acceptance Criteria:**
- [ ] All endpoints require `RequireAdmin` extractor
- [ ] `list_providers` excludes decrypted API keys (returns `api_key_masked`)
- [ ] `validate_provider` calls `provider.health_check()` and updates `last_validated_at`
- [ ] `provision_pod` accepts template_id and optional production_run_id
- [ ] `emergency_kill` requires `{ "confirm": true }` in request body
- [ ] `emergency_kill` terminates all pods, disables scaling, requeues jobs
- [ ] Standard `DataResponse` envelope on all responses
- [ ] Handler module registered in `handlers/mod.rs`

### Task 6.2: Cloud Provider Routes
**File:** `apps/backend/crates/api/src/lib.rs` (extend route registration)

Register all cloud provider routes nested under `/api/v1/admin/cloud-providers`:

```
/admin/cloud-providers
├── GET    /                           → list_providers
├── POST   /                           → create_provider
├── GET    /:id                        → get_provider
├── PUT    /:id                        → update_provider
├── DELETE /:id                        → delete_provider
├── POST   /:id/validate              → validate_provider
├── GET    /:id/gpu-types             → list_gpu_types
├── GET    /costs                      → get_costs
├── POST   /templates                  → create_template
├── GET    /templates                  → list_templates
├── PUT    /templates/:id             → update_template
├── DELETE /templates/:id             → delete_template
├── POST   /pods/provision            → provision_pod
├── GET    /pods                       → list_pods
├── GET    /pods/:lease_id            → get_pod
├── POST   /pods/:lease_id/stop       → stop_pod
├── POST   /pods/:lease_id/start      → start_pod
├── POST   /pods/:lease_id/terminate  → terminate_pod
├── POST   /serverless                → create_serverless_endpoint
├── GET    /serverless                → list_serverless_endpoints
├── PUT    /serverless/:id            → update_serverless_endpoint
├── DELETE /serverless/:id            → delete_serverless_endpoint
├── POST   /scaling-rules             → create_scaling_rule
├── GET    /scaling-rules             → list_scaling_rules
├── PUT    /scaling-rules/:id         → update_scaling_rule
├── DELETE /scaling-rules/:id         → delete_scaling_rule
├── POST   /scaling-rules/disable-all → disable_all_scaling
├── POST   /scaling-rules/enable-all  → enable_all_scaling
├── POST   /emergency-kill            → emergency_kill
└── GET    /reconciliation/status     → reconciliation_status
```

**Acceptance Criteria:**
- [ ] All routes nested under `/api/v1/admin/cloud-providers`
- [ ] Route tree uses `Router::new()` with nested `.route()` calls
- [ ] All handlers imported from `cloud_providers` handler module
- [ ] Route tree documentation updated in `lib.rs` comments

### Task 6.3: Auto-Scaling Background Service
**File:** `apps/backend/crates/api/src/background/cloud_scaling.rs`

Background Tokio task that evaluates scaling rules every 30 seconds.

```rust
pub struct CloudScalingService {
    pool: PgPool,
    provider_registry: Arc<ProviderRegistry>,
    cancel_token: CancellationToken,
}

impl CloudScalingService {
    pub async fn run(&self) {
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        loop {
            tokio::select! {
                _ = self.cancel_token.cancelled() => break,
                _ = ticker.tick() => self.evaluate_rules().await,
            }
        }
    }

    async fn evaluate_rules(&self) { /* calls core::cloud_scaling::evaluate_scaling */ }
    async fn execute_scale_up(&self, rule: &CloudScalingRule, template: &CloudPodTemplate) { /* provision pod */ }
    async fn execute_scale_down(&self, lease_id: DbId) { /* drain + terminate */ }
}
```

**Acceptance Criteria:**
- [ ] Runs every 30 seconds using `tokio::time::interval`
- [ ] Loads enabled rules from `CloudScalingRuleRepo::list_enabled`
- [ ] Calls `core::cloud_scaling::evaluate_scaling` with current state
- [ ] Executes scale-up by provisioning a pod from the rule's template
- [ ] Executes scale-down by draining the worker then terminating
- [ ] Emits events: `CloudScaleUp`, `CloudScaleDown`, `CloudBudgetWarning`, `CloudBudgetExceeded`
- [ ] Uses `CancellationToken` for graceful shutdown
- [ ] Max runtime enforcement (Req 1.15) checked in same loop

### Task 6.4: Cloud Worker Monitoring Service
**File:** `apps/backend/crates/api/src/background/cloud_monitoring.rs`

Background task that fetches GPU metrics from cloud providers every 60 seconds.

```rust
pub struct CloudMonitoringService {
    pool: PgPool,
    provider_registry: Arc<ProviderRegistry>,
    cancel_token: CancellationToken,
}
```

**Acceptance Criteria:**
- [ ] Polls every 60 seconds for each active cloud pod lease
- [ ] Calls `provider.get_pod_status(pod_id)` to get GPU utilization and cost
- [ ] Inserts metrics into existing `gpu_metrics` table (reuses PRD-06 schema)
- [ ] Updates `cloud_pod_leases.total_cost` each cycle
- [ ] Evaluates thresholds using existing `evaluate()` from PRD-06
- [ ] Marks unreachable pods as `error` status
- [ ] Serverless endpoints checked via `/health` — worker count and queue depth stored

### Task 6.5: Orphan Pod Reconciliation Service
**File:** `apps/backend/crates/api/src/background/cloud_reconciliation.rs`

Background task for detecting and managing orphaned pods (Req 1.14).

```rust
pub struct CloudReconciliationService {
    pool: PgPool,
    provider_registry: Arc<ProviderRegistry>,
    cancel_token: CancellationToken,
}
```

**Acceptance Criteria:**
- [ ] Runs on startup and then every 5 minutes (configurable)
- [ ] Detects stale leases (terminated at provider, still "running" in DB) and cleans them up
- [ ] Detects orphaned pods (running at provider, not tracked in DB) and logs warning
- [ ] Auto-terminates orphans if `orphan_auto_terminate` is enabled in provider config
- [ ] Detects disconnected pods (running but no heartbeat) and triggers worker re-registration
- [ ] Emits events: `CloudReconciliationComplete`, `CloudOrphanDetected`, `CloudOrphanTerminated`
- [ ] Results stored in-memory for the `/reconciliation/status` endpoint

### Task 6.6: Provider Registry
**File:** `apps/backend/crates/api/src/cloud/registry.rs`

A registry that manages provider instances and dispatches operations.

```rust
pub struct ProviderRegistry {
    providers: RwLock<HashMap<DbId, Arc<dyn CloudGpuProvider>>>,
    encryption_key: [u8; 32],
}

impl ProviderRegistry {
    pub async fn load_from_db(pool: &PgPool, encryption_key: [u8; 32]) -> Result<Self, CoreError>;
    pub fn get_provider(&self, config_id: DbId) -> Option<Arc<dyn CloudGpuProvider>>;
    pub async fn reload_provider(&self, pool: &PgPool, config_id: DbId) -> Result<(), CoreError>;
}
```

**Acceptance Criteria:**
- [ ] Loads all active provider configs from DB on startup
- [ ] Decrypts API keys and instantiates provider structs
- [ ] Thread-safe via `RwLock` (read-heavy, write-rare)
- [ ] `reload_provider` re-reads config and replaces the provider instance
- [ ] Returns `None` for unknown or disabled provider configs

### Task 6.7: S3 File Transfer Service
**File:** `apps/backend/crates/api/src/cloud/transfer.rs`

File transfer bridge for cloud workers (Req 1.7).

```rust
pub struct CloudFileTransfer {
    s3_client: aws_sdk_s3::Client,
    bucket: String,
}

impl CloudFileTransfer {
    pub async fn upload_inputs(&self, job_id: DbId, files: &[PathBuf]) -> Result<Vec<String>, CoreError>;
    pub async fn download_outputs(&self, job_id: DbId, remote_keys: &[String], local_dir: &Path) -> Result<Vec<PathBuf>, CoreError>;
    pub async fn cleanup_job_files(&self, job_id: DbId) -> Result<(), CoreError>;
    pub async fn generate_presigned_put(&self, key: &str) -> Result<String, CoreError>;
    pub async fn generate_presigned_get(&self, key: &str) -> Result<String, CoreError>;
}
```

**Acceptance Criteria:**
- [ ] Uploads input files to `s3://{bucket}/inputs/{job_id}/{filename}`
- [ ] Downloads output files from `s3://{bucket}/outputs/{job_id}/`
- [ ] Presigned URLs with 5-minute expiry
- [ ] Large files (>100 MB) use multipart upload
- [ ] Transfer failures retry 3 times with exponential backoff
- [ ] Cleanup removes transfer files after configurable retention (default 24h)
- [ ] Reuses PRD-48 S3 client configuration where possible

---

## Phase 7: Frontend — Cloud GPU Management

### Task 7.1: Create Cloud GPU Feature Module
**Files:** `apps/frontend/src/features/cloud-gpus/`

Create the feature module structure:

```
apps/frontend/src/features/cloud-gpus/
├── CloudGpuManagement.tsx       -- Main page component
├── ProviderConfigForm.tsx       -- Provider config add/edit form
├── TemplateForm.tsx             -- Pod template add/edit form
├── ActivePodsTable.tsx          -- Table of running pods with actions
├── ServerlessEndpointForm.tsx   -- Serverless endpoint add/edit form
├── ScalingRuleForm.tsx          -- Scaling rule add/edit form
├── CostOverview.tsx             -- Cost charts and budget utilization
├── EmergencyKillButton.tsx      -- Red emergency terminate button
├── ReconciliationStatus.tsx     -- Last reconciliation results
├── hooks/
│   └── use-cloud-gpus.ts        -- TanStack Query hooks for all endpoints
└── types.ts                     -- TypeScript interfaces
```

**Acceptance Criteria:**
- [ ] Feature module follows existing pattern (see `features/workers/`, `features/admin/`)
- [ ] All components use named exports
- [ ] Uses design tokens for all colors and spacing
- [ ] Uses existing design system components (`Card`, `Button`, `Spinner`, `Stack`, `StatusBadge`)
- [ ] Page accessible at `/admin/cloud-gpus` route

### Task 7.2: Cloud GPU Management Page
**File:** `apps/frontend/src/features/cloud-gpus/CloudGpuManagement.tsx`

Main page with tabbed sections following the PRD-46 Worker Dashboard pattern.

**Acceptance Criteria:**
- [ ] Emergency Kill button prominently at top-right (red, always visible)
- [ ] Tabbed sections: Providers, Templates, Active Pods, Serverless, Scaling Rules, Costs
- [ ] Provider config list with masked API keys and validate button
- [ ] Template list grouped by provider
- [ ] Active pods table with status badges, uptime, cost, and action buttons (Stop/Start/Terminate)
- [ ] Active pods table auto-refreshes every 30 seconds
- [ ] Manual provision button with template dropdown
- [ ] Admin-only page (protected route)

### Task 7.3: TanStack Query Hooks
**File:** `apps/frontend/src/features/cloud-gpus/hooks/use-cloud-gpus.ts`

```typescript
export function useCloudProviders();
export function useCreateCloudProvider();
export function useUpdateCloudProvider();
export function useDeleteCloudProvider();
export function useValidateCloudProvider();
export function useGpuTypes(providerId: number);
export function useCloudTemplates(providerId?: number);
export function useCreateCloudTemplate();
export function useUpdateCloudTemplate();
export function useDeleteCloudTemplate();
export function useCloudPods();
export function useProvisionPod();
export function useStopPod();
export function useStartPod();
export function useTerminatePod();
export function useServerlessEndpoints(providerId?: number);
export function useScalingRules(providerId?: number);
export function useCloudCosts(period: 'daily' | 'weekly' | 'monthly');
export function useEmergencyKill();
export function useDisableAllScaling();
export function useEnableAllScaling();
export function useReconciliationStatus();
```

**Acceptance Criteria:**
- [ ] All hooks follow existing TanStack Query patterns (query keys, invalidation on mutation)
- [ ] `useCloudPods` polls every 30 seconds (`refetchInterval: 30000`)
- [ ] `useCloudCosts` accepts a period parameter for the aggregation window
- [ ] All hooks use the shared `api` client from `@/lib/api`
- [ ] Mutations invalidate relevant query keys on success

### Task 7.4: Cost Overview Component
**File:** `apps/frontend/src/features/cloud-gpus/CostOverview.tsx`

**Acceptance Criteria:**
- [ ] Bar chart: daily spend over last 30 days (reuses Recharts from PRD-06)
- [ ] Budget utilization: progress bar (green/yellow/red at 60/80/100%)
- [ ] Breakdown by GPU type (pie or horizontal bar)
- [ ] Total spend for current period displayed prominently
- [ ] Uses existing chart library (Recharts) for consistency with HardwareDashboard

### Task 7.5: Emergency Kill Button Component
**File:** `apps/frontend/src/features/cloud-gpus/EmergencyKillButton.tsx`

**Acceptance Criteria:**
- [ ] Red button with warning icon, always visible at top of page
- [ ] Confirmation dialog: "This will immediately terminate N running pods, requeue M active jobs, and disable auto-scaling. Continue?"
- [ ] Requires typing "TERMINATE" or similar confirmation text
- [ ] Shows loading state during mutation
- [ ] Displays success/error result
- [ ] Uses existing `Button` and `Modal` components from design system

### Task 7.6: Wire Route and Navigation
**Files:** `apps/frontend/src/app/router.tsx`, `apps/frontend/src/app/navigation.ts`

**Acceptance Criteria:**
- [ ] Route `/admin/cloud-gpus` added to TanStack Router
- [ ] Protected with `ProtectedRoute` requiring admin role
- [ ] Navigation entry added to sidebar under admin section
- [ ] `WIRING-STATUS.md` updated with the new route

---

## Phase 8: Integration & Testing

### Task 8.1: DB-Level Repository Tests
**File:** `apps/backend/crates/db/tests/cloud_provider.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_and_list_provider_configs(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_and_list_templates(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_and_query_leases(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_lease_cost_aggregation(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_scaling_rule_disable_all(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_serverless_endpoint_crud(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Test: provider config CRUD (create, read, update, delete)
- [ ] Test: template CRUD scoped to provider
- [ ] Test: lease creation and status transitions
- [ ] Test: lease cost aggregation (daily/monthly spend)
- [ ] Test: scaling rule disable_all and enable_all
- [ ] Test: serverless endpoint CRUD
- [ ] Test: unique constraint violations return appropriate errors
- [ ] All tests pass

### Task 8.2: Core Logic Unit Tests
**File:** `apps/backend/crates/core/src/cloud_scaling.rs` (inline tests), `apps/backend/crates/core/src/crypto.rs` (inline tests)

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_scale_up_when_queue_exceeds_threshold();
    #[test]
    fn test_no_scale_up_when_at_max_pods();
    #[test]
    fn test_no_scale_up_when_budget_exceeded();
    #[test]
    fn test_scale_down_when_idle_exceeds_threshold();
    #[test]
    fn test_no_scale_down_when_at_min_pods();
    #[test]
    fn test_cooldown_prevents_action();
    #[test]
    fn test_encrypt_decrypt_roundtrip();
    #[test]
    fn test_mask_api_key();
}
```

**Acceptance Criteria:**
- [ ] Scaling algorithm tests cover all decision paths
- [ ] Budget cap logic tested for both daily and monthly limits
- [ ] Cooldown logic tested
- [ ] Crypto roundtrip verified
- [ ] API key masking verified
- [ ] All tests are deterministic (no randomness, no time-dependence)

### Task 8.3: API-Level Handler Tests
**File:** `apps/backend/crates/api/tests/cloud_provider_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_provider_config(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_providers_masks_api_key(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_provider_with_active_leases_fails(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_emergency_kill_requires_confirmation(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_scaling_rule_crud(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_template_crud(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Test: provider config creation returns masked API key
- [ ] Test: listing providers never returns decrypted keys
- [ ] Test: deleting provider with active leases returns 409
- [ ] Test: emergency kill without `{ "confirm": true }` returns 400
- [ ] Test: scaling rule CRUD with enable/disable
- [ ] Test: template CRUD scoped to provider
- [ ] All tests use `common::build_test_app` and shared HTTP helpers
- [ ] All tests pass

### Task 8.4: Update AppState and Startup
**Files:** `apps/backend/crates/api/src/state.rs`, `apps/backend/crates/api/src/main.rs`

Add provider registry and background services to application state and startup sequence.

**Acceptance Criteria:**
- [ ] `AppState` gains `provider_registry: Arc<ProviderRegistry>` field
- [ ] `CLOUD_ENCRYPTION_KEY` env var loaded at startup
- [ ] `ProviderRegistry::load_from_db` called during initialization
- [ ] `CloudScalingService` spawned as background task
- [ ] `CloudMonitoringService` spawned as background task
- [ ] `CloudReconciliationService` spawned as background task (runs immediately then periodically)
- [ ] All background tasks respect `CancellationToken` for graceful shutdown
- [ ] `cloud` crate added to `api` crate dependencies in `Cargo.toml`

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_provider_tables.sql` | Provider config + statuses DDL |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_pod_templates.sql` | Pod template DDL |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_pod_leases.sql` | Pod lease tracking DDL |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_serverless_endpoints.sql` | Serverless endpoint DDL |
| `apps/db/migrations/YYYYMMDDHHMMSS_create_cloud_scaling_rules.sql` | Scaling rule DDL |
| `apps/backend/crates/cloud/Cargo.toml` | New cloud provider crate manifest |
| `apps/backend/crates/cloud/src/lib.rs` | Cloud crate barrel file |
| `apps/backend/crates/cloud/src/runpod.rs` | RunPod provider implementation |
| `apps/backend/crates/cloud/src/serverless.rs` | Serverless operations |
| `apps/backend/crates/core/src/cloud_provider.rs` | Provider trait and core types |
| `apps/backend/crates/core/src/crypto.rs` | AES-256-GCM encryption utilities |
| `apps/backend/crates/core/src/cloud_scaling.rs` | Auto-scaling algorithm (pure logic) |
| `apps/backend/crates/db/src/models/cloud_provider.rs` | Provider config model |
| `apps/backend/crates/db/src/models/cloud_pod_template.rs` | Pod template model |
| `apps/backend/crates/db/src/models/cloud_pod_lease.rs` | Pod lease model |
| `apps/backend/crates/db/src/models/cloud_serverless_endpoint.rs` | Serverless endpoint model |
| `apps/backend/crates/db/src/models/cloud_scaling_rule.rs` | Scaling rule model |
| `apps/backend/crates/db/src/repositories/cloud_provider_config_repo.rs` | Provider config CRUD |
| `apps/backend/crates/db/src/repositories/cloud_pod_template_repo.rs` | Template CRUD |
| `apps/backend/crates/db/src/repositories/cloud_pod_lease_repo.rs` | Lease CRUD + cost queries |
| `apps/backend/crates/db/src/repositories/cloud_serverless_endpoint_repo.rs` | Serverless CRUD |
| `apps/backend/crates/db/src/repositories/cloud_scaling_rule_repo.rs` | Scaling rule CRUD |
| `apps/backend/crates/api/src/handlers/cloud_providers.rs` | Admin API handlers (~29 endpoints) |
| `apps/backend/crates/api/src/cloud/registry.rs` | Provider instance registry |
| `apps/backend/crates/api/src/cloud/transfer.rs` | S3 file transfer bridge |
| `apps/backend/crates/api/src/background/cloud_scaling.rs` | Auto-scaling background service |
| `apps/backend/crates/api/src/background/cloud_monitoring.rs` | Cloud metrics monitoring |
| `apps/backend/crates/api/src/background/cloud_reconciliation.rs` | Orphan pod reconciliation |
| `apps/frontend/src/features/cloud-gpus/CloudGpuManagement.tsx` | Main management page |
| `apps/frontend/src/features/cloud-gpus/hooks/use-cloud-gpus.ts` | TanStack Query hooks |
| `apps/frontend/src/features/cloud-gpus/CostOverview.tsx` | Cost charts |
| `apps/frontend/src/features/cloud-gpus/EmergencyKillButton.tsx` | Emergency kill button |
| `apps/frontend/src/features/cloud-gpus/types.ts` | TypeScript interfaces |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `set_updated_at()` trigger, `DbId = i64`, `StatusId = i16`, `define_status_enum!`
- PRD-002: Axum server, `AppState`, `AppError`, `DataResponse` envelope
- PRD-003: `RequireAdmin` extractor for admin-only endpoints
- PRD-005: `comfyui_instances` table, `ComfyUIManager` bridge connection
- PRD-006: `gpu_metrics` table, `GpuMetricRepo`, threshold evaluation
- PRD-007: `jobs` table, job dispatch, `worker_id` FK
- PRD-008: Queue depth queries for scaling signals
- PRD-010: Event bus for broadcasting cloud lifecycle events
- PRD-046: `workers` table, `WorkerRepo` (cloud pods register as workers)
- PRD-048: S3 storage backend utilities

### New Infrastructure Needed
- New Rust crate: `x121-cloud` (cloud provider implementations)
- New dependencies: `aes-gcm` + `base64` in core, `async-trait` in core, `aws-sdk-s3` in api/cloud
- `CLOUD_ENCRYPTION_KEY` environment variable for API key encryption
- S3 bucket for cloud worker file transfer

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.5
2. Phase 2: Database Models — Tasks 2.1–2.6
3. Phase 3: Repositories — Tasks 3.1–3.5
4. Phase 4: Core Domain Logic — Tasks 4.1–4.3
5. Phase 5: RunPod Provider — Tasks 5.1–5.3
6. Phase 6: Backend Services — Tasks 6.1–6.7
7. Phase 7: Frontend — Tasks 7.1–7.6
8. Phase 8: Integration Tests — Tasks 8.1–8.4

**MVP Success Criteria:**
- Cloud provider configs can be created and validated via API
- Pod templates define standardized GPU configurations
- Pods can be manually provisioned, monitored, stopped, and terminated
- Auto-scaling provisions/terminates pods based on queue depth with budget caps
- Serverless endpoints accept job submissions via REST
- Cloud workers register as standard workers and receive job dispatch
- File transfer via S3 bridge enables input/output exchange
- Cost tracking provides per-lease and aggregate cost reporting
- Orphan reconciliation detects and cleans up stale pods
- Emergency kill terminates all cloud pods in one action
- Admin UI provides full management capabilities

### Post-MVP Enhancements
- Multi-provider support (Vast.ai, Lambda Labs) — implement trait for new providers
- Spot instance preemption handling — detect and requeue interrupted jobs
- Serverless streaming via `/stream/{id}` for real-time progress
- GPU type recommendation engine based on historical job data
- Provider health dashboard with region availability and pricing trends

---

## Notes

1. **Encryption key management:** The `CLOUD_ENCRYPTION_KEY` env var holds a 32-byte key for AES-256-GCM. In production, this should be managed via a secrets manager (Vault, AWS Secrets Manager). For local dev, a hex-encoded string in `.env` is sufficient.
2. **RunPod API rate limits:** RunPod's GraphQL API has rate limits (~100 req/min). The provider implementation should use exponential backoff on 429 responses and batch queries where possible.
3. **Provider registry lifecycle:** The registry loads on startup but can be refreshed when a provider config is updated. The `reload_provider` method handles this without restarting the server.
4. **Cloud crate placement:** The `x121-cloud` crate is the recommended location per the PRD's open question #4. This keeps the API layer thin and isolates external API dependencies.
5. **Serverless cold starts:** RunPod Serverless has cold starts when no workers are warm. The monitoring service should track cold start latency via the `/health` endpoint and surface it in the dashboard.
6. **Production run binding:** The `production_run_id` FK on `cloud_pod_leases` is a forward reference — it depends on PRD-57. If PRD-57 is not yet implemented, this column can be added as a plain `BIGINT` without an FK constraint initially.
7. **Webhook security:** RunPod serverless callbacks should be validated. A shared secret (stored in provider config JSONB) can be included in the webhook URL as a query parameter and verified on receipt.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-114
