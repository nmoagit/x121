use crate::types::DbId;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("Entity not found: {entity} with id {id}")]
    NotFound { entity: &'static str, id: DbId },

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Storage connection failed: {0}")]
    StorageConnectionFailed(String),

    #[error("Storage object not found: {0}")]
    StorageObjectNotFound(String),

    #[error("Storage permission denied: {0}")]
    StoragePermissionDenied(String),

    #[error("Storage bucket not found: {0}")]
    StorageBucketNotFound(String),

    #[error("Storage I/O error: {0}")]
    StorageIo(String),
}
