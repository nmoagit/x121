use std::sync::Arc;

use crate::config::ServerConfig;
use crate::ws::WsManager;

/// Shared application state available to all Axum handlers via `State<AppState>`.
///
/// This is cheaply cloneable (inner data is behind `Arc` or is already `Clone`).
#[derive(Clone)]
pub struct AppState {
    /// Database connection pool.
    pub pool: trulience_db::DbPool,
    /// Server configuration (accessed by middleware and handlers in later PRDs).
    #[allow(dead_code)]
    pub config: Arc<ServerConfig>,
    /// WebSocket connection manager.
    pub ws_manager: Arc<WsManager>,
}
