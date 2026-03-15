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

    // Detect orphaned jobs: running/dispatched jobs assigned to instances that
    // no longer exist or are terminated. Retry up to MAX_ORPHAN_RETRIES times
    // before marking as permanently failed (scene status → Failed).
    const MAX_ORPHAN_RETRIES: i16 = 3;

    let orphaned = sqlx::query_as::<_, (x121_core::types::DbId, i16)>(
        "SELECT j.id, j.orphan_retry_count FROM jobs j \
         WHERE j.status_id IN (2, 9) \
           AND j.comfyui_instance_id IS NOT NULL \
           AND NOT EXISTS ( \
               SELECT 1 FROM comfyui_instances ci \
               WHERE ci.id = j.comfyui_instance_id AND ci.status = 'connected' \
           )"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if !orphaned.is_empty() {
        let mut retried_ids: Vec<i64> = Vec::new();
        let mut failed_ids: Vec<i64> = Vec::new();

        for (job_id, retry_count) in &orphaned {
            if *retry_count < MAX_ORPHAN_RETRIES {
                // Retry: reset to pending with incremented retry count
                let _ = sqlx::query(
                    "UPDATE jobs SET status_id = 1, comfyui_instance_id = NULL, \
                     orphan_retry_count = orphan_retry_count + 1, \
                     error_message = NULL \
                     WHERE id = $1"
                )
                .bind(job_id)
                .execute(pool)
                .await;
                retried_ids.push(*job_id);
            } else {
                // Max retries exceeded: mark as permanently failed
                let _ = sqlx::query(
                    "UPDATE jobs SET status_id = 4, comfyui_instance_id = NULL, \
                     error_message = 'Generation failed: instance lost 3 times' \
                     WHERE id = $1"
                )
                .bind(job_id)
                .execute(pool)
                .await;
                failed_ids.push(*job_id);
            }
        }

        if !retried_ids.is_empty() {
            info!(
                count = retried_ids.len(),
                job_ids = ?retried_ids,
                "Orphaned jobs reset to pending for retry"
            );
            emit_reconcile(
                activity,
                ActivityLogLevel::Warn,
                format!("{} orphaned job(s) will be retried", retried_ids.len()),
                serde_json::json!({ "job_ids": retried_ids }),
            );
        }

        // Set scenes for permanently failed jobs to Failed status (7)
        if !failed_ids.is_empty() {
            let _ = sqlx::query(
                "UPDATE scenes SET status_id = 7 \
                 WHERE status_id = 2 AND id IN ( \
                     SELECT (j.parameters->>'scene_id')::bigint FROM jobs j WHERE j.id = ANY($1) \
                 )"
            )
            .bind(&failed_ids)
            .execute(pool)
            .await;

            warn!(
                count = failed_ids.len(),
                job_ids = ?failed_ids,
                "Orphaned jobs permanently failed after {MAX_ORPHAN_RETRIES} retries"
            );
            emit_reconcile(
                activity,
                ActivityLogLevel::Error,
                format!("{} job(s) failed after {} retries — instance lost repeatedly", failed_ids.len(), MAX_ORPHAN_RETRIES),
                serde_json::json!({ "job_ids": failed_ids }),
            );
        }
    }

    Ok(())
}
