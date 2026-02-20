# Task List: Backend Foundation (Rust/Axum)

**PRD Reference:** `design/prds/002-prd-backend-foundation.md`
**Scope:** Establish the Rust/Axum backend server with async I/O, routing architecture, middleware pipeline, WebSocket infrastructure, error handling, configuration management, structured logging, and graceful shutdown.

## Overview

This PRD builds the backend application framework on top of the PRD-000 database infrastructure. We create a production-grade Axum server with layered middleware (logging, CORS, error recovery), a WebSocket connection manager for real-time features, a unified error handling system, and a graceful shutdown mechanism. The result is a server binary that can accept HTTP and WebSocket connections, talk to PostgreSQL, and serve as the host for all feature-specific endpoints defined by downstream PRDs.

### What Already Exists
- PRD-000: Cargo project with `Cargo.toml`, `src/main.rs`, `src/config.rs`, `src/db.rs`, `src/types.rs`
- PRD-000: SQLx connection pool setup and health check
- PRD-000: Environment configuration via `dotenvy`
- PRD-000: `tracing` and `tracing-subscriber` dependencies

### What We're Building
1. Axum HTTP server with configurable port and layered middleware
2. Modular route registration system
3. WebSocket connection manager with heartbeat
4. Unified API error type and response format
5. CORS middleware configuration
6. Request logging middleware with method, path, status, duration
7. Graceful shutdown with connection draining
8. Extended configuration struct for all server settings

### Key Design Decisions
1. **Single crate with modules** — Start with a single crate organized into modules (`api`, `models`, `repositories`, `ws`). Extract to workspace crates only when compile times justify it.
2. **Axum `State` over `Extension`** — Use Axum's typed `State` extractor for shared state (pool, config, ws manager) rather than untyped `Extension` for compile-time safety.
3. **Tower middleware stack** — Leverage the tower ecosystem for middleware (tracing, CORS, timeout) rather than custom implementations.
4. **Unified `AppError` type** — A single error enum that implements `IntoResponse` so all handlers return `Result<T, AppError>`.

---

## Phase 1: Server Configuration

### Task 1.1: Extend Configuration for Server Settings
**File:** `src/config.rs`

Extend the existing `DbConfig` into a comprehensive `AppConfig` that includes server settings.

```rust
pub struct AppConfig {
    pub db: DbConfig,
    pub server: ServerConfig,
}

pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: Vec<String>,
    pub request_timeout_secs: u64,
    pub shutdown_timeout_secs: u64,
    pub log_level: String,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        Self {
            host: std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("SERVER_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            cors_origins: std::env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:5173".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            request_timeout_secs: std::env::var("REQUEST_TIMEOUT_SECS")
                .ok()
                .and_then(|t| t.parse().ok())
                .unwrap_or(30),
            shutdown_timeout_secs: std::env::var("SHUTDOWN_TIMEOUT_SECS")
                .ok()
                .and_then(|t| t.parse().ok())
                .unwrap_or(30),
            log_level: std::env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
        }
    }
}
```

**Acceptance Criteria:**
- [x] `AppConfig` wraps `DbConfig` and `ServerConfig`
- [x] `SERVER_HOST` (default `0.0.0.0`), `SERVER_PORT` (default `3000`) configurable
- [x] `CORS_ORIGINS` configurable as comma-separated list
- [x] `REQUEST_TIMEOUT_SECS` (default `30`), `SHUTDOWN_TIMEOUT_SECS` (default `30`) configurable
- [x] `LOG_LEVEL` (default `info`) configurable
- [x] `.env.example` updated with all new variables documented

### Task 1.2: Create `.env.example` Template
**File:** `.env.example`

Document all environment variables the application reads.

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trulience_x121
DB_USER=your_user
DB_PASSWORD=your_password
DB_SSL=false

# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
CORS_ORIGINS=http://localhost:5173
REQUEST_TIMEOUT_SECS=30
SHUTDOWN_TIMEOUT_SECS=30
LOG_LEVEL=info
```

**Acceptance Criteria:**
- [x] `.env.example` documents every env var with comments
- [x] Sensitive values use placeholder text
- [x] File is committed to version control (not in `.gitignore`)

---

## Phase 2: Axum Server Setup

### Task 2.1: Application State
**File:** `src/app_state.rs`

Define the shared application state struct that Axum handlers receive.

```rust
use sqlx::PgPool;
use crate::config::AppConfig;
use crate::ws::WsManager;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub ws_manager: Arc<WsManager>,
}
```

**Acceptance Criteria:**
- [x] `AppState` holds `PgPool`, `Arc<AppConfig>`, `Arc<WsManager>`
- [x] `AppState` derives `Clone` (required by Axum)
- [x] All handlers can access state via `State(state): State<AppState>`

### Task 2.2: Axum Server Bootstrap
**File:** `src/server.rs`

Create the server bootstrap function that assembles the Axum application with middleware and starts listening.

```rust
use axum::Router;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tower_http::timeout::TimeoutLayer;

pub async fn start(state: AppState) -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new()
        .nest("/api/v1", api_routes())
        .nest("/ws", ws_routes())
        .route("/health", axum::routing::get(health_check))
        .with_state(state.clone())
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer(&state.config.server))
        .layer(TimeoutLayer::new(
            std::time::Duration::from_secs(state.config.server.request_timeout_secs)
        ));

    let addr = format!("{}:{}", state.config.server.host, state.config.server.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on {}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}
```

**Acceptance Criteria:**
- [x] Server listens on configured host:port
- [x] Routes nested under `/api/v1` for API, `/ws` for WebSocket, `/health` for health check
- [x] `tower-http` middleware applied: TraceLayer, CorsLayer, TimeoutLayer
- [x] `tower-http` added to `Cargo.toml` with features: `cors`, `trace`, `timeout`
- [x] Health check endpoint returns 200 with `{"status": "ok"}`

### Task 2.3: Modular Route Registration
**File:** `src/api/routes.rs`

Create a route registration system where each feature module contributes its routes.

```rust
use axum::Router;
use crate::app_state::AppState;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        // PRD-001 entity routes will be registered here
        // .nest("/projects", project_routes())
        // PRD-003 auth routes
        // .nest("/auth", auth_routes())
}

pub fn ws_routes() -> Router<AppState> {
    Router::new()
        // PRD-005 ComfyUI WebSocket bridge
        // PRD-011 real-time collaboration
}
```

**Acceptance Criteria:**
- [x] `api_routes()` returns a `Router<AppState>` with nested sub-routers
- [x] `ws_routes()` returns a separate router for WebSocket endpoints
- [x] New feature modules add routes by adding a `.nest()` call — no other files need modification
- [x] Route structure is documented with comments showing which PRD owns each route group

### Task 2.4: Update Main Entry Point
**File:** `src/main.rs`

Wire the server into the main function, replacing the simple migrate-and-exit flow.

```rust
mod api;
mod app_state;
mod config;
mod db;
mod error;
mod models;
mod repositories;
mod server;
mod types;
mod ws;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let config = config::AppConfig::from_env();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(&config.server.log_level)
        .init();

    // Connect to database
    let pool = db::connect(&config.db).await.expect("Failed to connect to database");
    db::health_check(&pool).await.expect("Database health check failed");

    // Run migrations
    sqlx::migrate!().run(&pool).await.expect("Migration failed");
    tracing::info!("Migrations applied successfully");

    // Build app state
    let ws_manager = std::sync::Arc::new(ws::WsManager::new());
    let state = app_state::AppState {
        pool,
        config: std::sync::Arc::new(config),
        ws_manager,
    };

    // Start server
    server::start(state).await.expect("Server failed");
}
```

**Acceptance Criteria:**
- [x] `main.rs` initializes config, tracing, pool, migrations, state, server in order
- [x] All modules are declared
- [x] `cargo run` starts the Axum server and accepts HTTP requests
- [x] Server startup logs show each initialization step

---

## Phase 3: Error Handling

### Task 3.1: Unified Error Type
**File:** `src/error.rs`

Create a unified `AppError` enum that handles all error cases and implements Axum's `IntoResponse`.

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    BadRequest(String),
    Conflict(String),
    InternalError(String),
    DatabaseError(sqlx::Error),
    Unauthorized(String),
    Forbidden(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<serde_json::Value>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone()),
            AppError::InternalError(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal server error".to_string())
            }
            AppError::DatabaseError(e) => {
                tracing::error!("Database error: {:?}", e);
                translate_db_error(e)
            }
        };

        let body = ErrorResponse { error: message, code: code.to_string(), details: None };
        (status, Json(body)).into_response()
    }
}

fn translate_db_error(e: &sqlx::Error) -> (StatusCode, &'static str, String) {
    match e {
        sqlx::Error::Database(db_err) => {
            if let Some(constraint) = db_err.constraint() {
                if constraint.starts_with("uq_") {
                    return (StatusCode::CONFLICT, "CONFLICT",
                        format!("Duplicate entry violates unique constraint: {}", constraint));
                }
            }
            (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal server error".to_string())
        }
        sqlx::Error::RowNotFound => (StatusCode::NOT_FOUND, "NOT_FOUND", "Resource not found".to_string()),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal server error".to_string()),
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::DatabaseError(e)
    }
}
```

**Acceptance Criteria:**
- [x] `AppError` enum covers: NotFound, BadRequest, Conflict, InternalError, DatabaseError, Unauthorized, Forbidden
- [x] Implements `IntoResponse` with consistent JSON: `{ error, code, details? }`
- [x] Database unique constraint violations map to 409 Conflict with constraint name
- [x] `RowNotFound` maps to 404
- [x] Internal errors log full details but return sanitized messages
- [x] `From<sqlx::Error>` implemented for ergonomic `?` usage

### Task 3.2: Panic Recovery Middleware
**File:** `src/server.rs` (add to middleware stack)

Add panic-catching middleware so a handler panic does not crash the server.

```rust
use tower_http::catch_panic::CatchPanicLayer;

// In the middleware stack:
.layer(CatchPanicLayer::custom(|_: Box<dyn std::any::Any + Send>| {
    let body = serde_json::json!({
        "error": "Internal server error",
        "code": "PANIC"
    });
    (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response()
}))
```

**Acceptance Criteria:**
- [x] Handler panics are caught and return 500 with JSON body
- [x] Panic details are logged at error level
- [x] Server continues serving other requests after a handler panic
- [x] `catch-panic` feature enabled on `tower-http`

---

## Phase 4: Request Logging Middleware

### Task 4.1: Structured Request Logging
**File:** `src/middleware/logging.rs`

Configure the tower-http TraceLayer to log structured request/response information.

```rust
use tower_http::trace::{TraceLayer, DefaultMakeSpan, DefaultOnResponse};
use tracing::Level;

pub fn request_logging_layer() -> TraceLayer<
    tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>,
> {
    TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO))
}
```

**Acceptance Criteria:**
- [x] Every request logs: method, path, status code, response time
- [x] Log format is structured (JSON or key=value for filtering)
- [x] Log level configurable via `LOG_LEVEL` env var
- [x] Sensitive headers (Authorization, Cookie) are not logged
- [x] `tracing-subscriber` configured with `env-filter` feature for level filtering

### Task 4.2: Request ID Middleware
**File:** `src/middleware/request_id.rs`

Assign a unique ID to each request for correlation across log lines.

```rust
use axum::{middleware::Next, http::Request, response::Response};
use uuid::Uuid;

pub async fn inject_request_id<B>(
    mut req: Request<B>,
    next: Next<B>,
) -> Response {
    let request_id = Uuid::new_v4().to_string();
    req.headers_mut().insert(
        "x-request-id",
        request_id.parse().unwrap(),
    );
    let mut response = next.run(req).await;
    response.headers_mut().insert(
        "x-request-id",
        request_id.parse().unwrap(),
    );
    response
}
```

**Acceptance Criteria:**
- [x] Each request gets a unique `X-Request-Id` header
- [x] The same ID is returned in the response
- [x] The ID is included in all log lines for the request
- [x] `uuid` crate added to `Cargo.toml`

---

## Phase 5: CORS Configuration

### Task 5.1: CORS Middleware
**File:** `src/middleware/cors.rs`

Configure CORS to allow requests from the frontend origin(s).

```rust
use tower_http::cors::{CorsLayer, Any};
use axum::http::{header, Method};
use crate::config::ServerConfig;

pub fn cors_layer(config: &ServerConfig) -> CorsLayer {
    let origins: Vec<_> = config.cors_origins.iter()
        .map(|o| o.parse().expect("Invalid CORS origin"))
        .collect();

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_credentials(true)
        .max_age(std::time::Duration::from_secs(3600))
}
```

**Acceptance Criteria:**
- [x] CORS origins read from `AppConfig.server.cors_origins`
- [x] Methods: GET, POST, PUT, DELETE, PATCH allowed
- [x] Headers: Content-Type, Authorization allowed
- [x] Credentials: allowed
- [x] Preflight cache max-age: 1 hour
- [x] Invalid origin in config causes startup failure with clear error

---

## Phase 6: WebSocket Infrastructure

### Task 6.1: WebSocket Connection Manager
**File:** `src/ws/manager.rs`

Create a connection manager that tracks active WebSocket connections.

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use crate::types::DbId;

pub type WsSender = mpsc::UnboundedSender<axum::extract::ws::Message>;

#[derive(Debug, Clone)]
pub struct WsConnection {
    pub user_id: Option<DbId>,
    pub sender: WsSender,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

pub struct WsManager {
    connections: RwLock<HashMap<String, WsConnection>>,
}

impl WsManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    pub async fn add(&self, conn_id: String, conn: WsConnection) {
        self.connections.write().await.insert(conn_id, conn);
    }

    pub async fn remove(&self, conn_id: &str) -> Option<WsConnection> {
        self.connections.write().await.remove(conn_id)
    }

    pub async fn get_by_user(&self, user_id: DbId) -> Vec<WsSender> {
        self.connections.read().await.values()
            .filter(|c| c.user_id == Some(user_id))
            .map(|c| c.sender.clone())
            .collect()
    }

    pub async fn broadcast(&self, msg: axum::extract::ws::Message) {
        let conns = self.connections.read().await;
        for conn in conns.values() {
            let _ = conn.sender.send(msg.clone());
        }
    }

    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }
}
```

**Acceptance Criteria:**
- [x] `WsManager` tracks connections in a `RwLock<HashMap<String, WsConnection>>`
- [x] `add`, `remove`, `get_by_user`, `broadcast`, `connection_count` methods implemented
- [x] Thread-safe: uses `RwLock` for concurrent read access
- [x] Each connection has an ID, optional user_id, sender channel, and timestamp

### Task 6.2: WebSocket Upgrade Handler
**File:** `src/ws/handler.rs`

Create the WebSocket upgrade handler with heartbeat and message routing.

```rust
use axum::{
    extract::{ws::{WebSocket, WebSocketUpgrade, Message}, State},
    response::Response,
};
use crate::app_state::AppState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let conn_id = uuid::Uuid::new_v4().to_string();
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();

    let conn = super::manager::WsConnection {
        user_id: None,
        sender,
        connected_at: chrono::Utc::now(),
    };

    state.ws_manager.add(conn_id.clone(), conn).await;
    tracing::info!(conn_id = %conn_id, "WebSocket connected");

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Spawn task to forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = receiver.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Receive messages from WebSocket
    let recv_state = state.clone();
    let recv_conn_id = conn_id.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Ping(data) => { /* pong is auto-sent by axum */ }
                Message::Close(_) => break,
                Message::Text(text) => {
                    tracing::debug!(conn_id = %recv_conn_id, "Received: {}", text);
                    // Route message to appropriate handler
                }
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // Cleanup
    state.ws_manager.remove(&conn_id).await;
    tracing::info!(conn_id = %conn_id, "WebSocket disconnected");
}
```

**Acceptance Criteria:**
- [x] WebSocket upgrade from HTTP works at `/ws` endpoint
- [x] Each connection gets a unique ID
- [x] Messages are received and can be routed to handlers
- [x] Disconnection cleans up the connection from `WsManager`
- [x] Ping/pong heartbeat is handled (Axum auto-responds to pings)
- [x] Connection and disconnection are logged with the connection ID

### Task 6.3: WebSocket Heartbeat
**File:** `src/ws/heartbeat.rs`

Implement a periodic ping sender to detect dead connections.

```rust
use std::time::Duration;
use tokio::time::interval;
use axum::extract::ws::Message;
use crate::ws::manager::WsManager;

pub async fn start_heartbeat(ws_manager: Arc<WsManager>) {
    let mut ticker = interval(Duration::from_secs(30));
    loop {
        ticker.tick().await;
        ws_manager.broadcast(Message::Ping(vec![])).await;
        tracing::debug!("Heartbeat ping sent to {} connections", ws_manager.connection_count().await);
    }
}
```

**Acceptance Criteria:**
- [x] Ping sent every 30 seconds to all connected clients
- [x] Clients that don't respond to pong within timeout are disconnected
- [x] Heartbeat task runs as a background Tokio task
- [x] Heartbeat interval is configurable

---

## Phase 7: Graceful Shutdown

### Task 7.1: Shutdown Signal Handler
**File:** `src/server.rs` (add function)

Implement the shutdown signal handler that listens for SIGTERM/SIGINT.

```rust
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.expect("Failed to install Ctrl+C handler");
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
        _ = ctrl_c => tracing::info!("Received Ctrl+C, shutting down"),
        _ = terminate => tracing::info!("Received SIGTERM, shutting down"),
    }
}
```

**Acceptance Criteria:**
- [x] Handles both SIGINT (Ctrl+C) and SIGTERM
- [x] Logs shutdown reason
- [x] Active HTTP requests complete before server exits (Axum's `with_graceful_shutdown`)
- [x] WebSocket connections receive close frames via `WsManager`
- [x] Database pool is dropped cleanly on exit
- [x] Configurable shutdown timeout (default 30s)

### Task 7.2: Shutdown Cleanup
**File:** `src/ws/manager.rs` (add method)

Add a method to gracefully close all WebSocket connections during shutdown.

```rust
impl WsManager {
    pub async fn shutdown_all(&self) {
        let conns = self.connections.write().await;
        for (id, conn) in conns.iter() {
            let _ = conn.sender.send(Message::Close(None));
            tracing::info!(conn_id = %id, "Sent close frame");
        }
    }
}
```

**Acceptance Criteria:**
- [x] `shutdown_all` sends close frames to all connections
- [x] Called during graceful shutdown before server exits
- [x] Connection count logged at shutdown

---

## Phase 8: Integration Tests

### Task 8.1: Server Startup Test
**File:** `tests/server_startup.rs`

Verify the server starts, responds to health checks, and shuts down cleanly.

```rust
#[tokio::test]
async fn test_health_check() {
    let app = create_test_app().await;
    let response = app.get("/health").await;
    assert_eq!(response.status(), 200);
    let body: serde_json::Value = response.json().await;
    assert_eq!(body["status"], "ok");
}
```

**Acceptance Criteria:**
- [x] Test: `/health` returns 200 with `{"status": "ok"}`
- [x] Test: Unknown route returns 404
- [x] Test: CORS preflight returns correct headers
- [x] Test: Request timeout returns 408

### Task 8.2: Error Handling Tests
**File:** `tests/error_handling.rs`

Test the unified error handling system.

**Acceptance Criteria:**
- [x] Test: `AppError::NotFound` returns 404 JSON with code `NOT_FOUND`
- [x] Test: `AppError::BadRequest` returns 400 JSON with code `BAD_REQUEST`
- [x] Test: Database unique constraint violation returns 409
- [x] Test: Internal errors return sanitized messages (no stack traces in response)
- [x] Test: Panic in handler returns 500 JSON (not a plain text crash)

### Task 8.3: WebSocket Connection Test
**File:** `tests/ws_tests.rs`

Test WebSocket connection lifecycle.

**Acceptance Criteria:**
- [x] Test: WebSocket upgrade succeeds
- [x] Test: Connection appears in `WsManager` after connect
- [x] Test: Connection removed from `WsManager` after disconnect
- [x] Test: Messages can be sent and received

---

## Relevant Files

| File | Description |
|------|-------------|
| `src/config.rs` | Extended with `AppConfig` and `ServerConfig` |
| `src/app_state.rs` | Shared application state (pool, config, ws_manager) |
| `src/server.rs` | Axum server bootstrap, middleware stack, shutdown |
| `src/error.rs` | Unified `AppError` enum with `IntoResponse` |
| `src/api/routes.rs` | Modular route registration |
| `src/middleware/logging.rs` | Structured request logging |
| `src/middleware/request_id.rs` | Request ID injection |
| `src/middleware/cors.rs` | CORS configuration |
| `src/ws/mod.rs` | WebSocket module barrel file |
| `src/ws/manager.rs` | WebSocket connection manager |
| `src/ws/handler.rs` | WebSocket upgrade and message handling |
| `src/ws/heartbeat.rs` | Periodic ping for dead connection detection |
| `src/main.rs` | Updated entry point wiring everything together |
| `.env.example` | Documented environment variable template |
| `Cargo.toml` | Updated dependencies |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `src/config.rs` (`DbConfig`), `src/db.rs` (pool, health check), `src/types.rs` (`DbId`)
- PRD-000: `tracing` and `tracing-subscriber` already in `Cargo.toml`
- PRD-000: `dotenvy` for env loading

### New Infrastructure Needed
- `axum` crate (0.7+) with `ws` feature for WebSocket support
- `tower-http` crate with features: `cors`, `trace`, `timeout`, `catch-panic`
- `uuid` crate for request IDs and connection IDs
- `serde` / `serde_json` for JSON serialization
- `chrono` for timestamps
- `futures` crate for stream utilities (WebSocket split)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Server Configuration — Tasks 1.1–1.2
2. Phase 2: Axum Server Setup — Tasks 2.1–2.4
3. Phase 3: Error Handling — Tasks 3.1–3.2
4. Phase 4: Request Logging — Tasks 4.1–4.2
5. Phase 5: CORS Configuration — Task 5.1

**MVP Success Criteria:**
- `cargo run` starts Axum server on configured port
- `/health` returns 200 with JSON body
- Requests are logged with method, path, status, duration
- Errors return consistent JSON format
- CORS allows frontend origin

### Post-MVP Enhancements
1. Phase 6: WebSocket Infrastructure — Tasks 6.1–6.3
2. Phase 7: Graceful Shutdown — Tasks 7.1–7.2
3. Phase 8: Integration Tests — Tasks 8.1–8.3

---

## Notes

1. **Axum version:** Target Axum 0.7+ which uses `axum::serve` with `TcpListener` rather than the older hyper-based approach.
2. **WebSocket scaling:** The in-memory `WsManager` works for single-instance deployment. For multi-instance, PRD-010 (event bus) will add Redis pub/sub for cross-instance message routing.
3. **Authentication:** CORS and request logging are in place, but authentication middleware is deferred to PRD-003. Routes are open until then.
4. **Compile-time queries:** SQLx compile-time query checking requires `DATABASE_URL` set during build. Use `cargo sqlx prepare` for CI builds without a live database.
5. **Tower middleware ordering:** Middleware is applied bottom-to-top in Axum. The order in the `.layer()` calls matters: timeout wraps trace wraps CORS wraps the actual handler.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
