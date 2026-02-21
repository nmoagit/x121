//! Handlers for the `/validation` and `/imports` resources.
//!
//! Provides validation rule CRUD, dry-run record validation with import
//! preview generation, import commit, and report export (JSON/CSV).

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use trulience_core::error::CoreError;
use trulience_core::import_status::{
    IMPORT_STATUS_COMMITTED, IMPORT_STATUS_PREVIEW, IMPORT_STATUS_PREVIEW_ID,
};
use trulience_core::types::DbId;
use trulience_core::validation::conflict::ConflictResolutionChoice;
use trulience_core::validation::evaluator::evaluate_rules;
use trulience_core::validation::import_preview::{ImportAction, ImportPreview, ImportPreviewEntry};
use trulience_core::validation::rules::{ValidationRule, ValidationSeverity};
use trulience_db::models::validation::{
    CreateImportReport, CreateImportReportEntry, CreateValidationRule, UpdateValidationRule,
    ValidationRuleRow,
};
use trulience_db::repositories::{ImportReportRepo, ValidationRuleRepo};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ── Validation Rule CRUD ─────────────────────────────────────────────

/// GET /api/v1/validation/rule-types
///
/// List all available validation rule types (seeded lookup data).
pub async fn list_rule_types(State(state): State<AppState>) -> AppResult<Json<serde_json::Value>> {
    let types = ValidationRuleRepo::list_rule_types(&state.pool).await?;
    Ok(Json(serde_json::json!({ "data": types })))
}

/// Query parameters for listing validation rules.
#[derive(Debug, Deserialize)]
pub struct ListRulesParams {
    pub entity_type: String,
    pub project_id: Option<DbId>,
}

/// GET /api/v1/validation/rules?entity_type=X&project_id=Y
///
/// List all validation rules for a given entity type, optionally scoped
/// to a project. Returns both global and project-specific rules.
pub async fn list_rules(
    State(state): State<AppState>,
    Query(params): Query<ListRulesParams>,
) -> AppResult<Json<serde_json::Value>> {
    let rules = ValidationRuleRepo::list_by_entity_type(
        &state.pool,
        &params.entity_type,
        params.project_id,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": rules })))
}

/// POST /api/v1/validation/rules
///
/// Create a new validation rule. Returns the created rule with HTTP 201.
pub async fn create_rule(
    State(state): State<AppState>,
    Json(input): Json<CreateValidationRule>,
) -> AppResult<(StatusCode, Json<serde_json::Value>)> {
    let rule = ValidationRuleRepo::create(&state.pool, &input).await?;
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "data": rule })),
    ))
}

/// PUT /api/v1/validation/rules/{id}
///
/// Update an existing validation rule. Returns 404 if not found.
pub async fn update_rule(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateValidationRule>,
) -> AppResult<Json<serde_json::Value>> {
    let rule = ValidationRuleRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ValidationRule",
            id,
        }))?;
    Ok(Json(serde_json::json!({ "data": rule })))
}

/// DELETE /api/v1/validation/rules/{id}
///
/// Delete a validation rule. Returns 204 on success, 404 if not found.
pub async fn delete_rule(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ValidationRuleRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ValidationRule",
            id,
        }))
    }
}

// ── Validation / Dry-Run ─────────────────────────────────────────────

/// Request body for the validation (dry-run) endpoint.
#[derive(Debug, Deserialize)]
pub struct ValidateRequest {
    pub entity_type: String,
    pub records: Vec<serde_json::Map<String, serde_json::Value>>,
    pub project_id: Option<DbId>,
}

/// POST /api/v1/validation/validate
///
/// Evaluate validation rules against the supplied records and produce an
/// import preview. Persists the preview as an import report with per-record
/// entries for later retrieval or commit.
pub async fn validate(
    State(state): State<AppState>,
    Json(body): Json<ValidateRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if body.records.is_empty() {
        return Err(AppError::BadRequest(
            "records array must not be empty".to_string(),
        ));
    }

    // Load rules once for the entity type.
    let rule_rows =
        ValidationRuleRepo::load_rules(&state.pool, &body.entity_type, body.project_id).await?;
    let rules = rows_to_rules(&rule_rows);

    // Evaluate each record and build the preview.
    let mut preview = ImportPreview::new(body.records.len());
    for (index, record) in body.records.iter().enumerate() {
        let result = evaluate_rules(&rules, record);
        let action = if result.is_valid {
            ImportAction::Create
        } else {
            ImportAction::Reject
        };
        preview.push(ImportPreviewEntry {
            record_index: index,
            action,
            entity_id: None,
            validation_result: result,
            field_diffs: Vec::new(),
            conflicts: Vec::new(),
        });
    }

    // Persist the preview report.
    let report =
        persist_preview_report(&state.pool, &body.entity_type, body.project_id, &preview).await?;

    // Persist per-record entries.
    let entries = build_report_entries(report.id, &preview);
    ImportReportRepo::create_entries_batch(&state.pool, &entries).await?;

    Ok(Json(serde_json::json!({
        "data": {
            "report_id": report.id,
            "preview": preview,
        }
    })))
}

// ── Import Commit ────────────────────────────────────────────────────

/// Request body for the import commit endpoint.
#[derive(Debug, Deserialize)]
pub struct CommitImportRequest {
    #[serde(default)]
    pub conflict_resolutions: Vec<ConflictResolutionChoice>,
}

/// POST /api/v1/imports/{id}/commit
///
/// Commit a previously-created import preview. Only reports in `preview`
/// status (status_id = 1) can be committed. Returns 409 if the report
/// has already been committed or is in another state.
pub async fn commit_import(
    State(state): State<AppState>,
    Path(report_id): Path<DbId>,
    Json(_body): Json<CommitImportRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let report = ImportReportRepo::find_by_id(&state.pool, report_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportReport",
            id: report_id,
        }))?;

    // Only "preview" reports can be committed.
    if report.status_id != IMPORT_STATUS_PREVIEW_ID {
        return Err(AppError::Core(CoreError::Conflict(
            "Only reports in 'preview' status can be committed".to_string(),
        )));
    }

    let updated = ImportReportRepo::update_status(&state.pool, report_id, IMPORT_STATUS_COMMITTED)
        .await?
        .ok_or(AppError::InternalError(
            "Failed to update report status".to_string(),
        ))?;

    Ok(Json(serde_json::json!({ "data": updated })))
}

// ── Import Reports ───────────────────────────────────────────────────

/// GET /api/v1/imports/{id}/report
///
/// Export a full import report as JSON (report metadata + all entries).
pub async fn get_report(
    State(state): State<AppState>,
    Path(report_id): Path<DbId>,
) -> AppResult<Json<serde_json::Value>> {
    let report_json = ImportReportRepo::export_json(&state.pool, report_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportReport",
            id: report_id,
        }))?;
    Ok(Json(serde_json::json!({ "data": report_json })))
}

/// GET /api/v1/imports/{id}/report/csv
///
/// Export a report's entries as CSV. Returns `text/csv` content type.
pub async fn get_report_csv(
    State(state): State<AppState>,
    Path(report_id): Path<DbId>,
) -> AppResult<(
    StatusCode,
    [(axum::http::header::HeaderName, &'static str); 1],
    String,
)> {
    let csv = ImportReportRepo::export_csv(&state.pool, report_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportReport",
            id: report_id,
        }))?;
    Ok((
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/csv")],
        csv,
    ))
}

/// Query parameters for listing import reports.
#[derive(Debug, Deserialize)]
pub struct ListImportsParams {
    pub entity_type: Option<String>,
    pub project_id: Option<DbId>,
}

/// GET /api/v1/imports?entity_type=X&project_id=Y
///
/// List import reports, optionally filtered by entity type and/or project.
pub async fn list_imports(
    State(state): State<AppState>,
    Query(params): Query<ListImportsParams>,
) -> AppResult<Json<serde_json::Value>> {
    let reports = ImportReportRepo::list(
        &state.pool,
        params.entity_type.as_deref(),
        params.project_id,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": reports })))
}

// ── Private helpers ──────────────────────────────────────────────────

/// Convert database rows into core [`ValidationRule`] values for the evaluator.
fn rows_to_rules(rows: &[ValidationRuleRow]) -> Vec<ValidationRule> {
    rows.iter()
        .map(|row| ValidationRule {
            id: row.id,
            entity_type: row.entity_type.clone(),
            field_name: row.field_name.clone(),
            rule_type: row.rule_type.clone(),
            config: row.config.clone(),
            error_message: row.error_message.clone(),
            severity: match row.severity.as_str() {
                "warning" => ValidationSeverity::Warning,
                _ => ValidationSeverity::Error,
            },
        })
        .collect()
}

/// Persist an import preview as a new report in `preview` status.
async fn persist_preview_report(
    pool: &sqlx::PgPool,
    entity_type: &str,
    project_id: Option<DbId>,
    preview: &ImportPreview,
) -> Result<trulience_db::models::validation::ImportReport, AppError> {
    let input = CreateImportReport {
        status: IMPORT_STATUS_PREVIEW.to_string(),
        source_type: "api".to_string(),
        source_reference: None,
        entity_type: entity_type.to_string(),
        project_id,
        total_records: preview.total_records as i32,
        accepted: (preview.to_create.len() + preview.to_update.len()) as i32,
        rejected: preview.invalid.len() as i32,
        auto_corrected: 0,
        skipped: preview.to_skip.len() as i32,
        report_data: serde_json::to_value(preview).unwrap_or_default(),
        created_by: None,
    };
    Ok(ImportReportRepo::create(pool, &input).await?)
}

/// Build report entry DTOs from a completed preview.
fn build_report_entries(report_id: DbId, preview: &ImportPreview) -> Vec<CreateImportReportEntry> {
    preview
        .to_create
        .iter()
        .chain(preview.to_update.iter())
        .chain(preview.to_skip.iter())
        .chain(preview.invalid.iter())
        .map(|entry| CreateImportReportEntry {
            report_id,
            record_index: entry.record_index as i32,
            entity_id: entry.entity_id,
            action: entry.action.as_str().to_string(),
            field_errors: serde_json::to_value(&entry.validation_result.errors).unwrap_or_default(),
            field_warnings: serde_json::to_value(&entry.validation_result.warnings)
                .unwrap_or_default(),
            field_diffs: serde_json::to_value(&entry.field_diffs).unwrap_or_default(),
            conflict_resolutions: serde_json::to_value(&entry.conflicts).unwrap_or_default(),
        })
        .collect()
}
