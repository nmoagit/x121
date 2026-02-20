use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderName, Method, StatusCode};
use axum::Router;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use trulience_api::config::ServerConfig;
use trulience_api::{routes, state, ws};

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

    // --- CORS ---
    let cors = build_cors_layer(&config);

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

    tracing::info!("Event services started (persistence, notification router, digest scheduler)");

    // --- App state ---
    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
        ws_manager: Arc::clone(&ws_manager),
        comfyui_manager: Arc::clone(&comfyui_manager),
        event_bus: Arc::clone(&event_bus),
    };

    // --- Request ID header name ---
    let request_id_header = HeaderName::from_static("x-request-id");

    // --- Router ---
    let app = Router::new()
        // Health check at root level (not under /api/v1).
        .merge(routes::health::router())
        // API v1 routes.
        .nest("/api/v1", routes::api_routes())
        // -- Middleware stack (applied bottom-up) --
        // Panic recovery: catch panics and return 500 JSON.
        .layer(CatchPanicLayer::new())
        // Request timeout.
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(config.request_timeout_secs),
        ))
        // Propagate request ID to response.
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        // Structured request/response tracing.
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        // Set request ID on incoming requests.
        .layer(SetRequestIdLayer::new(
            request_id_header,
            MakeRequestUuid,
        ))
        // CORS.
        .layer(cors)
        // Shared state.
        .with_state(state);

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

/// Build the CORS middleware layer from server configuration.
///
/// Panics at startup if any configured origin is invalid, which is the
/// desired behaviour -- we want misconfiguration to fail fast.
fn build_cors_layer(config: &ServerConfig) -> CorsLayer {
    let origins: Vec<_> = config
        .cors_origins
        .iter()
        .map(|o| {
            o.parse()
                .unwrap_or_else(|e| panic!("Invalid CORS origin '{o}': {e}"))
        })
        .collect();

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
        ])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        .allow_credentials(true)
        .max_age(Duration::from_secs(3600))
}
