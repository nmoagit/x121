# Task List: Hardware Monitoring & Direct Control

**PRD Reference:** `design/prds/006-prd-hardware-monitoring-direct-control.md`
**Scope:** Implement GPU vitals collection (VRAM, temperature, utilization, power), real-time hardware dashboard, one-click service restart for worker machines, and configurable threshold alerts.

## Overview

This PRD creates a hardware monitoring system with two sides: a lightweight Rust agent running on each GPU worker that collects metrics via NVML, and a backend module that receives, stores, and serves those metrics. The worker agent pushes metrics over WebSocket to the backend at configurable intervals. The backend stores metrics in a time-series-like table, evaluates threshold alerts, and exposes admin API endpoints for the dashboard and restart actions. The frontend provides a real-time hardware dashboard with color-coded gauges.

### What Already Exists
- PRD-002: Axum server with WebSocket infrastructure, `AppState`, `AppError`
- PRD-003: RBAC middleware (`RequireAdmin` extractor)
- PRD-005: ComfyUI bridge (instances table, connection management patterns)
- PRD-008: Queue management (referenced for job-aware restarts) — may be developed in parallel

### What We're Building
1. Database tables: `gpu_metrics`, `metric_thresholds`, `restart_logs`
2. Worker agent binary for NVML-based GPU metrics collection
3. Metrics ingestion endpoint (WebSocket push from agents)
4. Metrics API for dashboard consumption
5. One-click restart endpoint with job-awareness
6. Threshold evaluation engine with alert emission
7. React hardware dashboard with gauges and charts

### Key Design Decisions
1. **Push model** — Worker agents push metrics to the backend via WebSocket. This avoids the backend needing network access into worker machines and allows agents behind firewalls.
2. **NVML over nvidia-smi** — Direct NVML bindings are faster and more reliable than parsing `nvidia-smi` text output. The `nvml-wrapper` crate provides safe Rust bindings.
3. **Separate binary** — The worker agent is a separate Rust binary (`trulience-agent`) in the same Cargo workspace, compiled independently for deployment to worker machines.
4. **Metrics retention** — Raw metrics older than 24h are aggregated into hourly summaries. This prevents storage bloat while preserving historical trends.

---

## Phase 1: Database Schema [COMPLETE]

### Task 1.1: Create GPU Metrics Table [COMPLETE]
**File:** `apps/db/migrations/20260221000001_create_gpu_metrics_table.sql`

```sql
CREATE TABLE gpu_metrics (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT NOT NULL,
    gpu_index SMALLINT NOT NULL DEFAULT 0,
    vram_used_mb INTEGER NOT NULL,
    vram_total_mb INTEGER NOT NULL,
    temperature_celsius SMALLINT NOT NULL,
    utilization_percent SMALLINT NOT NULL,
    power_draw_watts SMALLINT,
    fan_speed_percent SMALLINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned-style index for time-range queries
CREATE INDEX idx_gpu_metrics_worker_recorded ON gpu_metrics(worker_id, recorded_at DESC);
CREATE INDEX idx_gpu_metrics_recorded_at ON gpu_metrics(recorded_at DESC);
```

**Acceptance Criteria:**
- [x] `gpu_metrics` table with worker_id, gpu_index, and all metric columns
- [x] `recorded_at TIMESTAMPTZ` for the actual collection timestamp (may differ from insert time)
- [x] Indexes optimized for time-range queries per worker
- [x] No `updated_at` trigger (append-only table — metrics are never updated)
- [x] Uses `SMALLINT` for bounded numeric values (temperature, utilization %)

### Task 1.2: Create Metric Thresholds Table [COMPLETE]
**File:** `apps/db/migrations/20260221000002_create_metric_thresholds_table.sql`

```sql
CREATE TABLE metric_thresholds (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT,
    metric_name TEXT NOT NULL,
    warning_value INTEGER NOT NULL,
    critical_value INTEGER NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metric_thresholds_worker_id ON metric_thresholds(worker_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON metric_thresholds
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Default thresholds (worker_id NULL = applies to all workers)
INSERT INTO metric_thresholds (worker_id, metric_name, warning_value, critical_value) VALUES
    (NULL, 'temperature_celsius', 70, 85),
    (NULL, 'vram_used_percent', 85, 95),
    (NULL, 'utilization_percent', 95, 99);
```

**Acceptance Criteria:**
- [x] Per-worker or global thresholds (`worker_id NULL` = global default)
- [x] `warning_value` and `critical_value` for two-tier alerting
- [x] Default thresholds seeded: temp 70/85C, VRAM 85/95%, utilization 95/99%
- [x] `is_enabled` to disable specific thresholds

**Implementation:** Added UNIQUE index using COALESCE(worker_id, 0) to handle NULL-safe uniqueness per metric per worker.

### Task 1.3: Create Restart Logs Table [COMPLETE]
**File:** `apps/db/migrations/20260221000003_create_restart_tables.sql`

```sql
CREATE TABLE restart_logs (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT NOT NULL,
    service_name TEXT NOT NULL,
    initiated_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status TEXT NOT NULL DEFAULT 'initiated',
    reason TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_restart_logs_worker_id ON restart_logs(worker_id);
CREATE INDEX idx_restart_logs_initiated_by ON restart_logs(initiated_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON restart_logs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [x] Tracks who initiated the restart (`initiated_by` FK to users)
- [x] Status progression: initiated, stopping, restarting, completed, failed
- [x] `error_message` for failure details
- [x] `completed_at` set when restart finishes

**Implementation:** Added `restart_statuses` lookup table per CONVENTIONS.md (status columns must use lookup tables, never raw TEXT). Status FK `status_id SMALLINT REFERENCES restart_statuses(id) DEFAULT 1`.

---

## Phase 2: Worker Agent [COMPLETE]

### Task 2.1: Agent Binary Scaffold [COMPLETE]
**File:** `apps/backend/crates/agent/Cargo.toml`, `apps/backend/crates/agent/src/main.rs`

Create the worker agent as a separate binary in the Cargo workspace.

```toml
# agent/Cargo.toml
[package]
name = "trulience-agent"
version = "0.1.0"
edition = "2021"

[dependencies]
nvml-wrapper = "0.10"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

```rust
// agent/src/main.rs
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let backend_ws_url = std::env::var("BACKEND_WS_URL")
        .expect("BACKEND_WS_URL must be set");
    let worker_id: i64 = std::env::var("WORKER_ID")
        .expect("WORKER_ID must be set")
        .parse()
        .expect("WORKER_ID must be a number");
    let interval_secs: u64 = std::env::var("METRICS_INTERVAL_SECS")
        .ok().and_then(|v| v.parse().ok()).unwrap_or(5);

    // Connect to backend, start collection loop
}
```

**Acceptance Criteria:**
- [x] Separate Cargo package `trulience-agent` in workspace
- [x] Configurable via env vars: `BACKEND_WS_URL`, `WORKER_ID`, `METRICS_INTERVAL_SECS`
- [x] Compiles independently: `cargo build -p trulience-agent`
- [x] Root `Cargo.toml` updated with workspace member

### Task 2.2: NVML Metrics Collection [COMPLETE]
**File:** `apps/backend/crates/agent/src/collector.rs`

```rust
use nvml_wrapper::Nvml;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct GpuMetrics {
    pub gpu_index: u32,
    pub vram_used_mb: u32,
    pub vram_total_mb: u32,
    pub temperature_celsius: u32,
    pub utilization_percent: u32,
    pub power_draw_watts: Option<u32>,
    pub fan_speed_percent: Option<u32>,
}

pub struct MetricsCollector {
    nvml: Nvml,
}

impl MetricsCollector {
    pub fn new() -> Result<Self, nvml_wrapper::error::NvmlError> {
        Ok(Self { nvml: Nvml::init()? })
    }

    pub fn collect_all(&self) -> Vec<GpuMetrics> {
        let device_count = self.nvml.device_count().unwrap_or(0);
        (0..device_count)
            .filter_map(|i| self.collect_gpu(i).ok())
            .collect()
    }

    fn collect_gpu(&self, index: u32) -> Result<GpuMetrics, nvml_wrapper::error::NvmlError> {
        let device = self.nvml.device_by_index(index)?;
        let memory = device.memory_info()?;
        let temp = device.temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)?;
        let util = device.utilization_rates()?;
        let power = device.power_usage().ok().map(|p| p / 1000); // mW to W
        let fan = device.fan_speed(0).ok();

        Ok(GpuMetrics {
            gpu_index: index,
            vram_used_mb: (memory.used / 1_048_576) as u32,
            vram_total_mb: (memory.total / 1_048_576) as u32,
            temperature_celsius: temp,
            utilization_percent: util.gpu,
            power_draw_watts: power,
            fan_speed_percent: fan,
        })
    }
}
```

**Acceptance Criteria:**
- [x] Collects VRAM used/total, temperature, utilization, power draw, fan speed
- [x] Handles multiple GPUs per machine (`device_count` loop)
- [x] Gracefully handles missing metrics (power draw, fan speed as `Option`)
- [x] NVML initialization errors are clear (driver not found, permission denied)
- [x] `nvml-wrapper` crate in agent dependencies

**Implementation:** NVML stored as `Option<Nvml>` — gracefully handles missing NVIDIA drivers without panicking.

### Task 2.3: Agent WebSocket Connection and Push [COMPLETE]
**File:** `apps/backend/crates/agent/src/sender.rs`

```rust
use tokio_tungstenite::connect_async;
use tokio::time::{interval, Duration};

pub async fn start_metrics_loop(
    backend_url: &str,
    worker_id: i64,
    interval_secs: u64,
    collector: MetricsCollector,
) {
    loop {
        match connect_async(backend_url).await {
            Ok((ws_stream, _)) => {
                let (mut write, _read) = ws_stream.split();
                let mut ticker = interval(Duration::from_secs(interval_secs));

                loop {
                    ticker.tick().await;
                    let metrics = collector.collect_all();
                    let payload = serde_json::json!({
                        "type": "gpu_metrics",
                        "worker_id": worker_id,
                        "metrics": metrics,
                        "timestamp": chrono::Utc::now().to_rfc3339(),
                    });

                    if write.send(Message::Text(payload.to_string())).await.is_err() {
                        tracing::warn!("WebSocket send failed, reconnecting");
                        break;
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to connect to backend: {}", e);
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}
```

**Acceptance Criteria:**
- [x] Pushes metrics every `METRICS_INTERVAL_SECS` (default 5) via WebSocket
- [x] Automatically reconnects on disconnection (with 5s delay)
- [x] JSON payload includes worker_id, all GPU metrics, and ISO 8601 timestamp
- [x] Reconnect loop runs indefinitely until process is killed

**Implementation:** Also added `restart.rs` module with service restart handler (validates service names against injection, 60s timeout, reports results back via WS). Added `tokio::select!` for concurrent metrics push and incoming command handling.

---

## Phase 3: Backend Metrics Ingestion [COMPLETE]

### Task 3.1: Metrics WebSocket Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/hardware.rs`

Backend endpoint that receives metrics from worker agents.

```rust
pub async fn metrics_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_metrics_socket(socket, state))
}

async fn handle_metrics_socket(mut socket: WebSocket, state: AppState) {
    let (_, mut receiver) = socket.split();

    while let Some(Ok(Message::Text(text))) = receiver.next().await {
        match serde_json::from_str::<MetricsPayload>(&text) {
            Ok(payload) => {
                // Insert metrics into gpu_metrics table
                for metric in &payload.metrics {
                    MetricsRepo::insert(&state.pool, payload.worker_id, metric).await.ok();
                }

                // Evaluate thresholds
                evaluate_thresholds(&state, payload.worker_id, &payload.metrics).await;
            }
            Err(e) => {
                tracing::warn!("Invalid metrics payload: {}", e);
            }
        }
    }
}
```

**Acceptance Criteria:**
- [x] WebSocket endpoint at `/ws/metrics` accepts agent connections
- [x] Parses JSON metrics payload and inserts into `gpu_metrics`
- [x] Evaluates thresholds on each batch of metrics
- [x] Invalid payloads are logged but don't crash the connection

### Task 3.2: Threshold Evaluation Engine [COMPLETE]
**File:** `apps/backend/crates/core/src/hardware/thresholds.rs`

```rust
pub async fn evaluate_thresholds(
    state: &AppState,
    worker_id: DbId,
    metrics: &[GpuMetrics],
) {
    let thresholds = ThresholdRepo::get_for_worker(&state.pool, worker_id).await.unwrap_or_default();

    for metric in metrics {
        for threshold in &thresholds {
            let value = match threshold.metric_name.as_str() {
                "temperature_celsius" => Some(metric.temperature_celsius as i32),
                "utilization_percent" => Some(metric.utilization_percent as i32),
                "vram_used_percent" => {
                    if metric.vram_total_mb > 0 {
                        Some((metric.vram_used_mb as f64 / metric.vram_total_mb as f64 * 100.0) as i32)
                    } else { None }
                }
                _ => None,
            };

            if let Some(v) = value {
                if v >= threshold.critical_value {
                    emit_alert(state, worker_id, &threshold.metric_name, v, AlertLevel::Critical).await;
                } else if v >= threshold.warning_value {
                    emit_alert(state, worker_id, &threshold.metric_name, v, AlertLevel::Warning).await;
                }
            }
        }
    }
}
```

**Acceptance Criteria:**
- [x] Evaluates temperature, VRAM %, and utilization % against thresholds
- [x] Supports per-worker overrides with fallback to global defaults
- [x] Emits warning and critical alerts (connected to PRD-010 event bus)
- [x] Alert deduplication: don't re-alert for the same condition within a cooldown period

**Implementation:** Pure evaluation logic in `core` crate with `AlertCooldownTracker` (5-min suppression). Handler in `api` crate calls evaluation after fetching thresholds from DB and emits alerts via event bus. 6 unit tests for threshold evaluation.

---

## Phase 4: Admin API Endpoints [COMPLETE]

### Task 4.1: Metrics Query API [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/hardware.rs`

```rust
pub async fn get_worker_metrics(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
    Path(worker_id): Path<DbId>,
    Query(params): Query<MetricsQuery>,
) -> Result<Json<Vec<GpuMetricRow>>, AppError> {
    let since = params.since.unwrap_or_else(|| Utc::now() - chrono::Duration::hours(1));
    let metrics = MetricsRepo::get_for_worker(&state.pool, worker_id, since).await?;
    Ok(Json(metrics))
}

pub async fn get_all_workers_current(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<WorkerCurrentMetrics>>, AppError> {
    // Get latest metric for each worker
    let metrics = MetricsRepo::get_latest_per_worker(&state.pool).await?;
    Ok(Json(metrics))
}
```

**Acceptance Criteria:**
- [x] `GET /api/v1/admin/hardware/workers/:id/metrics?since=<ISO8601>` — historical metrics for a worker
- [x] `GET /api/v1/admin/hardware/workers/metrics/current` — latest metrics for all workers
- [x] Admin-only access (`RequireAdmin`)
- [x] Configurable time range (default last 1 hour)

### Task 4.2: One-Click Restart Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/hardware.rs`

```rust
#[derive(Deserialize)]
pub struct RestartRequest {
    pub service_name: String,
    pub reason: Option<String>,
    pub force: bool,
}

pub async fn restart_service(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(worker_id): Path<DbId>,
    Json(input): Json<RestartRequest>,
) -> Result<Json<RestartLog>, AppError> {
    // 1. Create restart_logs entry
    let log = RestartLogRepo::create(&state.pool, worker_id, &input.service_name, admin.user_id, input.reason.as_deref()).await?;

    // 2. Send restart command to worker agent via WebSocket
    // 3. Agent executes restart and reports back
    // 4. Update restart_logs with result

    Ok(Json(log))
}
```

**Acceptance Criteria:**
- [x] `POST /api/v1/admin/hardware/workers/:id/restart` — trigger service restart
- [x] Requires Admin role
- [x] Request specifies service name and optional reason
- [x] `force: true` skips waiting for current job to complete
- [x] Restart logged with initiator, timestamp, and outcome
- [x] Returns restart log entry with status tracking

### Task 4.3: Threshold Configuration API [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/hardware.rs`

```rust
pub async fn update_thresholds(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
    Path(worker_id): Path<DbId>,
    Json(input): Json<UpdateThresholdRequest>,
) -> Result<Json<MetricThreshold>, AppError> { ... }
```

**Acceptance Criteria:**
- [x] `GET /api/v1/admin/hardware/thresholds` — list all thresholds
- [x] `PUT /api/v1/admin/hardware/workers/:id/thresholds` — update per-worker thresholds
- [x] `PUT /api/v1/admin/hardware/thresholds/global` — update global defaults
- [x] Admin-only access

**Implementation:** All routes nested under `/admin/hardware`. Includes input validation for threshold values (warning < critical, non-negative).

---

## Phase 5: Metrics Retention [COMPLETE]

### Task 5.1: Metrics Cleanup Job [COMPLETE]
**File:** `apps/backend/crates/api/src/background/metrics_retention.rs`

```rust
pub async fn cleanup_old_metrics(pool: &PgPool, retention_hours: i64) {
    let cutoff = Utc::now() - chrono::Duration::hours(retention_hours);
    let result = sqlx::query(
        "DELETE FROM gpu_metrics WHERE recorded_at < $1"
    )
    .bind(cutoff)
    .execute(pool)
    .await;

    match result {
        Ok(r) => tracing::info!("Cleaned up {} old metric rows", r.rows_affected()),
        Err(e) => tracing::error!("Metrics cleanup failed: {}", e),
    }
}
```

**Acceptance Criteria:**
- [x] Deletes metrics older than configurable retention period (default 24h)
- [x] Runs as a periodic background task (every hour)
- [x] Logs how many rows were deleted
- [x] Does not block metric ingestion

**Implementation:** Uses `tokio::spawn` + `tokio::time::interval`. Configurable via `METRICS_RETENTION_HOURS` env var. Uses `CancellationToken` for graceful shutdown.

---

## Phase 6: Frontend Dashboard [COMPLETE]

### Task 6.1: Hardware Dashboard Page [COMPLETE]
**File:** `apps/frontend/src/features/admin/HardwareDashboard.tsx`

**Acceptance Criteria:**
- [x] Shows all workers in a grid/list view
- [x] Each worker card shows: name, GPU count, current metrics
- [x] Auto-refreshes every 5 seconds
- [x] Admin-only page (protected route)

**Implementation:** Responsive grid (1-4 cols) of WorkerCards. Click-to-expand MetricsChart for selected worker. Route `/admin/hardware` added to TanStack Router with `ProtectedRoute` requiredRole="admin". EmptyState and Spinner for empty/loading states.

### Task 6.2: GPU Metrics Gauge Component [COMPLETE]
**File:** `apps/frontend/src/features/admin/components/GpuGauge.tsx`

**Acceptance Criteria:**
- [x] Color-coded: green (<warning), yellow (warning-critical), red (>critical)
- [x] Shows value, max, and percentage
- [x] Used for temperature, VRAM, utilization, power
- [x] Smooth transitions on value changes

**Implementation:** Horizontal bar gauge using CSS custom properties for theme-aware colors. Accessible `progressbar` role with aria attributes. CSS transition on width changes.

### Task 6.3: Historical Metrics Chart [COMPLETE]
**File:** `apps/frontend/src/features/admin/components/MetricsChart.tsx`

**Acceptance Criteria:**
- [x] Line chart showing metrics over time
- [x] Configurable time range: 1h, 6h, 24h
- [x] Separate series for temperature, VRAM, utilization
- [x] Threshold lines drawn on chart for reference
- [x] Uses a charting library (recharts or similar)

**Implementation:** Recharts 3.7 LineChart with three series (temperature=red, VRAM%=blue, utilization%=green). Warning/Critical ReferenceLine overlays. Time range buttons. Theme-aware colors resolved from CSS custom properties.

### Task 6.4: Restart Button with Confirmation [COMPLETE]
**File:** `apps/frontend/src/features/admin/components/RestartButton.tsx`

**Acceptance Criteria:**
- [x] Button visible on each worker card
- [x] Confirmation dialog with reason text input
- [x] Shows restart progress: initiated -> stopping -> restarting -> completed
- [x] Error display if restart fails
- [x] Force-restart option with stronger warning

**Implementation:** Uses existing Modal and Button components. Service name input, optional reason, force checkbox with danger warning. Loading state during mutation, error display on failure, auto-close on success.

**Additional files created:**
- `apps/frontend/src/features/admin/hooks/use-hardware.ts` — TanStack Query hooks: useCurrentMetrics (5s polling), useWorkerMetrics, useThresholds, useRestartService, useRestartLogs
- `apps/frontend/src/features/admin/components/WorkerCard.tsx` — Per-worker card with online/offline status, GPU gauges, threshold resolution, restart button
- Added `put<T>()` method to `src/lib/api.ts` for threshold PUT endpoints
- Added recharts 3.7 dependency

---

## Phase 7: Integration Tests [COMPLETE]

### Task 7.1: Metrics Collection Tests [COMPLETE]
**File:** `apps/backend/crates/agent/tests/collector_tests.rs`

**Acceptance Criteria:**
- [x] Test: NVML initialization (may skip on CI without GPU)
- [x] Test: metrics serialization to JSON

**Implementation:** 4 tests: GPU metrics serialization (all fields present), optional fields serialize as null, NVML init graceful without drivers, collect() returns vec without panicking. Added `lib.rs` to agent crate for test imports.

### Task 7.2: Backend Metrics API Tests [COMPLETE]
**File:** `apps/backend/crates/api/tests/hardware_api.rs`

**Acceptance Criteria:**
- [x] Test: insert and retrieve metrics
- [x] Test: latest metrics per worker query
- [x] Test: time-range filtering
- [x] Test: threshold evaluation triggers alerts
- [x] Test: restart log creation and status tracking
- [x] Test: metrics cleanup deletes old data

**Implementation:** 12 tests total: 9 DB-dependent tests using `#[sqlx::test]` with migrations (insert/retrieve, latest per worker, time-range filtering, restart log CRUD, metrics cleanup, threshold upsert, batch insert, restart log listing) + 3 pure threshold evaluation tests (triggers alerts, no alerts in range, VRAM % computation). All non-DB tests pass; DB tests pass when PostgreSQL is available.

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218500001_create_gpu_metrics_table.sql` | GPU metrics storage |
| `migrations/20260218500002_create_metric_thresholds_table.sql` | Alert thresholds |
| `migrations/20260218500003_create_restart_logs_table.sql` | Restart audit log |
| `agent/Cargo.toml` | Worker agent package manifest |
| `agent/src/main.rs` | Agent entry point |
| `agent/src/collector.rs` | NVML metrics collection |
| `agent/src/sender.rs` | WebSocket push to backend |
| `src/api/handlers/metrics_ws.rs` | Metrics ingestion WebSocket endpoint |
| `src/api/handlers/hardware.rs` | Admin hardware API handlers |
| `src/hardware/mod.rs` | Hardware module barrel file |
| `src/hardware/thresholds.rs` | Threshold evaluation engine |
| `src/hardware/retention.rs` | Metrics cleanup background job |
| `src/repositories/metrics_repo.rs` | GPU metrics CRUD |
| `src/repositories/threshold_repo.rs` | Threshold CRUD |
| `src/repositories/restart_log_repo.rs` | Restart log CRUD |
| `frontend/src/pages/admin/HardwareDashboard.tsx` | Dashboard page |
| `frontend/src/components/hardware/GpuGauge.tsx` | Metric gauge component |
| `frontend/src/components/hardware/MetricsChart.tsx` | Historical chart |
| `frontend/src/components/hardware/RestartButton.tsx` | Restart with confirmation |

---

## Dependencies

### Existing Components to Reuse
- PRD-002: Axum WebSocket handler pattern, `AppState`, Tokio runtime
- PRD-003: `RequireAdmin` extractor for admin-only endpoints
- PRD-000: `trigger_set_updated_at()`, `DbId = i64`

### New Infrastructure Needed
- `nvml-wrapper` crate (agent only) for GPU metrics
- `reqwest` (if agent uses HTTP instead of/in addition to WebSocket)
- Charting library for frontend (recharts or similar)
- Cargo workspace configuration for `agent/` member

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.3
2. Phase 2: Worker Agent — Tasks 2.1–2.3
3. Phase 3: Backend Metrics Ingestion — Tasks 3.1–3.2
4. Phase 4: Admin API Endpoints — Tasks 4.1–4.2

**MVP Success Criteria:**
- Agent collects GPU metrics every 5s and pushes to backend
- Metrics stored in database with timestamps
- Admin can query current and historical metrics via API
- Threshold alerts fire when metrics exceed configured values
- Restart endpoint creates audit log and sends command

### Post-MVP Enhancements
1. Phase 4: Threshold API — Task 4.3
2. Phase 5: Metrics Retention — Task 5.1
3. Phase 6: Frontend Dashboard — Tasks 6.1–6.4
4. Phase 7: Integration Tests — Tasks 7.1–7.2

---

## Notes

1. **NVML availability:** The worker agent requires the NVIDIA driver and NVML library. On CI/test machines without GPUs, the collector should gracefully handle initialization failure and report zero GPUs.
2. **Metrics volume:** At 5-second intervals with 4 GPUs per worker and 10 workers, that is 8 rows/second or ~690k rows/day. The retention cleanup is essential.
3. **Restart mechanism:** The restart command flows from backend -> agent WebSocket -> agent executes `systemctl restart comfyui` or similar. The agent needs appropriate permissions (sudoers entry for the service).
4. **Alert deduplication:** Threshold alerts should have a cooldown (e.g., 5 minutes) to prevent alert storms during sustained high temperature.
5. **Worker identity:** The `worker_id` in metrics currently references an integer configured on the agent. This will link to PRD-046's `workers` table once that is implemented.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
