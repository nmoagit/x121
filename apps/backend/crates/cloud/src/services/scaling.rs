//! Auto-scaling background service (PRD-114, PRD-130 Phase 6).
//!
//! Periodically evaluates scaling rules and provisions/terminates instances.
//! When scaling up, spawns a background lifecycle startup (SSH + ComfyUI
//! registration) via [`LifecycleBridge`]. When scaling down, runs lifecycle
//! teardown before termination.

use std::sync::Arc;

use sqlx::PgPool;
use tracing::{info, warn};
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::cloud_scaling::{evaluate_scaling_decision_with_reason, ScalingAction, ScalingInput};
use x121_events::ActivityLogBroadcaster;

use crate::lifecycle::LifecycleBridge;
use crate::registry::ProviderRegistry;

/// Default evaluation interval.
const DEFAULT_INTERVAL_SECS: u64 = 30;

/// Spawn the auto-scaling service as a background task.
///
/// The `lifecycle_bridge` is used to run the full startup sequence
/// (SSH + ComfyUI + WebSocket) after provisioning and full teardown
/// before termination.
pub fn spawn_scaling_service(
    pool: PgPool,
    registry: Arc<ProviderRegistry>,
    lifecycle_bridge: Arc<LifecycleBridge>,
    broadcaster: Arc<ActivityLogBroadcaster>,
    interval_secs: Option<u64>,
) -> tokio::task::JoinHandle<()> {
    let bridge = Arc::clone(&lifecycle_bridge);
    super::spawn_periodic_service(
        "Scaling",
        pool,
        registry,
        interval_secs,
        DEFAULT_INTERVAL_SECS,
        move |pool, registry| {
            let bridge = Arc::clone(&bridge);
            let broadcaster = Arc::clone(&broadcaster);
            async move { evaluate_all_rules(&pool, &registry, &bridge, &broadcaster).await }
        },
    )
}

async fn evaluate_all_rules(
    pool: &PgPool,
    registry: &ProviderRegistry,
    lifecycle_bridge: &Arc<LifecycleBridge>,
    broadcaster: &Arc<ActivityLogBroadcaster>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use x121_db::repositories::{
        CloudCostEventRepo, CloudInstanceRepo, CloudProviderRepo, CloudScalingRuleRepo, JobRepo,
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

        let decision = evaluate_scaling_decision_with_reason(&input);

        // Log every decision to the audit table.
        let instances_changed = match &decision.action {
            ScalingAction::ScaleUp(n) | ScalingAction::ScaleDown(n) => *n as i16,
            ScalingAction::NoChange => 0,
        };
        let action_label = match &decision.action {
            ScalingAction::ScaleUp(_) => "scale_up",
            ScalingAction::ScaleDown(_) => "scale_down",
            ScalingAction::NoChange => "no_change",
        };
        let _ = x121_db::repositories::CloudScalingEventRepo::create(
            pool,
            &x121_db::models::cloud_provider::CreateCloudScalingEvent {
                rule_id: rule.id,
                provider_id: rule.provider_id,
                action: action_label.to_string(),
                reason: decision.reason.clone(),
                instances_changed,
                queue_depth: queue_depth as i32,
                current_count: current_count as i16,
                budget_spent_cents: budget_spent,
                cooldown_remaining_secs: decision.cooldown_remaining_secs as i32,
            },
        )
        .await;

        // Broadcast non-trivial scaling decisions to the activity console.
        if !matches!(decision.action, ScalingAction::NoChange) {
            let level = match &decision.action {
                ScalingAction::ScaleUp(_) => ActivityLogLevel::Info,
                ScalingAction::ScaleDown(_) => ActivityLogLevel::Warn,
                ScalingAction::NoChange => unreachable!(),
            };
            broadcaster.publish(
                ActivityLogEntry::curated(
                    level,
                    ActivityLogSource::Infrastructure,
                    format!("Auto-scaling: {action_label} — {}", decision.reason),
                )
                .with_fields(serde_json::json!({
                    "action": action_label,
                    "instances_changed": instances_changed,
                    "queue_depth": queue_depth,
                    "current_count": current_count,
                    "reason": &decision.reason,
                })),
            );
        }

        match decision.action {
            ScalingAction::ScaleUp(count) => {
                info!(
                    provider_id = rule.provider_id,
                    gpu_type_id = rule.gpu_type_id,
                    count,
                    "Scaling up"
                );

                // Phase 1: Try to resume stopped instances before provisioning new ones.
                // Resuming is faster (~1-2 min) and avoids cold-start overhead.
                let stopped_instances = CloudInstanceRepo::list_stopped_by_gpu_type(
                    pool,
                    rule.provider_id,
                    rule.gpu_type_id,
                )
                .await
                .unwrap_or_default();

                let mut remaining = count as usize;

                for inst in stopped_instances.iter().take(count as usize) {
                    info!(
                        cloud_instance_id = inst.id,
                        external_id = %inst.external_id,
                        "Auto-scaling: resuming stopped instance instead of provisioning"
                    );
                    broadcaster.publish(ActivityLogEntry::curated(
                        ActivityLogLevel::Info,
                        ActivityLogSource::Infrastructure,
                        format!(
                            "Auto-scaling: resuming stopped instance {} ({} pending job{})",
                            inst.external_id,
                            queue_depth,
                            if queue_depth == 1 { "" } else { "s" },
                        ),
                    ));

                    // Mark as starting in the DB.
                    let _ = CloudInstanceRepo::update_status(
                        pool,
                        inst.id,
                        x121_db::models::status::CloudInstanceStatus::Starting.id(),
                    )
                    .await;

                    // Spawn lifecycle startup in the background (handles resume + SSH + ComfyUI).
                    lifecycle_bridge.spawn_startup(
                        inst.id,
                        rule.provider_id,
                        inst.external_id.clone(),
                    );

                    remaining -= 1;
                }

                // Phase 2: Provision new instances for the remainder.
                if remaining > 0 {
                    let gpu_type =
                        x121_db::repositories::CloudGpuTypeRepo::find_by_id(pool, rule.gpu_type_id)
                            .await?;
                    let provider_settings =
                        CloudProviderRepo::find_by_id_safe(pool, rule.provider_id)
                            .await?
                            .map(|p| p.settings)
                            .unwrap_or_default();
                    if let Some(gpu) = gpu_type {
                        for _ in 0..remaining {
                            let config = x121_core::cloud::ProvisionConfig {
                                gpu_count: 1,
                                network_volume_id: provider_settings
                                    .get("network_volume_id")
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                                volume_mount_path: provider_settings
                                    .get("volume_mount_path")
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                                docker_image: provider_settings
                                    .get("docker_image")
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                                template_id: provider_settings
                                    .get("template_id")
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                                container_disk_gb: provider_settings
                                    .get("container_disk_gb")
                                    .and_then(|v| v.as_u64())
                                    .map(|v| v as u32),
                                ..Default::default()
                            };
                            info!(
                                gpu_id = %gpu.gpu_id,
                                template_id = ?config.template_id,
                                network_volume_id = ?config.network_volume_id,
                                "Provisioning new instance via scaling (no stopped instances to resume)"
                            );
                            broadcaster.publish(ActivityLogEntry::curated(
                                ActivityLogLevel::Info,
                                ActivityLogSource::Infrastructure,
                                format!(
                                    "Auto-scaling: provisioning {} instance ({} pending job{})",
                                    gpu.name,
                                    queue_depth,
                                    if queue_depth == 1 { "" } else { "s" },
                                ),
                            ));
                            match provider.provision_instance(&gpu.gpu_id, &config).await {
                                Ok(provision_info) => {
                                    let create =
                                        x121_db::models::cloud_provider::CreateCloudInstance {
                                            gpu_type_id: rule.gpu_type_id,
                                            external_id: provision_info.external_id.clone(),
                                            name: provision_info.name,
                                            gpu_count: Some(1),
                                            cost_per_hour_cents: provision_info.cost_per_hour_cents
                                                as i32,
                                            metadata: Some(serde_json::json!({
                                                "container_disk_gb": config.container_disk_gb.unwrap_or(20),
                                            })),
                                        };
                                    match CloudInstanceRepo::create(pool, rule.provider_id, &create)
                                        .await
                                    {
                                        Ok(instance) => {
                                            broadcaster.publish(ActivityLogEntry::curated(
                                                ActivityLogLevel::Info,
                                                ActivityLogSource::Infrastructure,
                                                format!(
                                                    "Auto-scaling: {} instance provisioned — starting lifecycle setup (~3 min)",
                                                    gpu.name,
                                                ),
                                            ));
                                            lifecycle_bridge.spawn_startup(
                                                instance.id,
                                                rule.provider_id,
                                                provision_info.external_id,
                                            );
                                        }
                                        Err(e) => {
                                            warn!(
                                                provider_id = rule.provider_id,
                                                "Failed to record provisioned instance: {e}"
                                            );
                                        }
                                    }
                                }
                                Err(e) => {
                                    let err_msg = format!("PROVISION FAILED: {e}");
                                    warn!(
                                        provider_id = rule.provider_id,
                                        gpu_id = %gpu.gpu_id,
                                        error = %e,
                                        "Failed to provision instance via auto-scaling"
                                    );
                                    broadcaster.publish(ActivityLogEntry::curated(
                                        ActivityLogLevel::Error,
                                        ActivityLogSource::Infrastructure,
                                        format!(
                                            "Auto-scaling: failed to provision {} instance — {e}",
                                            gpu.name,
                                        ),
                                    ));
                                    let _ =
                                        x121_db::repositories::CloudScalingEventRepo::create(
                                            pool,
                                            &x121_db::models::cloud_provider::CreateCloudScalingEvent {
                                                rule_id: rule.id,
                                                provider_id: rule.provider_id,
                                                action: "provision_error".to_string(),
                                                reason: err_msg,
                                                instances_changed: 0,
                                                queue_depth: queue_depth as i32,
                                                current_count: current_count as i16,
                                                budget_spent_cents: budget_spent,
                                                cooldown_remaining_secs: 0,
                                            },
                                        )
                                        .await;
                                }
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
                // Terminate the oldest idle instances with lifecycle teardown.
                let instances =
                    CloudInstanceRepo::list_active_by_provider(pool, rule.provider_id).await?;
                let to_teardown: Vec<_> = instances
                    .into_iter()
                    .filter(|i| i.gpu_type_id == rule.gpu_type_id)
                    .rev() // oldest first
                    .take(count as usize)
                    .collect();

                let (ok, fail) = teardown_and_terminate(
                    lifecycle_bridge,
                    provider.as_ref(),
                    pool,
                    rule.provider_id,
                    &to_teardown,
                )
                .await;
                if fail > 0 {
                    warn!(
                        provider_id = rule.provider_id,
                        terminated = ok,
                        failed = fail,
                        "Some scale-down teardowns failed"
                    );
                    broadcaster.publish(ActivityLogEntry::curated(
                        ActivityLogLevel::Error,
                        ActivityLogSource::Infrastructure,
                        format!(
                            "Auto-scaling: scale-down completed — {ok} terminated, {fail} failed",
                        ),
                    ));
                } else if ok > 0 {
                    broadcaster.publish(ActivityLogEntry::curated(
                        ActivityLogLevel::Info,
                        ActivityLogSource::Infrastructure,
                        format!("Auto-scaling: scale-down completed — {ok} instance(s) terminated"),
                    ));
                }
                let _ = CloudScalingRuleRepo::touch_last_scaled(pool, rule.id).await;
            }
            ScalingAction::NoChange => {}
        }
    }

    Ok(())
}

/// Run lifecycle teardown then terminate each instance, recording results.
///
/// Returns `(terminated_count, failed_count)`.
async fn teardown_and_terminate(
    bridge: &Arc<LifecycleBridge>,
    provider: &dyn x121_core::cloud::CloudGpuProvider,
    pool: &PgPool,
    provider_id: x121_core::types::DbId,
    instances: &[x121_db::models::cloud_provider::CloudInstance],
) -> (u32, u32) {
    use x121_db::repositories::CloudInstanceRepo;

    let mut terminated = 0u32;
    let mut failed = 0u32;

    // Build orchestrator once for all teardowns (same provider).
    let orchestrator = match bridge.build_orchestrator(provider_id).await {
        Ok(o) => Some(o),
        Err(e) => {
            warn!(
                provider_id,
                error = %e,
                "Failed to build orchestrator for teardown — falling back to direct termination"
            );
            None
        }
    };

    for inst in instances {
        // Run lifecycle teardown if we have an orchestrator.
        if let Some(ref orch) = orchestrator {
            if let Err(e) = bridge.teardown(inst.id, orch, &inst.external_id, true).await {
                warn!(
                    cloud_instance_id = inst.id,
                    external_id = %inst.external_id,
                    error = %e,
                    "Lifecycle teardown failed — proceeding with direct termination"
                );
            }
        }

        // Terminate via provider API (handles the actual cloud-side shutdown).
        match provider.terminate_instance(&inst.external_id).await {
            Ok(()) => {
                let _ =
                    CloudInstanceRepo::mark_terminated(pool, inst.id, inst.total_cost_cents).await;
                terminated += 1;
            }
            Err(e) => {
                warn!(
                    cloud_instance_id = inst.id,
                    external_id = %inst.external_id,
                    error = %e,
                    "Failed to terminate instance"
                );
                failed += 1;
            }
        }
    }

    (terminated, failed)
}
