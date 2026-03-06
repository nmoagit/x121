//! Handlers for character metadata version management.
//!
//! Provides endpoints for versioned metadata: generate from source files,
//! create manual versions, activate, reject, and delete.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::metadata_transform::{self, MetadataInput, SOURCE_GENERATED, SOURCE_MANUAL};
use x121_core::types::DbId;
use x121_db::models::character::UpdateCharacter;
use x121_db::models::character_metadata_version::{
    CharacterMetadataVersion, CreateCharacterMetadataVersion, UpdateCharacterMetadataVersion,
};
use x121_db::repositories::{CharacterMetadataVersionRepo, CharacterRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Body for the generate endpoint.
#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub bio_json: Option<serde_json::Value>,
    pub tov_json: Option<serde_json::Value>,
    pub activate: Option<bool>,
}

/// Body for creating a manual version.
#[derive(Debug, Deserialize)]
pub struct CreateManualVersionRequest {
    pub metadata: serde_json::Value,
    pub notes: Option<String>,
    pub activate: Option<bool>,
    /// Override the source label (defaults to "manual"). Allowed: manual, json_import, csv_import.
    pub source: Option<String>,
}

/// Body for rejecting a version.
#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason: String,
}

/// Body for marking active versions as outdated.
#[derive(Debug, Deserialize)]
pub struct MarkOutdatedRequest {
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a metadata version exists, returning the full row.
async fn ensure_version_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<CharacterMetadataVersion> {
    CharacterMetadataVersionRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CharacterMetadataVersion",
                id,
            })
        })
}

/// Verify that a character exists, returning its name.
async fn ensure_character_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<String> {
    let character = CharacterRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(character.name)
}

/// Sync version metadata to `characters.metadata` column.
pub(crate) async fn sync_to_character(
    pool: &sqlx::PgPool,
    character_id: DbId,
    metadata: &serde_json::Value,
) -> AppResult<()> {
    CharacterRepo::update(
        pool,
        character_id,
        &UpdateCharacter {
            name: None,
            status_id: None,
            metadata: Some(metadata.clone()),
            settings: None,
            group_id: None,
        },
    )
    .await?;
    Ok(())
}

/// Create a version, optionally marking it active and syncing to character.
async fn create_version_maybe_activate(
    pool: &sqlx::PgPool,
    character_id: DbId,
    input: &CreateCharacterMetadataVersion,
    metadata: &serde_json::Value,
    activate: bool,
) -> AppResult<CharacterMetadataVersion> {
    if activate {
        let v = CharacterMetadataVersionRepo::create_as_active(pool, input).await?;
        sync_to_character(pool, character_id, metadata).await?;
        Ok(v)
    } else {
        Ok(CharacterMetadataVersionRepo::create(pool, input).await?)
    }
}

/// Build a `CreateCharacterMetadataVersion` for a manual edit.
///
/// When `source_bio` / `source_tov` are `None` they are omitted from the
/// version row.  The `character_metadata` handler passes them so that
/// previously-attached source blobs survive manual edits.
pub(crate) fn build_manual_version_input(
    character_id: DbId,
    metadata: serde_json::Value,
    notes: Option<String>,
    generation_report: Option<serde_json::Value>,
    source_bio: Option<serde_json::Value>,
    source_tov: Option<serde_json::Value>,
) -> CreateCharacterMetadataVersion {
    CreateCharacterMetadataVersion {
        character_id,
        metadata,
        source: SOURCE_MANUAL.to_string(),
        source_bio,
        source_tov,
        generation_report,
        is_active: None,
        notes,
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/characters/{character_id}/metadata/versions
pub async fn list_versions(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let versions =
        CharacterMetadataVersionRepo::list_by_character(&state.pool, character_id).await?;
    Ok(Json(DataResponse { data: versions }))
}

/// GET /api/v1/characters/{character_id}/metadata/versions/{version_id}
pub async fn get_version(
    State(state): State<AppState>,
    Path((_character_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let version = ensure_version_exists(&state.pool, version_id).await?;
    Ok(Json(DataResponse { data: version }))
}

/// POST /api/v1/characters/{character_id}/metadata/versions/generate
///
/// Run the metadata transform engine on bio/tov source files, create a new
/// version with source='generated', and store the generation report.
pub async fn generate_version(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<GenerateRequest>,
) -> AppResult<impl IntoResponse> {
    let char_name = ensure_character_exists(&state.pool, character_id).await?;

    let input = MetadataInput {
        bio: body.bio_json.clone(),
        tov: body.tov_json.clone(),
        name: char_name,
    };

    let result = metadata_transform::generate_metadata_via_python(&input)
        .map_err(|e| AppError::InternalError(format!("Metadata generation failed: {e}")))?;
    let report_json = serde_json::to_value(&result.report)
        .map_err(|e| AppError::InternalError(format!("Failed to serialize report: {e}")))?;

    // Source data lives in the version's source_bio/source_tov columns,
    // NOT embedded in the metadata blob. The delivered metadata.json is clean.
    let create_input = CreateCharacterMetadataVersion {
        character_id,
        metadata: result.metadata.clone(),
        source: SOURCE_GENERATED.to_string(),
        source_bio: body.bio_json,
        source_tov: body.tov_json,
        generation_report: Some(report_json),
        is_active: None,
        notes: None,
    };

    let version = create_version_maybe_activate(
        &state.pool,
        character_id,
        &create_input,
        &result.metadata,
        body.activate.unwrap_or(false),
    )
    .await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

/// POST /api/v1/characters/{character_id}/metadata/versions
///
/// Create a manual metadata version from a form edit.
pub async fn create_manual_version(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<CreateManualVersionRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    // Build a completeness report for this version
    let report_json = metadata_transform::build_report_json(&body.metadata);

    let mut create_input = build_manual_version_input(
        character_id,
        body.metadata.clone(),
        body.notes,
        report_json,
        None,
        None,
    );

    // Allow callers to override source (e.g. json_import, csv_import)
    if let Some(ref src) = body.source {
        create_input.source = src.clone();
    }

    let version = create_version_maybe_activate(
        &state.pool,
        character_id,
        &create_input,
        &body.metadata,
        body.activate.unwrap_or(false),
    )
    .await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

/// PUT /api/v1/characters/{character_id}/metadata/versions/{version_id}/activate
///
/// Mark a version as active and sync its metadata to `characters.metadata`.
pub async fn activate_version(
    State(state): State<AppState>,
    Path((character_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let version = CharacterMetadataVersionRepo::set_active(&state.pool, character_id, version_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CharacterMetadataVersion",
                id: version_id,
            })
        })?;

    sync_to_character(&state.pool, character_id, &version.metadata).await?;

    Ok(Json(DataResponse { data: version }))
}

/// PUT /api/v1/characters/{character_id}/metadata/versions/{version_id}/reject
///
/// Store a rejection reason on a version.
pub async fn reject_version(
    State(state): State<AppState>,
    Path((_character_id, version_id)): Path<(DbId, DbId)>,
    Json(body): Json<RejectRequest>,
) -> AppResult<impl IntoResponse> {
    let version = CharacterMetadataVersionRepo::update(
        &state.pool,
        version_id,
        &UpdateCharacterMetadataVersion {
            notes: None,
            rejection_reason: Some(body.reason),
        },
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "CharacterMetadataVersion",
            id: version_id,
        })
    })?;

    Ok(Json(DataResponse { data: version }))
}

/// PATCH /api/v1/characters/{character_id}/metadata/versions/{version_id}
///
/// Update version notes.
pub async fn update_version(
    State(state): State<AppState>,
    Path((_character_id, version_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateCharacterMetadataVersion>,
) -> AppResult<impl IntoResponse> {
    let version = CharacterMetadataVersionRepo::update(&state.pool, version_id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CharacterMetadataVersion",
                id: version_id,
            })
        })?;

    Ok(Json(DataResponse { data: version }))
}

/// DELETE /api/v1/characters/{character_id}/metadata/versions/{version_id}
///
/// Soft-delete a version. Returns 409 if the version is currently active.
pub async fn delete_version(
    State(state): State<AppState>,
    Path((_character_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let version = ensure_version_exists(&state.pool, version_id).await?;

    if version.is_active {
        return Err(AppError::Core(CoreError::Conflict(
            "Cannot delete the active version. Activate a different version first.".into(),
        )));
    }

    CharacterMetadataVersionRepo::soft_delete(&state.pool, version_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/characters/{character_id}/metadata/mark-outdated
///
/// Mark all active metadata versions for the character as outdated.
/// Called when Bio or ToV source files are updated.
pub async fn mark_metadata_outdated(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<MarkOutdatedRequest>,
) -> AppResult<StatusCode> {
    ensure_character_exists(&state.pool, character_id).await?;
    CharacterMetadataVersionRepo::mark_outdated_for_character(
        &state.pool,
        character_id,
        &body.reason,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
