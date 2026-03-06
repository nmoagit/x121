//! Pipeline-specific error types.

use thiserror::Error;

/// Errors that can occur during pipeline operations.
#[derive(Debug, Error)]
pub enum PipelineError {
    /// A database query failed.
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    /// Failed to build the ComfyUI workflow JSON.
    #[error("Workflow build error: {0}")]
    WorkflowBuild(String),

    /// A required configuration value is missing.
    #[error("Missing configuration: {0}")]
    MissingConfig(String),

    /// An error from the core domain layer.
    #[error("Core error: {0}")]
    Core(#[from] x121_core::error::CoreError),

    /// Failed to download output from ComfyUI.
    #[error("Output download error: {0}")]
    Download(String),

    /// ComfyUI manager or API error.
    #[error("ComfyUI error: {0}")]
    ComfyUI(String),
}
