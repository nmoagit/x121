//! Local filesystem storage provider (PRD-122).
//!
//! Stores objects as plain files under a configurable root directory.
//! Path traversal is prevented by rejecting `..` components and
//! canonicalizing resolved paths.

use std::path::PathBuf;

use async_trait::async_trait;

use super::{StorageObject, StorageProvider};
use crate::error::CoreError;

/// A [`StorageProvider`] backed by the local filesystem.
pub struct LocalStorageProvider {
    root_dir: PathBuf,
}

impl LocalStorageProvider {
    /// Create a new provider rooted at `root_dir`.
    ///
    /// Creates the directory (and parents) if it does not already exist,
    /// then canonicalizes the path so all subsequent checks use absolute paths.
    pub fn new(root_dir: PathBuf) -> Result<Self, CoreError> {
        std::fs::create_dir_all(&root_dir).map_err(|e| {
            CoreError::StorageIo(format!(
                "Failed to create root dir {}: {e}",
                root_dir.display()
            ))
        })?;
        let root_dir = root_dir
            .canonicalize()
            .map_err(|e| CoreError::StorageIo(format!("Failed to canonicalize root dir: {e}")))?;
        Ok(Self { root_dir })
    }

    /// Resolve `key` to an absolute path under `root_dir`, preventing traversal.
    fn resolve_path(&self, key: &str) -> Result<PathBuf, CoreError> {
        // Reject any ".." component to prevent path traversal.
        for component in std::path::Path::new(key).components() {
            if matches!(component, std::path::Component::ParentDir) {
                return Err(CoreError::StoragePermissionDenied(
                    "Path traversal detected".into(),
                ));
            }
        }

        let path = self.root_dir.join(key);

        // For existing paths, canonicalize and verify the prefix.
        if path.exists() {
            let canonical = path
                .canonicalize()
                .map_err(|e| CoreError::StorageIo(format!("Path resolution failed: {e}")))?;
            if !canonical.starts_with(&self.root_dir) {
                return Err(CoreError::StoragePermissionDenied(
                    "Path traversal detected".into(),
                ));
            }
            Ok(canonical)
        } else {
            Ok(path)
        }
    }

    /// Remove empty parent directories between `dir` and `root` (exclusive).
    async fn cleanup_empty_dirs(dir: &std::path::Path, root: &std::path::Path) -> Result<(), ()> {
        let mut current = dir.to_path_buf();
        while current != *root {
            match tokio::fs::read_dir(&current).await {
                Ok(mut entries) => {
                    if entries.next_entry().await.map_err(|_| ())?.is_some() {
                        break; // Directory not empty.
                    }
                    let _ = tokio::fs::remove_dir(&current).await;
                }
                Err(_) => break,
            }
            current = match current.parent() {
                Some(p) => p.to_path_buf(),
                None => break,
            };
        }
        Ok(())
    }

    /// Recursively list files under `dir`, producing relative keys from `root`.
    async fn list_recursive(
        dir: &std::path::Path,
        root: &std::path::Path,
        objects: &mut Vec<StorageObject>,
    ) -> Result<(), CoreError> {
        let mut entries = tokio::fs::read_dir(dir)
            .await
            .map_err(|e| CoreError::StorageIo(format!("Failed to read directory: {e}")))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| CoreError::StorageIo(format!("Failed to read entry: {e}")))?
        {
            let path = entry.path();
            if path.is_dir() {
                Box::pin(Self::list_recursive(&path, root, objects)).await?;
            } else {
                let meta = entry
                    .metadata()
                    .await
                    .map_err(|e| CoreError::StorageIo(format!("Failed to read metadata: {e}")))?;
                let key = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                let last_modified = meta
                    .modified()
                    .ok()
                    .map(chrono::DateTime::<chrono::Utc>::from);
                objects.push(StorageObject {
                    key,
                    size_bytes: meta.len() as i64,
                    last_modified,
                    etag: None,
                });
            }
        }
        Ok(())
    }
}

#[async_trait]
impl StorageProvider for LocalStorageProvider {
    async fn upload(&self, key: &str, data: &[u8]) -> Result<(), CoreError> {
        let path = self.resolve_path(key)?;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| CoreError::StorageIo(format!("Failed to create directories: {e}")))?;
        }
        tokio::fs::write(&path, data)
            .await
            .map_err(|e| CoreError::StorageIo(format!("Failed to write file: {e}")))
    }

    async fn download(&self, key: &str) -> Result<Vec<u8>, CoreError> {
        let path = self.resolve_path(key)?;
        tokio::fs::read(&path).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                CoreError::StorageObjectNotFound(key.to_string())
            } else {
                CoreError::StorageIo(format!("Failed to read file: {e}"))
            }
        })
    }

    async fn delete(&self, key: &str) -> Result<(), CoreError> {
        let path = self.resolve_path(key)?;
        tokio::fs::remove_file(&path).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                CoreError::StorageObjectNotFound(key.to_string())
            } else {
                CoreError::StorageIo(format!("Failed to delete file: {e}"))
            }
        })?;
        // Clean up empty parent dirs between the file and root.
        if let Some(parent) = path.parent() {
            let _ = Self::cleanup_empty_dirs(parent, &self.root_dir).await;
        }
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CoreError> {
        let path = self.resolve_path(key)?;
        Ok(tokio::fs::try_exists(&path).await.unwrap_or(false))
    }

    async fn list(&self, prefix: &str) -> Result<Vec<StorageObject>, CoreError> {
        let dir = self.resolve_path(prefix)?;
        let mut objects = Vec::new();
        if !dir.exists() {
            return Ok(objects);
        }
        Self::list_recursive(&dir, &self.root_dir, &mut objects).await?;
        Ok(objects)
    }

    async fn presigned_url(&self, key: &str, _expiry_secs: u64) -> Result<String, CoreError> {
        let path = self.resolve_path(key)?;
        Ok(format!("file://{}", path.display()))
    }

    async fn test_connection(&self) -> Result<(), CoreError> {
        let test_file = self.root_dir.join(".storage_test");
        tokio::fs::write(&test_file, b"test").await.map_err(|e| {
            CoreError::StorageConnectionFailed(format!("Root dir not writable: {e}"))
        })?;
        tokio::fs::remove_file(&test_file)
            .await
            .map_err(|e| CoreError::StorageIo(format!("Failed to remove test file: {e}")))?;
        Ok(())
    }
}
