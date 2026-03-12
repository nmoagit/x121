//! Pipeline-specific error types and shared lookup helpers.

use thiserror::Error;
use x121_core::types::DbId;
use x121_db::models::scene::Scene;
use x121_db::models::scene_type::SceneType;
use x121_db::repositories::{SceneRepo, SceneTypeRepo};

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

    /// No ComfyUI instances are currently connected.
    ///
    /// Unlike other errors, this is a transient condition: the job should
    /// remain `Pending` (not `Failed`) so the dispatcher can pick it up
    /// once an instance becomes available.
    #[error("No ComfyUI instances available — job queued for dispatch")]
    NoInstances,
}

// ---------------------------------------------------------------------------
// Shared lookup helpers
// ---------------------------------------------------------------------------

/// Fetch a scene and its associated scene type in one call.
///
/// Returns `PipelineError::MissingConfig` if either entity is not found.
/// Used by `context_loader` and `loop_driver` to avoid duplicating the
/// fetch-and-unwrap pair.
pub async fn load_scene_and_type(
    pool: &sqlx::PgPool,
    scene_id: DbId,
) -> Result<(Scene, SceneType), PipelineError> {
    let scene = SceneRepo::find_by_id(pool, scene_id)
        .await?
        .ok_or_else(|| PipelineError::MissingConfig(format!("Scene {scene_id} not found")))?;

    let scene_type = SceneTypeRepo::find_by_id(pool, scene.scene_type_id)
        .await?
        .ok_or_else(|| {
            PipelineError::MissingConfig(format!("SceneType {} not found", scene.scene_type_id))
        })?;

    Ok((scene, scene_type))
}
