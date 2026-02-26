//! Handlers for the template & preset system (PRD-27).
//!
//! Provides endpoints for managing templates, presets, marketplace discovery,
//! ratings, and override-diff preview/apply.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::preset;
use x121_core::types::DbId;
use x121_db::models::preset::{CreatePreset, CreatePresetRating, Preset, UpdatePreset};
use x121_db::models::template::{CreateTemplate, Template, UpdateTemplate};
use x121_db::repositories::{PresetRepo, TemplateRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for listing templates/presets.
#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub project_id: Option<DbId>,
}

/// Query parameters for the marketplace endpoint.
#[derive(Debug, Deserialize)]
pub struct MarketplaceParams {
    pub sort_by: Option<String>,
    pub page: Option<i32>,
    pub per_page: Option<i32>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a template exists, returning the full row.
async fn ensure_template_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Template> {
    TemplateRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "Template",
            id,
        })
    })
}

/// Verify that a preset exists, returning the full row.
async fn ensure_preset_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Preset> {
    PresetRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "Preset",
            id,
        })
    })
}

/// Validate scope and scope-project consistency for create/update operations.
fn validate_scope_and_project(scope: Option<&str>, project_id: Option<DbId>) -> AppResult<()> {
    let scope_val = scope.unwrap_or(preset::SCOPE_PERSONAL);
    preset::validate_scope(scope_val)?;
    preset::validate_scope_project_consistency(scope_val, project_id)?;
    Ok(())
}

// ===========================================================================
// TEMPLATE HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /templates
// ---------------------------------------------------------------------------

/// List templates visible to the authenticated user.
pub async fn list_templates(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> AppResult<impl IntoResponse> {
    let items = TemplateRepo::list_for_user(&state.pool, auth.user_id, params.project_id).await?;
    tracing::debug!(count = items.len(), "Listed templates");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /templates
// ---------------------------------------------------------------------------

/// Create a new template.
pub async fn create_template(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateTemplate>,
) -> AppResult<impl IntoResponse> {
    preset::validate_template_name(&input.name)?;
    validate_scope_and_project(input.scope.as_deref(), input.project_id)?;

    let created = TemplateRepo::create(&state.pool, auth.user_id, &input).await?;
    tracing::info!(id = created.id, name = %created.name, "Template created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /templates/{id}
// ---------------------------------------------------------------------------

/// Get a single template by ID.
pub async fn get_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let t = ensure_template_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: t }))
}

// ---------------------------------------------------------------------------
// PUT /templates/{id}
// ---------------------------------------------------------------------------

/// Update an existing template.
pub async fn update_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateTemplate>,
) -> AppResult<impl IntoResponse> {
    ensure_template_exists(&state.pool, id).await?;

    if let Some(ref name) = input.name {
        preset::validate_template_name(name)?;
    }
    if input.scope.is_some() || input.project_id.is_some() {
        validate_scope_and_project(input.scope.as_deref(), input.project_id)?;
    }

    let updated = TemplateRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Template",
            id,
        }))?;
    tracing::info!(id = updated.id, "Template updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /templates/{id}
// ---------------------------------------------------------------------------

/// Delete a template by ID.
pub async fn delete_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = TemplateRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Template deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Template",
            id,
        }))
    }
}

// ===========================================================================
// PRESET HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /presets
// ---------------------------------------------------------------------------

/// List presets visible to the authenticated user.
pub async fn list_presets(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> AppResult<impl IntoResponse> {
    let items = PresetRepo::list_for_user(&state.pool, auth.user_id, params.project_id).await?;
    tracing::debug!(count = items.len(), "Listed presets");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /presets
// ---------------------------------------------------------------------------

/// Create a new preset.
pub async fn create_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreatePreset>,
) -> AppResult<impl IntoResponse> {
    preset::validate_preset_name(&input.name)?;
    validate_scope_and_project(input.scope.as_deref(), input.project_id)?;

    let created = PresetRepo::create(&state.pool, auth.user_id, &input).await?;
    tracing::info!(id = created.id, name = %created.name, "Preset created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /presets/{id}
// ---------------------------------------------------------------------------

/// Get a single preset by ID.
pub async fn get_preset(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let p = ensure_preset_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: p }))
}

// ---------------------------------------------------------------------------
// PUT /presets/{id}
// ---------------------------------------------------------------------------

/// Update an existing preset.
pub async fn update_preset(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePreset>,
) -> AppResult<impl IntoResponse> {
    ensure_preset_exists(&state.pool, id).await?;

    if let Some(ref name) = input.name {
        preset::validate_preset_name(name)?;
    }
    if input.scope.is_some() || input.project_id.is_some() {
        validate_scope_and_project(input.scope.as_deref(), input.project_id)?;
    }

    let updated = PresetRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Preset",
            id,
        }))?;
    tracing::info!(id = updated.id, "Preset updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /presets/{id}
// ---------------------------------------------------------------------------

/// Delete a preset by ID.
pub async fn delete_preset(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = PresetRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Preset deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Preset",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// GET /presets/marketplace
// ---------------------------------------------------------------------------

/// List shared presets for the marketplace with average ratings.
pub async fn marketplace(
    State(state): State<AppState>,
    Query(params): Query<MarketplaceParams>,
) -> AppResult<impl IntoResponse> {
    let sort_by = params.sort_by.as_deref().unwrap_or("popular");
    let per_page = params.per_page.unwrap_or(25).min(100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * per_page;

    let items = PresetRepo::list_marketplace(&state.pool, sort_by, per_page, offset).await?;
    tracing::debug!(count = items.len(), sort_by, "Marketplace query");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /presets/{id}/rate
// ---------------------------------------------------------------------------

/// Rate a preset (upsert).
pub async fn rate_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<CreatePresetRating>,
) -> AppResult<impl IntoResponse> {
    ensure_preset_exists(&state.pool, id).await?;
    preset::validate_rating(input.rating)?;

    let rating = PresetRepo::rate(&state.pool, id, auth.user_id, &input).await?;
    tracing::info!(
        preset_id = id,
        user_id = auth.user_id,
        rating = input.rating,
        "Preset rated"
    );
    Ok(Json(DataResponse { data: rating }))
}

// ---------------------------------------------------------------------------
// GET /presets/{id}/diff/{scene_type_id}
// ---------------------------------------------------------------------------

/// Preview what fields a preset would override on a scene type's current parameters.
///
/// NOTE: This is a simplified implementation that compares the preset parameters
/// against an empty set. A full implementation would fetch the scene type's
/// current parameters from the database.
pub async fn preview_apply(
    State(state): State<AppState>,
    Path((id, _scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let p = ensure_preset_exists(&state.pool, id).await?;

    // Compare preset params against an empty baseline (placeholder for
    // real scene-type parameter lookup in a future iteration).
    let current_params = serde_json::Value::Object(serde_json::Map::new());
    let diffs = preset::compute_override_diff(&current_params, &p.parameters);

    Ok(Json(DataResponse { data: diffs }))
}

// ---------------------------------------------------------------------------
// POST /presets/{id}/apply/{scene_type_id}
// ---------------------------------------------------------------------------

/// Apply a preset to a scene type, incrementing the preset's usage counter.
///
/// NOTE: This is a simplified implementation that increments usage and returns
/// the preset parameters. A full implementation would merge the preset
/// parameters into the scene type configuration.
pub async fn apply_preset(
    State(state): State<AppState>,
    Path((id, _scene_type_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let p = ensure_preset_exists(&state.pool, id).await?;

    PresetRepo::increment_usage(&state.pool, id).await?;
    tracing::info!(preset_id = id, "Preset applied");

    Ok(Json(DataResponse { data: p.parameters }))
}
