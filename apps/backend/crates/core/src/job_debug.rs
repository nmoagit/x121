//! Constants and validation for the interactive debugger (PRD-34).
//!
//! Provides validation helpers for mid-run job control actions,
//! parameter modification, and abort reasons.

use crate::error::CoreError;

/// Maximum number of parameters that can be modified mid-run.
pub const MAX_MODIFIED_PARAMS: usize = 100;

/// Maximum number of intermediate preview entries stored per job.
pub const MAX_PREVIEW_ENTRIES: usize = 50;

/// Timeout in seconds before a paused job is considered stale.
pub const PAUSE_TIMEOUT_SECS: u64 = 30;

/// Maximum length of an abort reason string.
const MAX_ABORT_REASON_LEN: usize = 2000;

/// Valid control actions for a running/paused job.
pub const VALID_JOB_CONTROL_ACTIONS: &[&str] = &["pause", "resume", "abort"];

/// Parameters that cannot be changed mid-run (would invalidate pipeline state).
pub const NON_MODIFIABLE_PARAMS: &[&str] = &["model", "vae", "seed"];

/// Validate that a control action is one of the accepted values.
pub fn validate_control_action(action: &str) -> Result<(), CoreError> {
    if VALID_JOB_CONTROL_ACTIONS.contains(&action) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid control action '{action}'. Must be one of: {}",
            VALID_JOB_CONTROL_ACTIONS.join(", ")
        )))
    }
}

/// Check whether a parameter can be modified mid-run.
pub fn is_param_modifiable(param_name: &str) -> bool {
    !NON_MODIFIABLE_PARAMS.contains(&param_name)
}

/// Validate modified parameters: must be a JSON object, under MAX limit,
/// and must not include non-modifiable parameters.
pub fn validate_modified_params(params: &serde_json::Value) -> Result<(), CoreError> {
    let obj = params.as_object().ok_or_else(|| {
        CoreError::Validation("Modified params must be a JSON object".to_string())
    })?;

    if obj.len() > MAX_MODIFIED_PARAMS {
        return Err(CoreError::Validation(format!(
            "Too many modified parameters: {} (max {MAX_MODIFIED_PARAMS})",
            obj.len()
        )));
    }

    for key in obj.keys() {
        if !is_param_modifiable(key) {
            return Err(CoreError::Validation(format!(
                "Parameter '{key}' cannot be modified mid-run"
            )));
        }
    }

    Ok(())
}

/// Validate an optional abort reason (max 2000 characters).
pub fn validate_abort_reason(reason: &Option<String>) -> Result<(), CoreError> {
    if let Some(r) = reason {
        if r.len() > MAX_ABORT_REASON_LEN {
            return Err(CoreError::Validation(format!(
                "Abort reason too long: {} characters (max {MAX_ABORT_REASON_LEN})",
                r.len()
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_control_actions_accepted() {
        assert!(validate_control_action("pause").is_ok());
        assert!(validate_control_action("resume").is_ok());
        assert!(validate_control_action("abort").is_ok());
    }

    #[test]
    fn test_invalid_control_action_rejected() {
        let result = validate_control_action("restart");
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid control action"));
    }

    #[test]
    fn test_empty_control_action_rejected() {
        assert!(validate_control_action("").is_err());
    }

    #[test]
    fn test_modifiable_params() {
        assert!(is_param_modifiable("resolution"));
        assert!(is_param_modifiable("steps"));
        assert!(is_param_modifiable("cfg_scale"));
    }

    #[test]
    fn test_non_modifiable_params() {
        assert!(!is_param_modifiable("model"));
        assert!(!is_param_modifiable("vae"));
        assert!(!is_param_modifiable("seed"));
    }

    #[test]
    fn test_validate_modified_params_valid() {
        let params = serde_json::json!({ "resolution": "720p", "steps": 30 });
        assert!(validate_modified_params(&params).is_ok());
    }

    #[test]
    fn test_validate_modified_params_rejects_non_object() {
        let params = serde_json::json!([1, 2, 3]);
        let result = validate_modified_params(&params);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("JSON object"));
    }

    #[test]
    fn test_validate_modified_params_rejects_non_modifiable() {
        let params = serde_json::json!({ "model": "sd15", "resolution": "720p" });
        let result = validate_modified_params(&params);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("model"));
        assert!(err.contains("cannot be modified"));
    }

    #[test]
    fn test_validate_modified_params_rejects_too_many() {
        let mut map = serde_json::Map::new();
        for i in 0..=MAX_MODIFIED_PARAMS {
            map.insert(format!("param_{i}"), serde_json::json!(i));
        }
        let params = serde_json::Value::Object(map);
        let result = validate_modified_params(&params);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Too many modified parameters"));
    }

    #[test]
    fn test_validate_abort_reason_none_ok() {
        assert!(validate_abort_reason(&None).is_ok());
    }

    #[test]
    fn test_validate_abort_reason_valid() {
        let reason = Some("User requested abort due to wrong parameters".to_string());
        assert!(validate_abort_reason(&reason).is_ok());
    }

    #[test]
    fn test_validate_abort_reason_too_long() {
        let reason = Some("x".repeat(2001));
        let result = validate_abort_reason(&reason);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("too long"));
    }
}
