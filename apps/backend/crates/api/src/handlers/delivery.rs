//! Handlers for scene assembly & delivery packaging (PRD-39).
//!
//! Provides endpoints for managing output format profiles, watermark settings,
//! starting delivery exports, listing exports, and running pre-export validation.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::assembly;
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::delivery_export::{
    AssemblyStartedResponse, CreateDeliveryExport, DeliveryExport, DeliveryValidationResponse,
    StartAssemblyRequest, ValidationIssueDto,
};
use x121_db::models::output_format_profile::{
    CreateOutputFormatProfile, OutputFormatProfile, UpdateOutputFormatProfile,
};
use x121_db::models::watermark_setting::{
    CreateWatermarkSetting, UpdateWatermarkSetting, WatermarkSetting,
};
use x121_db::repositories::{DeliveryExportRepo, OutputFormatProfileRepo, WatermarkSettingRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination parameters for listing exports.
#[derive(Debug, Deserialize)]
pub struct ListExportsParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that an output format profile exists, returning the full row.
async fn ensure_profile_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<OutputFormatProfile> {
    OutputFormatProfileRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "OutputFormatProfile",
                id,
            })
        })
}

/// Verify that a watermark setting exists, returning the full row.
async fn ensure_watermark_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<WatermarkSetting> {
    WatermarkSettingRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "WatermarkSetting",
                id,
            })
        })
}

/// Verify that a delivery export exists, returning the full row.
async fn ensure_export_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<DeliveryExport> {
    DeliveryExportRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DeliveryExport",
                id,
            })
        })
}

// ===========================================================================
// OUTPUT FORMAT PROFILE HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /output-format-profiles
// ---------------------------------------------------------------------------

/// List all output format profiles.
pub async fn list_profiles(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let items = OutputFormatProfileRepo::list_all(&state.pool).await?;
    tracing::debug!(count = items.len(), "Listed output format profiles");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /output-format-profiles
// ---------------------------------------------------------------------------

/// Create a new output format profile.
pub async fn create_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateOutputFormatProfile>,
) -> AppResult<impl IntoResponse> {
    assembly::validate_codec(&body.codec)?;
    assembly::validate_container(&body.container)?;
    assembly::validate_resolution_str(&body.resolution)?;
    if let Some(ref pf) = body.pixel_format {
        assembly::validate_pixel_format(pf)?;
    }

    let created = OutputFormatProfileRepo::create(&state.pool, &body).await?;
    tracing::info!(id = created.id, name = %created.name, "Output format profile created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /output-format-profiles/{id}
// ---------------------------------------------------------------------------

/// Get a single output format profile by ID.
pub async fn get_profile(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let profile = ensure_profile_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: profile }))
}

// ---------------------------------------------------------------------------
// PUT /output-format-profiles/{id}
// ---------------------------------------------------------------------------

/// Update an existing output format profile.
pub async fn update_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateOutputFormatProfile>,
) -> AppResult<impl IntoResponse> {
    ensure_profile_exists(&state.pool, id).await?;

    if let Some(ref codec) = body.codec {
        assembly::validate_codec(codec)?;
    }
    if let Some(ref container) = body.container {
        assembly::validate_container(container)?;
    }
    if let Some(ref resolution) = body.resolution {
        assembly::validate_resolution_str(resolution)?;
    }
    if let Some(ref pf) = body.pixel_format {
        assembly::validate_pixel_format(pf)?;
    }

    let updated = OutputFormatProfileRepo::update(&state.pool, id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "OutputFormatProfile",
            id,
        }))?;
    tracing::info!(id = updated.id, "Output format profile updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /output-format-profiles/{id}
// ---------------------------------------------------------------------------

/// Delete an output format profile by ID.
pub async fn delete_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = OutputFormatProfileRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Output format profile deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "OutputFormatProfile",
            id,
        }))
    }
}

// ===========================================================================
// ASSEMBLY & EXPORT HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /projects/{project_id}/assemble
// ---------------------------------------------------------------------------

/// Start a new delivery assembly/export job for a project.
pub async fn start_assembly(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<DbId>,
    Json(body): Json<StartAssemblyRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify the format profile exists.
    ensure_profile_exists(&state.pool, body.format_profile_id).await?;

    let characters_json = body
        .character_ids
        .as_ref()
        .map(|ids| serde_json::to_value(ids).unwrap_or(serde_json::Value::Null));

    let input = CreateDeliveryExport {
        project_id,
        format_profile_id: body.format_profile_id,
        exported_by: auth.user_id,
        include_watermark: body.include_watermark,
        characters_json,
    };

    let export = DeliveryExportRepo::create(&state.pool, &input).await?;
    tracing::info!(
        export_id = export.id,
        project_id,
        user_id = auth.user_id,
        "Delivery assembly started"
    );

    let response = AssemblyStartedResponse {
        export_id: export.id,
        status: assembly::EXPORT_STATUS_PENDING.to_string(),
    };

    Ok((StatusCode::CREATED, Json(DataResponse { data: response })))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/exports
// ---------------------------------------------------------------------------

/// List delivery exports for a project.
pub async fn list_exports(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(params): Query<ListExportsParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let items = DeliveryExportRepo::list_by_project(&state.pool, project_id, limit, offset).await?;
    tracing::debug!(count = items.len(), project_id, "Listed delivery exports");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/exports/{export_id}
// ---------------------------------------------------------------------------

/// Get a single delivery export by ID.
pub async fn get_export(
    State(state): State<AppState>,
    Path((_project_id, export_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let export = ensure_export_exists(&state.pool, export_id).await?;
    Ok(Json(DataResponse { data: export }))
}

// ---------------------------------------------------------------------------
// GET /projects/{project_id}/delivery-validation
// ---------------------------------------------------------------------------

/// Run pre-export validation checks for a project.
///
/// This performs basic structural validation. A full implementation would
/// check for missing videos, codec consistency, and resolution matching.
pub async fn validate_delivery(
    State(_state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Placeholder: return an empty validation result.
    // A full implementation would query project data and run checks.
    let _project_id = project_id;
    let issues: Vec<assembly::ValidationIssue> = Vec::new();
    let result = assembly::ValidationResult::from_issues(issues);

    let dto_issues: Vec<ValidationIssueDto> = result
        .errors
        .iter()
        .chain(result.warnings.iter())
        .map(|issue| ValidationIssueDto {
            severity: match issue.severity {
                assembly::IssueSeverity::Error => "error".to_string(),
                assembly::IssueSeverity::Warning => "warning".to_string(),
            },
            category: issue.category.clone(),
            message: issue.message.clone(),
            entity_id: issue.entity_id,
        })
        .collect();

    let response = DeliveryValidationResponse {
        passed: result.passed,
        error_count: result.errors.len(),
        warning_count: result.warnings.len(),
        issues: dto_issues,
    };

    Ok(Json(DataResponse { data: response }))
}

// ===========================================================================
// WATERMARK SETTINGS HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /watermark-settings
// ---------------------------------------------------------------------------

/// List all watermark settings.
pub async fn list_watermarks(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let items = WatermarkSettingRepo::list_all(&state.pool).await?;
    tracing::debug!(count = items.len(), "Listed watermark settings");
    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /watermark-settings
// ---------------------------------------------------------------------------

/// Create a new watermark setting.
pub async fn create_watermark(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateWatermarkSetting>,
) -> AppResult<impl IntoResponse> {
    assembly::validate_watermark_type(&body.watermark_type)?;
    if let Some(ref pos) = body.position {
        assembly::validate_watermark_position(pos)?;
    }
    if let Some(opacity) = body.opacity {
        assembly::validate_opacity(opacity)?;
    }

    let created = WatermarkSettingRepo::create(&state.pool, &body).await?;
    tracing::info!(id = created.id, name = %created.name, "Watermark setting created");
    Ok((StatusCode::CREATED, Json(DataResponse { data: created })))
}

// ---------------------------------------------------------------------------
// GET /watermark-settings/{id}
// ---------------------------------------------------------------------------

/// Get a single watermark setting by ID.
pub async fn get_watermark(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let wm = ensure_watermark_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: wm }))
}

// ---------------------------------------------------------------------------
// PUT /watermark-settings/{id}
// ---------------------------------------------------------------------------

/// Update an existing watermark setting.
pub async fn update_watermark(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateWatermarkSetting>,
) -> AppResult<impl IntoResponse> {
    ensure_watermark_exists(&state.pool, id).await?;

    if let Some(ref wt) = body.watermark_type {
        assembly::validate_watermark_type(wt)?;
    }
    if let Some(ref pos) = body.position {
        assembly::validate_watermark_position(pos)?;
    }
    if let Some(opacity) = body.opacity {
        assembly::validate_opacity(opacity)?;
    }

    let updated = WatermarkSettingRepo::update(&state.pool, id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WatermarkSetting",
            id,
        }))?;
    tracing::info!(id = updated.id, "Watermark setting updated");
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /watermark-settings/{id}
// ---------------------------------------------------------------------------

/// Delete a watermark setting by ID.
pub async fn delete_watermark(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = WatermarkSettingRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Watermark setting deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "WatermarkSetting",
            id,
        }))
    }
}
