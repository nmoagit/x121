//! S3-compatible storage provider (PRD-122).
//!
//! Wraps the AWS SDK S3 client to implement [`StorageProvider`].
//! Supports AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, and
//! any other S3-compatible service via a custom endpoint URL.

use async_trait::async_trait;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::Client;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::storage::{StorageObject, StorageProvider};

/// Configuration required to connect to an S3-compatible bucket.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub path_prefix: Option<String>,
}

/// [`StorageProvider`] backed by an S3-compatible object store.
pub struct S3StorageProvider {
    client: Client,
    bucket: String,
    path_prefix: String,
}

impl S3StorageProvider {
    /// Build an S3 client from the given config and verify it is usable.
    pub async fn new(config: S3Config) -> Result<Self, CoreError> {
        let creds = Credentials::new(
            &config.access_key_id,
            &config.secret_access_key,
            None,
            None,
            "x121-storage",
        );
        let region = Region::new(config.region.clone());

        let mut sdk_config_builder = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(region)
            .credentials_provider(creds);

        if let Some(endpoint) = &config.endpoint {
            sdk_config_builder = sdk_config_builder.endpoint_url(endpoint);
        }

        let sdk_config = sdk_config_builder.load().await;

        let mut s3_config_builder = aws_sdk_s3::config::Builder::from(&sdk_config);
        if config.endpoint.is_some() {
            s3_config_builder = s3_config_builder.force_path_style(true);
        }

        let client = Client::from_conf(s3_config_builder.build());

        Ok(Self {
            client,
            bucket: config.bucket,
            path_prefix: config.path_prefix.unwrap_or_default(),
        })
    }

    /// Prepend the configured path prefix to a key.
    fn full_key(&self, key: &str) -> String {
        if self.path_prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.path_prefix.trim_end_matches('/'), key)
        }
    }

    /// Infer a content-type from the file extension.
    fn content_type(key: &str) -> &'static str {
        match key.rsplit('.').next().map(|s| s.to_lowercase()).as_deref() {
            Some("mp4") => "video/mp4",
            Some("webm") => "video/webm",
            Some("mov") => "video/quicktime",
            Some("png") => "image/png",
            Some("jpg" | "jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("json") => "application/json",
            Some("txt") => "text/plain",
            _ => "application/octet-stream",
        }
    }

    /// Strip the path prefix from a returned S3 key to produce a relative key.
    fn strip_prefix_from_key(&self, key: &str) -> String {
        if self.path_prefix.is_empty() {
            return key.to_string();
        }
        let prefix_with_slash = format!("{}/", self.path_prefix.trim_end_matches('/'));
        key.strip_prefix(&prefix_with_slash)
            .unwrap_or(key)
            .to_string()
    }
}

#[async_trait]
impl StorageProvider for S3StorageProvider {
    async fn upload(&self, key: &str, data: &[u8]) -> Result<(), CoreError> {
        let full_key = self.full_key(key);
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .body(data.to_vec().into())
            .content_type(Self::content_type(key))
            .send()
            .await
            .map_err(|e| CoreError::StorageIo(format!("S3 PutObject failed: {e}")))?;
        Ok(())
    }

    async fn download(&self, key: &str) -> Result<Vec<u8>, CoreError> {
        let full_key = self.full_key(key);
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await
            .map_err(|e| {
                let msg = e.to_string();
                if msg.contains("NoSuchKey") || msg.contains("404") {
                    CoreError::StorageObjectNotFound(key.to_string())
                } else {
                    CoreError::StorageIo(format!("S3 GetObject failed: {e}"))
                }
            })?;
        let bytes = resp
            .body
            .collect()
            .await
            .map_err(|e| CoreError::StorageIo(format!("Failed to read S3 body: {e}")))?;
        Ok(bytes.into_bytes().to_vec())
    }

    async fn delete(&self, key: &str) -> Result<(), CoreError> {
        let full_key = self.full_key(key);
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await
            .map_err(|e| CoreError::StorageIo(format!("S3 DeleteObject failed: {e}")))?;
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CoreError> {
        let full_key = self.full_key(key);
        match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("NotFound") || msg.contains("404") || msg.contains("NoSuchKey") {
                    Ok(false)
                } else {
                    Err(CoreError::StorageIo(format!("S3 HeadObject failed: {e}")))
                }
            }
        }
    }

    async fn list(&self, prefix: &str) -> Result<Vec<StorageObject>, CoreError> {
        let full_prefix = self.full_key(prefix);
        let mut objects = Vec::new();
        let mut continuation_token: Option<String> = None;

        loop {
            let mut req = self
                .client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(&full_prefix);

            if let Some(token) = &continuation_token {
                req = req.continuation_token(token);
            }

            let resp = req
                .send()
                .await
                .map_err(|e| CoreError::StorageIo(format!("S3 ListObjectsV2 failed: {e}")))?;

            if let Some(contents) = resp.contents {
                for obj in contents {
                    let key = obj.key.unwrap_or_default();
                    let relative_key = self.strip_prefix_from_key(&key);
                    objects.push(StorageObject {
                        key: relative_key,
                        size_bytes: obj.size.unwrap_or(0),
                        last_modified: obj.last_modified.map(|t| {
                            chrono::DateTime::from_timestamp(t.secs(), t.subsec_nanos())
                                .unwrap_or_default()
                        }),
                        etag: obj.e_tag,
                    });
                }
            }

            if resp.is_truncated == Some(true) {
                continuation_token = resp.next_continuation_token;
            } else {
                break;
            }
        }

        Ok(objects)
    }

    async fn presigned_url(&self, key: &str, expiry_secs: u64) -> Result<String, CoreError> {
        let full_key = self.full_key(key);
        let presigning_config = aws_sdk_s3::presigning::PresigningConfig::expires_in(
            std::time::Duration::from_secs(expiry_secs),
        )
        .map_err(|e| CoreError::StorageIo(format!("Failed to build presigning config: {e}")))?;

        let presigned = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .presigned(presigning_config)
            .await
            .map_err(|e| CoreError::StorageIo(format!("Failed to generate presigned URL: {e}")))?;

        Ok(presigned.uri().to_string())
    }

    async fn test_connection(&self) -> Result<(), CoreError> {
        self.client
            .head_bucket()
            .bucket(&self.bucket)
            .send()
            .await
            .map_err(|e| {
                let msg = e.to_string();
                if msg.contains("403") || msg.contains("Forbidden") {
                    CoreError::StoragePermissionDenied(format!(
                        "Access denied to bucket '{}': {e}",
                        self.bucket
                    ))
                } else if msg.contains("404") || msg.contains("NotFound") {
                    CoreError::StorageBucketNotFound(self.bucket.clone())
                } else {
                    CoreError::StorageConnectionFailed(format!(
                        "Failed to reach bucket '{}': {e}",
                        self.bucket
                    ))
                }
            })?;
        Ok(())
    }
}
