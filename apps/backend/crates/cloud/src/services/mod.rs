//! Background services for cloud GPU management (PRD-114).

pub mod monitoring;
pub mod reconciliation;
pub mod scaling;

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tracing::warn;

use crate::registry::ProviderRegistry;

/// Spawn a periodic background service that runs `task_fn` at the given interval.
///
/// Shared boilerplate for scaling, monitoring, and reconciliation services.
pub fn spawn_periodic_service<F, Fut>(
    name: &'static str,
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    interval_secs: Option<u64>,
    default_interval_secs: u64,
    task_fn: F,
) -> tokio::task::JoinHandle<()>
where
    F: Fn(PgPool, Arc<ProviderRegistry>) -> Fut + Send + 'static,
    Fut: Future<Output = Result<(), Box<dyn std::error::Error + Send + Sync>>> + Send,
{
    let interval = Duration::from_secs(interval_secs.unwrap_or(default_interval_secs));

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            if let Err(e) = task_fn(pool.clone(), registry.clone()).await {
                warn!("{name} service error: {e}");
            }
        }
    })
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
                terminated += 1;
            }
            Err(_) => {
                failed += 1;
            }
        }
    }

    (terminated, failed)
}
