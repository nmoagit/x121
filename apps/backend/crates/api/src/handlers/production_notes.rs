//! Handlers for the production notes system (PRD-95).
//!
//! Provides endpoints for creating, listing, updating, deleting, pinning,
//! resolving, and searching production notes, plus note category CRUD.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::error::CoreError;
use trulience_core::production_notes::{
    validate_entity_type, validate_note_content, validate_visibility,
};
use trulience_core::types::DbId;
use trulience_db::models::note_category::{CreateNoteCategory, UpdateNoteCategory};
use trulience_db::models::production_note::{
    CreateProductionNote, NoteSearchParams, UpdateProductionNote,
};
use trulience_db::repositories::{NoteCategoryRepo, ProductionNoteRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter structs
// ---------------------------------------------------------------------------

/// Query parameters for listing notes by entity.
#[derive(Debug, serde::Deserialize)]
pub struct EntityNoteParams {
    pub entity_type: String,
    pub entity_id: DbId,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for listing pinned notes.
#[derive(Debug, serde::Deserialize)]
pub struct PinnedNoteParams {
    pub entity_type: String,
    pub entity_id: DbId,
}

// ---------------------------------------------------------------------------
// Note Handlers
// ---------------------------------------------------------------------------

/// GET /notes?entity_type=&entity_id=&limit=&offset=
///
/// List notes for a given entity.
pub async fn list_notes(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<EntityNoteParams>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&params.entity_type)
        .map_err(AppError::BadRequest)?;

    let notes = ProductionNoteRepo::list_by_entity(
        &state.pool,
        &params.entity_type,
        params.entity_id,
        params.limit,
        params.offset,
    )
    .await?;

    Ok(Json(DataResponse { data: notes }))
}

/// POST /notes
///
/// Create a new production note.
pub async fn create_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateProductionNote>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&input.entity_type)
        .map_err(AppError::BadRequest)?;
    validate_note_content(&input.content_md)
        .map_err(AppError::BadRequest)?;

    if let Some(ref vis) = input.visibility {
        validate_visibility(vis).map_err(AppError::BadRequest)?;
    }

    let note = ProductionNoteRepo::create(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = note.id,
        entity_type = %note.entity_type,
        entity_id = note.entity_id,
        "Production note created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: note })))
}

/// GET /notes/{id}
///
/// Get a single production note by ID.
pub async fn get_note(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let note = ProductionNoteRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProductionNote",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: note }))
}

/// PUT /notes/{id}
///
/// Update a production note.
pub async fn update_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateProductionNote>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref content) = input.content_md {
        validate_note_content(content).map_err(AppError::BadRequest)?;
    }
    if let Some(ref vis) = input.visibility {
        validate_visibility(vis).map_err(AppError::BadRequest)?;
    }

    let note = ProductionNoteRepo::update(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProductionNote",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = id,
        "Production note updated"
    );

    Ok(Json(DataResponse { data: note }))
}

/// DELETE /notes/{id}
///
/// Delete a production note.
pub async fn delete_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ProductionNoteRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ProductionNote",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        note_id = id,
        "Production note deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /notes/{id}/pin
///
/// Toggle the pinned state of a note.
pub async fn toggle_pin(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let note = ProductionNoteRepo::toggle_pin(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProductionNote",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = id,
        pinned = note.pinned,
        "Production note pin toggled"
    );

    Ok(Json(DataResponse { data: note }))
}

/// PATCH /notes/{id}/resolve
///
/// Mark a note as resolved.
pub async fn resolve_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let note = ProductionNoteRepo::resolve(&state.pool, id, auth.user_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProductionNote",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = id,
        "Production note resolved"
    );

    Ok(Json(DataResponse { data: note }))
}

/// PATCH /notes/{id}/unresolve
///
/// Clear the resolved state of a note.
pub async fn unresolve_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let note = ProductionNoteRepo::unresolve(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProductionNote",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = id,
        "Production note unresolved"
    );

    Ok(Json(DataResponse { data: note }))
}

/// GET /notes/search?q=&entity_type=
///
/// Search notes by content.
pub async fn search_notes(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<NoteSearchParams>,
) -> AppResult<impl IntoResponse> {
    if params.q.is_empty() {
        return Err(AppError::BadRequest(
            "Search query 'q' is required".to_string(),
        ));
    }

    let notes = ProductionNoteRepo::search(
        &state.pool,
        &params.q,
        params.entity_type.as_deref(),
        None,
        None,
    )
    .await?;

    Ok(Json(DataResponse { data: notes }))
}

/// GET /notes/pinned?entity_type=&entity_id=
///
/// List pinned notes for an entity.
pub async fn list_pinned(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PinnedNoteParams>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&params.entity_type)
        .map_err(AppError::BadRequest)?;

    let notes =
        ProductionNoteRepo::list_pinned(&state.pool, &params.entity_type, params.entity_id)
            .await?;

    Ok(Json(DataResponse { data: notes }))
}

/// GET /notes/{id}/thread
///
/// List replies to a note.
pub async fn list_thread(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let replies = ProductionNoteRepo::list_thread(&state.pool, id).await?;
    Ok(Json(DataResponse { data: replies }))
}

// ---------------------------------------------------------------------------
// Note Category Handlers
// ---------------------------------------------------------------------------

/// GET /note-categories
///
/// List all note categories.
pub async fn list_categories(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let categories = NoteCategoryRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: categories }))
}

/// POST /note-categories
///
/// Create a new note category.
pub async fn create_category(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateNoteCategory>,
) -> AppResult<impl IntoResponse> {
    if input.name.is_empty() {
        return Err(AppError::BadRequest(
            "Category name is required".to_string(),
        ));
    }

    let category = NoteCategoryRepo::create(&state.pool, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        category_id = category.id,
        name = %category.name,
        "Note category created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: category })))
}

/// PUT /note-categories/{id}
///
/// Update a note category.
pub async fn update_category(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateNoteCategory>,
) -> AppResult<impl IntoResponse> {
    let category = NoteCategoryRepo::update(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "NoteCategory",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        category_id = id,
        "Note category updated"
    );

    Ok(Json(DataResponse { data: category }))
}

/// DELETE /note-categories/{id}
///
/// Delete a note category.
pub async fn delete_category(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = NoteCategoryRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "NoteCategory",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        category_id = id,
        "Note category deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}
