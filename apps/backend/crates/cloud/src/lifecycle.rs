//! Unified lifecycle orchestration bridge (PRD-130 Phase 4).
//!
//! [`LifecycleBridge`] connects cloud instance events (provision, start,
//! stop, terminate) to ComfyUI instance management (register WebSocket,
//! refresh manager). It is the single point of coordination between the
//! cloud provider layer and the ComfyUI connection layer.

use std::sync::Arc;

use sqlx::PgPool;
use x121_core::cloud::CloudProviderError;
use x121_core::types::DbId;
use x121_db::repositories::{CloudInstanceRepo, CloudProviderRepo, ComfyUIInstanceRepo};

use crate::runpod::orchestrator::{PodOrchestrator, PodOrchestratorConfig, PodReady};

/// Orchestrates the full lifecycle of a cloud GPU instance,
/// bridging cloud provider operations with ComfyUI instance management.
pub struct LifecycleBridge {
    pool: PgPool,
    comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>,
}

impl LifecycleBridge {
    pub fn new(pool: PgPool, comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>) -> Self {
        Self {
            pool,
            comfyui_manager,
        }
    }

    /// Build a [`PodOrchestrator`] from a cloud provider's DB settings.
    ///
    /// Loads the provider row, decrypts the API key using the
    /// `CLOUD_ENCRYPTION_KEY` env var, and constructs the orchestrator
    /// config from the provider's settings JSON.
    pub async fn build_orchestrator(
        &self,
        provider_id: DbId,
    ) -> Result<PodOrchestrator, CloudProviderError> {
        let provider = CloudProviderRepo::find_by_id(&self.pool, provider_id)
            .await
            .map_err(|e| CloudProviderError::ApiError(format!("DB error loading provider: {e}")))?
            .ok_or_else(|| {
                CloudProviderError::NotFound(format!("cloud provider {provider_id} not found"))
            })?;

        let master_key = load_master_key()?;

        let api_key = x121_core::crypto::decrypt_api_key(
            &provider.api_key_encrypted,
            &provider.api_key_nonce,
            &master_key,
        )
        .map_err(|e| {
            CloudProviderError::InvalidConfig(format!("Failed to decrypt API key: {e}"))
        })?;

        let config = PodOrchestratorConfig::from_provider(api_key, &provider.settings)?;
        Ok(PodOrchestrator::new(config))
    }

    /// Execute the full startup sequence for a cloud instance.
    ///
    /// 1. Call `ensure_ready()` which handles: resume/provision, wait for
    ///    runtime, SSH startup, and ComfyUI verification.
    /// 2. Upsert a `comfyui_instances` row with ws_url, api_url, and
    ///    cloud_instance_id FK.
    /// 3. Refresh [`ComfyUIManager`] to pick up the new instance.
    /// 4. Update `cloud_instances` status to Running.
    pub async fn startup(
        &self,
        cloud_instance_id: DbId,
        orchestrator: &PodOrchestrator,
        external_id: &str,
    ) -> Result<PodReady, CloudProviderError> {
        // Run the full ensure_ready sequence (resume/provision + SSH + verify).
        let ready = match orchestrator.ensure_ready(&self.pool).await {
            Ok(ready) => ready,
            Err(e) => {
                tracing::error!(
                    cloud_instance_id,
                    external_id,
                    error = %e,
                    "Startup ensure_ready failed"
                );
                // Record the error on the cloud instance row.
                if let Err(db_err) =
                    CloudInstanceRepo::mark_errored(&self.pool, cloud_instance_id, &e.to_string())
                        .await
                {
                    tracing::error!(error = %db_err, "Failed to mark cloud instance as errored");
                }
                return Err(e);
            }
        };

        // Register the ComfyUI instance in the DB, linked to the cloud instance.
        let instance_name = PodOrchestrator::instance_name(&ready.pod_id);
        if let Err(e) = ComfyUIInstanceRepo::upsert_by_name_with_cloud(
            &self.pool,
            &instance_name,
            &ready.comfyui_ws_url,
            &ready.comfyui_api_url,
            Some(cloud_instance_id),
        )
        .await
        {
            tracing::error!(
                cloud_instance_id,
                instance_name,
                error = %e,
                "Failed to upsert comfyui_instances row"
            );
            return Err(CloudProviderError::ApiError(format!(
                "DB error upserting ComfyUI instance: {e}"
            )));
        }

        // Refresh the manager so it connects to the new instance.
        self.comfyui_manager.refresh_instances().await;

        // Update network info if SSH info is available.
        if let Some((ref host, port)) = ready.ssh_info {
            if let Err(e) = CloudInstanceRepo::update_network(
                &self.pool,
                cloud_instance_id,
                host,
                Some(port as i32),
            )
            .await
            {
                tracing::warn!(error = %e, "Failed to update cloud instance network info");
            }
        }

        // Mark the cloud instance as running.
        if let Err(e) = CloudInstanceRepo::mark_running(&self.pool, cloud_instance_id).await {
            tracing::warn!(error = %e, "Failed to mark cloud instance as running");
        }

        tracing::info!(
            cloud_instance_id,
            pod_id = %ready.pod_id,
            api_url = %ready.comfyui_api_url,
            "Lifecycle startup complete"
        );

        Ok(ready)
    }

    /// Spawn the full startup sequence as a fire-and-forget background task.
    ///
    /// This is a convenience wrapper around [`build_orchestrator`] +
    /// [`startup`] that logs errors and never blocks the caller. Use
    /// this from handlers and the scaling service instead of inlining
    /// the same `tokio::spawn { build_orchestrator → startup }` pattern.
    pub fn spawn_startup(
        self: &Arc<Self>,
        cloud_instance_id: DbId,
        provider_id: DbId,
        external_id: String,
    ) {
        let bridge = Arc::clone(self);
        tokio::spawn(async move {
            tracing::info!(
                cloud_instance_id,
                external_id = %external_id,
                "Starting lifecycle startup (background)"
            );

            let orchestrator = match bridge.build_orchestrator(provider_id).await {
                Ok(o) => o,
                Err(e) => {
                    tracing::error!(
                        cloud_instance_id,
                        provider_id,
                        error = %e,
                        "Failed to build orchestrator for lifecycle startup"
                    );
                    return;
                }
            };

            match bridge
                .startup(cloud_instance_id, &orchestrator, &external_id)
                .await
            {
                Ok(ready) => {
                    tracing::info!(
                        cloud_instance_id,
                        pod_id = %ready.pod_id,
                        "Lifecycle startup succeeded"
                    );
                }
                Err(e) => {
                    tracing::error!(
                        cloud_instance_id,
                        external_id = %external_id,
                        error = %e,
                        "Lifecycle startup failed"
                    );
                }
            }
        });
    }

    /// Execute the full teardown sequence for a cloud instance.
    ///
    /// 1. Find and disable the `comfyui_instances` row linked to this
    ///    cloud instance.
    /// 2. Refresh [`ComfyUIManager`] so it drops the connection.
    /// 3. Stop or terminate the pod via the orchestrator.
    pub async fn teardown(
        &self,
        cloud_instance_id: DbId,
        orchestrator: &PodOrchestrator,
        external_id: &str,
    ) -> Result<(), CloudProviderError> {
        // Disable the linked ComfyUI instance so the manager stops using it.
        match ComfyUIInstanceRepo::find_by_cloud_instance_id(&self.pool, cloud_instance_id).await {
            Ok(Some(comfyui_instance)) => {
                let prefix = &comfyui_instance.name;
                if let Err(e) =
                    ComfyUIInstanceRepo::disable_by_name_prefix(&self.pool, prefix).await
                {
                    tracing::warn!(
                        error = %e,
                        comfyui_instance_name = prefix,
                        "Failed to disable ComfyUI instance"
                    );
                }
            }
            Ok(None) => {
                tracing::debug!(
                    cloud_instance_id,
                    "No ComfyUI instance linked — nothing to disable"
                );
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    cloud_instance_id,
                    "Failed to look up linked ComfyUI instance"
                );
            }
        }

        // Refresh manager so it drops the now-disabled connection.
        self.comfyui_manager.refresh_instances().await;

        // Stop or terminate the pod.
        orchestrator.stop_or_terminate_pod(external_id).await?;

        // Mark the cloud instance as stopped.
        if let Err(e) = CloudInstanceRepo::mark_stopped(&self.pool, cloud_instance_id).await {
            tracing::warn!(error = %e, "Failed to mark cloud instance as stopped");
        }

        tracing::info!(
            cloud_instance_id,
            external_id,
            "Lifecycle teardown complete"
        );

        Ok(())
    }
}

/// Load and parse the AES-256-GCM master key from the `CLOUD_ENCRYPTION_KEY` env var.
fn load_master_key() -> Result<[u8; 32], CloudProviderError> {
    let hex = std::env::var("CLOUD_ENCRYPTION_KEY").map_err(|_| {
        CloudProviderError::InvalidConfig(
            "CLOUD_ENCRYPTION_KEY env var not set — cannot decrypt provider API key".into(),
        )
    })?;
    x121_core::crypto::parse_master_key(&hex).map_err(|e| {
        CloudProviderError::InvalidConfig(format!("Invalid CLOUD_ENCRYPTION_KEY: {e}"))
    })
}
