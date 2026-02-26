use std::sync::Arc;

use crate::config::ServerConfig;
use crate::scripting::orchestrator::ScriptOrchestrator;
use crate::ws::WsManager;

/// Shared application state available to all Axum handlers via `State<AppState>`.
///
/// This is cheaply cloneable (inner data is behind `Arc` or is already `Clone`).
#[derive(Clone)]
pub struct AppState {
    /// Database connection pool.
    pub pool: x121_db::DbPool,
    /// Server configuration (accessed by middleware and handlers in later PRDs).
    pub config: Arc<ServerConfig>,
    /// WebSocket connection manager (browser clients).
    pub ws_manager: Arc<WsManager>,
    /// ComfyUI connection manager (generation instances).
    pub comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>,
    /// Centralized event bus for publishing platform events.
    pub event_bus: Arc<x121_events::EventBus>,
    /// Multi-runtime script orchestrator (PRD-09).
    pub script_orchestrator: Option<Arc<ScriptOrchestrator>>,
}
