//! Template & preset validation and override-diff utilities (PRD-27).
//!
//! Provides scope constants, name/rating validation helpers, scope-project
//! consistency checks, and a field-level override-diff calculation for
//! previewing preset application.

use serde::Serialize;

use crate::error::CoreError;
use crate::types::DbId;

/* --------------------------------------------------------------------------
   Scope constants
   -------------------------------------------------------------------------- */

/// Personal scope — visible only to the owning user.
pub const SCOPE_PERSONAL: &str = "personal";

/// Project scope — visible to all members of a project.
pub const SCOPE_PROJECT: &str = "project";

/// Studio scope — visible to all users across the studio.
pub const SCOPE_STUDIO: &str = "studio";

/// All valid scope values.
pub const VALID_SCOPES: &[&str] = &[SCOPE_PERSONAL, SCOPE_PROJECT, SCOPE_STUDIO];

/* --------------------------------------------------------------------------
   Validation limits
   -------------------------------------------------------------------------- */

/// Maximum length for a template name.
pub const MAX_TEMPLATE_NAME_LEN: usize = 200;

/// Maximum length for a preset name.
pub const MAX_PRESET_NAME_LEN: usize = 200;

/// Maximum length for a description (shared by templates and presets).
pub const MAX_DESCRIPTION_LEN: usize = 5000;

/// Minimum allowed rating value.
pub const MIN_RATING: i16 = 1;

/// Maximum allowed rating value.
pub const MAX_RATING: i16 = 5;

/* --------------------------------------------------------------------------
   Validation functions
   -------------------------------------------------------------------------- */

/// Validate that `scope` is one of the allowed values.
pub fn validate_scope(scope: &str) -> Result<(), CoreError> {
    if VALID_SCOPES.contains(&scope) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid scope '{scope}'. Must be one of: {}",
            VALID_SCOPES.join(", ")
        )))
    }
}

/// Validate a template name: non-empty and within length limit.
pub fn validate_template_name(name: &str) -> Result<(), CoreError> {
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Template name must not be empty".to_string(),
        ));
    }
    if name.len() > MAX_TEMPLATE_NAME_LEN {
        return Err(CoreError::Validation(format!(
            "Template name too long: {} chars (max {MAX_TEMPLATE_NAME_LEN})",
            name.len()
        )));
    }
    Ok(())
}

/// Validate a preset name: non-empty and within length limit.
pub fn validate_preset_name(name: &str) -> Result<(), CoreError> {
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Preset name must not be empty".to_string(),
        ));
    }
    if name.len() > MAX_PRESET_NAME_LEN {
        return Err(CoreError::Validation(format!(
            "Preset name too long: {} chars (max {MAX_PRESET_NAME_LEN})",
            name.len()
        )));
    }
    Ok(())
}

/// Validate a rating value is within the allowed range.
pub fn validate_rating(rating: i16) -> Result<(), CoreError> {
    if rating < MIN_RATING || rating > MAX_RATING {
        return Err(CoreError::Validation(format!(
            "Rating must be between {MIN_RATING} and {MAX_RATING}, got {rating}"
        )));
    }
    Ok(())
}

/// Validate scope-project consistency.
///
/// - `"project"` scope **requires** a `project_id`.
/// - `"personal"` and `"studio"` scopes must **not** have a `project_id`.
pub fn validate_scope_project_consistency(
    scope: &str,
    project_id: Option<DbId>,
) -> Result<(), CoreError> {
    match scope {
        SCOPE_PROJECT => {
            if project_id.is_none() {
                return Err(CoreError::Validation(
                    "Project scope requires a project_id".to_string(),
                ));
            }
        }
        SCOPE_PERSONAL | SCOPE_STUDIO => {
            if project_id.is_some() {
                return Err(CoreError::Validation(format!(
                    "Scope '{scope}' must not have a project_id"
                )));
            }
        }
        _ => {
            // Caller should have validated scope first, but be defensive.
            return Err(CoreError::Validation(format!(
                "Invalid scope '{scope}'"
            )));
        }
    }
    Ok(())
}

/* --------------------------------------------------------------------------
   Override diff
   -------------------------------------------------------------------------- */

/// A single field difference between current parameters and preset parameters.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OverrideDiff {
    /// The JSON field key that differs.
    pub field: String,
    /// The current value for this field.
    pub current_value: serde_json::Value,
    /// The value the preset would set for this field.
    pub preset_value: serde_json::Value,
}

/// Compare two JSON objects field-by-field and return a list of fields
/// where the preset value differs from the current value.
///
/// Only top-level keys are compared. Fields present in `preset_params` but
/// absent from `current_params` are included (current_value = null). Fields
/// present only in `current_params` are ignored (the preset does not touch them).
pub fn compute_override_diff(
    current_params: &serde_json::Value,
    preset_params: &serde_json::Value,
) -> Vec<OverrideDiff> {
    let preset_obj = match preset_params.as_object() {
        Some(obj) => obj,
        None => return Vec::new(),
    };

    let current_obj = current_params.as_object();

    let mut diffs = Vec::new();

    for (key, preset_val) in preset_obj {
        let current_val = current_obj
            .and_then(|o| o.get(key))
            .unwrap_or(&serde_json::Value::Null);

        if current_val != preset_val {
            diffs.push(OverrideDiff {
                field: key.clone(),
                current_value: current_val.clone(),
                preset_value: preset_val.clone(),
            });
        }
    }

    // Sort for deterministic output.
    diffs.sort_by(|a, b| a.field.cmp(&b.field));
    diffs
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --- Scope validation ---

    #[test]
    fn validate_scope_accepts_valid_scopes() {
        assert!(validate_scope("personal").is_ok());
        assert!(validate_scope("project").is_ok());
        assert!(validate_scope("studio").is_ok());
    }

    #[test]
    fn validate_scope_rejects_invalid_scope() {
        let err = validate_scope("global").unwrap_err();
        assert!(err.to_string().contains("Invalid scope"));
    }

    // --- Template name validation ---

    #[test]
    fn validate_template_name_accepts_valid() {
        assert!(validate_template_name("My Template").is_ok());
    }

    #[test]
    fn validate_template_name_rejects_empty() {
        let err = validate_template_name("").unwrap_err();
        assert!(err.to_string().contains("must not be empty"));
    }

    #[test]
    fn validate_template_name_rejects_too_long() {
        let long_name = "x".repeat(MAX_TEMPLATE_NAME_LEN + 1);
        let err = validate_template_name(&long_name).unwrap_err();
        assert!(err.to_string().contains("too long"));
    }

    // --- Preset name validation ---

    #[test]
    fn validate_preset_name_accepts_valid() {
        assert!(validate_preset_name("Cinematic Look").is_ok());
    }

    #[test]
    fn validate_preset_name_rejects_empty() {
        let err = validate_preset_name("").unwrap_err();
        assert!(err.to_string().contains("must not be empty"));
    }

    // --- Rating validation ---

    #[test]
    fn validate_rating_accepts_valid_range() {
        for r in MIN_RATING..=MAX_RATING {
            assert!(validate_rating(r).is_ok());
        }
    }

    #[test]
    fn validate_rating_rejects_out_of_range() {
        assert!(validate_rating(0).is_err());
        assert!(validate_rating(6).is_err());
        assert!(validate_rating(-1).is_err());
    }

    // --- Scope-project consistency ---

    #[test]
    fn scope_project_consistency_project_requires_id() {
        assert!(validate_scope_project_consistency("project", Some(1)).is_ok());
        let err = validate_scope_project_consistency("project", None).unwrap_err();
        assert!(err.to_string().contains("requires a project_id"));
    }

    #[test]
    fn scope_project_consistency_personal_rejects_id() {
        assert!(validate_scope_project_consistency("personal", None).is_ok());
        let err = validate_scope_project_consistency("personal", Some(1)).unwrap_err();
        assert!(err.to_string().contains("must not have a project_id"));
    }

    #[test]
    fn scope_project_consistency_studio_rejects_id() {
        assert!(validate_scope_project_consistency("studio", None).is_ok());
        let err = validate_scope_project_consistency("studio", Some(1)).unwrap_err();
        assert!(err.to_string().contains("must not have a project_id"));
    }

    // --- Override diff ---

    #[test]
    fn compute_override_diff_detects_changed_fields() {
        let current = json!({"brightness": 50, "contrast": 70});
        let preset = json!({"brightness": 80, "contrast": 70});

        let diffs = compute_override_diff(&current, &preset);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].field, "brightness");
        assert_eq!(diffs[0].current_value, json!(50));
        assert_eq!(diffs[0].preset_value, json!(80));
    }

    #[test]
    fn compute_override_diff_includes_new_fields() {
        let current = json!({"brightness": 50});
        let preset = json!({"brightness": 50, "saturation": 100});

        let diffs = compute_override_diff(&current, &preset);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].field, "saturation");
        assert_eq!(diffs[0].current_value, serde_json::Value::Null);
        assert_eq!(diffs[0].preset_value, json!(100));
    }

    #[test]
    fn compute_override_diff_returns_empty_when_identical() {
        let params = json!({"brightness": 50, "contrast": 70});
        let diffs = compute_override_diff(&params, &params);
        assert!(diffs.is_empty());
    }

    #[test]
    fn compute_override_diff_handles_non_object_preset() {
        let current = json!({"brightness": 50});
        let preset = json!("not an object");
        let diffs = compute_override_diff(&current, &preset);
        assert!(diffs.is_empty());
    }
}
