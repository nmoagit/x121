//! Handlers for the character library (PRD-60).
//!
//! Provides endpoints for managing library characters, importing them into
//! projects, viewing cross-project usage, and managing field links.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::character_library;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character::CreateCharacter;
use x121_db::models::library_character::{
    CreateLibraryCharacter, CreateProjectCharacterLink, ImportCharacterRequest, LibraryCharacter,
    UpdateLibraryCharacter,
};
use x121_db::repositories::{CharacterRepo, LibraryCharacterRepo, ProjectCharacterLinkRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a library character exists, returning the full row.
async fn ensure_library_character_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<LibraryCharacter> {
    LibraryCharacterRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "LibraryCharacter",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// GET /library/characters
// ---------------------------------------------------------------------------

/// List all library characters visible to the authenticated user.
/// Includes all published characters plus unpublished ones owned by the user.
pub async fn list_library_characters(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let items = LibraryCharacterRepo::list(&state.pool, auth.user_id).await?;
    tracing::debug!(count = items.len(), "Listed library characters");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /library/characters
// ---------------------------------------------------------------------------

/// Register a new library character.
pub async fn create_library_character(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateLibraryCharacter>,
) -> AppResult<impl IntoResponse> {
    let created = LibraryCharacterRepo::create(&state.pool, auth.user_id, &input).await?;
    tracing::info!(id = created.id, name = %created.name, "Library character created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /library/characters/{id}
// ---------------------------------------------------------------------------

/// Get a single library character by ID.
pub async fn get_library_character(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let lc = ensure_library_character_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: lc }))
}

// ---------------------------------------------------------------------------
// PUT /library/characters/{id}
// ---------------------------------------------------------------------------

/// Update an existing library character.
pub async fn update_library_character(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateLibraryCharacter>,
) -> AppResult<impl IntoResponse> {
    // Verify it exists before updating.
    ensure_library_character_exists(&state.pool, id).await?;

    let updated = LibraryCharacterRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "LibraryCharacter",
            id,
        }))?;
    tracing::info!(id = updated.id, "Library character updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /library/characters/{id}
// ---------------------------------------------------------------------------

/// Delete a library character by ID.
pub async fn delete_library_character(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = LibraryCharacterRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Library character deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "LibraryCharacter",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// GET /library/characters/{id}/usage
// ---------------------------------------------------------------------------

/// Get cross-project usage for a library character.
pub async fn get_library_usage(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_library_character_exists(&state.pool, id).await?;
    let usage = ProjectCharacterLinkRepo::get_usage(&state.pool, id).await?;
    Ok(Json(DataResponse { data: usage }))
}

// ---------------------------------------------------------------------------
// POST /library/characters/{id}/import
// ---------------------------------------------------------------------------

/// Import a library character into a project.
///
/// Creates a new character in the target project with the library character's
/// master_metadata, then creates a project-character link.
pub async fn import_to_project(
    State(state): State<AppState>,
    Path(library_id): Path<DbId>,
    Json(input): Json<ImportCharacterRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate linked fields if provided.
    if let Some(ref fields) = input.linked_fields {
        character_library::validate_linked_fields(fields)?;
    }

    // Fetch the library character.
    let lc = ensure_library_character_exists(&state.pool, library_id).await?;

    // Check if already linked to this project.
    let existing = ProjectCharacterLinkRepo::find_by_project_and_library(
        &state.pool,
        input.project_id,
        library_id,
    )
    .await?;
    if existing.is_some() {
        return Err(AppError::Core(CoreError::Conflict(
            "Library character is already imported into this project".to_string(),
        )));
    }

    // Create a project character from the library character's data.
    let create_char = CreateCharacter {
        project_id: input.project_id,
        name: lc.name.clone(),
        status_id: Some(1), // Draft
        metadata: Some(lc.master_metadata.clone()),
        settings: None,
    };
    let project_char = CharacterRepo::create(&state.pool, &create_char).await?;

    // Build linked_fields JSON.
    let linked_fields_json = input
        .linked_fields
        .as_ref()
        .and_then(|f| serde_json::to_value(f).ok());

    // Create the link.
    let link_input = CreateProjectCharacterLink {
        project_id: input.project_id,
        library_character_id: library_id,
        project_character_id: project_char.id,
        linked_fields: linked_fields_json,
    };
    let link = ProjectCharacterLinkRepo::create_link(&state.pool, &link_input).await?;

    tracing::info!(
        library_id,
        project_id = input.project_id,
        project_character_id = project_char.id,
        "Library character imported into project"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: link })))
}

// ---------------------------------------------------------------------------
// GET /library/characters/projects/{project_id}/links
// ---------------------------------------------------------------------------

/// List all library-character links for a project.
pub async fn list_project_links(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let links = ProjectCharacterLinkRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: links }))
}

// ---------------------------------------------------------------------------
// PUT /library/characters/links/{link_id}
// ---------------------------------------------------------------------------

/// Update the linked fields on an existing project-character link.
pub async fn update_link_fields(
    State(state): State<AppState>,
    Path(link_id): Path<DbId>,
    Json(input): Json<Vec<String>>,
) -> AppResult<impl IntoResponse> {
    character_library::validate_linked_fields(&input)?;

    let updated = ProjectCharacterLinkRepo::update_linked_fields(&state.pool, link_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ProjectCharacterLink",
            id: link_id,
        }))?;

    tracing::info!(link_id, "Link fields updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /library/characters/links/{link_id}
// ---------------------------------------------------------------------------

/// Delete a project-character link (does not delete the project character).
pub async fn delete_link(
    State(state): State<AppState>,
    Path(link_id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ProjectCharacterLinkRepo::delete_link(&state.pool, link_id).await?;
    if deleted {
        tracing::info!(link_id, "Project-character link deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ProjectCharacterLink",
            id: link_id,
        }))
    }
}
