//! Onboarding constants and validation (PRD-53).
//!
//! Defines the valid checklist item IDs, feature reveal keys, and hint
//! validation helpers used by the API and repository layers.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Checklist item IDs
// ---------------------------------------------------------------------------

/// Upload a character portrait.
pub const CHECKLIST_UPLOAD_PORTRAIT: &str = "upload_portrait";
/// Run a generation job.
pub const CHECKLIST_RUN_GENERATION: &str = "run_generation";
/// Approve a segment in the review queue.
pub const CHECKLIST_APPROVE_SEGMENT: &str = "approve_segment";
/// Configure a workflow.
pub const CHECKLIST_CONFIGURE_WORKFLOW: &str = "configure_workflow";
/// Invite a team member.
pub const CHECKLIST_INVITE_TEAM: &str = "invite_team";

/// All valid checklist item IDs.
pub const VALID_CHECKLIST_ITEMS: &[&str] = &[
    CHECKLIST_UPLOAD_PORTRAIT,
    CHECKLIST_RUN_GENERATION,
    CHECKLIST_APPROVE_SEGMENT,
    CHECKLIST_CONFIGURE_WORKFLOW,
    CHECKLIST_INVITE_TEAM,
];

// ---------------------------------------------------------------------------
// Feature reveal keys
// ---------------------------------------------------------------------------

/// Advanced workflow editor.
pub const FEATURE_ADVANCED_WORKFLOW: &str = "advanced_workflow";
/// Branching / versioning.
pub const FEATURE_BRANCHING: &str = "branching";
/// Worker pool management.
pub const FEATURE_WORKER_POOL: &str = "worker_pool";
/// Custom themes.
pub const FEATURE_CUSTOM_THEMES: &str = "custom_themes";

/// All valid feature reveal keys.
pub const VALID_FEATURE_KEYS: &[&str] = &[
    FEATURE_ADVANCED_WORKFLOW,
    FEATURE_BRANCHING,
    FEATURE_WORKER_POOL,
    FEATURE_CUSTOM_THEMES,
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a value is present in a known list, returning a
/// descriptive error if not.
fn validate_known_key(
    value: &str,
    valid: &[&str],
    label: &str,
) -> Result<(), CoreError> {
    if valid.contains(&value) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid {label} '{value}'. Must be one of: {valid:?}"
        )))
    }
}

/// Validate that every key in a slice is present in a known list.
fn validate_known_keys(
    keys: &[String],
    valid: &[&str],
    label: &str,
) -> Result<(), CoreError> {
    for key in keys {
        validate_known_key(key, valid, label)?;
    }
    Ok(())
}

/// Validate that a hint ID is a non-empty string.
pub fn validate_hint_id(hint_id: &str) -> Result<(), CoreError> {
    if hint_id.trim().is_empty() {
        return Err(CoreError::Validation(
            "Hint ID must be a non-empty string".to_string(),
        ));
    }
    Ok(())
}

/// Validate that all hint IDs in a slice are valid (non-empty strings).
pub fn validate_hint_ids(hint_ids: &[String]) -> Result<(), CoreError> {
    for hint_id in hint_ids {
        validate_hint_id(hint_id)?;
    }
    Ok(())
}

/// Validate that a checklist item key is one of the known items.
pub fn validate_checklist_item(item: &str) -> Result<(), CoreError> {
    validate_known_key(item, VALID_CHECKLIST_ITEMS, "checklist item")
}

/// Validate that all keys in a checklist progress map are known items.
pub fn validate_checklist_keys(keys: &[String]) -> Result<(), CoreError> {
    validate_known_keys(keys, VALID_CHECKLIST_ITEMS, "checklist item")
}

/// Validate that a feature reveal key is one of the known keys.
pub fn validate_feature_key(key: &str) -> Result<(), CoreError> {
    validate_known_key(key, VALID_FEATURE_KEYS, "feature reveal key")
}

/// Validate that all keys in a feature reveal map are known keys.
pub fn validate_feature_keys(keys: &[String]) -> Result<(), CoreError> {
    validate_known_keys(keys, VALID_FEATURE_KEYS, "feature reveal key")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_hint_id_passes() {
        assert!(validate_hint_id("workflow_editor").is_ok());
        assert!(validate_hint_id("a").is_ok());
    }

    #[test]
    fn empty_hint_id_fails() {
        assert!(validate_hint_id("").is_err());
        assert!(validate_hint_id("   ").is_err());
    }

    #[test]
    fn valid_hint_ids_batch_passes() {
        let ids = vec!["tip_1".to_string(), "tip_2".to_string()];
        assert!(validate_hint_ids(&ids).is_ok());
    }

    #[test]
    fn empty_hint_id_in_batch_fails() {
        let ids = vec!["tip_1".to_string(), "".to_string()];
        assert!(validate_hint_ids(&ids).is_err());
    }

    #[test]
    fn all_checklist_items_are_valid() {
        for item in VALID_CHECKLIST_ITEMS {
            assert!(
                validate_checklist_item(item).is_ok(),
                "Checklist item '{item}' should be valid"
            );
        }
    }

    #[test]
    fn unknown_checklist_item_fails() {
        assert!(validate_checklist_item("nonexistent_step").is_err());
        assert!(validate_checklist_item("").is_err());
    }

    #[test]
    fn all_feature_keys_are_valid() {
        for key in VALID_FEATURE_KEYS {
            assert!(
                validate_feature_key(key).is_ok(),
                "Feature key '{key}' should be valid"
            );
        }
    }

    #[test]
    fn unknown_feature_key_fails() {
        assert!(validate_feature_key("nonexistent_feature").is_err());
        assert!(validate_feature_key("").is_err());
    }

    #[test]
    fn validate_checklist_keys_batch() {
        let valid = vec![
            "upload_portrait".to_string(),
            "run_generation".to_string(),
        ];
        assert!(validate_checklist_keys(&valid).is_ok());

        let invalid = vec![
            "upload_portrait".to_string(),
            "bad_key".to_string(),
        ];
        assert!(validate_checklist_keys(&invalid).is_err());
    }

    #[test]
    fn validate_feature_keys_batch() {
        let valid = vec![
            "advanced_workflow".to_string(),
            "branching".to_string(),
        ];
        assert!(validate_feature_keys(&valid).is_ok());

        let invalid = vec![
            "advanced_workflow".to_string(),
            "bad_feature".to_string(),
        ];
        assert!(validate_feature_keys(&invalid).is_err());
    }
}
