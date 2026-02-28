//! In-memory health aggregator for the system status footer (PRD-117).
//!
//! Periodically probes platform services (database, ComfyUI instances,
//! worker fleet) and caches their status. The cached snapshot is served
//! by the `/api/v1/status/footer` endpoint without any per-request I/O.

use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use tokio::sync::RwLock;

use x121_core::system_health::{STATUS_DEGRADED, STATUS_DOWN, STATUS_HEALTHY};
use x121_db::repositories::WorkerRepo;

/// How often the background task refreshes the cached snapshot.
const POLL_INTERVAL: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Cached status of a single service.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    /// One of `"healthy"`, `"degraded"`, or `"down"`.
    pub status: &'static str,
    /// Round-trip latency of the last probe, in milliseconds.
    pub latency_ms: Option<u32>,
    /// When this service was last checked.
    pub checked_at: DateTime<Utc>,
    /// Optional human-readable detail (e.g. error message).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Cached cloud GPU summary. Stubbed until PRD-114 lands.
#[derive(Debug, Clone, Serialize)]
pub struct CloudGpuStatus {
    /// Number of active GPU pods.
    pub active_pods: u32,
    /// Total cost per hour in cents.
    pub cost_per_hour_cents: u32,
    /// One of `"within_budget"`, `"approaching_cap"`, or `"exceeded"`.
    pub budget_status: &'static str,
}

/// Cached workflow summary. Stubbed until PRD-07 workflows are fully wired.
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowStatus {
    /// Number of active (in-flight) workflows.
    pub active: u32,
    /// Name of the current pipeline stage, if any.
    pub current_stage: Option<String>,
}

/// Per-service breakdown included in the footer snapshot.
#[derive(Debug, Clone, Serialize)]
pub struct FooterServices {
    /// ComfyUI connection manager health.
    pub comfyui: ServiceStatus,
    /// Database connectivity.
    pub database: ServiceStatus,
    /// Worker fleet health.
    pub workers: ServiceStatus,
}

/// Complete footer data cached in memory.
#[derive(Debug, Clone, Serialize)]
pub struct FooterSnapshot {
    /// Individual service statuses (admin-only).
    pub services: FooterServices,
    /// Cloud GPU summary (admin-only, stubbed).
    pub cloud_gpu: CloudGpuStatus,
    /// Workflow summary.
    pub workflows: WorkflowStatus,
}

// ---------------------------------------------------------------------------
// HealthAggregator
// ---------------------------------------------------------------------------

/// In-memory cache of platform health, refreshed by a background Tokio task.
pub struct HealthAggregator {
    snapshot: RwLock<FooterSnapshot>,
}

impl Default for HealthAggregator {
    fn default() -> Self {
        Self::new()
    }
}

impl HealthAggregator {
    /// Create a new aggregator with all services initially marked as `"down"`.
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::new(initial_snapshot()),
        }
    }

    /// Read the current cached snapshot.
    pub async fn snapshot(&self) -> FooterSnapshot {
        self.snapshot.read().await.clone()
    }

    /// Spawn a background Tokio task that refreshes the snapshot every
    /// [`POLL_INTERVAL`] seconds.
    pub fn start_polling(
        self: Arc<Self>,
        pool: PgPool,
        comfyui: Arc<x121_comfyui::manager::ComfyUIManager>,
    ) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(POLL_INTERVAL);
            loop {
                interval.tick().await;
                self.refresh(&pool, &comfyui).await;
            }
        });
    }

    /// Probe all services and update the cached snapshot.
    async fn refresh(&self, pool: &PgPool, comfyui: &x121_comfyui::manager::ComfyUIManager) {
        let db_status = probe_database(pool).await;
        let comfyui_status = probe_comfyui(comfyui).await;
        let workers_status = probe_workers(pool).await;

        let new_snapshot = FooterSnapshot {
            services: FooterServices {
                comfyui: comfyui_status,
                database: db_status,
                workers: workers_status,
            },
            // Stubbed until PRD-114 (RunPod cloud GPU integration).
            cloud_gpu: CloudGpuStatus {
                active_pods: 0,
                cost_per_hour_cents: 0,
                budget_status: "within_budget",
            },
            // Stubbed until workflow orchestration is fully wired.
            workflows: WorkflowStatus {
                active: 0,
                current_stage: None,
            },
        };

        *self.snapshot.write().await = new_snapshot;
    }
}

// ---------------------------------------------------------------------------
// Probe helpers
// ---------------------------------------------------------------------------

/// Probe the database via the shared `x121_db::health_check` and measure latency.
async fn probe_database(pool: &PgPool) -> ServiceStatus {
    let start = Instant::now();
    let now = Utc::now();

    match x121_db::health_check(pool).await {
        Ok(()) => {
            let latency_ms = start.elapsed().as_millis() as u32;
            ServiceStatus {
                status: STATUS_HEALTHY,
                latency_ms: Some(latency_ms),
                checked_at: now,
                detail: None,
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "Database health probe failed");
            ServiceStatus {
                status: STATUS_DOWN,
                latency_ms: None,
                checked_at: now,
                detail: Some(e.to_string()),
            }
        }
    }
}

/// Probe ComfyUI by checking the number of connected instances.
async fn probe_comfyui(comfyui: &x121_comfyui::manager::ComfyUIManager) -> ServiceStatus {
    let now = Utc::now();
    let connected = comfyui.connected_instance_ids().await;
    let count = connected.len();

    if count > 0 {
        ServiceStatus {
            status: STATUS_HEALTHY,
            latency_ms: None,
            checked_at: now,
            detail: Some(format!("{count} instance(s) connected")),
        }
    } else {
        ServiceStatus {
            status: STATUS_DOWN,
            latency_ms: None,
            checked_at: now,
            detail: Some("No ComfyUI instances connected".to_string()),
        }
    }
}

/// Probe the worker fleet via `WorkerRepo::fleet_stats`.
async fn probe_workers(pool: &PgPool) -> ServiceStatus {
    let now = Utc::now();

    match WorkerRepo::fleet_stats(pool).await {
        Ok(stats) => {
            let total = stats.total_workers;
            let idle = stats.idle_workers;
            let busy = stats.busy_workers;

            let status = if total == 0 {
                STATUS_DOWN
            } else if idle == 0 && busy == 0 {
                STATUS_DEGRADED
            } else {
                STATUS_HEALTHY
            };

            ServiceStatus {
                status,
                latency_ms: None,
                checked_at: now,
                detail: Some(format!("{total} total, {idle} idle, {busy} busy")),
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "Worker fleet probe failed");
            ServiceStatus {
                status: STATUS_DEGRADED,
                latency_ms: None,
                checked_at: now,
                detail: Some(e.to_string()),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/// Build the initial snapshot with all services marked as `"down"`.
fn initial_snapshot() -> FooterSnapshot {
    let now = Utc::now();
    let down = || ServiceStatus {
        status: STATUS_DOWN,
        latency_ms: None,
        checked_at: now,
        detail: None,
    };

    FooterSnapshot {
        services: FooterServices {
            comfyui: down(),
            database: down(),
            workers: down(),
        },
        cloud_gpu: CloudGpuStatus {
            active_pods: 0,
            cost_per_hour_cents: 0,
            budget_status: "within_budget",
        },
        workflows: WorkflowStatus {
            active: 0,
            current_stage: None,
        },
    }
}
