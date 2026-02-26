//! Handlers for the metadata preview, regeneration, and staleness endpoints
//! (PRD-13).
//!
//! Metadata JSON is generated on-the-fly from database records. The
//! regeneration endpoints additionally persist a generation record in the
//! `metadata_generations` table.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::metadata::{
    self, BiographicalData, CharacterMetadata, PhysicalAttributes, ProvenanceInfo, SegmentInfo,
    VideoMetadata, VideoTechnicalInfo, CHARACTER_SCHEMA_VERSION, ENTITY_TYPE_CHARACTER,
    FILE_TYPE_CHARACTER, VIDEO_SCHEMA_VERSION,
};
use x121_core::types::DbId;
use x121_db::models::metadata::{CreateMetadataGeneration, RegenerationReport, StaleMetadata};
use x121_db::repositories::{CharacterRepo, MetadataGenerationRepo, SceneRepo, SegmentRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Typed response structs (DRY-176)
// ---------------------------------------------------------------------------

/// Response for a single character metadata regeneration.
#[derive(Debug, Serialize)]
struct RegenerateResponse {
    status: &'static str,
    character_id: DbId,
}

/// Response for the stale metadata endpoint.
#[derive(Debug, Serialize)]
struct StaleResponse {
    stale_character_metadata: Vec<StaleMetadata>,
    stale_video_metadata: Vec<StaleMetadata>,
}

// ---------------------------------------------------------------------------
// Internal: build metadata structs from DB
// ---------------------------------------------------------------------------

/// Build a `CharacterMetadata` struct from database records.
async fn build_character_metadata(
    pool: &sqlx::PgPool,
    character_id: DbId,
) -> AppResult<CharacterMetadata> {
    let character = CharacterRepo::find_by_id(pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    // Fetch the project name.
    let project = x121_db::repositories::ProjectRepo::find_by_id(pool, character.project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: character.project_id,
        }))?;

    // Extract biographical data from the character's metadata JSON.
    let (bio, physical) = extract_bio_and_physical(&character.metadata);

    let now = chrono::Utc::now();
    Ok(CharacterMetadata {
        schema_version: CHARACTER_SCHEMA_VERSION.to_string(),
        character_id: character.id,
        name: character.name,
        project_id: character.project_id,
        project_name: project.name,
        biographical: bio,
        physical_attributes: physical,
        source_image: None,
        derived_images: Vec::new(),
        custom_fields: character.metadata.clone(),
        generated_at: now.to_rfc3339(),
        source_updated_at: character.updated_at.to_rfc3339(),
    })
}

/// Extract biographical and physical attribute data from the character's
/// optional metadata JSONB column.
fn extract_bio_and_physical(
    meta: &Option<serde_json::Value>,
) -> (BiographicalData, PhysicalAttributes) {
    let bio = meta
        .as_ref()
        .and_then(|m| m.get("biographical"))
        .and_then(|b| serde_json::from_value::<BiographicalData>(b.clone()).ok())
        .unwrap_or(BiographicalData {
            description: None,
            tags: Vec::new(),
        });

    let physical = meta
        .as_ref()
        .and_then(|m| m.get("physical_attributes"))
        .and_then(|p| serde_json::from_value::<PhysicalAttributes>(p.clone()).ok())
        .unwrap_or(PhysicalAttributes {
            height: None,
            build: None,
            hair_color: None,
            eye_color: None,
        });

    (bio, physical)
}

/// Build a `VideoMetadata` struct from database records.
async fn build_video_metadata(pool: &sqlx::PgPool, scene_id: DbId) -> AppResult<VideoMetadata> {
    let scene = SceneRepo::find_by_id(pool, scene_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id: scene_id,
        }))?;

    let character = CharacterRepo::find_by_id(pool, scene.character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: scene.character_id,
        }))?;

    let segments = SegmentRepo::list_by_scene(pool, scene_id).await?;

    let segment_infos: Vec<SegmentInfo> = segments
        .iter()
        .map(|s| SegmentInfo {
            segment_id: s.id,
            sequence_index: s.sequence_index,
            seed_frame_path: s.seed_frame_path.clone().unwrap_or_default(),
            output_video_path: s.output_video_path.clone().unwrap_or_default(),
            last_frame_path: s.last_frame_path.clone().unwrap_or_default(),
            status: format!("{}", s.status_id),
        })
        .collect();

    let now = chrono::Utc::now();
    Ok(VideoMetadata {
        schema_version: VIDEO_SCHEMA_VERSION.to_string(),
        scene_id: scene.id,
        character_id: scene.character_id,
        character_name: character.name,
        scene_type: format!("{}", scene.scene_type_id),
        technical: VideoTechnicalInfo {
            duration_seconds: 0.0,
            resolution: "unknown".to_string(),
            codec: "unknown".to_string(),
            fps: 0.0,
            segment_count: segment_infos.len() as i32,
        },
        segments: segment_infos,
        provenance: ProvenanceInfo {
            workflow_name: "default".to_string(),
            model_version: None,
            lora_versions: Vec::new(),
            generation_parameters: serde_json::Value::Object(serde_json::Map::new()),
        },
        quality_scores: None,
        generated_at: now.to_rfc3339(),
        source_updated_at: scene.updated_at.to_rfc3339(),
    })
}

// ---------------------------------------------------------------------------
// Internal: persist a generation record (DRY-168)
// ---------------------------------------------------------------------------

/// Serialize metadata, hash it, and upsert a generation record.
async fn upsert_generation(
    pool: &sqlx::PgPool,
    entity_type: &str,
    entity_id: DbId,
    file_type: &str,
    schema_version: &str,
    source_updated_at: chrono::DateTime<chrono::Utc>,
    metadata: &impl serde::Serialize,
) -> AppResult<()> {
    let json_str = metadata::serialize_metadata(metadata)
        .map_err(|e| AppError::InternalError(format!("Serialization failed: {e}")))?;
    let file_hash = metadata::sha256_hex(json_str.as_bytes());

    let input = CreateMetadataGeneration {
        entity_type: entity_type.to_string(),
        entity_id,
        file_type: file_type.to_string(),
        file_path: format!("{entity_type}_{entity_id}/{file_type}.json"),
        source_updated_at,
        schema_version: schema_version.to_string(),
        file_hash,
    };

    MetadataGenerationRepo::upsert(pool, &input).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/characters/{character_id}/metadata/preview
///
/// Returns the current character metadata JSON without persisting a generation
/// record.
pub async fn preview_character_metadata(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let meta = build_character_metadata(&state.pool, character_id).await?;
    Ok(Json(DataResponse { data: meta }))
}

/// GET /api/v1/scenes/{scene_id}/metadata/preview
///
/// Returns the current video metadata JSON without persisting a generation
/// record.
pub async fn preview_video_metadata(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let meta = build_video_metadata(&state.pool, scene_id).await?;
    Ok(Json(DataResponse { data: meta }))
}

/// POST /api/v1/characters/{character_id}/metadata/regenerate
///
/// Generates character metadata and records the generation in the
/// `metadata_generations` table.
pub async fn regenerate_character_metadata(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let meta = build_character_metadata(&state.pool, character_id).await?;

    let source_updated_at = chrono::DateTime::parse_from_rfc3339(&meta.source_updated_at)
        .map_err(|e| AppError::InternalError(format!("Timestamp parse failed: {e}")))?
        .with_timezone(&chrono::Utc);

    upsert_generation(
        &state.pool,
        ENTITY_TYPE_CHARACTER,
        character_id,
        FILE_TYPE_CHARACTER,
        CHARACTER_SCHEMA_VERSION,
        source_updated_at,
        &meta,
    )
    .await?;

    Ok(Json(DataResponse {
        data: RegenerateResponse {
            status: "regenerated",
            character_id,
        },
    }))
}

/// Request body for project-level metadata regeneration.
#[derive(Debug, Deserialize)]
pub struct RegenerateProjectRequest {
    pub stale_only: Option<bool>,
}

/// POST /api/v1/projects/{project_id}/metadata/regenerate
///
/// Batch-regenerates metadata for all characters in a project. Accepts a
/// `stale_only` flag to skip up-to-date entries.
pub async fn regenerate_project_metadata(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(body): Json<RegenerateProjectRequest>,
) -> AppResult<impl IntoResponse> {
    let stale_only = body.stale_only.unwrap_or(false);
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;

    let mut report = RegenerationReport::default();

    for character in &characters {
        // If stale_only, check whether the generation is actually stale.
        if stale_only {
            let existing = MetadataGenerationRepo::find_by_entity(
                &state.pool,
                ENTITY_TYPE_CHARACTER,
                character.id,
                FILE_TYPE_CHARACTER,
            )
            .await?;

            if let Some(gen) = existing {
                if !metadata::is_stale(&gen.source_updated_at, &character.updated_at) {
                    report.skipped += 1;
                    continue;
                }
            }
        }

        // Generate and persist.
        match build_character_metadata(&state.pool, character.id).await {
            Ok(meta) => {
                if upsert_generation(
                    &state.pool,
                    ENTITY_TYPE_CHARACTER,
                    character.id,
                    FILE_TYPE_CHARACTER,
                    CHARACTER_SCHEMA_VERSION,
                    character.updated_at,
                    &meta,
                )
                .await
                .is_ok()
                {
                    report.regenerated += 1;
                } else {
                    report.failed += 1;
                }
            }
            Err(_) => {
                report.failed += 1;
            }
        }
    }

    Ok(Json(DataResponse { data: report }))
}

/// GET /api/v1/projects/{project_id}/metadata/stale
///
/// Returns all stale metadata entries for a given project, grouped by
/// character metadata and video metadata.
pub async fn get_stale_metadata(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let stale_characters = MetadataGenerationRepo::find_stale_characters(&state.pool).await?;
    let stale_scenes = MetadataGenerationRepo::find_stale_scenes(&state.pool).await?;

    // Filter to the requested project's entities.
    let project_character_ids: Vec<DbId> = CharacterRepo::list_by_project(&state.pool, project_id)
        .await?
        .iter()
        .map(|c| c.id)
        .collect();

    let filtered_characters: Vec<StaleMetadata> = stale_characters
        .into_iter()
        .filter(|s| project_character_ids.contains(&s.entity_id))
        .collect();

    // For scenes, resolve via character_id by collecting scenes per character.
    let mut project_scene_ids: Vec<DbId> = Vec::new();
    for char_id in &project_character_ids {
        if let Ok(scenes) = SceneRepo::list_by_character(&state.pool, *char_id).await {
            project_scene_ids.extend(scenes.iter().map(|s| s.id));
        }
    }

    let filtered_scenes: Vec<StaleMetadata> = stale_scenes
        .into_iter()
        .filter(|s| project_scene_ids.contains(&s.entity_id))
        .collect();

    Ok(Json(DataResponse {
        data: StaleResponse {
            stale_character_metadata: filtered_characters,
            stale_video_metadata: filtered_scenes,
        },
    }))
}
