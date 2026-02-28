//! Handlers for Platform Setup Wizard (PRD-105).
//!
//! All endpoints are admin-only. Provides wizard status, step execution,
//! connection testing, skip, reset, and per-step config retrieval.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::setup_wizard::{
    build_step_validation_result, build_wizard_state, validate_admin_config,
    validate_comfyui_config, validate_comfyui_url, validate_database_config,
    validate_integrations_config, validate_smtp_config, validate_storage_config,
    validate_worker_config, AdminAccountStepConfig, ComfyUiStepConfig, DatabaseStepConfig,
    IntegrationsStepConfig, SetupStepName, StepStatus, StepValidationResult, StorageStepConfig,
    WorkerStepConfig,
};

use x121_db::repositories::PlatformSetupRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert a `PlatformSetup` row to the core `StepStatus` DTO.
fn row_to_step_status(row: &x121_db::models::setup_wizard::PlatformSetup) -> StepStatus {
    StepStatus {
        name: row.step_name.clone(),
        completed: row.completed,
        validated_at: row.validated_at,
        error_message: row.error_message.clone(),
        has_config: row.config_json.is_some(),
    }
}

/// Find a step by name or return 404.
async fn ensure_step_exists(
    state: &AppState,
    step_name: &str,
) -> AppResult<x121_db::models::setup_wizard::PlatformSetup> {
    // Validate step name first.
    SetupStepName::parse(step_name)?;

    PlatformSetupRepo::find_by_step_name(&state.pool, step_name)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Validation(format!(
                "Setup step '{step_name}' not found in database"
            )))
        })
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/// Body for the execute-step endpoint.
#[derive(Debug, Deserialize)]
pub struct ExecuteStepBody {
    /// Configuration for this step as a JSON object.
    pub config: serde_json::Value,
}

/// Body for the test-connection endpoint.
#[derive(Debug, Deserialize)]
pub struct TestConnectionBody {
    /// Which service to test: "database", "comfyui", "smtp".
    pub service_type: String,
    /// Service-specific configuration.
    pub config: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /admin/setup/status` -- get the full wizard state with all steps.
pub async fn get_wizard_status(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let rows = PlatformSetupRepo::list_all(&state.pool).await?;
    let steps: Vec<StepStatus> = rows.iter().map(row_to_step_status).collect();
    let wizard_state = build_wizard_state(&steps);
    Ok(Json(DataResponse { data: wizard_state }))
}

/// `POST /admin/setup/step/:step_name` -- validate and execute a setup step.
pub async fn execute_step(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(step_name): Path<String>,
    Json(body): Json<ExecuteStepBody>,
) -> AppResult<impl IntoResponse> {
    let _existing = ensure_step_exists(&state, &step_name).await?;
    let step = SetupStepName::parse(&step_name)?;

    // Validate the step-specific configuration.
    validate_step_config(step, &body.config)?;

    // Mark the step as complete.
    let updated = PlatformSetupRepo::mark_complete(
        &state.pool,
        &step_name,
        Some(&body.config),
        admin.user_id,
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::Validation(format!(
            "Failed to update step '{step_name}'"
        )))
    })?;

    tracing::info!(
        step = %step_name,
        user_id = admin.user_id,
        "Setup step completed"
    );

    let step_status = row_to_step_status(&updated);
    Ok(Json(DataResponse { data: step_status }))
}

/// `POST /admin/setup/test-connection` -- test connectivity for a service.
///
/// Validates the provided config and returns a `StepValidationResult`.
/// Actual network connectivity testing can be added later; for now this
/// validates the configuration format.
pub async fn test_connection(
    RequireAdmin(_admin): RequireAdmin,
    Json(body): Json<TestConnectionBody>,
) -> AppResult<impl IntoResponse> {
    let result = match body.service_type.as_str() {
        "database" => test_database_connection(&body.config),
        "comfyui" => test_comfyui_connection(&body.config),
        "smtp" => test_smtp_connection(&body.config),
        other => {
            return Err(AppError::Core(CoreError::Validation(format!(
                "Unknown service type: {other}. Expected: database, comfyui, smtp"
            ))));
        }
    };

    Ok(Json(DataResponse { data: result }))
}

/// `POST /admin/setup/skip` -- mark all steps as complete (skip wizard).
pub async fn skip_wizard(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let now = Utc::now();

    for step in SetupStepName::all() {
        let step_name = step.as_str();
        PlatformSetupRepo::update_step(
            &state.pool,
            step_name,
            Some(true),
            None,
            Some(now),
            Some(admin.user_id),
            None,
        )
        .await?;
    }

    tracing::info!(user_id = admin.user_id, "Setup wizard skipped");

    // Return updated state.
    let rows = PlatformSetupRepo::list_all(&state.pool).await?;
    let steps: Vec<StepStatus> = rows.iter().map(row_to_step_status).collect();
    let wizard_state = build_wizard_state(&steps);
    Ok(Json(DataResponse { data: wizard_state }))
}

/// `POST /admin/setup/step/:step_name/reset` -- reset a step to incomplete.
pub async fn reset_step(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(step_name): Path<String>,
) -> AppResult<impl IntoResponse> {
    let _existing = ensure_step_exists(&state, &step_name).await?;

    let updated = PlatformSetupRepo::reset_step(&state.pool, &step_name)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Validation(format!(
                "Failed to reset step '{step_name}'"
            )))
        })?;

    tracing::info!(
        step = %step_name,
        user_id = admin.user_id,
        "Setup step reset"
    );

    let step_status = row_to_step_status(&updated);
    Ok(Json(DataResponse { data: step_status }))
}

/// `GET /admin/setup/step/:step_name` -- get config for a specific step.
pub async fn get_step_config(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(step_name): Path<String>,
) -> AppResult<impl IntoResponse> {
    let row = ensure_step_exists(&state, &step_name).await?;
    let step_status = row_to_step_status(&row);
    Ok(Json(DataResponse { data: step_status }))
}

// ---------------------------------------------------------------------------
// Step validation dispatcher
// ---------------------------------------------------------------------------

/// Validate step-specific configuration based on the step name.
fn validate_step_config(step: SetupStepName, config: &serde_json::Value) -> AppResult<()> {
    match step {
        SetupStepName::Database => {
            let parsed: DatabaseStepConfig = serde_json::from_value(config.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid database config: {e}")))?;
            validate_database_config(&parsed)?;
        }
        SetupStepName::Storage => {
            let parsed: StorageStepConfig = serde_json::from_value(config.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid storage config: {e}")))?;
            validate_storage_config(&parsed)?;
        }
        SetupStepName::ComfyUi => {
            let parsed: ComfyUiStepConfig = serde_json::from_value(config.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid ComfyUI config: {e}")))?;
            validate_comfyui_config(&parsed)?;
        }
        SetupStepName::AdminAccount => {
            let parsed: AdminAccountStepConfig = serde_json::from_value(config.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid admin account config: {e}")))?;
            validate_admin_config(&parsed)?;
        }
        SetupStepName::WorkerRegistration => {
            let parsed: WorkerStepConfig = serde_json::from_value(config.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid worker config: {e}")))?;
            validate_worker_config(&parsed)?;
        }
        SetupStepName::Integrations => {
            let parsed: IntegrationsStepConfig = serde_json::from_value(config.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid integrations config: {e}")))?;
            validate_integrations_config(&parsed)?;
        }
        SetupStepName::HealthCheck => {
            // Health check step has no specific config to validate.
            // Any JSON value is acceptable.
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Connection testers
// ---------------------------------------------------------------------------

/// Test database connection by validating config.
fn test_database_connection(config: &serde_json::Value) -> StepValidationResult {
    let parsed: Result<DatabaseStepConfig, _> = serde_json::from_value(config.clone());
    match parsed {
        Ok(ref cfg) => match validate_database_config(cfg) {
            Ok(()) => build_step_validation_result(
                true,
                &format!(
                    "Database configuration valid: {}@{}:{}/{}",
                    cfg.user, cfg.host, cfg.port, cfg.name
                ),
            ),
            Err(e) => build_step_validation_result(false, &e.to_string()),
        },
        Err(e) => build_step_validation_result(false, &format!("Invalid database config: {e}")),
    }
}

/// Test ComfyUI connection by validating URL.
fn test_comfyui_connection(config: &serde_json::Value) -> StepValidationResult {
    // Accept either a full ComfyUiStepConfig or just { "url": "..." }.
    if let Some(url) = config.get("url").and_then(|v| v.as_str()) {
        match validate_comfyui_url(url) {
            Ok(()) => build_step_validation_result(true, &format!("ComfyUI URL valid: {url}")),
            Err(e) => build_step_validation_result(false, &e.to_string()),
        }
    } else {
        let parsed: Result<ComfyUiStepConfig, _> = serde_json::from_value(config.clone());
        match parsed {
            Ok(ref cfg) => match validate_comfyui_config(cfg) {
                Ok(()) => build_step_validation_result(
                    true,
                    &format!(
                        "ComfyUI configuration valid: {} instance(s)",
                        cfg.instances.len()
                    ),
                ),
                Err(e) => build_step_validation_result(false, &e.to_string()),
            },
            Err(e) => build_step_validation_result(false, &format!("Invalid ComfyUI config: {e}")),
        }
    }
}

/// Test SMTP connection by validating config.
fn test_smtp_connection(config: &serde_json::Value) -> StepValidationResult {
    let host = config.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = config.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;

    match validate_smtp_config(host, port) {
        Ok(()) => {
            build_step_validation_result(true, &format!("SMTP configuration valid: {host}:{port}"))
        }
        Err(e) => build_step_validation_result(false, &e.to_string()),
    }
}
