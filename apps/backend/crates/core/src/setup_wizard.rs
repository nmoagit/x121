//! Pure business logic for Platform Setup Wizard (PRD-105).
//!
//! Contains enums, structs, validation functions, and state-building helpers
//! with no database dependencies. All datetime operations use `chrono::DateTime<Utc>`.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum password length for the admin account step.
const MIN_PASSWORD_LENGTH: usize = 12;

/// Minimum storage space in GB.
const MIN_STORAGE_SPACE_GB: u64 = 1;

/// Maximum SMTP port number.
const MAX_PORT: u16 = 65535;

// ---------------------------------------------------------------------------
// SetupStepName
// ---------------------------------------------------------------------------

/// Canonical setup wizard step names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SetupStepName {
    Database,
    Storage,
    ComfyUi,
    AdminAccount,
    WorkerRegistration,
    Integrations,
    HealthCheck,
}

impl SetupStepName {
    /// Convert to the database TEXT representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Database => "database",
            Self::Storage => "storage",
            Self::ComfyUi => "comfyui",
            Self::AdminAccount => "admin_account",
            Self::WorkerRegistration => "worker_registration",
            Self::Integrations => "integrations",
            Self::HealthCheck => "health_check",
        }
    }

    /// Parse from a database TEXT value.
    pub fn parse(s: &str) -> Result<Self, CoreError> {
        match s {
            "database" => Ok(Self::Database),
            "storage" => Ok(Self::Storage),
            "comfyui" => Ok(Self::ComfyUi),
            "admin_account" => Ok(Self::AdminAccount),
            "worker_registration" => Ok(Self::WorkerRegistration),
            "integrations" => Ok(Self::Integrations),
            "health_check" => Ok(Self::HealthCheck),
            other => Err(CoreError::Validation(format!(
                "Invalid setup step name: {other}"
            ))),
        }
    }

    /// All step names in canonical order.
    pub fn all() -> &'static [SetupStepName] {
        &[
            Self::Database,
            Self::Storage,
            Self::ComfyUi,
            Self::AdminAccount,
            Self::WorkerRegistration,
            Self::Integrations,
            Self::HealthCheck,
        ]
    }
}

impl std::fmt::Display for SetupStepName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Step status & wizard state
// ---------------------------------------------------------------------------

/// Status of a single setup wizard step.
#[derive(Debug, Clone, Serialize)]
pub struct StepStatus {
    /// Step name (e.g. "database", "storage").
    pub name: String,
    /// Whether the step has been completed successfully.
    pub completed: bool,
    /// When the step was last validated, if ever.
    pub validated_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Error message from the last failed attempt, if any.
    pub error_message: Option<String>,
    /// Whether the step has associated configuration.
    pub has_config: bool,
}

/// Overall wizard state combining all step statuses.
#[derive(Debug, Clone, Serialize)]
pub struct WizardState {
    /// Status of each step in canonical order.
    pub steps: Vec<StepStatus>,
    /// Whether the entire wizard is complete.
    pub completed: bool,
    /// Index of the first non-completed step (0-based). Equal to `steps.len()`
    /// if all steps are completed.
    pub current_step_index: usize,
}

/// Build the overall wizard state from a list of step statuses.
///
/// Computes the `current_step_index` (first non-completed step) and the
/// `completed` flag (all required steps finished).
pub fn build_wizard_state(steps: &[StepStatus]) -> WizardState {
    let current_step_index = steps
        .iter()
        .position(|s| !s.completed)
        .unwrap_or(steps.len());
    let completed = is_wizard_complete(steps);

    WizardState {
        steps: steps.to_vec(),
        completed,
        current_step_index,
    }
}

/// Check whether the wizard is complete: all required steps are finished.
///
/// The `integrations` step is optional and not required for completion.
pub fn is_wizard_complete(steps: &[StepStatus]) -> bool {
    let required = get_required_steps();
    for req in &required {
        let req_name = req.as_str();
        let found = steps.iter().any(|s| s.name == req_name && s.completed);
        if !found {
            return false;
        }
    }
    true
}

/// Return the list of required steps (all except Integrations).
pub fn get_required_steps() -> Vec<SetupStepName> {
    SetupStepName::all()
        .iter()
        .copied()
        .filter(|s| *s != SetupStepName::Integrations)
        .collect()
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate password strength for the admin account step.
///
/// Requirements: min 12 chars, has uppercase, lowercase, and at least one digit.
pub fn validate_password_strength(password: &str) -> Result<(), CoreError> {
    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(CoreError::Validation(format!(
            "Password must be at least {MIN_PASSWORD_LENGTH} avatars"
        )));
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err(CoreError::Validation(
            "Password must contain at least one uppercase letter".to_string(),
        ));
    }
    if !password.chars().any(|c| c.is_lowercase()) {
        return Err(CoreError::Validation(
            "Password must contain at least one lowercase letter".to_string(),
        ));
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(CoreError::Validation(
            "Password must contain at least one digit".to_string(),
        ));
    }
    Ok(())
}

/// Validate a storage path: must be non-empty and absolute.
pub fn validate_storage_path(path: &str) -> Result<(), CoreError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Storage path cannot be empty".to_string(),
        ));
    }
    if !trimmed.starts_with('/') {
        return Err(CoreError::Validation(
            "Storage path must be an absolute path (starts with '/')".to_string(),
        ));
    }
    Ok(())
}

/// Validate a ComfyUI URL: basic format validation.
pub fn validate_comfyui_url(url: &str) -> Result<(), CoreError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "ComfyUI URL cannot be empty".to_string(),
        ));
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(CoreError::Validation(
            "ComfyUI URL must start with http:// or https://".to_string(),
        ));
    }
    // Must have a host after the scheme.
    let after_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or_default();
    if after_scheme.is_empty() {
        return Err(CoreError::Validation(
            "ComfyUI URL must include a hostname".to_string(),
        ));
    }
    Ok(())
}

/// Validate SMTP configuration: host must be non-empty and port valid.
pub fn validate_smtp_config(host: &str, port: u16) -> Result<(), CoreError> {
    if host.trim().is_empty() {
        return Err(CoreError::Validation(
            "SMTP host cannot be empty".to_string(),
        ));
    }
    if port == 0 {
        return Err(CoreError::Validation(
            "SMTP port must be between 1 and 65535".to_string(),
        ));
    }
    // port is u16, so it cannot exceed MAX_PORT by type constraint,
    // but we document the intent.
    let _ = MAX_PORT;
    Ok(())
}

// ---------------------------------------------------------------------------
// Step configuration types
// ---------------------------------------------------------------------------

/// Configuration for the database setup step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStepConfig {
    pub host: String,
    pub port: u16,
    pub name: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
}

/// Configuration for the storage setup step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStepConfig {
    pub root_path: String,
    pub min_space_gb: u64,
}

/// A single ComfyUI instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyUiInstance {
    pub url: String,
    pub name: String,
}

/// Configuration for the ComfyUI setup step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyUiStepConfig {
    pub instances: Vec<ComfyUiInstance>,
}

/// Configuration for the admin account setup step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminAccountStepConfig {
    pub username: String,
    pub password: String,
}

/// Configuration for the worker registration setup step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerStepConfig {
    pub worker_url: String,
    pub name: String,
}

/// Configuration for the integrations setup step (all optional).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationsStepConfig {
    pub email: Option<SmtpConfig>,
    pub slack_webhook: Option<String>,
    pub backup_destination: Option<String>,
}

/// SMTP email configuration for the integrations step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

/// Result of validating or testing a setup step.
#[derive(Debug, Clone, Serialize)]
pub struct StepValidationResult {
    /// Whether the validation/test succeeded.
    pub success: bool,
    /// Human-readable result message.
    pub message: String,
    /// Optional structured details.
    pub details: Option<serde_json::Value>,
}

/// Build a `StepValidationResult` with no extra details.
pub fn build_step_validation_result(success: bool, message: &str) -> StepValidationResult {
    StepValidationResult {
        success,
        message: message.to_string(),
        details: None,
    }
}

// ---------------------------------------------------------------------------
// Step validation helpers
// ---------------------------------------------------------------------------

/// Validate the database step configuration.
pub fn validate_database_config(config: &DatabaseStepConfig) -> Result<(), CoreError> {
    if config.host.trim().is_empty() {
        return Err(CoreError::Validation(
            "Database host cannot be empty".to_string(),
        ));
    }
    if config.port == 0 {
        return Err(CoreError::Validation(
            "Database port must be between 1 and 65535".to_string(),
        ));
    }
    if config.name.trim().is_empty() {
        return Err(CoreError::Validation(
            "Database name cannot be empty".to_string(),
        ));
    }
    if config.user.trim().is_empty() {
        return Err(CoreError::Validation(
            "Database user cannot be empty".to_string(),
        ));
    }
    Ok(())
}

/// Validate the storage step configuration.
pub fn validate_storage_config(config: &StorageStepConfig) -> Result<(), CoreError> {
    validate_storage_path(&config.root_path)?;
    if config.min_space_gb < MIN_STORAGE_SPACE_GB {
        return Err(CoreError::Validation(format!(
            "Minimum storage space must be at least {MIN_STORAGE_SPACE_GB} GB"
        )));
    }
    Ok(())
}

/// Validate the ComfyUI step configuration.
pub fn validate_comfyui_config(config: &ComfyUiStepConfig) -> Result<(), CoreError> {
    if config.instances.is_empty() {
        return Err(CoreError::Validation(
            "At least one ComfyUI instance is required".to_string(),
        ));
    }
    for (i, inst) in config.instances.iter().enumerate() {
        validate_comfyui_url(&inst.url)
            .map_err(|e| CoreError::Validation(format!("ComfyUI instance {}: {e}", i + 1)))?;
        if inst.name.trim().is_empty() {
            return Err(CoreError::Validation(format!(
                "ComfyUI instance {} name cannot be empty",
                i + 1
            )));
        }
    }
    Ok(())
}

/// Validate the admin account step configuration.
pub fn validate_admin_config(config: &AdminAccountStepConfig) -> Result<(), CoreError> {
    if config.username.trim().is_empty() {
        return Err(CoreError::Validation(
            "Admin username cannot be empty".to_string(),
        ));
    }
    validate_password_strength(&config.password)
}

/// Validate the worker registration step configuration.
pub fn validate_worker_config(config: &WorkerStepConfig) -> Result<(), CoreError> {
    if config.worker_url.trim().is_empty() {
        return Err(CoreError::Validation(
            "Worker URL cannot be empty".to_string(),
        ));
    }
    if config.name.trim().is_empty() {
        return Err(CoreError::Validation(
            "Worker name cannot be empty".to_string(),
        ));
    }
    Ok(())
}

/// Validate the integrations step configuration.
pub fn validate_integrations_config(config: &IntegrationsStepConfig) -> Result<(), CoreError> {
    if let Some(ref smtp) = config.email {
        validate_smtp_config(&smtp.host, smtp.port)?;
    }
    if let Some(ref webhook) = config.slack_webhook {
        if webhook.trim().is_empty() {
            return Err(CoreError::Validation(
                "Slack webhook URL cannot be empty if provided".to_string(),
            ));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- SetupStepName -------------------------------------------------------

    #[test]
    fn step_name_roundtrip_all() {
        for step in SetupStepName::all() {
            let s = step.as_str();
            let parsed = SetupStepName::parse(s).unwrap();
            assert_eq!(*step, parsed);
        }
    }

    #[test]
    fn step_name_invalid_returns_error() {
        assert!(SetupStepName::parse("unknown_step").is_err());
    }

    #[test]
    fn step_name_display() {
        assert_eq!(SetupStepName::Database.to_string(), "database");
        assert_eq!(SetupStepName::ComfyUi.to_string(), "comfyui");
        assert_eq!(SetupStepName::AdminAccount.to_string(), "admin_account");
    }

    #[test]
    fn step_name_all_has_seven_entries() {
        assert_eq!(SetupStepName::all().len(), 7);
    }

    // -- get_required_steps --------------------------------------------------

    #[test]
    fn required_steps_excludes_integrations() {
        let required = get_required_steps();
        assert!(!required.contains(&SetupStepName::Integrations));
        assert_eq!(required.len(), 6);
    }

    #[test]
    fn required_steps_includes_all_non_optional() {
        let required = get_required_steps();
        assert!(required.contains(&SetupStepName::Database));
        assert!(required.contains(&SetupStepName::Storage));
        assert!(required.contains(&SetupStepName::ComfyUi));
        assert!(required.contains(&SetupStepName::AdminAccount));
        assert!(required.contains(&SetupStepName::WorkerRegistration));
        assert!(required.contains(&SetupStepName::HealthCheck));
    }

    // -- build_wizard_state / is_wizard_complete -----------------------------

    fn make_step(name: &str, completed: bool) -> StepStatus {
        StepStatus {
            name: name.to_string(),
            completed,
            validated_at: None,
            error_message: None,
            has_config: false,
        }
    }

    #[test]
    fn wizard_state_all_incomplete() {
        let steps: Vec<StepStatus> = SetupStepName::all()
            .iter()
            .map(|s| make_step(s.as_str(), false))
            .collect();
        let state = build_wizard_state(&steps);
        assert!(!state.completed);
        assert_eq!(state.current_step_index, 0);
    }

    #[test]
    fn wizard_state_all_complete() {
        let steps: Vec<StepStatus> = SetupStepName::all()
            .iter()
            .map(|s| make_step(s.as_str(), true))
            .collect();
        let state = build_wizard_state(&steps);
        assert!(state.completed);
        assert_eq!(state.current_step_index, steps.len());
    }

    #[test]
    fn wizard_state_partial_completion() {
        let steps = vec![
            make_step("database", true),
            make_step("storage", true),
            make_step("comfyui", false),
            make_step("admin_account", false),
            make_step("worker_registration", false),
            make_step("integrations", false),
            make_step("health_check", false),
        ];
        let state = build_wizard_state(&steps);
        assert!(!state.completed);
        assert_eq!(state.current_step_index, 2); // comfyui
    }

    #[test]
    fn wizard_complete_without_integrations() {
        let steps = vec![
            make_step("database", true),
            make_step("storage", true),
            make_step("comfyui", true),
            make_step("admin_account", true),
            make_step("worker_registration", true),
            make_step("integrations", false), // optional
            make_step("health_check", true),
        ];
        assert!(is_wizard_complete(&steps));
    }

    #[test]
    fn wizard_incomplete_missing_required() {
        let steps = vec![
            make_step("database", true),
            make_step("storage", true),
            make_step("comfyui", true),
            make_step("admin_account", false), // required, not done
            make_step("worker_registration", true),
            make_step("integrations", true),
            make_step("health_check", true),
        ];
        assert!(!is_wizard_complete(&steps));
    }

    // -- validate_password_strength ------------------------------------------

    #[test]
    fn password_valid() {
        assert!(validate_password_strength("Abcdefgh1234").is_ok());
    }

    #[test]
    fn password_too_short() {
        assert!(validate_password_strength("Abc1").is_err());
    }

    #[test]
    fn password_no_uppercase() {
        assert!(validate_password_strength("abcdefgh1234").is_err());
    }

    #[test]
    fn password_no_lowercase() {
        assert!(validate_password_strength("ABCDEFGH1234").is_err());
    }

    #[test]
    fn password_no_digit() {
        assert!(validate_password_strength("Abcdefghijkl").is_err());
    }

    #[test]
    fn password_exactly_min_length() {
        assert!(validate_password_strength("Abcdefghij1k").is_ok());
    }

    // -- validate_storage_path -----------------------------------------------

    #[test]
    fn storage_path_valid() {
        assert!(validate_storage_path("/data/storage").is_ok());
    }

    #[test]
    fn storage_path_empty() {
        assert!(validate_storage_path("").is_err());
    }

    #[test]
    fn storage_path_whitespace_only() {
        assert!(validate_storage_path("   ").is_err());
    }

    #[test]
    fn storage_path_relative() {
        assert!(validate_storage_path("data/storage").is_err());
    }

    // -- validate_comfyui_url ------------------------------------------------

    #[test]
    fn comfyui_url_valid_http() {
        assert!(validate_comfyui_url("http://localhost:8188").is_ok());
    }

    #[test]
    fn comfyui_url_valid_https() {
        assert!(validate_comfyui_url("https://comfyui.example.com").is_ok());
    }

    #[test]
    fn comfyui_url_empty() {
        assert!(validate_comfyui_url("").is_err());
    }

    #[test]
    fn comfyui_url_no_scheme() {
        assert!(validate_comfyui_url("localhost:8188").is_err());
    }

    #[test]
    fn comfyui_url_scheme_only() {
        assert!(validate_comfyui_url("http://").is_err());
    }

    // -- validate_smtp_config ------------------------------------------------

    #[test]
    fn smtp_valid() {
        assert!(validate_smtp_config("smtp.example.com", 587).is_ok());
    }

    #[test]
    fn smtp_empty_host() {
        assert!(validate_smtp_config("", 587).is_err());
    }

    #[test]
    fn smtp_zero_port() {
        assert!(validate_smtp_config("smtp.example.com", 0).is_err());
    }

    #[test]
    fn smtp_max_port() {
        assert!(validate_smtp_config("smtp.example.com", 65535).is_ok());
    }

    // -- validate_database_config --------------------------------------------

    #[test]
    fn database_config_valid() {
        let config = DatabaseStepConfig {
            host: "localhost".to_string(),
            port: 5432,
            name: "x121_db".to_string(),
            user: "postgres".to_string(),
            password: "secret".to_string(),
            ssl: false,
        };
        assert!(validate_database_config(&config).is_ok());
    }

    #[test]
    fn database_config_empty_host() {
        let config = DatabaseStepConfig {
            host: "".to_string(),
            port: 5432,
            name: "x121_db".to_string(),
            user: "postgres".to_string(),
            password: "secret".to_string(),
            ssl: false,
        };
        assert!(validate_database_config(&config).is_err());
    }

    #[test]
    fn database_config_zero_port() {
        let config = DatabaseStepConfig {
            host: "localhost".to_string(),
            port: 0,
            name: "x121_db".to_string(),
            user: "postgres".to_string(),
            password: "secret".to_string(),
            ssl: false,
        };
        assert!(validate_database_config(&config).is_err());
    }

    // -- validate_storage_config ---------------------------------------------

    #[test]
    fn storage_config_valid() {
        let config = StorageStepConfig {
            root_path: "/data/storage".to_string(),
            min_space_gb: 10,
        };
        assert!(validate_storage_config(&config).is_ok());
    }

    #[test]
    fn storage_config_zero_space() {
        let config = StorageStepConfig {
            root_path: "/data/storage".to_string(),
            min_space_gb: 0,
        };
        assert!(validate_storage_config(&config).is_err());
    }

    // -- validate_comfyui_config ---------------------------------------------

    #[test]
    fn comfyui_config_valid() {
        let config = ComfyUiStepConfig {
            instances: vec![ComfyUiInstance {
                url: "http://localhost:8188".to_string(),
                name: "local".to_string(),
            }],
        };
        assert!(validate_comfyui_config(&config).is_ok());
    }

    #[test]
    fn comfyui_config_empty_instances() {
        let config = ComfyUiStepConfig { instances: vec![] };
        assert!(validate_comfyui_config(&config).is_err());
    }

    #[test]
    fn comfyui_config_invalid_url() {
        let config = ComfyUiStepConfig {
            instances: vec![ComfyUiInstance {
                url: "not-a-url".to_string(),
                name: "bad".to_string(),
            }],
        };
        assert!(validate_comfyui_config(&config).is_err());
    }

    #[test]
    fn comfyui_config_empty_name() {
        let config = ComfyUiStepConfig {
            instances: vec![ComfyUiInstance {
                url: "http://localhost:8188".to_string(),
                name: "".to_string(),
            }],
        };
        assert!(validate_comfyui_config(&config).is_err());
    }

    // -- validate_admin_config -----------------------------------------------

    #[test]
    fn admin_config_valid() {
        let config = AdminAccountStepConfig {
            username: "admin".to_string(),
            password: "StrongPass123!".to_string(),
        };
        assert!(validate_admin_config(&config).is_ok());
    }

    #[test]
    fn admin_config_empty_username() {
        let config = AdminAccountStepConfig {
            username: "".to_string(),
            password: "StrongPass123!".to_string(),
        };
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn admin_config_weak_password() {
        let config = AdminAccountStepConfig {
            username: "admin".to_string(),
            password: "weak".to_string(),
        };
        assert!(validate_admin_config(&config).is_err());
    }

    // -- validate_worker_config ----------------------------------------------

    #[test]
    fn worker_config_valid() {
        let config = WorkerStepConfig {
            worker_url: "http://worker1:9000".to_string(),
            name: "worker-1".to_string(),
        };
        assert!(validate_worker_config(&config).is_ok());
    }

    #[test]
    fn worker_config_empty_url() {
        let config = WorkerStepConfig {
            worker_url: "".to_string(),
            name: "worker-1".to_string(),
        };
        assert!(validate_worker_config(&config).is_err());
    }

    #[test]
    fn worker_config_empty_name() {
        let config = WorkerStepConfig {
            worker_url: "http://worker1:9000".to_string(),
            name: "".to_string(),
        };
        assert!(validate_worker_config(&config).is_err());
    }

    // -- validate_integrations_config ----------------------------------------

    #[test]
    fn integrations_config_all_none() {
        let config = IntegrationsStepConfig {
            email: None,
            slack_webhook: None,
            backup_destination: None,
        };
        assert!(validate_integrations_config(&config).is_ok());
    }

    #[test]
    fn integrations_config_valid_email() {
        let config = IntegrationsStepConfig {
            email: Some(SmtpConfig {
                host: "smtp.example.com".to_string(),
                port: 587,
            }),
            slack_webhook: None,
            backup_destination: None,
        };
        assert!(validate_integrations_config(&config).is_ok());
    }

    #[test]
    fn integrations_config_invalid_email() {
        let config = IntegrationsStepConfig {
            email: Some(SmtpConfig {
                host: "".to_string(),
                port: 587,
            }),
            slack_webhook: None,
            backup_destination: None,
        };
        assert!(validate_integrations_config(&config).is_err());
    }

    #[test]
    fn integrations_config_empty_slack_webhook() {
        let config = IntegrationsStepConfig {
            email: None,
            slack_webhook: Some("".to_string()),
            backup_destination: None,
        };
        assert!(validate_integrations_config(&config).is_err());
    }

    // -- build_step_validation_result ----------------------------------------

    #[test]
    fn validation_result_success() {
        let result = build_step_validation_result(true, "Connection successful");
        assert!(result.success);
        assert_eq!(result.message, "Connection successful");
        assert!(result.details.is_none());
    }

    #[test]
    fn validation_result_failure() {
        let result = build_step_validation_result(false, "Connection refused");
        assert!(!result.success);
        assert_eq!(result.message, "Connection refused");
    }
}
