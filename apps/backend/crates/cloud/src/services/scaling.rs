//! Auto-scaling background service (PRD-114).
//!
//! Periodically evaluates scaling rules and provisions/terminates instances.

use std::sync::Arc;

use sqlx::PgPool;
use tracing::{info, warn};
use x121_core::cloud_scaling::{evaluate_scaling_decision, ScalingAction, ScalingInput};

use crate::registry::ProviderRegistry;

/// Default evaluation interval.
const DEFAULT_INTERVAL_SECS: u64 = 30;

/// Spawn the auto-scaling service as a background task.
pub fn spawn_scaling_service(
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    interval_secs: Option<u64>,
) -> tokio::task::JoinHandle<()> {
    super::spawn_periodic_service(
        "Scaling",
        pool,
        registry,
        interval_secs,
        DEFAULT_INTERVAL_SECS,
        |pool, registry| async move { evaluate_all_rules(&pool, &registry).await },
    )
}

async fn evaluate_all_rules(
    pool: &PgPool,
    registry: &ProviderRegistry,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use x121_db::repositories::{
        CloudCostEventRepo, CloudInstanceRepo, CloudScalingRuleRepo, JobRepo,
    };

    let rules = CloudScalingRuleRepo::list_enabled(pool).await?;

    for rule in &rules {
        let provider = match registry.get(rule.provider_id).await {
            Some(p) => p,
            None => continue,
        };

        let current_count =
            CloudInstanceRepo::active_count_by_gpu_type(pool, rule.provider_id, rule.gpu_type_id)
                .await? as u16;

        let (pending, _running, _scheduled) = JobRepo::queue_counts(pool).await?;
        let queue_depth = pending as u32;

        let now = chrono::Utc::now();
        let budget_spent = if rule.budget_limit_cents.is_some() {
            let period_start = now - chrono::Duration::hours(24 * 30); // ~30 day window
            let summary = CloudCostEventRepo::sum_by_provider_in_range(
                pool,
                rule.provider_id,
                period_start,
                now,
            )
            .await?;
            summary.total_cost_cents
        } else {
            0
        };

        let input = ScalingInput {
            min_instances: rule.min_instances as u16,
            max_instances: rule.max_instances as u16,
            queue_threshold: rule.queue_threshold as u32,
            cooldown_secs: rule.cooldown_secs as u32,
            budget_limit_cents: rule.budget_limit_cents,
            current_count,
            queue_depth,
            budget_spent_cents: budget_spent,
            last_scaled_at: rule.last_scaled_at,
            now,
        };

        let action = evaluate_scaling_decision(&input);

        match action {
            ScalingAction::ScaleUp(count) => {
                info!(
                    provider_id = rule.provider_id,
                    gpu_type_id = rule.gpu_type_id,
                    count,
                    "Scaling up"
                );
                // Provision instances via provider
                let gpu_type =
                    x121_db::repositories::CloudGpuTypeRepo::find_by_id(pool, rule.gpu_type_id)
                        .await?;
                if let Some(gpu) = gpu_type {
                    for _ in 0..count {
                        let config = x121_core::cloud::ProvisionConfig {
                            gpu_count: 1,
                            ..Default::default()
                        };
                        match provider.provision_instance(&gpu.gpu_id, &config).await {
                            Ok(info) => {
                                let create = x121_db::models::cloud_provider::CreateCloudInstance {
                                    gpu_type_id: rule.gpu_type_id,
                                    external_id: info.external_id,
                                    name: info.name,
                                    gpu_count: Some(1),
                                    cost_per_hour_cents: info.cost_per_hour_cents as i32,
                                    metadata: None,
                                };
                                let _ = CloudInstanceRepo::create(pool, rule.provider_id, &create)
                                    .await;
                            }
                            Err(e) => {
                                warn!(
                                    provider_id = rule.provider_id,
                                    "Failed to provision instance: {e}"
                                );
                            }
                        }
                    }
                }
                let _ = CloudScalingRuleRepo::touch_last_scaled(pool, rule.id).await;
            }
            ScalingAction::ScaleDown(count) => {
                info!(
                    provider_id = rule.provider_id,
                    gpu_type_id = rule.gpu_type_id,
                    count,
                    "Scaling down"
                );
                // Terminate the oldest idle instances
                let instances =
                    CloudInstanceRepo::list_active_by_provider(pool, rule.provider_id).await?;
                let to_terminate: Vec<_> = instances
                    .into_iter()
                    .filter(|i| i.gpu_type_id == rule.gpu_type_id)
                    .rev() // oldest first
                    .take(count as usize)
                    .collect();

                let (ok, fail) =
                    super::terminate_and_record(provider.as_ref(), pool, &to_terminate).await;
                if fail > 0 {
                    warn!(
                        provider_id = rule.provider_id,
                        terminated = ok,
                        failed = fail,
                        "Some scale-down terminations failed"
                    );
                }
                let _ = CloudScalingRuleRepo::touch_last_scaled(pool, rule.id).await;
            }
            ScalingAction::NoChange => {}
        }
    }

    Ok(())
}
