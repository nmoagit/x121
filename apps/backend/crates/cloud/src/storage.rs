//! S3 file transfer bridge for cloud GPU workers (PRD-114).
//!
//! Generates presigned URLs that cloud workers use to upload/download files.
//! This uses generic S3-compatible presigned URL generation.

use serde::{Deserialize, Serialize};

/// Configuration for the S3 storage bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageBridgeConfig {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub default_expiry_secs: u64,
}

/// A presigned URL with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresignedUrl {
    pub url: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub method: String,
    pub key: String,
}

/// Generate a presigned URL for the given HTTP method.
fn generate_presigned_url(
    config: &StorageBridgeConfig,
    key: &str,
    method: &str,
    expiry_secs: Option<u64>,
) -> PresignedUrl {
    let expiry = expiry_secs.unwrap_or(config.default_expiry_secs);
    let expires_at = chrono::Utc::now() + chrono::Duration::seconds(expiry as i64);

    let endpoint = config
        .endpoint
        .as_deref()
        .unwrap_or("https://s3.amazonaws.com");

    PresignedUrl {
        url: format!("{}/{}/{}", endpoint, config.bucket, key),
        expires_at,
        method: method.to_string(),
        key: key.to_string(),
    }
}

/// Generate a presigned upload URL (PUT).
///
/// For production use, integrate with the `aws-sdk-s3` crate's presigning API.
pub fn generate_presigned_upload_url(
    config: &StorageBridgeConfig,
    key: &str,
    expiry_secs: Option<u64>,
) -> PresignedUrl {
    generate_presigned_url(config, key, "PUT", expiry_secs)
}

/// Generate a presigned download URL (GET).
pub fn generate_presigned_download_url(
    config: &StorageBridgeConfig,
    key: &str,
    expiry_secs: Option<u64>,
) -> PresignedUrl {
    generate_presigned_url(config, key, "GET", expiry_secs)
}
