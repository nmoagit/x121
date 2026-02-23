//! Handlers for the Prompt Editor & Versioning feature (PRD-63).
//!
//! Provides endpoints for saving/listing/diffing/restoring prompt versions,
//! and for browsing/creating/updating/deleting/rating prompt library entries.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use trulience_core::error::CoreError;
use trulience_core::prompt_editor::{self, compute_diff};
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;
use trulience_db::models::prompt_library_entry::{
    CreateLibraryEntry, RateLibraryEntryRequest, UpdateLibraryEntry,
};
use trulience_db::models::prompt_version::{CreatePromptVersion, PromptVersion};
use trulience_db::repositories::PromptLibraryRepo;
use trulience_db::repositories::PromptVersionRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination parameters for prompt version listings.
#[derive(Debug, Deserialize)]
pub struct VersionListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Search and pagination parameters for prompt library listings.
#[derive(Debug, Deserialize)]
pub struct LibraryListParams {
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

/// Request body for saving a new prompt version.
#[derive(Debug, Deserialize)]
pub struct SavePromptVersionRequest {
    pub scene_type_id: DbId,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub change_notes: Option<String>,
}

/// Request body for creating a prompt library entry.
#[derive(Debug, Deserialize)]
pub struct CreateLibraryEntryRequest {
    pub name: String,
    pub description: Option<String>,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub tags: Option<Vec<String>>,
    pub model_compatibility: Option<Vec<String>>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a prompt version exists, returning the full row.
async fn ensure_prompt_version_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<PromptVersion> {
    PromptVersionRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "PromptVersion",
                id,
            })
        })
}

/// Verify that a prompt library entry exists, returning the full row.
async fn ensure_library_entry_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<trulience_db::models::prompt_library_entry::PromptLibraryEntry> {
    PromptLibraryRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "PromptLibraryEntry",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// POST /scene-types/{id}/prompt-versions
// ---------------------------------------------------------------------------

/// Save a new prompt version for a scene type.
///
/// Validates prompt content, auto-increments the version number, and
/// creates the database record.
pub async fn save_prompt_version(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SavePromptVersionRequest>,
) -> AppResult<impl IntoResponse> {
    prompt_editor::validate_prompt(&body.positive_prompt)?;
    if let Some(ref neg) = body.negative_prompt {
        prompt_editor::validate_negative_prompt(neg)?;
    }
    if let Some(ref notes) = body.change_notes {
        prompt_editor::validate_change_notes(notes)?;
    }

    let input = CreatePromptVersion {
        scene_type_id: body.scene_type_id,
        positive_prompt: body.positive_prompt,
        negative_prompt: body.negative_prompt,
        change_notes: body.change_notes,
        created_by_id: auth.user_id,
    };

    let version = PromptVersionRepo::create(&state.pool, &input).await?;

    tracing::info!(
        prompt_version_id = version.id,
        scene_type_id = version.scene_type_id,
        version = version.version,
        user_id = auth.user_id,
        "Prompt version saved"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: version })))
}

// ---------------------------------------------------------------------------
// GET /scene-types/{id}/prompt-versions
// ---------------------------------------------------------------------------

/// List prompt versions for a scene type with pagination.
pub async fn list_versions(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
    Query(params): Query<VersionListParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let versions =
        PromptVersionRepo::list_for_scene_type(&state.pool, scene_type_id, limit, offset).await?;

    tracing::debug!(
        count = versions.len(),
        scene_type_id,
        "Listed prompt versions"
    );

    Ok(Json(DataResponse { data: versions }))
}

// ---------------------------------------------------------------------------
// GET /prompt-versions/{id_a}/diff/{id_b}
// ---------------------------------------------------------------------------

/// Compute a diff between two prompt versions.
pub async fn diff_versions(
    State(state): State<AppState>,
    Path((id_a, id_b)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let version_a = ensure_prompt_version_exists(&state.pool, id_a).await?;
    let version_b = ensure_prompt_version_exists(&state.pool, id_b).await?;

    let diff = compute_diff(
        &version_a.positive_prompt,
        &version_b.positive_prompt,
        version_a.negative_prompt.as_deref(),
        version_b.negative_prompt.as_deref(),
    );

    Ok(Json(DataResponse { data: diff }))
}

// ---------------------------------------------------------------------------
// POST /prompt-versions/{id}/restore
// ---------------------------------------------------------------------------

/// Restore a previous prompt version by creating a new version with
/// the old content. The restored version gets a new, higher version number.
pub async fn restore_version(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(version_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let old_version = ensure_prompt_version_exists(&state.pool, version_id).await?;

    let input = CreatePromptVersion {
        scene_type_id: old_version.scene_type_id,
        positive_prompt: old_version.positive_prompt,
        negative_prompt: old_version.negative_prompt,
        change_notes: Some(format!("Restored from version {}", old_version.version)),
        created_by_id: auth.user_id,
    };

    let restored = PromptVersionRepo::create(&state.pool, &input).await?;

    tracing::info!(
        restored_version_id = restored.id,
        from_version = old_version.version,
        new_version = restored.version,
        scene_type_id = restored.scene_type_id,
        user_id = auth.user_id,
        "Prompt version restored"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: restored })))
}

// ---------------------------------------------------------------------------
// GET /prompt-library
// ---------------------------------------------------------------------------

/// List prompt library entries with optional search and pagination.
pub async fn list_library(
    State(state): State<AppState>,
    Query(params): Query<LibraryListParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let entries =
        PromptLibraryRepo::list(&state.pool, params.search.as_deref(), limit, offset).await?;

    tracing::debug!(count = entries.len(), "Listed prompt library entries");

    Ok(Json(DataResponse { data: entries }))
}

// ---------------------------------------------------------------------------
// POST /prompt-library
// ---------------------------------------------------------------------------

/// Create a new prompt library entry.
pub async fn create_library_entry(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateLibraryEntryRequest>,
) -> AppResult<impl IntoResponse> {
    prompt_editor::validate_library_name(&body.name)?;
    prompt_editor::validate_prompt(&body.positive_prompt)?;
    if let Some(ref neg) = body.negative_prompt {
        prompt_editor::validate_negative_prompt(neg)?;
    }
    if let Some(ref tags) = body.tags {
        prompt_editor::validate_tags(tags)?;
    }

    let input = CreateLibraryEntry {
        name: body.name,
        description: body.description,
        positive_prompt: body.positive_prompt,
        negative_prompt: body.negative_prompt,
        tags: body.tags,
        model_compatibility: body.model_compatibility,
        owner_id: auth.user_id,
    };

    let entry = PromptLibraryRepo::create(&state.pool, &input).await?;

    tracing::info!(
        library_entry_id = entry.id,
        user_id = auth.user_id,
        "Prompt library entry created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: entry })))
}

// ---------------------------------------------------------------------------
// GET /prompt-library/{id}
// ---------------------------------------------------------------------------

/// Get a single prompt library entry by ID.
pub async fn get_library_entry(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let entry = ensure_library_entry_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: entry }))
}

// ---------------------------------------------------------------------------
// PUT /prompt-library/{id}
// ---------------------------------------------------------------------------

/// Update a prompt library entry.
pub async fn update_library_entry(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateLibraryEntry>,
) -> AppResult<impl IntoResponse> {
    // Validate provided fields.
    if let Some(ref name) = body.name {
        prompt_editor::validate_library_name(name)?;
    }
    if let Some(ref prompt) = body.positive_prompt {
        prompt_editor::validate_prompt(prompt)?;
    }
    if let Some(ref neg) = body.negative_prompt {
        prompt_editor::validate_negative_prompt(neg)?;
    }
    if let Some(ref tags) = body.tags {
        prompt_editor::validate_tags(tags)?;
    }

    let updated = PromptLibraryRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "PromptLibraryEntry",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /prompt-library/{id}
// ---------------------------------------------------------------------------

/// Delete a prompt library entry by ID.
pub async fn delete_library_entry(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = PromptLibraryRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Prompt library entry deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "PromptLibraryEntry",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// POST /prompt-library/{id}/rate
// ---------------------------------------------------------------------------

/// Rate a prompt library entry. Updates the average rating and increments usage count.
pub async fn rate_library_entry(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<RateLibraryEntryRequest>,
) -> AppResult<impl IntoResponse> {
    prompt_editor::validate_rating(body.rating)?;

    // Ensure the entry exists.
    ensure_library_entry_exists(&state.pool, id).await?;

    // For simplicity, set the rating directly (a production system would
    // maintain a separate ratings table and compute the average).
    PromptLibraryRepo::update_rating(&state.pool, id, body.rating).await?;
    PromptLibraryRepo::increment_usage(&state.pool, id).await?;

    let updated = ensure_library_entry_exists(&state.pool, id).await?;

    tracing::info!(library_entry_id = id, rating = body.rating, "Library entry rated");

    Ok(Json(DataResponse { data: updated }))
}
