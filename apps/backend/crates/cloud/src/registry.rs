//! Provider registry — holds active cloud GPU provider instances (PRD-114).

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use x121_core::cloud::CloudGpuProvider;
use x121_core::types::DbId;

/// In-memory registry of cloud GPU provider instances, keyed by DB ID.
#[derive(Clone)]
pub struct ProviderRegistry {
    inner: Arc<RwLock<HashMap<DbId, Arc<dyn CloudGpuProvider>>>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get a provider by its database ID.
    pub async fn get(&self, id: DbId) -> Option<Arc<dyn CloudGpuProvider>> {
        let map = self.inner.read().await;
        map.get(&id).cloned()
    }

    /// Register a provider instance.
    pub async fn register(&self, id: DbId, provider: Arc<dyn CloudGpuProvider>) {
        let mut map = self.inner.write().await;
        map.insert(id, provider);
    }

    /// Remove a provider from the registry.
    pub async fn remove(&self, id: DbId) -> Option<Arc<dyn CloudGpuProvider>> {
        let mut map = self.inner.write().await;
        map.remove(&id)
    }

    /// Get all registered provider IDs.
    pub async fn provider_ids(&self) -> Vec<DbId> {
        let map = self.inner.read().await;
        map.keys().copied().collect()
    }

    /// Number of registered providers.
    pub async fn len(&self) -> usize {
        let map = self.inner.read().await;
        map.len()
    }

    /// Check if the registry is empty.
    pub async fn is_empty(&self) -> bool {
        let map = self.inner.read().await;
        map.is_empty()
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}
