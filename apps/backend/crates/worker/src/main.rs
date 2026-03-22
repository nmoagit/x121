//! Video generation worker binary.
//!
//! Connects to the database and ComfyUI instances, then runs an event
//! loop that processes generation completions and drives the recursive
//! segment generation loop.
//!
//! When RunPod is configured, the worker manages the full pod lifecycle:
//! provision on startup → process queue → terminate when idle.

use std::sync::Arc;

use tokio::signal;
use x121_cloud::runpod::orchestrator::{PodOrchestrator, PodOrchestratorConfig, PodReady};
use x121_comfyui::manager::ComfyUIManager;
use x121_core::storage::local::LocalStorageProvider;
use x121_core::storage::StorageProvider;
use x121_db::repositories::{CloudProviderRepo, ComfyUIInstanceRepo};

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod event_loop;

/// Instance name prefix for RunPod pods in the database.
const RUNPOD_INSTANCE_PREFIX: &str = "runpod-";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "x121_worker=debug,x121_pipeline=debug,x121_comfyui=info,x121_cloud=info".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Worker starting");

    // 1. Database connection.
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = x121_db::create_pool(&database_url)
        .await
        .expect("Failed to create database pool");

    x121_db::health_check(&pool)
        .await
        .expect("Database health check failed");
    tracing::info!("Database connected");

    // 2. Storage provider.
    let storage_root = std::env::var("STORAGE_ROOT").unwrap_or_else(|_| "./storage".to_string());
    let storage: Arc<dyn StorageProvider> = Arc::new(
        LocalStorageProvider::new(std::path::PathBuf::from(&storage_root))
            .expect("Failed to initialize storage provider"),
    );
    tracing::info!(root = %storage_root, "Storage provider ready");

    // 3. RunPod pod lifecycle — provision/resume pod and wait for ComfyUI.
    let orchestrator_and_pod = setup_runpod_pod(&pool).await;

    // 4. ComfyUI manager (connects to all enabled instances).
    let comfyui = ComfyUIManager::start(pool.clone()).await;
    tracing::info!("ComfyUI manager started");

    // 5. Run the event loop until shutdown signal.
    let event_rx = comfyui.subscribe();

    tokio::select! {
        _ = event_loop::run(pool.clone(), comfyui.clone(), storage, event_rx, None) => {
            tracing::info!("Event loop exited");
        }
        _ = shutdown_signal() => {
            tracing::info!("Shutdown signal received");
        }
    }

    comfyui.shutdown().await;

    // 6. Terminate the RunPod pod on shutdown (high-demand GPUs like RTX PRO
    //    6000 Blackwell cannot be stopped, only terminated — the network
    //    volume preserves all state for next provisioning).
    if let Some((orchestrator, ready)) = orchestrator_and_pod {
        tracing::info!(pod_id = %ready.pod_id, "Terminating RunPod pod on shutdown");
        if let Err(e) = orchestrator.stop_or_terminate_pod(&ready.pod_id).await {
            tracing::error!(error = %e, "Failed to terminate RunPod pod");
        }
    }

    tracing::info!("Worker shut down");
}

/// Set up the RunPod pod if configured in the database.
/// Returns the orchestrator and pod info so the caller can terminate on shutdown.
async fn setup_runpod_pod(pool: &sqlx::PgPool) -> Option<(PodOrchestrator, PodReady)> {
    // Look for a RunPod provider in the database (need full entity for encrypted key).
    let all_providers = CloudProviderRepo::list_all(pool).await.ok()?;
    let provider = all_providers.iter().find(|p| p.provider_type == "runpod")?;

    // Decrypt API key and build orchestrator from DB settings.
    let master_hex = std::env::var("CLOUD_ENCRYPTION_KEY").ok()?;
    let master_key = x121_core::crypto::parse_master_key(&master_hex).ok()?;
    let api_key = x121_core::crypto::decrypt_api_key(
        &provider.api_key_encrypted,
        &provider.api_key_nonce,
        &master_key,
    )
    .ok()?;

    let pod_config = PodOrchestratorConfig::from_provider(api_key, &provider.settings).ok()?;
    let orchestrator = PodOrchestrator::new(pod_config);

    match orchestrator.ensure_ready(pool).await {
        Ok(ready) => {
            tracing::info!(
                pod_id = %ready.pod_id,
                api_url = %ready.comfyui_api_url,
                "RunPod pod ready, registering ComfyUI instance"
            );

            // Disable any stale runpod-* instances from previous pods.
            match ComfyUIInstanceRepo::disable_by_name_prefix(pool, RUNPOD_INSTANCE_PREFIX).await {
                Ok(count) if count > 0 => {
                    tracing::info!(count, "Disabled stale RunPod instances");
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to disable stale RunPod instances");
                }
                _ => {}
            }

            // Register the new pod's ComfyUI endpoints.
            let instance_name = PodOrchestrator::instance_name(&ready.pod_id);
            if let Err(e) = ComfyUIInstanceRepo::upsert_by_name(
                pool,
                &instance_name,
                &ready.comfyui_ws_url,
                &ready.comfyui_api_url,
            )
            .await
            {
                tracing::error!(error = %e, "Failed to register ComfyUI instance in DB");
            }

            Some((orchestrator, ready))
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to ensure RunPod pod is ready");
            tracing::warn!(
                "Continuing without RunPod — ComfyUI manager will use any pre-configured instances"
            );
            None
        }
    }
}

/// Wait for Ctrl+C or SIGTERM.
async fn shutdown_signal() {
    let ctrl_c = signal::ctrl_c();
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}
