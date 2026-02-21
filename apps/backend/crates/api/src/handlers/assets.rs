//! Handlers for the asset registry (PRD-17).
//!
//! Provides endpoints for asset CRUD, dependency mapping, compatibility notes,
//! ratings, and impact analysis.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::assets::dependencies::check_deletion_safe;
use trulience_core::assets::impact::{AffectedGroup, UpdateImpact};
use trulience_core::assets::registry::validate_rating;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::asset::{
    AssetSearchParams, CreateAsset, CreateDependency, CreateNote, RateAsset, UpdateAsset,
};
use trulience_db::repositories::AssetRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::{RequireAdmin, RequireAuth};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Verify that an asset exists, returning NotFound if it does not.
async fn ensure_asset_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<()> {
    if !AssetRepo::verify_exists(pool, id).await? {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Asset",
            id,
        }));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Asset CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/assets
///
/// List/search assets with optional filters.
pub async fn list_assets(
    RequireAuth(_auth): RequireAuth,
    State(state): State<AppState>,
    Query(params): Query<AssetSearchParams>,
) -> AppResult<impl IntoResponse> {
    let assets = AssetRepo::search(&state.pool, &params).await?;

    Ok(Json(DataResponse { data: assets }))
}

/// POST /api/v1/assets
///
/// Register a new asset. Admin only.
pub async fn create_asset(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateAsset>,
) -> AppResult<impl IntoResponse> {
    // Validate file exists and compute metadata.
    // In non-production environments, the file may not exist on the API server.
    // Use a placeholder if the file is not accessible.
    let (file_size, checksum) =
        match trulience_core::assets::registry::validate_file(&input.file_path) {
            Ok(info) => (info.size_bytes, info.checksum),
            Err(_) => {
                // File not found on this host -- store placeholder values.
                // The asset might reside on a different storage node.
                (0_i64, format!("pending-checksum-{}", input.file_path))
            }
        };

    let asset = AssetRepo::create(
        &state.pool,
        &input,
        file_size,
        &checksum,
        Some(admin.user_id),
    )
    .await?;

    tracing::info!(
        asset_id = asset.id,
        name = %asset.name,
        version = %asset.version,
        user_id = admin.user_id,
        "Asset registered",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: asset })))
}

/// GET /api/v1/assets/{id}
///
/// Get full asset detail including notes, rating summary, and dependencies.
pub async fn get_asset(
    RequireAuth(_auth): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let asset = AssetRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Asset",
            id,
        }))?;

    let notes = AssetRepo::get_notes(&state.pool, id).await?;
    let rating_summary = AssetRepo::get_rating_summary(&state.pool, id).await?;
    let dependencies = AssetRepo::get_dependents(&state.pool, id).await?;

    let detail = serde_json::json!({
        "asset": asset,
        "notes": notes,
        "rating_summary": rating_summary,
        "dependencies": dependencies,
    });

    Ok(Json(DataResponse { data: detail }))
}

/// PUT /api/v1/assets/{id}
///
/// Update an asset's metadata. Admin only.
pub async fn update_asset(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateAsset>,
) -> AppResult<impl IntoResponse> {
    let asset = AssetRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Asset",
            id,
        }))?;

    tracing::info!(asset_id = id, user_id = admin.user_id, "Asset updated",);

    Ok(Json(DataResponse { data: asset }))
}

/// DELETE /api/v1/assets/{id}
///
/// Delete an asset. Checks for active dependents first. Admin only.
pub async fn delete_asset(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Check deletion safety.
    let dependent_count = AssetRepo::count_dependents(&state.pool, id).await?;
    let check = check_deletion_safe(dependent_count);

    if !check.is_safe {
        return Err(AppError::BadRequest(check.message));
    }

    let deleted = AssetRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Asset",
            id,
        }));
    }

    tracing::info!(asset_id = id, user_id = admin.user_id, "Asset deleted",);

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/// GET /api/v1/assets/{id}/dependencies
///
/// List all dependency links for an asset.
pub async fn get_dependencies(
    RequireAuth(_auth): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deps = AssetRepo::get_dependents(&state.pool, id).await?;

    Ok(Json(DataResponse { data: deps }))
}

/// POST /api/v1/assets/{id}/dependencies
///
/// Add a dependency link. Admin only.
pub async fn add_dependency(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<CreateDependency>,
) -> AppResult<impl IntoResponse> {
    ensure_asset_exists(&state.pool, id).await?;

    let dep = AssetRepo::add_dependency(&state.pool, id, &input).await?;

    tracing::info!(
        asset_id = id,
        entity_type = %input.dependent_entity_type,
        entity_id = input.dependent_entity_id,
        user_id = admin.user_id,
        "Dependency added",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: dep })))
}

// ---------------------------------------------------------------------------
// Impact analysis
// ---------------------------------------------------------------------------

/// GET /api/v1/assets/{id}/impact
///
/// Analyze the update impact of changing/removing an asset.
pub async fn get_impact(
    RequireAuth(_auth): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_asset_exists(&state.pool, id).await?;

    let deps = AssetRepo::get_dependents(&state.pool, id).await?;

    // Group dependencies by entity type.
    let mut groups: std::collections::HashMap<String, Vec<DbId>> = std::collections::HashMap::new();
    for dep in &deps {
        groups
            .entry(dep.dependent_entity_type.clone())
            .or_default()
            .push(dep.dependent_entity_id);
    }

    let affected_entities: Vec<AffectedGroup> = groups
        .into_iter()
        .map(|(entity_type, ids)| AffectedGroup {
            count: ids.len() as i64,
            entity_ids: ids,
            entity_type,
        })
        .collect();

    let total_dependents = deps.len() as i64;

    let impact = UpdateImpact {
        asset_id: id,
        total_dependents,
        affected_entities,
    };

    Ok(Json(DataResponse { data: impact }))
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/// POST /api/v1/assets/{id}/notes
///
/// Add a compatibility note to an asset.
pub async fn add_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<CreateNote>,
) -> AppResult<impl IntoResponse> {
    ensure_asset_exists(&state.pool, id).await?;

    let note = AssetRepo::add_note(&state.pool, id, &input, Some(auth.user_id)).await?;

    tracing::info!(
        asset_id = id,
        note_id = note.id,
        user_id = auth.user_id,
        "Note added to asset",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: note })))
}

/// GET /api/v1/assets/{id}/notes
///
/// List all notes for an asset.
pub async fn get_notes(
    RequireAuth(_auth): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let notes = AssetRepo::get_notes(&state.pool, id).await?;

    Ok(Json(DataResponse { data: notes }))
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

/// PUT /api/v1/assets/{id}/rating
///
/// Rate an asset (or update an existing rating).
pub async fn rate_asset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<RateAsset>,
) -> AppResult<impl IntoResponse> {
    // Validate rating range.
    validate_rating(input.rating).map_err(|e| AppError::BadRequest(e.to_string()))?;

    ensure_asset_exists(&state.pool, id).await?;

    let rating = AssetRepo::rate(&state.pool, id, &input, Some(auth.user_id)).await?;

    tracing::info!(
        asset_id = id,
        rating = input.rating,
        user_id = auth.user_id,
        "Asset rated",
    );

    Ok(Json(DataResponse { data: rating }))
}

/// GET /api/v1/assets/{id}/ratings
///
/// List all ratings for an asset.
pub async fn get_ratings(
    RequireAuth(_auth): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let ratings = AssetRepo::list_ratings(&state.pool, id).await?;

    Ok(Json(DataResponse { data: ratings }))
}
