//! Onboarding wizard constants and validation (PRD-67).
//!
//! Defines the wizard step definitions, status enumeration, and validation
//! helpers used by the API and repository layers for the bulk character
//! onboarding wizard.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Onboarding status
// ---------------------------------------------------------------------------

/// Status values for an onboarding session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingStatus {
    InProgress,
    Completed,
    Abandoned,
}

impl OnboardingStatus {
    /// Parse a status string from the database.
    pub fn from_str_db(s: &str) -> Result<Self, CoreError> {
        match s {
            "in_progress" => Ok(Self::InProgress),
            "completed" => Ok(Self::Completed),
            "abandoned" => Ok(Self::Abandoned),
            _ => Err(CoreError::Validation(format!(
                "Invalid onboarding status '{s}'. Must be one of: in_progress, completed, abandoned"
            ))),
        }
    }

    /// Convert to a database-compatible string.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
            Self::Abandoned => "abandoned",
        }
    }
}

// ---------------------------------------------------------------------------
// Onboarding steps
// ---------------------------------------------------------------------------

/// The six steps in the onboarding wizard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingStep {
    Upload,
    VariantGeneration,
    VariantReview,
    MetadataEntry,
    SceneTypeSelection,
    Summary,
}

/// Total number of steps in the wizard.
pub const TOTAL_STEPS: u8 = 6;

/// Minimum step number (1-based).
pub const MIN_STEP: u8 = 1;

/// Maximum step number (1-based).
pub const MAX_STEP: u8 = 6;

impl OnboardingStep {
    /// Convert a 1-based step number to an `OnboardingStep`.
    pub fn from_number(n: u8) -> Result<Self, CoreError> {
        match n {
            1 => Ok(Self::Upload),
            2 => Ok(Self::VariantGeneration),
            3 => Ok(Self::VariantReview),
            4 => Ok(Self::MetadataEntry),
            5 => Ok(Self::SceneTypeSelection),
            6 => Ok(Self::Summary),
            _ => Err(CoreError::Validation(format!(
                "Invalid step number {n}. Must be between {MIN_STEP} and {MAX_STEP}"
            ))),
        }
    }

    /// Convert to a 1-based step number.
    pub fn to_number(self) -> u8 {
        match self {
            Self::Upload => 1,
            Self::VariantGeneration => 2,
            Self::VariantReview => 3,
            Self::MetadataEntry => 4,
            Self::SceneTypeSelection => 5,
            Self::Summary => 6,
        }
    }

    /// Human-readable label for the step.
    pub fn label(self) -> &'static str {
        match self {
            Self::Upload => "Upload",
            Self::VariantGeneration => "Variant Generation",
            Self::VariantReview => "Variant Review",
            Self::MetadataEntry => "Metadata Entry",
            Self::SceneTypeSelection => "Scene Type Selection",
            Self::Summary => "Summary",
        }
    }
}

// ---------------------------------------------------------------------------
// Step data key names
// ---------------------------------------------------------------------------

/// JSON key for uploaded file references in step 1 data.
pub const STEP_DATA_KEY_FILES: &str = "files";

/// JSON key for CSV parsed characters in step 1 data.
pub const STEP_DATA_KEY_CSV_CHARACTERS: &str = "csv_characters";

/// JSON key for variant generation job IDs in step 2 data.
pub const STEP_DATA_KEY_VARIANT_JOBS: &str = "variant_jobs";

/// JSON key for reviewed variant selections in step 3 data.
pub const STEP_DATA_KEY_REVIEWED_VARIANTS: &str = "reviewed_variants";

/// JSON key for metadata entries in step 4 data.
pub const STEP_DATA_KEY_METADATA: &str = "metadata";

/// JSON key for selected scene type IDs in step 5 data.
pub const STEP_DATA_KEY_SCENE_TYPES: &str = "scene_types";

/// JSON key for submission options in step 6 data.
pub const STEP_DATA_KEY_SUBMISSION: &str = "submission";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a step transition.
///
/// A transition is valid if the next step is exactly one step forward or
/// one step backward from the current step. Jumping more than one step
/// in either direction is not allowed.
pub fn validate_step_transition(current: u8, next: u8) -> Result<(), CoreError> {
    if current < MIN_STEP || current > MAX_STEP {
        return Err(CoreError::Validation(format!(
            "Current step {current} is out of range ({MIN_STEP}..{MAX_STEP})"
        )));
    }
    if next < MIN_STEP || next > MAX_STEP {
        return Err(CoreError::Validation(format!(
            "Next step {next} is out of range ({MIN_STEP}..{MAX_STEP})"
        )));
    }

    let diff = (next as i16) - (current as i16);
    if diff != 1 && diff != -1 {
        return Err(CoreError::Validation(format!(
            "Cannot transition from step {current} to step {next}. \
             Must advance or go back exactly one step."
        )));
    }

    Ok(())
}

/// Validate that step data contains the required keys for a given step.
///
/// This performs structural validation only (presence of required keys).
/// Deeper validation of individual field values is left to the respective
/// domain services (PRD-21, PRD-66, etc.).
pub fn validate_step_data(step: u8, data: &serde_json::Value) -> Result<(), CoreError> {
    let step_enum = OnboardingStep::from_number(step)?;
    let obj = data
        .as_object()
        .ok_or_else(|| CoreError::Validation("Step data must be a JSON object".to_string()))?;

    match step_enum {
        OnboardingStep::Upload => {
            // Step 1 requires either files or csv_characters (at least one).
            let has_files = obj
                .get(STEP_DATA_KEY_FILES)
                .and_then(|v| v.as_array())
                .map_or(false, |a| !a.is_empty());
            let has_csv = obj
                .get(STEP_DATA_KEY_CSV_CHARACTERS)
                .and_then(|v| v.as_array())
                .map_or(false, |a| !a.is_empty());
            if !has_files && !has_csv {
                return Err(CoreError::Validation(
                    "Step 1 (Upload) requires either 'files' or 'csv_characters' data".to_string(),
                ));
            }
        }
        OnboardingStep::VariantGeneration => {
            // Step 2 requires variant_jobs key.
            if !obj.contains_key(STEP_DATA_KEY_VARIANT_JOBS) {
                return Err(CoreError::Validation(
                    "Step 2 (Variant Generation) requires 'variant_jobs' data".to_string(),
                ));
            }
        }
        OnboardingStep::VariantReview => {
            // Step 3 requires reviewed_variants key.
            if !obj.contains_key(STEP_DATA_KEY_REVIEWED_VARIANTS) {
                return Err(CoreError::Validation(
                    "Step 3 (Variant Review) requires 'reviewed_variants' data".to_string(),
                ));
            }
        }
        OnboardingStep::MetadataEntry => {
            // Step 4 requires metadata key.
            if !obj.contains_key(STEP_DATA_KEY_METADATA) {
                return Err(CoreError::Validation(
                    "Step 4 (Metadata Entry) requires 'metadata' data".to_string(),
                ));
            }
        }
        OnboardingStep::SceneTypeSelection => {
            // Step 5 requires scene_types key.
            if !obj.contains_key(STEP_DATA_KEY_SCENE_TYPES) {
                return Err(CoreError::Validation(
                    "Step 5 (Scene Type Selection) requires 'scene_types' data".to_string(),
                ));
            }
        }
        OnboardingStep::Summary => {
            // Step 6 (Summary) has no required keys before advancing (it's the final step).
        }
    }

    Ok(())
}

/// Check whether the current step can be advanced based on step data.
///
/// Returns `true` if the required data for the given step is present
/// and structurally valid.
pub fn can_advance_step(step: u8, step_data: &serde_json::Value) -> bool {
    validate_step_data(step, step_data).is_ok()
}

/// Validate that a step number is within the valid range.
pub fn validate_step_number(step: u8) -> Result<(), CoreError> {
    if step < MIN_STEP || step > MAX_STEP {
        return Err(CoreError::Validation(format!(
            "Step {step} is out of range ({MIN_STEP}..{MAX_STEP})"
        )));
    }
    Ok(())
}

/// Check if a session can be completed (must be on step 6).
pub fn can_complete_session(current_step: u8) -> Result<(), CoreError> {
    if current_step != MAX_STEP {
        return Err(CoreError::Validation(format!(
            "Cannot complete session: must be on step {MAX_STEP} (Summary), \
             currently on step {current_step}"
        )));
    }
    Ok(())
}

/// Check if a session can be abandoned (must be in_progress).
pub fn can_abandon_session(status: &str) -> Result<(), CoreError> {
    if status != OnboardingStatus::InProgress.as_str() {
        return Err(CoreError::Validation(format!(
            "Cannot abandon session with status '{status}'. Only 'in_progress' sessions can be abandoned."
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- OnboardingStatus --

    #[test]
    fn status_from_str_valid() {
        assert_eq!(
            OnboardingStatus::from_str_db("in_progress").unwrap(),
            OnboardingStatus::InProgress
        );
        assert_eq!(
            OnboardingStatus::from_str_db("completed").unwrap(),
            OnboardingStatus::Completed
        );
        assert_eq!(
            OnboardingStatus::from_str_db("abandoned").unwrap(),
            OnboardingStatus::Abandoned
        );
    }

    #[test]
    fn status_from_str_invalid() {
        assert!(OnboardingStatus::from_str_db("invalid").is_err());
        assert!(OnboardingStatus::from_str_db("").is_err());
    }

    #[test]
    fn status_as_str_roundtrip() {
        for status in [
            OnboardingStatus::InProgress,
            OnboardingStatus::Completed,
            OnboardingStatus::Abandoned,
        ] {
            let s = status.as_str();
            assert_eq!(OnboardingStatus::from_str_db(s).unwrap(), status);
        }
    }

    // -- OnboardingStep --

    #[test]
    fn step_from_number_valid() {
        assert_eq!(
            OnboardingStep::from_number(1).unwrap(),
            OnboardingStep::Upload
        );
        assert_eq!(
            OnboardingStep::from_number(6).unwrap(),
            OnboardingStep::Summary
        );
    }

    #[test]
    fn step_from_number_invalid() {
        assert!(OnboardingStep::from_number(0).is_err());
        assert!(OnboardingStep::from_number(7).is_err());
        assert!(OnboardingStep::from_number(255).is_err());
    }

    #[test]
    fn step_to_number_roundtrip() {
        for n in MIN_STEP..=MAX_STEP {
            let step = OnboardingStep::from_number(n).unwrap();
            assert_eq!(step.to_number(), n);
        }
    }

    #[test]
    fn step_labels_are_nonempty() {
        for n in MIN_STEP..=MAX_STEP {
            let step = OnboardingStep::from_number(n).unwrap();
            assert!(!step.label().is_empty());
        }
    }

    // -- validate_step_transition --

    #[test]
    fn transition_forward_by_one_is_valid() {
        for current in MIN_STEP..MAX_STEP {
            assert!(validate_step_transition(current, current + 1).is_ok());
        }
    }

    #[test]
    fn transition_backward_by_one_is_valid() {
        for current in (MIN_STEP + 1)..=MAX_STEP {
            assert!(validate_step_transition(current, current - 1).is_ok());
        }
    }

    #[test]
    fn transition_same_step_is_invalid() {
        for step in MIN_STEP..=MAX_STEP {
            assert!(validate_step_transition(step, step).is_err());
        }
    }

    #[test]
    fn transition_skip_step_is_invalid() {
        assert!(validate_step_transition(1, 3).is_err());
        assert!(validate_step_transition(1, 4).is_err());
        assert!(validate_step_transition(4, 6).is_err());
        assert!(validate_step_transition(6, 4).is_err());
    }

    #[test]
    fn transition_out_of_range_current() {
        assert!(validate_step_transition(0, 1).is_err());
        assert!(validate_step_transition(7, 6).is_err());
    }

    #[test]
    fn transition_out_of_range_next() {
        assert!(validate_step_transition(1, 0).is_err());
        assert!(validate_step_transition(6, 7).is_err());
    }

    // -- validate_step_data --

    #[test]
    fn step1_valid_with_files() {
        let data = json!({ "files": ["file1.png", "file2.png"] });
        assert!(validate_step_data(1, &data).is_ok());
    }

    #[test]
    fn step1_valid_with_csv() {
        let data = json!({ "csv_characters": [{"name": "Character A"}] });
        assert!(validate_step_data(1, &data).is_ok());
    }

    #[test]
    fn step1_invalid_empty_files() {
        let data = json!({ "files": [] });
        assert!(validate_step_data(1, &data).is_err());
    }

    #[test]
    fn step1_invalid_missing_both() {
        let data = json!({});
        assert!(validate_step_data(1, &data).is_err());
    }

    #[test]
    fn step2_valid() {
        let data = json!({ "variant_jobs": [1, 2, 3] });
        assert!(validate_step_data(2, &data).is_ok());
    }

    #[test]
    fn step2_invalid_missing_key() {
        let data = json!({ "other_key": true });
        assert!(validate_step_data(2, &data).is_err());
    }

    #[test]
    fn step3_valid() {
        let data = json!({ "reviewed_variants": [{"id": 1, "approved": true}] });
        assert!(validate_step_data(3, &data).is_ok());
    }

    #[test]
    fn step3_invalid() {
        let data = json!({});
        assert!(validate_step_data(3, &data).is_err());
    }

    #[test]
    fn step4_valid() {
        let data = json!({ "metadata": [{"character_id": 1, "name": "Test"}] });
        assert!(validate_step_data(4, &data).is_ok());
    }

    #[test]
    fn step4_invalid() {
        let data = json!({});
        assert!(validate_step_data(4, &data).is_err());
    }

    #[test]
    fn step5_valid() {
        let data = json!({ "scene_types": [1, 2, 3] });
        assert!(validate_step_data(5, &data).is_ok());
    }

    #[test]
    fn step5_invalid() {
        let data = json!({});
        assert!(validate_step_data(5, &data).is_err());
    }

    #[test]
    fn step6_no_required_keys() {
        let data = json!({});
        assert!(validate_step_data(6, &data).is_ok());
    }

    #[test]
    fn step_data_rejects_non_object() {
        assert!(validate_step_data(1, &json!("not an object")).is_err());
        assert!(validate_step_data(1, &json!(42)).is_err());
        assert!(validate_step_data(1, &json!(null)).is_err());
    }

    #[test]
    fn step_data_invalid_step_number() {
        assert!(validate_step_data(0, &json!({})).is_err());
        assert!(validate_step_data(7, &json!({})).is_err());
    }

    // -- can_advance_step --

    #[test]
    fn can_advance_returns_true_for_valid_data() {
        let data = json!({ "files": ["img.png"] });
        assert!(can_advance_step(1, &data));
    }

    #[test]
    fn can_advance_returns_false_for_invalid_data() {
        let data = json!({});
        assert!(!can_advance_step(1, &data));
    }

    // -- validate_step_number --

    #[test]
    fn validate_step_number_valid() {
        for n in MIN_STEP..=MAX_STEP {
            assert!(validate_step_number(n).is_ok());
        }
    }

    #[test]
    fn validate_step_number_invalid() {
        assert!(validate_step_number(0).is_err());
        assert!(validate_step_number(7).is_err());
    }

    // -- can_complete_session --

    #[test]
    fn can_complete_on_step_6() {
        assert!(can_complete_session(6).is_ok());
    }

    #[test]
    fn cannot_complete_before_step_6() {
        for step in MIN_STEP..MAX_STEP {
            assert!(can_complete_session(step).is_err());
        }
    }

    // -- can_abandon_session --

    #[test]
    fn can_abandon_in_progress() {
        assert!(can_abandon_session("in_progress").is_ok());
    }

    #[test]
    fn cannot_abandon_completed() {
        assert!(can_abandon_session("completed").is_err());
    }

    #[test]
    fn cannot_abandon_already_abandoned() {
        assert!(can_abandon_session("abandoned").is_err());
    }
}
