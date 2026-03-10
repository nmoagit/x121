use std::sync::Arc;

use tokio::sync::RwLock;

use crate::config::ServerConfig;
use crate::engine::health_aggregator::HealthAggregator;
use crate::scripting::orchestrator::ScriptOrchestrator;
use crate::ws::WsManager;
use x121_cloud::runpod::orchestrator::PodOrchestrator;
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
    /// Unified cloud ↔ ComfyUI lifecycle bridge (PRD-130).
    pub lifecycle_bridge: Arc<x121_cloud::lifecycle::LifecycleBridge>,
    /// RunPod pod orchestrator (None if RunPod is not configured).
    pub pod_orchestrator: Option<Arc<PodOrchestrator>>,
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

    /// Resolve a file path or storage key to an absolute filesystem path.
    ///
    /// If `path` is already absolute it is returned as-is. Otherwise it is
    /// treated as a storage key and resolved through the active storage
    /// provider (for local storage this prepends the configured root).
    ///
    /// Used for reading files via ffprobe, ffmpeg, image processing, etc.
    pub async fn resolve_to_path(
        &self,
        path: &str,
    ) -> Result<std::path::PathBuf, crate::error::AppError> {
        if std::path::Path::new(path).is_absolute() {
            return Ok(std::path::PathBuf::from(path));
        }
        let provider = self.storage_provider().await;
        // CoreError implements Into<AppError> via the From impl on AppError.
        let url = provider.presigned_url(path, 3600).await?;
        let abs = url.strip_prefix("file://").unwrap_or(&url);
        Ok(std::path::PathBuf::from(abs))
    }
}
