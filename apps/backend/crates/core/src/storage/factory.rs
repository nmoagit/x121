//! Storage provider factory (PRD-122).
//!
//! Builds a concrete [`StorageProvider`] from a backend configuration.
//! S3 providers must be built by the `x121_cloud` crate (which has the
//! AWS SDK dependency); this factory returns an error for that case.

use std::sync::Arc;

use super::local::LocalStorageProvider;
use super::StorageProvider;
use crate::error::CoreError;
use crate::settings::SettingsService;

/// Describes which backend type and configuration to use.
pub struct StorageBackendConfig {
    /// `"local"` or `"s3"`.
    pub backend_type: String,
    /// Provider-specific JSON config (e.g. `{"root": "./storage"}`).
    pub config: serde_json::Value,
}

/// Build a storage provider from the given config, falling back to the
/// `storage_root` platform setting for local backends.
///
/// Returns an error for `"s3"` because the AWS SDK lives in `x121_cloud`.
pub fn build_provider(
    backend_config: Option<&StorageBackendConfig>,
    settings: &SettingsService,
) -> Result<Arc<dyn StorageProvider>, CoreError> {
    match backend_config.map(|c| c.backend_type.as_str()) {
        Some("s3") => Err(CoreError::Internal(
            "S3 provider must be built by the cloud crate".into(),
        )),
        _ => {
            let root = backend_config
                .and_then(|c| {
                    c.config
                        .get("base_path")
                        .or_else(|| c.config.get("root"))
                        .and_then(|v| v.as_str())
                })
                .map(String::from)
                .unwrap_or_else(|| {
                    let (val, _) = settings.resolve("storage_root", None);
                    val
                });
            let provider = LocalStorageProvider::new(std::path::PathBuf::from(root))?;
            Ok(Arc::new(provider))
        }
    }
}
