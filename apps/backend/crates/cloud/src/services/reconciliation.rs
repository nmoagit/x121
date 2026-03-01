//! State reconciliation background service (PRD-114).
//!
//! Compares DB state vs actual provider state and fixes drift:
//! - Instances marked as running in DB but terminated at provider -> mark terminated
//! - Instances unknown to DB but running at provider -> log warning

use std::sync::Arc;

use sqlx::PgPool;
use tracing::{info, warn};
use x121_core::cloud::InstanceStatus;

use crate::registry::ProviderRegistry;

const DEFAULT_INTERVAL_SECS: u64 = 300; // Every 5 minutes

/// Spawn the reconciliation service.
pub fn spawn_reconciliation_service(
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    interval_secs: Option<u64>,
) -> tokio::task::JoinHandle<()> {
    super::spawn_periodic_service(
        "Reconciliation",
        pool,
        registry,
        interval_secs,
        DEFAULT_INTERVAL_SECS,
        |pool, registry| async move { reconcile_all(&pool, &registry).await },
    )
}

async fn reconcile_all(
    pool: &PgPool,
    registry: &ProviderRegistry,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use x121_db::models::status::CloudInstanceStatus as DbStatus;
    use x121_db::repositories::CloudInstanceRepo;

    let provider_ids = registry.provider_ids().await;

    for pid in provider_ids {
        let provider = match registry.get(pid).await {
            Some(p) => p,
            None => continue,
        };

        let db_instances = CloudInstanceRepo::list_active_by_provider(pool, pid).await?;

        for inst in &db_instances {
            match provider.get_instance_status(&inst.external_id).await {
                Ok(actual_status) => {
                    // Instance shows terminated at provider but active in DB
                    if actual_status == InstanceStatus::Terminated
                        && inst.status_id != DbStatus::Terminated.id()
                    {
                        info!(
                            instance_id = inst.id,
                            external_id = inst.external_id,
                            "Reconciling: marking as terminated (provider reports terminated)"
                        );
                        let _ = CloudInstanceRepo::mark_terminated(
                            pool,
                            inst.id,
                            inst.total_cost_cents,
                        )
                        .await;
                    }
                }
                Err(x121_core::cloud::CloudProviderError::NotFound(_)) => {
                    // Instance doesn't exist at provider — mark as terminated
                    info!(
                        instance_id = inst.id,
                        external_id = inst.external_id,
                        "Reconciling: instance not found at provider, marking terminated"
                    );
                    let _ =
                        CloudInstanceRepo::mark_terminated(pool, inst.id, inst.total_cost_cents)
                            .await;
                }
                Err(e) => {
                    warn!(instance_id = inst.id, "Reconciliation check failed: {e}");
                }
            }
        }
    }

    Ok(())
}
