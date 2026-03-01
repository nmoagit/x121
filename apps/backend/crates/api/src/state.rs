use std::sync::Arc;

use tokio::sync::RwLock;

use crate::config::ServerConfig;
use crate::engine::health_aggregator::HealthAggregator;
use crate::scripting::orchestrator::ScriptOrchestrator;
use crate::ws::WsManager;
use x121_core::storage::StorageProvider;

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
    /// In-memory health aggregator for the system status footer (PRD-117).
    pub health_aggregator: Arc<HealthAggregator>,
    /// Platform settings cache and resolution service (PRD-110).
    pub settings_service: Arc<x121_core::settings::SettingsService>,
    /// Activity log broadcast channel for real-time streaming (PRD-118).
    pub activity_broadcaster: Arc<x121_events::ActivityLogBroadcaster>,
    /// Cloud GPU provider registry (PRD-114).
    pub cloud_registry: Arc<x121_cloud::registry::ProviderRegistry>,
    /// Active storage provider, swappable at runtime (PRD-122).
    ///
    /// Wrapped in `RwLock` to allow hot-swapping when the admin changes the
    /// default backend. Reads are cheap (no contention), writes are rare.
    pub storage: Arc<RwLock<Arc<dyn StorageProvider>>>,
}

impl AppState {
    /// Get a clone of the current storage provider `Arc`.
    pub async fn storage_provider(&self) -> Arc<dyn StorageProvider> {
        self.storage.read().await.clone()
    }

    /// Hot-swap the active storage provider at runtime.
    pub async fn swap_storage_provider(&self, new_provider: Arc<dyn StorageProvider>) {
        let mut guard = self.storage.write().await;
        *guard = new_provider;
    }
}
