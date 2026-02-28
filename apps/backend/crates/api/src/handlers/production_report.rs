//! Handlers for the production reporting & data export system (PRD-73).
//!
//! Provides endpoints for listing report types, generating reports,
//! retrieving report data, downloading reports, and managing report schedules.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::production_report::{validate_format, validate_schedule};
use x121_core::types::DbId;
use x121_db::models::production_report::{
    CreateReport, CreateReportSchedule, UpdateReportSchedule,
};
use x121_db::repositories::ProductionReportRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Report Type Handlers
// ---------------------------------------------------------------------------

/// GET /reports/templates
///
/// List all available report types.
pub async fn list_report_types(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let types = ProductionReportRepo::list_report_types(&state.pool).await?;
    Ok(Json(DataResponse { data: types }))
}

// ---------------------------------------------------------------------------
// Report Handlers
// ---------------------------------------------------------------------------

/// POST /reports/generate
///
/// Generate a new report. Validates the format and report type, then creates
/// a report record with status pending.
pub async fn generate_report(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateReport>,
) -> AppResult<impl IntoResponse> {
    validate_format(&input.format).map_err(AppError::BadRequest)?;

    // Verify the report type exists.
    ensure_report_type_exists(&state.pool, input.report_type_id).await?;

    let report = ProductionReportRepo::create_report(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        report_id = report.id,
        report_type_id = report.report_type_id,
        format = %report.format,
        "Report generation requested"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: report })))
}

/// GET /reports/{id}
///
/// Get a single report by ID.
pub async fn get_report(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let report = ProductionReportRepo::get_report(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Report",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: report }))
}

/// GET /reports
///
/// List reports with optional pagination.
pub async fn list_reports(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let reports =
        ProductionReportRepo::list_reports(&state.pool, params.limit, params.offset).await?;
    Ok(Json(DataResponse { data: reports }))
}

/// GET /reports/{id}/download
///
/// Download a report's data. Returns the data_json payload as a JSON file
/// attachment (placeholder for binary file streaming in future iterations).
pub async fn download_report(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let report = ProductionReportRepo::get_report(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Report",
                id,
            })
        })?;

    let data = report.data_json.unwrap_or(serde_json::Value::Null);

    Ok(Json(DataResponse { data }))
}

// ---------------------------------------------------------------------------
// Schedule Handlers
// ---------------------------------------------------------------------------

/// POST /report-schedules
///
/// Create a new report schedule. Validates format and schedule string.
pub async fn create_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateReportSchedule>,
) -> AppResult<impl IntoResponse> {
    validate_format(&input.format).map_err(AppError::BadRequest)?;
    validate_schedule(&input.schedule).map_err(AppError::BadRequest)?;

    let schedule = ProductionReportRepo::create_schedule(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        schedule_id = schedule.id,
        report_type_id = schedule.report_type_id,
        schedule = %schedule.schedule,
        "Report schedule created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: schedule })))
}

/// GET /report-schedules
///
/// List all report schedules.
pub async fn list_schedules(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let schedules = ProductionReportRepo::list_schedules(&state.pool).await?;
    Ok(Json(DataResponse { data: schedules }))
}

/// PUT /report-schedules/{id}
///
/// Update a report schedule.
pub async fn update_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateReportSchedule>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref fmt) = input.format {
        validate_format(fmt).map_err(AppError::BadRequest)?;
    }
    if let Some(ref sched) = input.schedule {
        validate_schedule(sched).map_err(AppError::BadRequest)?;
    }

    let schedule = ProductionReportRepo::update_schedule(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReportSchedule",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        schedule_id = id,
        "Report schedule updated"
    );

    Ok(Json(DataResponse { data: schedule }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Ensure a report type exists, returning an error if not found.
async fn ensure_report_type_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<()> {
    ProductionReportRepo::get_report_type_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReportType",
                id,
            })
        })?;
    Ok(())
}

/// DELETE /report-schedules/{id}
///
/// Delete a report schedule.
pub async fn delete_schedule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ProductionReportRepo::delete_schedule(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ReportSchedule",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        schedule_id = id,
        "Report schedule deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}
