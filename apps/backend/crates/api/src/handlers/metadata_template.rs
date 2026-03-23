//! Handlers for the `/metadata-templates` resource (PRD-113).
//!
//! Standard CRUD for metadata templates and their fields.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::metadata_template::{
    CreateMetadataTemplate, CreateMetadataTemplateField, MetadataTemplate, MetadataTemplateField,
    UpdateMetadataTemplate,
};
use x121_db::repositories::{MetadataTemplateFieldRepo, MetadataTemplateRepo};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for listing templates.
#[derive(Debug, Deserialize)]
pub struct ListTemplatesQuery {
    pub project_id: Option<DbId>,
    pub pipeline_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// A template with its fields.
#[derive(Debug, Serialize)]
pub struct TemplateWithFields {
    #[serde(flatten)]
    pub template: MetadataTemplate,
    pub fields: Vec<MetadataTemplateField>,
}

// ---------------------------------------------------------------------------
// Template handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/metadata-templates
pub async fn list_templates(
    State(state): State<AppState>,
    Query(params): Query<ListTemplatesQuery>,
) -> AppResult<Json<Vec<MetadataTemplate>>> {
    let templates =
        MetadataTemplateRepo::list(&state.pool, params.project_id, params.pipeline_id).await?;
    Ok(Json(templates))
}

/// GET /api/v1/metadata-templates/{id}
pub async fn get_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<TemplateWithFields>> {
    let template = MetadataTemplateRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MetadataTemplate",
            id,
        }))?;

    let fields = MetadataTemplateFieldRepo::list_by_template(&state.pool, id).await?;

    Ok(Json(TemplateWithFields { template, fields }))
}

/// POST /api/v1/metadata-templates
pub async fn create_template(
    State(state): State<AppState>,
    Json(input): Json<CreateMetadataTemplate>,
) -> AppResult<(StatusCode, Json<MetadataTemplate>)> {
    let template = MetadataTemplateRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(template)))
}

/// PUT /api/v1/metadata-templates/{id}
pub async fn update_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateMetadataTemplate>,
) -> AppResult<Json<MetadataTemplate>> {
    let template = MetadataTemplateRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MetadataTemplate",
            id,
        }))?;
    Ok(Json(template))
}

/// DELETE /api/v1/metadata-templates/{id}
pub async fn delete_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = MetadataTemplateRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "MetadataTemplate",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Field handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/metadata-templates/{id}/fields
pub async fn list_fields(
    State(state): State<AppState>,
    Path(template_id): Path<DbId>,
) -> AppResult<Json<Vec<MetadataTemplateField>>> {
    let fields = MetadataTemplateFieldRepo::list_by_template(&state.pool, template_id).await?;
    Ok(Json(fields))
}

/// POST /api/v1/metadata-templates/{id}/fields
pub async fn create_field(
    State(state): State<AppState>,
    Path(template_id): Path<DbId>,
    Json(mut input): Json<CreateMetadataTemplateField>,
) -> AppResult<(StatusCode, Json<MetadataTemplateField>)> {
    input.template_id = template_id;
    let field = MetadataTemplateFieldRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(field)))
}

/// DELETE /api/v1/metadata-templates/{id}/fields/{field_id}
pub async fn delete_field(
    State(state): State<AppState>,
    Path((_template_id, field_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = MetadataTemplateFieldRepo::delete(&state.pool, field_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "MetadataTemplateField",
            id: field_id,
        }))
    }
}
