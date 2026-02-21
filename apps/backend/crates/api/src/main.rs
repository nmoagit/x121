use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use trulience_api::config::ServerConfig;
use trulience_api::router::build_app_router;
use trulience_api::{state, ws};

use state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // --- Tracing ---
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "trulience_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // --- Configuration ---
    let config = ServerConfig::from_env();
    tracing::info!(host = %config.host, port = %config.port, "Loaded server configuration");

    // --- Database ---
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = trulience_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    tracing::info!("Database connection pool created");

    trulience_db::health_check(&pool)
        .await
        .expect("Database health check failed");
    tracing::info!("Database health check passed");

    trulience_db::run_migrations(&pool)
        .await
        .expect("Failed to run database migrations");
    tracing::info!("Database migrations applied");

    // --- WebSocket manager ---
    let ws_manager = Arc::new(ws::WsManager::new());

    // --- Heartbeat ---
    let heartbeat_handle = ws::start_heartbeat(Arc::clone(&ws_manager));

    // --- ComfyUI manager ---
    let comfyui_manager = trulience_comfyui::manager::ComfyUIManager::start(pool.clone()).await;
    tracing::info!("ComfyUI manager started");

    // --- Event bus ---
    let event_bus = Arc::new(trulience_events::EventBus::default());
    tracing::info!("Event bus created");

    // Spawn event persistence (writes all events to the database).
    let persistence_handle = tokio::spawn(trulience_events::EventPersistence::run(
        pool.clone(),
        event_bus.subscribe(),
    ));

    // Spawn notification router (routes events to users via WebSocket).
    let notification_router = trulience_api::notifications::NotificationRouter::new(
        pool.clone(),
        Arc::clone(&ws_manager),
    );
    let router_handle = tokio::spawn(notification_router.run(event_bus.subscribe()));

    // Spawn digest scheduler (checks hourly for digest deliveries).
    let digest_cancel = tokio_util::sync::CancellationToken::new();
    let digest_scheduler = trulience_events::DigestScheduler::new(pool.clone());
    let digest_cancel_clone = digest_cancel.clone();
    let digest_handle = tokio::spawn(async move {
        digest_scheduler.run(digest_cancel_clone).await;
    });

    // Spawn metrics retention job (purges old GPU metrics hourly).
    let retention_cancel = tokio_util::sync::CancellationToken::new();
    let retention_cancel_clone = retention_cancel.clone();
    let retention_handle = tokio::spawn(trulience_api::background::metrics_retention::run(
        pool.clone(),
        retention_cancel_clone,
    ));

    tracing::info!("Event services started (persistence, notification router, digest scheduler, metrics retention)");

    // --- Script orchestrator (PRD-09) ---
    let venv_base_dir = std::env::var("VENV_BASE_DIR").unwrap_or_else(|_| "./venvs".to_string());
    let script_orchestrator = Arc::new(
        trulience_api::scripting::orchestrator::ScriptOrchestrator::new(
            pool.clone(),
            venv_base_dir,
        ),
    );
    tracing::info!("Script orchestrator initialized");

    // --- App state ---
    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
        ws_manager: Arc::clone(&ws_manager),
        comfyui_manager: Arc::clone(&comfyui_manager),
        event_bus: Arc::clone(&event_bus),
        script_orchestrator: Some(script_orchestrator),
    };

    // --- Router ---
    let app = build_app_router(state, &config);

    // --- Start server ---
    let addr = SocketAddr::new(
        config.host.parse().expect("Invalid HOST address"),
        config.port,
    );
    tracing::info!(%addr, "Starting server");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");

    // --- Post-shutdown cleanup ---
    tracing::info!("Server stopped accepting connections, cleaning up");

    // Shut down ComfyUI connections first (they may have in-flight work).
    comfyui_manager.shutdown().await;
    tracing::info!("ComfyUI manager shut down");

    // Stop digest scheduler.
    digest_cancel.cancel();
    let _ = tokio::time::timeout(Duration::from_secs(5), digest_handle).await;
    tracing::info!("Digest scheduler stopped");

    // Stop metrics retention job.
    retention_cancel.cancel();
    let _ = tokio::time::timeout(Duration::from_secs(5), retention_handle).await;
    tracing::info!("Metrics retention job stopped");

    // Drop the event bus sender to close the broadcast channel.
    // This signals persistence and notification router to shut down.
    drop(event_bus);
    let _ = tokio::time::timeout(Duration::from_secs(5), persistence_handle).await;
    let _ = tokio::time::timeout(Duration::from_secs(5), router_handle).await;
    tracing::info!("Event services shut down");

    let ws_count = ws_manager.connection_count().await;
    tracing::info!(ws_count, "Closing remaining WebSocket connections");
    ws_manager.shutdown_all().await;

    heartbeat_handle.abort();
    tracing::info!("Heartbeat task stopped");

    tracing::info!("Graceful shutdown complete");
}

/// Wait for a termination signal to initiate graceful shutdown.
///
/// Handles both SIGINT (Ctrl-C) and SIGTERM (on Unix) so the server
/// shuts down cleanly whether stopped interactively or by a process
/// manager (e.g. systemd, Docker, Kubernetes).
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl-C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {
            tracing::info!("Received SIGINT (Ctrl-C), starting graceful shutdown");
        }
        () = terminate => {
            tracing::info!("Received SIGTERM, starting graceful shutdown");
        }
    }
}
