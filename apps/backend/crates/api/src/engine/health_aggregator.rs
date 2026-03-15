//! In-memory health aggregator for the system status footer (PRD-117).
//!
//! Periodically probes platform services (database, ComfyUI instances,
//! worker fleet) and caches their status. The cached snapshot is served
//! by the `/api/v1/status/footer` endpoint without any per-request I/O.

use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::Serialize;
use sqlx::PgPool;
use tokio::sync::RwLock;

use x121_core::system_health::{STATUS_DEGRADED, STATUS_DOWN, STATUS_HEALTHY};
use x121_db::repositories::{
    CloudCostEventRepo, CloudInstanceRepo, CloudScalingRuleRepo, JobRepo, ProductionRunRepo, WorkerRepo,
};

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

/// Cached cloud GPU summary.
#[derive(Debug, Clone, Serialize)]
pub struct CloudGpuStatus {
    /// Number of active GPU pods.
    pub active_pods: u32,
    /// Total cost per hour in cents.
    pub cost_per_hour_cents: u32,
    /// One of `"ok"`, `"warning"`, or `"exceeded"`.
    pub budget_status: &'static str,
}

/// Cached workflow summary.
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
    /// Cloud GPU summary (admin-only).
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
        let comfyui_status = probe_comfyui(pool, comfyui).await;
        let workers_status = probe_workers(pool).await;

        let cloud_gpu = probe_cloud_gpu(pool).await;
        let workflows = probe_workflows(pool).await;

        let new_snapshot = FooterSnapshot {
            services: FooterServices {
                comfyui: comfyui_status,
                database: db_status,
                workers: workers_status,
            },
            cloud_gpu,
            workflows,
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
async fn probe_comfyui(pool: &PgPool, comfyui: &x121_comfyui::manager::ComfyUIManager) -> ServiceStatus {
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
        // No instances — only "down" if there are pending jobs
        let (pending, _, _) = JobRepo::queue_counts(pool).await.unwrap_or((0, 0, 0));
        if pending > 0 {
            ServiceStatus {
                status: STATUS_DOWN,
                latency_ms: None,
                checked_at: now,
                detail: Some(format!("{pending} pending job(s) but no GPU instances")),
            }
        } else {
            ServiceStatus {
                status: STATUS_HEALTHY,
                latency_ms: None,
                checked_at: now,
                detail: Some("Idle — instances scale on demand".to_string()),
            }
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

            let (pending, _, _) = JobRepo::queue_counts(pool).await.unwrap_or((0, 0, 0));
            let status = if total == 0 {
                if pending > 0 { STATUS_DOWN } else { STATUS_HEALTHY }
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

/// Probe cloud GPU instances and budget status.
async fn probe_cloud_gpu(pool: &PgPool) -> CloudGpuStatus {
    // Get active instance count and total cost/hour
    let (active_pods, cost_per_hour_cents) = match CloudInstanceRepo::active_summary(pool).await {
        Ok((count, cost)) => (count as u32, cost as u32),
        Err(e) => {
            tracing::warn!(error = %e, "Cloud GPU probe failed");
            return CloudGpuStatus {
                active_pods: 0,
                cost_per_hour_cents: 0,
                budget_status: "ok",
            };
        }
    };

    // Determine budget status from scaling rules
    let budget_status = match CloudScalingRuleRepo::list_enabled(pool).await {
        Ok(rules) => {
            let mut total_budget: i64 = 0;
            let mut total_spent: i64 = 0;
            let mut has_budget = false;
            let now = chrono::Utc::now();
            let period_start = now - ChronoDuration::hours(24 * 30);

            for rule in &rules {
                if let Some(limit) = rule.budget_limit_cents {
                    has_budget = true;
                    total_budget += limit;
                    if let Ok(summary) = CloudCostEventRepo::sum_by_provider_in_range(
                        pool,
                        rule.provider_id,
                        period_start,
                        now,
                    )
                    .await
                    {
                        total_spent += summary.total_cost_cents;
                    }
                }
            }

            if !has_budget || total_budget == 0 {
                "ok"
            } else if total_spent >= total_budget {
                "exceeded"
            } else if total_spent >= total_budget * 8 / 10 {
                "warning"
            } else {
                "ok"
            }
        }
        Err(_) => "ok",
    };

    CloudGpuStatus {
        active_pods,
        cost_per_hour_cents,
        budget_status,
    }
}

/// Probe active production runs and running jobs for workflow status.
async fn probe_workflows(pool: &PgPool) -> WorkflowStatus {
    let active = match ProductionRunRepo::active_run_count(pool).await {
        Ok(count) => count as u32,
        Err(e) => {
            tracing::warn!(error = %e, "Workflow probe failed");
            0
        }
    };

    // Determine current stage from job queue state
    let current_stage = match x121_db::repositories::JobRepo::queue_counts(pool).await {
        Ok((pending, running, _scheduled)) => {
            if running > 0 {
                Some(format!("Generating ({running} running, {pending} queued)"))
            } else if pending > 0 {
                Some(format!("Queued ({pending} pending)"))
            } else {
                None
            }
        }
        Err(_) => None,
    };

    WorkflowStatus {
        active,
        current_stage,
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
            budget_status: "ok",
        },
        workflows: WorkflowStatus {
            active: 0,
            current_stage: None,
        },
    }
}
