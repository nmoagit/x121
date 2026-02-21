//! Handlers for the tag system (PRD-47).
//!
//! Provides endpoints for tag CRUD, entity-tag associations (apply/remove),
//! autocomplete suggestions, and bulk operations.
//! All endpoints require authentication via [`AuthUser`].

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::tag::{
    ApplyTagsRequest, BulkApplyRequest, BulkRemoveRequest, TagListParams, TagSuggestParams,
    UpdateTag,
};
use trulience_db::repositories::TagRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Tag CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/tags
///
/// List all tags, optionally filtered by namespace.
pub async fn list_tags(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<TagListParams>,
) -> AppResult<impl IntoResponse> {
    let tags = TagRepo::list_all(&state.pool, &params).await?;

    Ok(Json(DataResponse { data: tags }))
}

/// GET /api/v1/tags/suggest
///
/// Autocomplete suggestions. Returns tags matching the given prefix,
/// sorted by usage count (most popular first).
pub async fn suggest_tags(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<TagSuggestParams>,
) -> AppResult<impl IntoResponse> {
    let suggestions = TagRepo::suggest(&state.pool, &params.prefix, params.limit).await?;

    Ok(Json(DataResponse { data: suggestions }))
}

/// PUT /api/v1/tags/{id}
///
/// Update a tag's display_name and/or color.
pub async fn update_tag(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(tag_id): Path<DbId>,
    Json(input): Json<UpdateTag>,
) -> AppResult<impl IntoResponse> {
    let tag = TagRepo::update(
        &state.pool,
        tag_id,
        input.display_name.as_deref(),
        input.color.as_deref(),
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "Tag",
        id: tag_id,
    }))?;

    tracing::info!(tag_id, user_id = auth.user_id, "Tag updated",);

    Ok(Json(DataResponse { data: tag }))
}

/// DELETE /api/v1/tags/{id}
///
/// Delete a tag and all its entity associations. Admin only.
pub async fn delete_tag(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(tag_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = TagRepo::delete(&state.pool, tag_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Tag",
            id: tag_id,
        }));
    }

    tracing::info!(tag_id, user_id = admin.user_id, "Tag deleted",);

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Entity-tag associations
// ---------------------------------------------------------------------------

/// GET /api/v1/entities/{entity_type}/{entity_id}/tags
///
/// List all tags applied to a specific entity.
pub async fn get_entity_tags(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, DbId)>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&entity_type)?;

    let tags = TagRepo::get_entity_tags(&state.pool, &entity_type, entity_id).await?;

    Ok(Json(DataResponse { data: tags }))
}

/// POST /api/v1/entities/{entity_type}/{entity_id}/tags
///
/// Apply one or more tags to an entity. Tags are created on first use.
pub async fn apply_entity_tags(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, DbId)>,
    Json(input): Json<ApplyTagsRequest>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&entity_type)?;

    if input.tag_names.is_empty() {
        return Err(AppError::BadRequest("tag_names must not be empty".into()));
    }

    let mut applied_tags = Vec::new();

    for tag_name in &input.tag_names {
        let tag = TagRepo::create_or_get(&state.pool, tag_name, None, Some(auth.user_id)).await?;
        TagRepo::apply(
            &state.pool,
            &entity_type,
            entity_id,
            tag.id,
            Some(auth.user_id),
        )
        .await?;
        applied_tags.push(tag);
    }

    tracing::info!(
        entity_type = %entity_type,
        entity_id,
        count = applied_tags.len(),
        user_id = auth.user_id,
        "Tags applied to entity",
    );

    // Return the full tag list for the entity after applying.
    let tags = TagRepo::get_entity_tags(&state.pool, &entity_type, entity_id).await?;

    Ok((StatusCode::CREATED, Json(DataResponse { data: tags })))
}

/// DELETE /api/v1/entities/{entity_type}/{entity_id}/tags/{tag_id}
///
/// Remove a single tag from an entity.
pub async fn remove_entity_tag(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id, tag_id)): Path<(String, DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&entity_type)?;

    let removed = TagRepo::remove(&state.pool, &entity_type, entity_id, tag_id).await?;

    if !removed {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "EntityTag",
            id: tag_id,
        }));
    }

    tracing::info!(
        entity_type = %entity_type,
        entity_id,
        tag_id,
        user_id = auth.user_id,
        "Tag removed from entity",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/// POST /api/v1/tags/bulk-apply
///
/// Apply tags to multiple entities at once. Tags are created on first use.
pub async fn bulk_apply(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<BulkApplyRequest>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&input.entity_type)?;

    if input.entity_ids.is_empty() {
        return Err(AppError::BadRequest("entity_ids must not be empty".into()));
    }
    if input.tag_names.is_empty() {
        return Err(AppError::BadRequest("tag_names must not be empty".into()));
    }

    let result = TagRepo::bulk_apply(
        &state.pool,
        &input.entity_type,
        &input.entity_ids,
        &input.tag_names,
        Some(auth.user_id),
    )
    .await?;

    tracing::info!(
        entity_type = %input.entity_type,
        entities = input.entity_ids.len(),
        tags = input.tag_names.len(),
        applied = result.applied,
        user_id = auth.user_id,
        "Bulk tags applied",
    );

    Ok(Json(DataResponse { data: result }))
}

/// POST /api/v1/tags/bulk-remove
///
/// Remove tags from multiple entities at once.
pub async fn bulk_remove(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<BulkRemoveRequest>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&input.entity_type)?;

    if input.entity_ids.is_empty() {
        return Err(AppError::BadRequest("entity_ids must not be empty".into()));
    }
    if input.tag_ids.is_empty() {
        return Err(AppError::BadRequest("tag_ids must not be empty".into()));
    }

    let result = TagRepo::bulk_remove(
        &state.pool,
        &input.entity_type,
        &input.entity_ids,
        &input.tag_ids,
    )
    .await?;

    tracing::info!(
        entity_type = %input.entity_type,
        entities = input.entity_ids.len(),
        tags = input.tag_ids.len(),
        removed = result.removed,
        user_id = auth.user_id,
        "Bulk tags removed",
    );

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Allowed entity types for tagging.
const VALID_ENTITY_TYPES: &[&str] = &["project", "character", "scene", "segment", "workflow"];

/// Validate that the entity type is one of the allowed values.
fn validate_entity_type(entity_type: &str) -> AppResult<()> {
    if !VALID_ENTITY_TYPES.contains(&entity_type) {
        return Err(AppError::BadRequest(format!(
            "Invalid entity_type '{}'. Must be one of: {}",
            entity_type,
            VALID_ENTITY_TYPES.join(", ")
        )));
    }
    Ok(())
}
