//! Instance health monitoring background service (PRD-114).
//!
//! Polls instance statuses, updates DB records, and records cost events.

use std::sync::Arc;

use sqlx::PgPool;
use tracing::warn;
use x121_core::cloud::InstanceStatus;

use crate::registry::ProviderRegistry;

const DEFAULT_INTERVAL_SECS: u64 = 60;

/// Spawn the monitoring service.
pub fn spawn_monitoring_service(
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    interval_secs: Option<u64>,
) -> (tokio::task::JoinHandle<()>, super::ServiceNudge) {
    super::spawn_periodic_service(
        "Monitoring",
        pool,
        registry,
        interval_secs,
        DEFAULT_INTERVAL_SECS,
        |pool, registry| async move { poll_all_instances(&pool, &registry).await },
    )
}

async fn poll_all_instances(
    pool: &PgPool,
    registry: &ProviderRegistry,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use x121_db::repositories::CloudInstanceRepo;

    let provider_ids = registry.provider_ids().await;

    for pid in provider_ids {
        let provider = match registry.get(pid).await {
            Some(p) => p,
            None => continue,
        };

        let instances = CloudInstanceRepo::list_active_by_provider(pool, pid).await?;

        for inst in &instances {
            match provider.get_instance_status(&inst.external_id).await {
                Ok(status) => {
                    let new_status_id = status.to_db_status_id();

                    if new_status_id != inst.status_id {
                        let _ =
                            CloudInstanceRepo::update_status(pool, inst.id, new_status_id).await;
                    }

                    // Update network info if newly running
                    if status == InstanceStatus::Running && inst.ip_address.is_none() {
                        // Fetch pod details for SSH info (RunPod-specific)
                        // This is already handled by the status mapping via PodInfo
                    }

                    let _ = CloudInstanceRepo::touch_health_check(pool, inst.id).await;
                }
                Err(e) => {
                    warn!(
                        instance_id = inst.id,
                        external_id = inst.external_id,
                        "Health check failed: {e}"
                    );
                }
            }
        }
    }

    Ok(())
}
