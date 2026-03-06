//! Video generation worker binary.
//!
//! Connects to the database and ComfyUI instances, then runs an event
//! loop that processes generation completions and drives the recursive
//! segment generation loop.

use std::sync::Arc;

use tokio::signal;
use x121_comfyui::manager::ComfyUIManager;
use x121_core::storage::local::LocalStorageProvider;
use x121_core::storage::StorageProvider;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod event_loop;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "x121_worker=debug,x121_pipeline=debug,x121_comfyui=info".into()),
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
    let storage_root =
        std::env::var("STORAGE_ROOT").unwrap_or_else(|_| "./storage".to_string());
    let storage: Arc<dyn StorageProvider> = Arc::new(
        LocalStorageProvider::new(std::path::PathBuf::from(&storage_root))
            .expect("Failed to initialize storage provider"),
    );
    tracing::info!(root = %storage_root, "Storage provider ready");

    // 3. ComfyUI manager (connects to all enabled instances).
    let comfyui = ComfyUIManager::start(pool.clone()).await;
    tracing::info!("ComfyUI manager started");

    // 4. Run the event loop until shutdown signal.
    let event_rx = comfyui.subscribe();

    tokio::select! {
        _ = event_loop::run(pool.clone(), comfyui.clone(), storage, event_rx) => {
            tracing::info!("Event loop exited");
        }
        _ = shutdown_signal() => {
            tracing::info!("Shutdown signal received");
        }
    }

    comfyui.shutdown().await;
    tracing::info!("Worker shut down");
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
