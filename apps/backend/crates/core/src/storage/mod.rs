//! Storage backend constants, validation, enums, and provider trait (PRD-48, PRD-122).
//!
//! Provides tier validation, backend config validation, type/status enums,
//! a rough retrieval-time estimator, and the `StorageProvider` trait for
//! pluggable storage backends (local filesystem, S3-compatible, etc.).

pub mod factory;
pub mod local;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// StorageProvider trait (PRD-122)
// ---------------------------------------------------------------------------

/// Metadata for a single stored object.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StorageObject {
    /// Object key (relative path within the storage backend).
    pub key: String,
    /// Size in bytes.
    pub size_bytes: i64,
    /// Last-modified timestamp, if available.
    pub last_modified: Option<DateTime<Utc>>,
    /// ETag / content hash, if available.
    pub etag: Option<String>,
}

/// Pluggable storage backend interface.
///
/// Implementations live in `local` (filesystem) and the `x121_cloud` crate (S3).
/// The active provider is held in `AppState` behind an `ArcSwap` so it can be
/// hot-swapped when the admin changes the default backend.
#[async_trait]
pub trait StorageProvider: Send + Sync + 'static {
    /// Upload `data` to the given `key`, creating parent directories as needed.
    async fn upload(&self, key: &str, data: &[u8]) -> Result<(), CoreError>;
    /// Download the full contents of `key`.
    async fn download(&self, key: &str) -> Result<Vec<u8>, CoreError>;
    /// Delete the object at `key`.
    async fn delete(&self, key: &str) -> Result<(), CoreError>;
    /// Check whether `key` exists.
    async fn exists(&self, key: &str) -> Result<bool, CoreError>;
    /// List all objects whose key starts with `prefix`.
    async fn list(&self, prefix: &str) -> Result<Vec<StorageObject>, CoreError>;
    /// Generate a presigned (or file://) URL for downloading `key`.
    async fn presigned_url(&self, key: &str, expiry_secs: u64) -> Result<String, CoreError>;
    /// Verify that the backend is reachable and writable.
    async fn test_connection(&self) -> Result<(), CoreError>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Hot storage tier identifier.
pub const TIER_HOT: &str = "hot";

/// Cold storage tier identifier.
pub const TIER_COLD: &str = "cold";

/// Default cache TTL for cold-tier retrieval (hours).
pub const DEFAULT_CACHE_TTL_HOURS: u64 = 24;

/// Default maximum local cache size (50 GiB).
pub const DEFAULT_MAX_CACHE_BYTES: u64 = 50 * 1024 * 1024 * 1024;

/// Valid tier values.
const VALID_TIERS: &[&str] = &[TIER_HOT, TIER_COLD];

// ---------------------------------------------------------------------------
// Tier validation
// ---------------------------------------------------------------------------

/// Validate that `tier` is either `"hot"` or `"cold"`.
pub fn validate_tier(tier: &str) -> Result<(), CoreError> {
    if VALID_TIERS.contains(&tier) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid tier '{tier}'. Must be one of: {VALID_TIERS:?}"
        )))
    }
}

// ---------------------------------------------------------------------------
// Backend config validation
// ---------------------------------------------------------------------------

/// Validate that `config` contains the required keys for `backend_type`.
///
/// - `local`: requires `base_path` (string)
/// - `s3`: requires `bucket` (string) and `region` (string)
/// - `nfs`: requires `mount_path` (string)
pub fn validate_backend_config(
    backend_type: &str,
    config: &serde_json::Value,
) -> Result<(), CoreError> {
    let obj = config
        .as_object()
        .ok_or_else(|| CoreError::Validation("Backend config must be a JSON object".into()))?;

    match backend_type {
        "local" => {
            require_string_field(obj, "base_path", "local")?;
        }
        "s3" => {
            require_string_field(obj, "bucket", "s3")?;
            require_string_field(obj, "region", "s3")?;
        }
        "nfs" => {
            require_string_field(obj, "mount_path", "nfs")?;
        }
        other => {
            return Err(CoreError::Validation(format!(
                "Unknown backend type '{other}'. Must be one of: local, s3, nfs"
            )));
        }
    }

    Ok(())
}

/// Helper: ensure an object has a non-empty string field.
fn require_string_field(
    obj: &serde_json::Map<String, serde_json::Value>,
    field: &str,
    backend_type: &str,
) -> Result<(), CoreError> {
    match obj.get(field) {
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => Ok(()),
        _ => Err(CoreError::Validation(format!(
            "Backend type '{backend_type}' requires a non-empty string field '{field}' in config"
        ))),
    }
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Storage backend type enum matching `storage_backend_types` seed data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageBackendType {
    Local = 1,
    S3 = 2,
    Nfs = 3,
}

impl StorageBackendType {
    /// Parse from the database `name` column.
    pub fn from_name(name: &str) -> Result<Self, CoreError> {
        match name {
            "local" => Ok(Self::Local),
            "s3" => Ok(Self::S3),
            "nfs" => Ok(Self::Nfs),
            other => Err(CoreError::Validation(format!(
                "Unknown storage backend type '{other}'"
            ))),
        }
    }

    /// Human-readable label.
    pub fn label(self) -> &'static str {
        match self {
            Self::Local => "Local Filesystem",
            Self::S3 => "Amazon S3 / Compatible",
            Self::Nfs => "Network File System",
        }
    }

    /// Database name value.
    pub fn name(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::S3 => "s3",
            Self::Nfs => "nfs",
        }
    }
}

// NOTE: StorageBackendStatus and StorageMigrationStatus live in
// `x121_db::models::status` (defined via `define_status_enum!` macro).
// They are NOT duplicated here -- the db crate is the canonical source (DRY-220).

// ---------------------------------------------------------------------------
// Retrieval time estimator
// ---------------------------------------------------------------------------

/// Rough estimate of retrieval time in seconds based on file size.
///
/// Assumes ~100 MB/s for hot storage and ~10 MB/s for cold storage.
/// Returns at least 1 second.
pub fn estimate_retrieval_time_secs(file_size_bytes: u64, tier: &str) -> u64 {
    let bytes_per_sec: u64 = match tier {
        TIER_HOT => 100 * 1024 * 1024, // ~100 MB/s
        TIER_COLD => 10 * 1024 * 1024, // ~10 MB/s
        _ => 10 * 1024 * 1024,         // default to cold speed
    };
    (file_size_bytes / bytes_per_sec).max(1)
}

// ---------------------------------------------------------------------------
// Pipeline-scoped storage paths (PRD-141)
// ---------------------------------------------------------------------------

/// Build a pipeline-scoped storage key by prepending the pipeline code.
///
/// New format: `{pipeline_code}/{rest_of_key}`
/// Old format: `{rest_of_key}` (no prefix)
///
/// # Examples
///
/// ```
/// use x121_core::storage::pipeline_scoped_key;
/// assert_eq!(pipeline_scoped_key("x121", "variants/file.png"), "x121/variants/file.png");
/// ```
pub fn pipeline_scoped_key(pipeline_code: &str, key: &str) -> String {
    format!("{pipeline_code}/{key}")
}

/// Resolve a storage key with backward-compatible fallback for pre-migration files.
///
/// Tries the key as-is first. If the file does not exist, strips the first path
/// segment (assumed to be a pipeline code) and tries the remainder. This allows
/// newly written pipeline-prefixed keys to coexist with legacy un-prefixed keys.
///
/// Returns the key that should be used for the lookup (not a full filesystem path).
pub async fn resolve_storage_key(provider: &dyn StorageProvider, key: &str) -> String {
    // Try the key verbatim first.
    if provider.exists(key).await.unwrap_or(false) {
        return key.to_string();
    }

    // Fallback: strip the first segment (pipeline code) and try the legacy path.
    if let Some((_pipeline, rest)) = key.split_once('/') {
        if provider.exists(rest).await.unwrap_or(false) {
            return rest.to_string();
        }
    }

    // Neither exists — return the original key (will 404 naturally).
    key.to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_tier_hot() {
        assert!(validate_tier("hot").is_ok());
    }

    #[test]
    fn validate_tier_cold() {
        assert!(validate_tier("cold").is_ok());
    }

    #[test]
    fn validate_tier_invalid() {
        assert!(validate_tier("warm").is_err());
        assert!(validate_tier("").is_err());
    }

    #[test]
    fn validate_local_config_valid() {
        let config = serde_json::json!({ "base_path": "/data/storage" });
        assert!(validate_backend_config("local", &config).is_ok());
    }

    #[test]
    fn validate_local_config_missing_base_path() {
        let config = serde_json::json!({});
        assert!(validate_backend_config("local", &config).is_err());
    }

    #[test]
    fn validate_s3_config_valid() {
        let config = serde_json::json!({ "bucket": "my-bucket", "region": "us-east-1" });
        assert!(validate_backend_config("s3", &config).is_ok());
    }

    #[test]
    fn validate_s3_config_missing_region() {
        let config = serde_json::json!({ "bucket": "my-bucket" });
        assert!(validate_backend_config("s3", &config).is_err());
    }

    #[test]
    fn validate_nfs_config_valid() {
        let config = serde_json::json!({ "mount_path": "/mnt/nfs/share" });
        assert!(validate_backend_config("nfs", &config).is_ok());
    }

    #[test]
    fn validate_nfs_config_missing_mount_path() {
        let config = serde_json::json!({});
        assert!(validate_backend_config("nfs", &config).is_err());
    }

    #[test]
    fn validate_unknown_backend_type() {
        let config = serde_json::json!({});
        assert!(validate_backend_config("ftp", &config).is_err());
    }

    #[test]
    fn validate_config_not_object() {
        let config = serde_json::json!("not an object");
        assert!(validate_backend_config("local", &config).is_err());
    }

    #[test]
    fn backend_type_from_name() {
        assert_eq!(
            StorageBackendType::from_name("local").unwrap(),
            StorageBackendType::Local
        );
        assert_eq!(
            StorageBackendType::from_name("s3").unwrap(),
            StorageBackendType::S3
        );
        assert_eq!(
            StorageBackendType::from_name("nfs").unwrap(),
            StorageBackendType::Nfs
        );
        assert!(StorageBackendType::from_name("ftp").is_err());
    }

    #[test]
    fn backend_type_labels() {
        assert_eq!(StorageBackendType::Local.label(), "Local Filesystem");
        assert_eq!(StorageBackendType::S3.label(), "Amazon S3 / Compatible");
        assert_eq!(StorageBackendType::Nfs.label(), "Network File System");
    }

    #[test]
    fn retrieval_time_hot() {
        // 1 GiB at ~100 MB/s ≈ 10 seconds
        let secs = estimate_retrieval_time_secs(1024 * 1024 * 1024, "hot");
        assert!(secs >= 9 && secs <= 11);
    }

    #[test]
    fn retrieval_time_cold() {
        // 1 GiB at ~10 MB/s ≈ 100 seconds
        let secs = estimate_retrieval_time_secs(1024 * 1024 * 1024, "cold");
        assert!(secs >= 95 && secs <= 105);
    }

    #[test]
    fn retrieval_time_minimum_is_one() {
        assert_eq!(estimate_retrieval_time_secs(0, "hot"), 1);
        assert_eq!(estimate_retrieval_time_secs(100, "cold"), 1);
    }

    #[test]
    fn pipeline_scoped_key_prefixes_code() {
        assert_eq!(
            pipeline_scoped_key("x121", "variants/file.png"),
            "x121/variants/file.png"
        );
    }

    #[test]
    fn pipeline_scoped_key_nested_path() {
        assert_eq!(
            pipeline_scoped_key("y122", "thumbnails/scene/1/frame.jpg"),
            "y122/thumbnails/scene/1/frame.jpg"
        );
    }

    // Status enum ID tests live in x121_db::models::status (DRY-220).
}
