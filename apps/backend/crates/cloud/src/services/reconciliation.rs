//! State reconciliation background service (PRD-114).
//!
//! Compares DB state vs actual provider state and fixes drift:
//! - Instances marked as running in DB but terminated at provider -> mark terminated
//! - Instances unknown to DB but running at provider -> log warning

use std::sync::Arc;

use sqlx::PgPool;
use tracing::{info, warn};
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::cloud::InstanceStatus;
use x121_events::ActivityLogBroadcaster;

use crate::registry::ProviderRegistry;

const DEFAULT_INTERVAL_SECS: u64 = 300; // Every 5 minutes

/// Spawn the reconciliation service.
pub fn spawn_reconciliation_service(
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    activity: Option<Arc<ActivityLogBroadcaster>>,
    interval_secs: Option<u64>,
) -> (tokio::task::JoinHandle<()>, super::ServiceNudge) {
    super::spawn_periodic_service(
        "Reconciliation",
        pool,
        registry,
        interval_secs,
        DEFAULT_INTERVAL_SECS,
        move |pool, registry| {
            let activity = activity.clone();
            async move { reconcile_all(&pool, &registry, activity.as_deref()).await }
        },
    )
}

/// Publish a curated infrastructure activity log entry if a broadcaster is available.
fn emit_reconcile(
    activity: Option<&ActivityLogBroadcaster>,
    level: ActivityLogLevel,
    message: impl Into<String>,
    fields: serde_json::Value,
) {
    if let Some(broadcaster) = activity {
        broadcaster.publish(
            ActivityLogEntry::curated(level, ActivityLogSource::Infrastructure, message)
                .with_fields(fields),
        );
    }
}

async fn reconcile_all(
    pool: &PgPool,
    registry: &ProviderRegistry,
    activity: Option<&ActivityLogBroadcaster>,
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
                        emit_reconcile(
                            activity,
                            ActivityLogLevel::Warn,
                            format!(
                                "Instance state corrected: {} marked terminated (provider reports terminated)",
                                inst.external_id
                            ),
                            serde_json::json!({
                                "instance_id": inst.id,
                                "external_id": inst.external_id,
                                "provider_id": pid,
                            }),
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
                    emit_reconcile(
                        activity,
                        ActivityLogLevel::Warn,
                        format!(
                            "Orphan detected: instance {} not found at provider",
                            inst.external_id
                        ),
                        serde_json::json!({
                            "instance_id": inst.id,
                            "external_id": inst.external_id,
                            "provider_id": pid,
                        }),
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

    // Orphaned job detection is handled by the scaling service (every 30s)
    // rather than here (every 5 min) for faster response.

    Ok(())
}
