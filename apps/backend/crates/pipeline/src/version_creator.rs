//! Create scene video versions from completed pipeline runs.
//!
//! Translates a [`CompletionResult`] (with downloaded artifacts) into a
//! `scene_video_version` row plus associated `scene_video_version_artifact`
//! rows for any intermediate outputs.

use x121_core::clip_qa::CLIP_SOURCE_GENERATED;
use x121_core::types::DbId;
use x121_db::models::scene_video_version::{CreateSceneVideoVersion, SceneVideoVersion};
use x121_db::models::scene_video_version_artifact::CreateArtifact;
use x121_db::repositories::{SceneVideoVersionArtifactRepo, SceneVideoVersionRepo};

use crate::completion_handler::{CompletionResult, DownloadedArtifact};
use crate::error::PipelineError;
use crate::output_classifier::OutputRole;

/// Create a `scene_video_version` from a completed pipeline run.
///
/// 1. Creates the version row with source `"generated"` and `is_final = false`.
/// 2. For each intermediate artifact in `completion.downloaded_artifacts`,
///    creates a `scene_video_version_artifact` row.
/// 3. Returns the newly created version.
pub async fn create_version_from_completion(
    pool: &sqlx::PgPool,
    scene_id: DbId,
    completion: &CompletionResult,
    generation_snapshot: Option<serde_json::Value>,
) -> Result<SceneVideoVersion, PipelineError> {
    // 1. Find the Final artifact for file size.
    let final_artifact = completion
        .downloaded_artifacts
        .iter()
        .find(|a| a.classified.role == OutputRole::Final);

    let file_size_bytes = final_artifact.map(|a| a.file_size_bytes);

    // 2. Create the version row.
    let input = CreateSceneVideoVersion {
        scene_id,
        source: CLIP_SOURCE_GENERATED.to_string(),
        file_path: completion.output_video_path.clone(),
        file_size_bytes,
        duration_secs: Some(completion.duration_secs),
        is_final: Some(false),
        notes: None,
        generation_snapshot,
    };

    let version = SceneVideoVersionRepo::create(pool, &input)
        .await
        .map_err(PipelineError::Database)?;

    // 3. Create artifact rows for intermediate outputs.
    let intermediate_artifacts: Vec<&DownloadedArtifact> = completion
        .downloaded_artifacts
        .iter()
        .filter(|a| a.classified.role == OutputRole::Intermediate)
        .collect();

    for artifact in &intermediate_artifacts {
        let create = CreateArtifact {
            version_id: version.id,
            role: artifact.classified.role.as_str().to_string(),
            label: artifact.classified.label.clone(),
            node_id: Some(artifact.classified.node_id.clone()),
            file_path: artifact.storage_key.clone(),
            file_size_bytes: Some(artifact.file_size_bytes),
            duration_secs: artifact.duration_secs,
            width: None,
            height: None,
            sort_order: Some(artifact.classified.sort_order as i32),
        };

        if let Err(e) = SceneVideoVersionArtifactRepo::create(pool, &create).await {
            tracing::warn!(
                version_id = version.id,
                node_id = %artifact.classified.node_id,
                error = %e,
                "Failed to create artifact record — skipping",
            );
        }
    }

    tracing::info!(
        version_id = version.id,
        scene_id,
        version_number = version.version_number,
        artifact_count = intermediate_artifacts.len(),
        "Created scene video version from pipeline completion",
    );

    Ok(version)
}
