//! Handlers for the avatar library (PRD-60).
//!
//! Provides endpoints for managing library avatars, importing them into
//! projects, viewing cross-project usage, and managing field links.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::avatar_library;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::avatar::CreateAvatar;
use x121_db::models::library_avatar::{
    CreateLibraryAvatar, CreateProjectAvatarLink, ImportAvatarRequest, LibraryAvatar,
    UpdateLibraryAvatar,
};
use x121_db::repositories::{AvatarRepo, LibraryAvatarRepo, ProjectAvatarLinkRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a library avatar exists, returning the full row.
async fn ensure_library_avatar_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<LibraryAvatar> {
    LibraryAvatarRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "LibraryAvatar",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// GET /library/avatars
// ---------------------------------------------------------------------------

/// Optional filter query params for the library avatar list endpoint.
#[derive(Debug, Deserialize)]
pub struct LibraryFilterParams {
    /// Text search on avatar name (ILIKE).
    pub search: Option<String>,
    /// Filter to avatars that have scenes with this scene type.
    pub scene_type_id: Option<DbId>,
    /// Filter to avatars that have scenes on this track.
    pub track_id: Option<DbId>,
    /// Filter to avatars belonging to projects in this pipeline.
    pub pipeline_id: Option<DbId>,
}

/// List all avatars across all projects for the library browser.
///
/// Returns enriched rows with project name, group name, hero variant,
/// and scene count. No longer queries the `library_avatars` table.
pub async fn list_library_avatars(
    State(state): State<AppState>,
    Query(params): Query<LibraryFilterParams>,
) -> AppResult<impl IntoResponse> {
    let items = AvatarRepo::list_all_for_library(
        &state.pool,
        params.search.as_deref(),
        params.scene_type_id,
        params.track_id,
        params.pipeline_id,
    )
    .await?;
    tracing::debug!(count = items.len(), "Listed library avatars");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /library/avatars
// ---------------------------------------------------------------------------

/// Register a new library avatar.
pub async fn create_library_avatar(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateLibraryAvatar>,
) -> AppResult<impl IntoResponse> {
    let created = LibraryAvatarRepo::create(&state.pool, auth.user_id, &input).await?;
    tracing::info!(id = created.id, name = %created.name, "Library avatar created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /library/avatars/{id}
// ---------------------------------------------------------------------------

/// Get a single library avatar by ID.
pub async fn get_library_avatar(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let lc = ensure_library_avatar_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: lc }))
}

// ---------------------------------------------------------------------------
// PUT /library/avatars/{id}
// ---------------------------------------------------------------------------

/// Update an existing library avatar.
pub async fn update_library_avatar(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateLibraryAvatar>,
) -> AppResult<impl IntoResponse> {
    // Verify it exists before updating.
    ensure_library_avatar_exists(&state.pool, id).await?;

    let updated = LibraryAvatarRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "LibraryAvatar",
            id,
        }))?;
    tracing::info!(id = updated.id, "Library avatar updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /library/avatars/{id}
// ---------------------------------------------------------------------------

/// Delete a library avatar by ID.
pub async fn delete_library_avatar(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = LibraryAvatarRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Library avatar deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "LibraryAvatar",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// GET /library/avatars/{id}/usage
// ---------------------------------------------------------------------------

/// Get cross-project usage for a library avatar.
pub async fn get_library_usage(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_library_avatar_exists(&state.pool, id).await?;
    let usage = ProjectAvatarLinkRepo::get_usage(&state.pool, id).await?;
    Ok(Json(DataResponse { data: usage }))
}

// ---------------------------------------------------------------------------
// POST /library/avatars/{id}/import
// ---------------------------------------------------------------------------

/// Import a library avatar into a project.
///
/// Creates a new avatar in the target project with the library avatar's
/// master_metadata, then creates a project-avatar link.
pub async fn import_to_project(
    State(state): State<AppState>,
    Path(library_id): Path<DbId>,
    Json(input): Json<ImportAvatarRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate linked fields if provided.
    if let Some(ref fields) = input.linked_fields {
        avatar_library::validate_linked_fields(fields)?;
    }

    // Fetch the library avatar.
    let lc = ensure_library_avatar_exists(&state.pool, library_id).await?;

    // Check if already linked to this project.
    let existing = ProjectAvatarLinkRepo::find_by_project_and_library(
        &state.pool,
        input.project_id,
        library_id,
    )
    .await?;
    if existing.is_some() {
        return Err(AppError::Core(CoreError::Conflict(
            "Library avatar is already imported into this project".to_string(),
        )));
    }

    // Create a project avatar from the library avatar's data.
    let create_char = CreateAvatar {
        project_id: input.project_id,
        name: lc.name.clone(),
        status_id: Some(1), // Draft
        metadata: Some(lc.master_metadata.clone()),
        settings: None,
        group_id: None,
    };
    let project_char = AvatarRepo::create(&state.pool, &create_char).await?;

    // Build linked_fields JSON.
    let linked_fields_json = input
        .linked_fields
        .as_ref()
        .and_then(|f| serde_json::to_value(f).ok());

    // Create the link.
    let link_input = CreateProjectAvatarLink {
        project_id: input.project_id,
        library_avatar_id: library_id,
        project_avatar_id: project_char.id,
        linked_fields: linked_fields_json,
    };
    let link = ProjectAvatarLinkRepo::create_link(&state.pool, &link_input).await?;

    tracing::info!(
        library_id,
        project_id = input.project_id,
        project_avatar_id = project_char.id,
        "Library avatar imported into project"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: link })))
}

// ---------------------------------------------------------------------------
// GET /library/avatars/projects/{project_id}/links
// ---------------------------------------------------------------------------

/// List all library-avatar links for a project.
pub async fn list_project_links(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let links = ProjectAvatarLinkRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: links }))
}

// ---------------------------------------------------------------------------
// PUT /library/avatars/links/{link_id}
// ---------------------------------------------------------------------------

/// Update the linked fields on an existing project-avatar link.
pub async fn update_link_fields(
    State(state): State<AppState>,
    Path(link_id): Path<DbId>,
    Json(input): Json<Vec<String>>,
) -> AppResult<impl IntoResponse> {
    avatar_library::validate_linked_fields(&input)?;

    let updated = ProjectAvatarLinkRepo::update_linked_fields(&state.pool, link_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ProjectAvatarLink",
            id: link_id,
        }))?;

    tracing::info!(link_id, "Link fields updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /library/avatars/links/{link_id}
// ---------------------------------------------------------------------------

/// Delete a project-avatar link (does not delete the project avatar).
pub async fn delete_link(
    State(state): State<AppState>,
    Path(link_id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ProjectAvatarLinkRepo::delete_link(&state.pool, link_id).await?;
    if deleted {
        tracing::info!(link_id, "Project-avatar link deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ProjectAvatarLink",
            id: link_id,
        }))
    }
}
