//! Orphan scan endpoint (Task 1.3).

use std::collections::HashSet;

use axum::extract::State;
use axum::Json;
use x121_db::repositories::{CloudInstanceRepo, CloudProviderRepo, ComfyUIInstanceRepo};

use x121_core::activity::ActivityLogLevel;

use crate::error::AppError;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

use super::{
    cloud_instance_status_name, emit_infra_fields, CloudOrphan, ComfyuiOrphan, DbOrphan,
    OrphanScanResult,
};

/// POST /admin/infrastructure/scan-orphans
///
/// Scans all registered cloud providers for orphaned instances:
/// - **Cloud orphans**: instances at the provider not tracked in the DB.
/// - **DB orphans**: DB rows marked running/starting but provider says terminated/not-found.
/// - **ComfyUI orphans**: comfyui_instances linked to non-existent cloud instances.
pub async fn scan_orphans(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<DataResponse<OrphanScanResult>>, AppError> {
    let mut cloud_orphans = Vec::new();
    let mut db_orphans = Vec::new();

    // Load all providers from the DB (safe view — no key material).
    let providers = CloudProviderRepo::list(&state.pool).await?;

    for provider in &providers {
        let provider_id = provider.id;

        // Get the provider trait implementation from the registry.
        let Some(provider_impl) = state.cloud_registry.get(provider_id).await else {
            tracing::debug!(provider_id, name = %provider.name, "Provider not in registry, skipping");
            continue;
        };

        // List all instances at the provider.
        let provider_instances = match provider_impl.list_all_instances().await {
            Ok(instances) => instances,
            Err(e) => {
                tracing::warn!(
                    provider_id,
                    name = %provider.name,
                    error = %e,
                    "Failed to list instances from provider, skipping"
                );
                continue;
            }
        };

        // Load DB instances for this provider.
        let db_instances = CloudInstanceRepo::list_by_provider(&state.pool, provider_id).await?;
        let db_external_ids: HashSet<&str> = db_instances
            .iter()
            .map(|i| i.external_id.as_str())
            .collect();

        // Cloud orphans: at the provider but not in the DB.
        for inst in &provider_instances {
            if !db_external_ids.contains(inst.external_id.as_str()) {
                cloud_orphans.push(CloudOrphan {
                    external_id: inst.external_id.clone(),
                    name: inst.name.clone(),
                    provider_id,
                    provider_name: provider.name.clone(),
                    status: format!("{:?}", inst.status),
                    cost_per_hour_cents: Some(inst.cost_per_hour_cents as i64),
                });
            }
        }

        // DB orphans: rows marked as running/starting but provider disagrees.
        let provider_external_ids: HashSet<&str> = provider_instances
            .iter()
            .map(|i| i.external_id.as_str())
            .collect();

        // Status IDs for "should be alive" states.
        let alive_status_ids: &[i16] = &[
            1, // Provisioning
            2, // Starting
            3, // Running
            4, // Stopping
        ];

        for db_inst in &db_instances {
            if !alive_status_ids.contains(&db_inst.status_id) {
                continue; // Already terminated/error in DB, not an orphan.
            }

            if !provider_external_ids.contains(db_inst.external_id.as_str()) {
                db_orphans.push(DbOrphan {
                    instance_id: db_inst.id,
                    external_id: db_inst.external_id.clone(),
                    db_status: cloud_instance_status_name(db_inst.status_id),
                    actual_status: "not_found".to_string(),
                    provider_id,
                });
            } else if let Some(provider_inst) = provider_instances
                .iter()
                .find(|p| p.external_id == db_inst.external_id)
            {
                // Provider has it but in a terminal state.
                if matches!(
                    provider_inst.status,
                    x121_core::cloud::InstanceStatus::Terminated
                        | x121_core::cloud::InstanceStatus::Error
                ) {
                    db_orphans.push(DbOrphan {
                        instance_id: db_inst.id,
                        external_id: db_inst.external_id.clone(),
                        db_status: cloud_instance_status_name(db_inst.status_id),
                        actual_status: format!("{:?}", provider_inst.status),
                        provider_id,
                    });
                }
            }
        }
    }

    // ComfyUI orphans: comfyui_instances with cloud_instance_id pointing to
    // non-existent or terminated cloud instances.
    let comfyui_instances = ComfyUIInstanceRepo::list(&state.pool)
        .await
        .unwrap_or_default();

    let all_cloud_instances = CloudInstanceRepo::list_all_active(&state.pool).await?;
    let active_cloud_ids: HashSet<i64> = all_cloud_instances.iter().map(|i| i.id).collect();

    let comfyui_orphans: Vec<ComfyuiOrphan> = comfyui_instances
        .into_iter()
        .filter_map(|ci| {
            let cloud_id = ci.cloud_instance_id?;
            if active_cloud_ids.contains(&cloud_id) {
                None
            } else {
                Some(ComfyuiOrphan {
                    comfyui_instance_id: ci.id,
                    name: ci.name,
                    cloud_instance_id: Some(cloud_id),
                    reason: "linked cloud instance is terminated or missing".to_string(),
                })
            }
        })
        .collect();

    let total = cloud_orphans.len() + db_orphans.len() + comfyui_orphans.len();
    if total > 0 {
        emit_infra_fields(
            &state,
            ActivityLogLevel::Warn,
            format!("Orphan scan detected {total} orphans"),
            serde_json::json!({
                "cloud_orphans": cloud_orphans.len(),
                "db_orphans": db_orphans.len(),
                "comfyui_orphans": comfyui_orphans.len(),
            }),
        );
    }

    let result = OrphanScanResult {
        cloud_orphans,
        db_orphans,
        comfyui_orphans,
    };

    Ok(Json(DataResponse { data: result }))
}
