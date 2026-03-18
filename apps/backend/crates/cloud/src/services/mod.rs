//! Background services for cloud GPU management (PRD-114).

pub mod monitoring;
pub mod reconciliation;
pub mod scaling;

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;
use tracing::warn;

use crate::registry::ProviderRegistry;

/// A handle that can wake a periodic service to run immediately.
///
/// Call `nudge()` after admin actions (enable/disable rules, resume processing)
/// so the service evaluates without waiting for the next interval tick.
#[derive(Clone)]
pub struct ServiceNudge(Arc<Notify>);

impl ServiceNudge {
    fn new() -> (Self, Arc<Notify>) {
        let notify = Arc::new(Notify::new());
        (Self(Arc::clone(&notify)), notify)
    }

    /// Wake the service to run its next evaluation immediately.
    pub fn nudge(&self) {
        self.0.notify_one();
    }
}

/// Spawn a periodic background service that runs `task_fn` at the given interval.
/// Returns a `ServiceNudge` handle that can trigger an immediate evaluation.
///
/// Shared boilerplate for scaling, monitoring, and reconciliation services.
pub fn spawn_periodic_service<F, Fut>(
    name: &'static str,
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    interval_secs: Option<u64>,
    default_interval_secs: u64,
    task_fn: F,
) -> (tokio::task::JoinHandle<()>, ServiceNudge)
where
    F: Fn(PgPool, Arc<ProviderRegistry>) -> Fut + Send + 'static,
    Fut: Future<Output = Result<(), Box<dyn std::error::Error + Send + Sync>>> + Send,
{
    let interval = Duration::from_secs(interval_secs.unwrap_or(default_interval_secs));
    let (nudge, notify) = ServiceNudge::new();

    let handle = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            // Wait for either the regular interval OR an immediate nudge
            tokio::select! {
                _ = ticker.tick() => {}
                _ = notify.notified() => {
                    ticker.reset(); // Reset timer so next tick is a full interval from now
                }
            }
            if let Err(e) = task_fn(pool.clone(), registry.clone()).await {
                warn!("{name} service error: {e}");
            }
        }
    });

    (handle, nudge)
}

/// Terminate a batch of instances and record the results in DB.
///
/// Returns `(terminated_count, failed_count)`.
pub async fn terminate_and_record(
    provider: &dyn x121_core::cloud::CloudGpuProvider,
    pool: &PgPool,
    instances: &[x121_db::models::cloud_provider::CloudInstance],
) -> (u32, u32) {
    use x121_db::repositories::CloudInstanceRepo;

    let mut terminated = 0u32;
    let mut failed = 0u32;

    for inst in instances {
        match provider.terminate_instance(&inst.external_id).await {
            Ok(()) => {
                let _ =
                    CloudInstanceRepo::mark_terminated(pool, inst.id, inst.total_cost_cents).await;
                // Disable linked ComfyUI instances
                let _ = sqlx::query(
                    "UPDATE comfyui_instances SET is_enabled = false \
                     WHERE cloud_instance_id = $1",
                )
                .bind(inst.id)
                .execute(pool)
                .await;
                terminated += 1;
            }
            Err(_) => {
                failed += 1;
            }
        }
    }

    (terminated, failed)
}
