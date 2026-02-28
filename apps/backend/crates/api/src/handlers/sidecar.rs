//! Handlers for VFX sidecar templates and dataset exports (PRD-40).
//!
//! Provides CRUD endpoints for sidecar templates (with protection for
//! built-in entries) and dataset export creation, listing, and retrieval.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::sidecar::validate_sidecar_format;
use x121_core::types::DbId;
use x121_db::models::sidecar::{CreateDatasetExport, CreateSidecarTemplate, UpdateSidecarTemplate};
use x121_db::repositories::SidecarRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

use x121_db::models::sidecar::SidecarTemplate;

/// Look up a sidecar template by ID, returning `AppError::NotFound` if absent.
async fn ensure_template_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<SidecarTemplate> {
    SidecarRepo::get_template(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SidecarTemplate",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Sidecar Template Handlers
// ---------------------------------------------------------------------------

/// POST /sidecar-templates
///
/// Create a custom sidecar template.
pub async fn create_template(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateSidecarTemplate>,
) -> AppResult<impl IntoResponse> {
    validate_sidecar_format(&input.format).map_err(AppError::BadRequest)?;

    let template = SidecarRepo::create_template(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        template_id = template.id,
        name = %template.name,
        format = %template.format,
        "Sidecar template created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: template })))
}

/// GET /sidecar-templates/{id}
///
/// Get a single sidecar template by ID.
pub async fn get_template(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let template = ensure_template_exists(&state.pool, id).await?;

    Ok(Json(DataResponse { data: template }))
}

/// GET /sidecar-templates
///
/// List all sidecar templates.
pub async fn list_templates(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let templates = SidecarRepo::list_templates(&state.pool).await?;
    Ok(Json(DataResponse { data: templates }))
}

/// PUT /sidecar-templates/{id}
///
/// Update a sidecar template. Built-in templates can still be updated
/// (only deletion is restricted).
pub async fn update_template(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateSidecarTemplate>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref fmt) = input.format {
        validate_sidecar_format(fmt).map_err(AppError::BadRequest)?;
    }

    let template = SidecarRepo::update_template(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SidecarTemplate",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        template_id = id,
        "Sidecar template updated"
    );

    Ok(Json(DataResponse { data: template }))
}

/// DELETE /sidecar-templates/{id}
///
/// Delete a sidecar template. Returns 403 for built-in templates.
pub async fn delete_template(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Check if the template exists and is not built-in.
    let template = ensure_template_exists(&state.pool, id).await?;

    if template.is_builtin {
        return Err(AppError::Core(CoreError::Forbidden(
            "Cannot delete a built-in sidecar template".to_string(),
        )));
    }

    SidecarRepo::delete_template(&state.pool, id).await?;

    tracing::info!(
        user_id = auth.user_id,
        template_id = id,
        name = %template.name,
        "Sidecar template deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Dataset Export Handlers
// ---------------------------------------------------------------------------

/// POST /projects/{project_id}/export-dataset
///
/// Create a new dataset export with pending status.
pub async fn create_export(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<CreateDatasetExport>,
) -> AppResult<impl IntoResponse> {
    let export = SidecarRepo::create_export(&state.pool, project_id, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        export_id = export.id,
        project_id = project_id,
        name = %export.name,
        "Dataset export created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: export })))
}

/// GET /datasets/{id}
///
/// Get a single dataset export by ID.
pub async fn get_export(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let export = SidecarRepo::get_export(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DatasetExport",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: export }))
}

/// GET /projects/{project_id}/datasets
///
/// List dataset exports for a project.
pub async fn list_project_exports(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let exports =
        SidecarRepo::list_exports_by_project(&state.pool, project_id, params.limit, params.offset)
            .await?;

    Ok(Json(DataResponse { data: exports }))
}
