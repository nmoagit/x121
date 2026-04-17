//! Source file reader for the server-side import engine (PRD-165).
//!
//! Abstracts over local filesystem paths and `s3://bucket/key` URIs so the
//! import phases (images, videos, metadata) can read bytes from wherever
//! the directory scan found them without branching at each call site.

use crate::error::CoreError;
use crate::storage::StorageProvider;

/// Read all bytes of a source file located either on the local filesystem
/// or in S3.
///
/// - Local paths are read via `tokio::fs::read`.
/// - `s3://bucket/key` paths are fetched through the supplied
///   [`StorageProvider`]. The provider must be configured with the
///   matching bucket / credentials; the leading `s3://bucket/` prefix is
///   stripped before it is passed to `provider.download()`.
///
/// Returns a clear error when an S3 URI is provided but no provider is
/// supplied, when the URI is malformed, or when the local file cannot be
/// read.
pub async fn read_source_file(
    path: &str,
    s3_provider: Option<&dyn StorageProvider>,
) -> Result<Vec<u8>, CoreError> {
    if let Some(rest) = path.strip_prefix("s3://") {
        // rest = "bucket/key..." — strip the first path segment (bucket).
        let key = rest
            .split_once('/')
            .map(|(_bucket, key)| key)
            .ok_or_else(|| {
                CoreError::Validation(format!("Invalid S3 URI (missing key): {path}"))
            })?;
        if key.is_empty() {
            return Err(CoreError::Validation(format!(
                "Invalid S3 URI (empty key): {path}"
            )));
        }
        let provider = s3_provider.ok_or_else(|| {
            CoreError::Validation(
                "S3 provider not supplied for s3:// source path".to_string(),
            )
        })?;
        provider.download(key).await
    } else {
        tokio::fs::read(path).await.map_err(|e| {
            CoreError::Internal(format!("Failed to read source file '{path}': {e}"))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn reads_local_file() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("hello.txt");
        tokio::fs::write(&path, b"hello world").await.unwrap();
        let data = read_source_file(path.to_str().unwrap(), None).await.unwrap();
        assert_eq!(data, b"hello world");
    }

    #[tokio::test]
    async fn s3_uri_without_provider_errors() {
        let err = read_source_file("s3://bucket/key.png", None)
            .await
            .expect_err("expected error");
        assert!(matches!(err, CoreError::Validation(_)));
    }

    #[tokio::test]
    async fn invalid_s3_uri_errors() {
        // No '/' after the bucket part.
        let err = read_source_file("s3://bucket-only", None)
            .await
            .expect_err("expected error");
        assert!(matches!(err, CoreError::Validation(_)));
    }

    #[tokio::test]
    async fn missing_local_file_errors() {
        let err = read_source_file("/nonexistent/does/not/exist.txt", None)
            .await
            .expect_err("expected error");
        assert!(matches!(err, CoreError::Internal(_)));
    }
}
