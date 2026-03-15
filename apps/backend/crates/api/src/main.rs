use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use x121_api::config::ServerConfig;
use x121_api::router::build_app_router;
use x121_api::{state, ws};

use state::AppState;

#[tokio::main]
async fn main() {
    // Install rustls CryptoProvider before any TLS usage (required by rustls 0.23+)
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls CryptoProvider");

    dotenvy::dotenv().ok();

    // --- Activity log broadcaster (PRD-118) ---
    // Created early so the tracing layer can publish to it.
    let activity_broadcaster = Arc::new(x121_events::ActivityLogBroadcaster::default());

    // --- Tracing ---
    let activity_tracing_layer = x121_api::background::activity_tracing::ActivityTracingLayer::new(
        Arc::clone(&activity_broadcaster),
    );

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "x121_api=debug,x121_comfyui=info,x121_cloud=info,x121_pipeline=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .with(activity_tracing_layer)
        .init();

    // --- Configuration ---
    let config = ServerConfig::from_env();
    tracing::info!(host = %config.host, port = %config.port, "Loaded server configuration");

    // --- Database ---
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = x121_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    tracing::info!("Database connection pool created");

    x121_db::health_check(&pool)
        .await
        .expect("Database health check failed");
    tracing::info!("Database health check passed");

    x121_db::run_migrations(&pool)
        .await
        .expect("Failed to run database migrations");
    tracing::info!("Database migrations applied");

    // --- Env-to-DB seed migration (PRD-130) ---
    if let Ok(master_hex) = std::env::var("CLOUD_ENCRYPTION_KEY") {
        if let Ok(master_key) = x121_core::crypto::parse_master_key(&master_hex) {
            match x121_cloud::seed::seed_provider_from_env(&pool, &master_key).await {
                Ok(Some(id)) => tracing::info!(provider_id = id, "Seeded RunPod provider from env"),
                Ok(None) => {}
                Err(e) => tracing::warn!(error = %e, "Failed to seed cloud provider from env"),
            }
        }
    }

    // --- WebSocket manager ---
    let ws_manager = Arc::new(ws::WsManager::new());

    // --- Heartbeat ---
    let heartbeat_handle = ws::start_heartbeat(Arc::clone(&ws_manager));

    // --- RunPod pod orchestrator (if configured) ---
    let pod_orchestrator =
        x121_cloud::runpod::orchestrator::PodOrchestratorConfig::from_env().map(|config| {
            tracing::info!("RunPod configured — pod orchestrator available");
            Arc::new(x121_cloud::runpod::orchestrator::PodOrchestrator::new(
                config,
            ))
        });

    // --- ComfyUI manager ---
    let comfyui_manager = x121_comfyui::manager::ComfyUIManager::start_with_activity(
        pool.clone(),
        Some(Arc::clone(&activity_broadcaster)),
    )
    .await;
    tracing::info!("ComfyUI manager started");

    // --- Event bus ---
    let event_bus = Arc::new(x121_events::EventBus::default());
    tracing::info!("Event bus created");

    // Spawn event persistence (writes all events to the database).
    let persistence_handle = tokio::spawn(x121_events::EventPersistence::run(
        pool.clone(),
        event_bus.subscribe(),
    ));

    // Spawn notification router (routes events to users via WebSocket).
    let notification_router =
        x121_api::notifications::NotificationRouter::new(pool.clone(), Arc::clone(&ws_manager));
    let router_handle = tokio::spawn(notification_router.run(event_bus.subscribe()));

    // Spawn digest scheduler (checks hourly for digest deliveries).
    let digest_cancel = tokio_util::sync::CancellationToken::new();
    let digest_scheduler = x121_events::DigestScheduler::new(pool.clone());
    let digest_cancel_clone = digest_cancel.clone();
    let digest_handle = tokio::spawn(async move {
        digest_scheduler.run(digest_cancel_clone).await;
    });

    // Spawn metrics retention job (purges old GPU metrics hourly).
    let retention_cancel = tokio_util::sync::CancellationToken::new();
    let retention_cancel_clone = retention_cancel.clone();
    let retention_handle = tokio::spawn(x121_api::background::metrics_retention::run(
        pool.clone(),
        retention_cancel_clone,
    ));

    // Spawn activity log persistence (batch writes to activity_logs table, PRD-118).
    let activity_persist_cancel = tokio_util::sync::CancellationToken::new();
    let activity_persist_cancel_clone = activity_persist_cancel.clone();
    let activity_persist_handle = tokio::spawn(x121_api::background::activity_persistence::run(
        pool.clone(),
        activity_broadcaster.subscribe(),
        activity_persist_cancel_clone,
        100,
        Duration::from_millis(1000),
    ));

    // Spawn activity log retention (purges old entries hourly, PRD-118).
    let activity_retention_cancel = tokio_util::sync::CancellationToken::new();
    let activity_retention_cancel_clone = activity_retention_cancel.clone();
    let activity_retention_handle = tokio::spawn(x121_api::background::activity_retention::run(
        pool.clone(),
        activity_retention_cancel_clone,
    ));

    tracing::info!("Event services started (persistence, notification router, digest scheduler, metrics retention, activity log persistence, activity log retention)");

    // --- Script orchestrator (PRD-09) ---
    let venv_base_dir = std::env::var("VENV_BASE_DIR").unwrap_or_else(|_| "./venvs".to_string());
    let script_orchestrator = Arc::new(x121_api::scripting::orchestrator::ScriptOrchestrator::new(
        pool.clone(),
        venv_base_dir,
    ));
    tracing::info!("Script orchestrator initialized");

    // --- Health aggregator (PRD-117) ---
    let health_aggregator = Arc::new(x121_api::engine::health_aggregator::HealthAggregator::new());
    health_aggregator
        .clone()
        .start_polling(pool.clone(), Arc::clone(&comfyui_manager));
    tracing::info!("Health aggregator started (30s interval)");

    // --- Settings service (PRD-110) ---
    let settings_service = Arc::new(x121_core::settings::SettingsService::new(
        Duration::from_secs(60),
    ));
    tracing::info!("Settings service initialized (60s cache TTL)");

    // --- Cloud GPU provider registry (PRD-114) ---
    let cloud_registry = Arc::new(x121_cloud::registry::ProviderRegistry::new());
    // Load ALL providers from DB into the runtime registry (including disabled ones).
    // Disabled providers won't have active scaling rules, but they must be in the
    // registry so that resume-processing can re-enable them without a restart.
    {
        if let Ok(providers) = x121_db::repositories::CloudProviderRepo::list_all(&pool).await {
            if let Ok(master_hex) = std::env::var("CLOUD_ENCRYPTION_KEY") {
                if let Ok(master_key) = x121_core::crypto::parse_master_key(&master_hex) {
                    for p in &providers {
                        if let Ok(api_key) = x121_core::crypto::decrypt_api_key(
                            &p.api_key_encrypted,
                            &p.api_key_nonce,
                            &master_key,
                        ) {
                            let runtime: Arc<dyn x121_core::cloud::CloudGpuProvider> =
                                match p.provider_type.as_str() {
                                    "runpod" => Arc::new(x121_cloud::runpod::RunPodProvider::new(
                                        api_key,
                                        p.base_url.clone(),
                                    )),
                                    _ => continue,
                                };
                            cloud_registry.register(p.id, runtime).await;
                        }
                    }
                    tracing::info!(count = providers.len(), "Cloud GPU providers loaded");
                }
            }
        }
    }

    // --- Lifecycle bridge (PRD-130) ---
    // Created before cloud services so the scaling service can use it.
    let lifecycle_bridge = Arc::new(x121_cloud::lifecycle::LifecycleBridge::new(
        pool.clone(),
        Arc::clone(&comfyui_manager),
    ));
    tracing::info!("Lifecycle bridge initialized");

    // Spawn cloud background services (PRD-114, PRD-130 Phase 6).
    let (_scaling_handle, scaling_nudge) = x121_cloud::services::scaling::spawn_scaling_service(
        pool.clone(),
        Arc::clone(&cloud_registry),
        Arc::clone(&lifecycle_bridge),
        Arc::clone(&activity_broadcaster),
        None,
    );
    let (_monitoring_handle, _monitoring_nudge) = x121_cloud::services::monitoring::spawn_monitoring_service(
        pool.clone(),
        Arc::clone(&cloud_registry),
        None,
    );
    let (_reconciliation_handle, _reconciliation_nudge) = x121_cloud::services::reconciliation::spawn_reconciliation_service(
        pool.clone(),
        Arc::clone(&cloud_registry),
        Some(Arc::clone(&activity_broadcaster)),
        None,
    );
    tracing::info!("Cloud GPU services started (scaling, monitoring, reconciliation)");

    // Reconnect to any ComfyUI instances that were connected before a crash.
    // refresh_instances checks the DB for enabled instances and spawns WS
    // connections for any that aren't currently connected.
    comfyui_manager.refresh_instances().await;

    // Periodic ComfyUI instance refresh — picks up instances that were registered
    // in the DB by the scaling service (provisioned pods) or marked for reconnect.
    {
        let mgr = Arc::clone(&comfyui_manager);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                ticker.tick().await;
                mgr.refresh_instances().await;
            }
        });
    }

    // --- Storage provider (PRD-122) ---
    let default_backend = x121_db::repositories::StorageBackendRepo::find_default(&pool).await;
    let storage_provider: std::sync::Arc<dyn x121_core::storage::StorageProvider> =
        match &default_backend {
            Ok(Some(backend)) if backend.backend_type_id == 2 => {
                // S3 backend
                let s3_config = serde_json::from_value::<x121_cloud::storage_provider::S3Config>(
                    backend.config.clone(),
                )
                .expect("Invalid S3 config in default storage backend");
                std::sync::Arc::new(
                    x121_cloud::storage_provider::S3StorageProvider::new(s3_config)
                        .await
                        .expect("Failed to initialize S3 storage provider"),
                )
            }
            _ => {
                // Local backend (default fallback)
                let backend_config = default_backend.ok().flatten().map(|b| {
                    x121_core::storage::factory::StorageBackendConfig {
                        backend_type: "local".to_string(),
                        config: b.config.clone(),
                    }
                });
                x121_core::storage::factory::build_provider(
                    backend_config.as_ref(),
                    &settings_service,
                )
                .expect("Failed to initialize local storage provider")
            }
        };
    // --- Generation event loop (processes ComfyUI completions) ---
    // Embedded from x121-worker — runs as a background task so the API
    // server handles both HTTP requests and generation event processing.
    let comfyui_event_rx = comfyui_manager.subscribe();
    let generation_event_cancel = tokio_util::sync::CancellationToken::new();
    let generation_event_cancel_clone = generation_event_cancel.clone();
    let generation_event_handle = {
        let pool = pool.clone();
        let comfyui = Arc::clone(&comfyui_manager);
        let storage_for_events = storage_provider.clone();
        let broadcaster_for_events = Some(Arc::clone(&activity_broadcaster));
        x121_pipeline::gen_log::init_broadcaster(Arc::clone(&activity_broadcaster));
        tokio::spawn(async move {
            tokio::select! {
                _ = x121_worker::event_loop::run(pool, comfyui, storage_for_events, comfyui_event_rx, broadcaster_for_events) => {}
                _ = generation_event_cancel_clone.cancelled() => {}
            }
        })
    };
    tracing::info!("Generation event loop started (embedded)");

    let storage = Arc::new(tokio::sync::RwLock::new(storage_provider));
    tracing::info!("Storage provider initialized");

    // --- App state ---
    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
        ws_manager: Arc::clone(&ws_manager),
        comfyui_manager: Arc::clone(&comfyui_manager),
        event_bus: Arc::clone(&event_bus),
        script_orchestrator: Some(script_orchestrator),
        health_aggregator,
        settings_service,
        activity_broadcaster: Arc::clone(&activity_broadcaster),
        cloud_registry,
        storage,
        lifecycle_bridge,
        pod_orchestrator,
        scaling_nudge,
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

    // Stop the generation event loop.
    generation_event_cancel.cancel();
    let _ = tokio::time::timeout(Duration::from_secs(5), generation_event_handle).await;
    tracing::info!("Generation event loop stopped");

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

    // Stop activity log services (PRD-118).
    activity_persist_cancel.cancel();
    let _ = tokio::time::timeout(Duration::from_secs(5), activity_persist_handle).await;
    activity_retention_cancel.cancel();
    let _ = tokio::time::timeout(Duration::from_secs(5), activity_retention_handle).await;
    tracing::info!("Activity log services stopped");

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
