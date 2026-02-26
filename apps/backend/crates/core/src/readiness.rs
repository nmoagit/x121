//! Character readiness computation and validation (PRD-107).
//!
//! Provides types, validation functions, and pure evaluation logic for
//! determining whether a character meets configurable readiness criteria.
//! The `core` crate contains no database dependencies; evaluation is
//! done against pre-loaded data passed in by the caller.

use serde::{Deserialize, Serialize};

use crate::types::DbId;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Valid scope types for readiness criteria.
pub const SCOPE_STUDIO: &str = "studio";
pub const SCOPE_PROJECT: &str = "project";

/// All valid scope types.
pub const VALID_SCOPE_TYPES: &[&str] = &[SCOPE_STUDIO, SCOPE_PROJECT];

/// Valid readiness states (stored in the cache table).
pub const STATE_READY: &str = "ready";
pub const STATE_PARTIALLY_READY: &str = "partially_ready";
pub const STATE_NOT_STARTED: &str = "not_started";

/// All valid readiness state strings.
pub const VALID_READINESS_STATES: &[&str] =
    &[STATE_READY, STATE_PARTIALLY_READY, STATE_NOT_STARTED];

/// Maximum number of custom settings keys allowed in criteria.
pub const MAX_SETTINGS_KEYS: usize = 50;

/// Maximum length for a single settings key name.
pub const MAX_SETTINGS_KEY_LENGTH: usize = 100;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// The overall readiness state of a character.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessState {
    Ready,
    PartiallyReady,
    NotStarted,
}

impl ReadinessState {
    /// Convert from a database string value.
    pub fn from_str_value(s: &str) -> Result<Self, String> {
        match s {
            STATE_READY => Ok(Self::Ready),
            STATE_PARTIALLY_READY => Ok(Self::PartiallyReady),
            STATE_NOT_STARTED => Ok(Self::NotStarted),
            _ => Err(format!(
                "Invalid readiness state '{s}'. Must be one of: {}",
                VALID_READINESS_STATES.join(", ")
            )),
        }
    }

    /// Convert to the database string value.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ready => STATE_READY,
            Self::PartiallyReady => STATE_PARTIALLY_READY,
            Self::NotStarted => STATE_NOT_STARTED,
        }
    }
}

/// Type of a missing readiness item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum MissingItemType {
    /// Character has no source image.
    SourceImage,
    /// Character has no approved image variant.
    ApprovedVariant,
    /// Character metadata is incomplete.
    MetadataComplete,
    /// A specific pipeline settings key is missing.
    SettingKey { key: String },
}

impl MissingItemType {
    /// Human-readable label for display.
    pub fn label(&self) -> String {
        match self {
            Self::SourceImage => "source_image".to_string(),
            Self::ApprovedVariant => "approved_variant".to_string(),
            Self::MetadataComplete => "metadata_complete".to_string(),
            Self::SettingKey { key } => key.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

/// Parsed readiness criteria from `criteria_json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadinessCriteria {
    /// Whether a source image is required.
    pub source_image: bool,
    /// Whether at least one approved variant is required.
    pub approved_variant: bool,
    /// Whether metadata must be complete.
    pub metadata_complete: bool,
    /// List of required pipeline settings keys.
    pub settings: Vec<String>,
}

impl Default for ReadinessCriteria {
    fn default() -> Self {
        Self {
            source_image: true,
            approved_variant: true,
            metadata_complete: true,
            settings: vec![
                "a2c4_model".to_string(),
                "elevenlabs_voice".to_string(),
                "avatar_json".to_string(),
            ],
        }
    }
}

/// Result of evaluating a character against readiness criteria.
#[derive(Debug, Clone, Serialize)]
pub struct ReadinessResult {
    pub character_id: DbId,
    pub state: ReadinessState,
    pub missing_items: Vec<String>,
    pub readiness_pct: u8,
}

/// Summary of readiness across a set of characters.
#[derive(Debug, Clone, Serialize)]
pub struct ReadinessSummary {
    pub total: usize,
    pub ready: usize,
    pub partially_ready: usize,
    pub not_started: usize,
}

// ---------------------------------------------------------------------------
// Evaluation functions
// ---------------------------------------------------------------------------

/// Compute the readiness percentage from total and met criteria counts.
///
/// Returns 0 if `total_criteria` is 0.
pub fn compute_readiness_pct(total_criteria: usize, met_criteria: usize) -> u8 {
    if total_criteria == 0 {
        return 0;
    }
    let pct = (met_criteria as f64 / total_criteria as f64 * 100.0).round() as u8;
    pct.min(100)
}

/// Evaluate a character's readiness against the given criteria.
///
/// This is a pure function with no database dependencies. The caller
/// must pre-load the character's data and pass in booleans/lists.
pub fn evaluate_readiness(
    character_id: DbId,
    criteria: &ReadinessCriteria,
    has_source_image: bool,
    has_approved_variant: bool,
    metadata_complete: bool,
    present_settings: &[String],
) -> ReadinessResult {
    let mut missing: Vec<String> = Vec::new();
    let mut total = 0usize;
    let mut met = 0usize;

    // Check source image.
    if criteria.source_image {
        total += 1;
        if has_source_image {
            met += 1;
        } else {
            missing.push(MissingItemType::SourceImage.label());
        }
    }

    // Check approved variant.
    if criteria.approved_variant {
        total += 1;
        if has_approved_variant {
            met += 1;
        } else {
            missing.push(MissingItemType::ApprovedVariant.label());
        }
    }

    // Check metadata completeness.
    if criteria.metadata_complete {
        total += 1;
        if metadata_complete {
            met += 1;
        } else {
            missing.push(MissingItemType::MetadataComplete.label());
        }
    }

    // Check required settings keys.
    for key in &criteria.settings {
        total += 1;
        if present_settings.iter().any(|s| s == key) {
            met += 1;
        } else {
            missing.push(MissingItemType::SettingKey { key: key.clone() }.label());
        }
    }

    let pct = compute_readiness_pct(total, met);

    let state = if missing.is_empty() {
        ReadinessState::Ready
    } else if met > 0 {
        ReadinessState::PartiallyReady
    } else {
        ReadinessState::NotStarted
    };

    ReadinessResult {
        character_id,
        state,
        missing_items: missing,
        readiness_pct: pct,
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that the scope type is one of the allowed values.
pub fn validate_scope_type(scope: &str) -> Result<(), String> {
    if VALID_SCOPE_TYPES.contains(&scope) {
        Ok(())
    } else {
        Err(format!(
            "Invalid scope type '{scope}'. Must be one of: {}",
            VALID_SCOPE_TYPES.join(", ")
        ))
    }
}

/// Validate that a readiness state string is valid.
pub fn validate_readiness_state(state: &str) -> Result<(), String> {
    if VALID_READINESS_STATES.contains(&state) {
        Ok(())
    } else {
        Err(format!(
            "Invalid readiness state '{state}'. Must be one of: {}",
            VALID_READINESS_STATES.join(", ")
        ))
    }
}

/// Validate criteria JSON structure.
///
/// Expects `{"required_fields": {"source_image": bool, "approved_variant": bool,
/// "metadata_complete": bool, "settings": [string, ...]}}`.
pub fn validate_criteria_json(json: &serde_json::Value) -> Result<(), String> {
    let obj = json
        .as_object()
        .ok_or_else(|| "criteria_json must be a JSON object".to_string())?;

    let required_fields = obj
        .get("required_fields")
        .ok_or_else(|| "criteria_json must contain 'required_fields' key".to_string())?
        .as_object()
        .ok_or_else(|| "'required_fields' must be a JSON object".to_string())?;

    // Validate boolean fields.
    for field in &["source_image", "approved_variant", "metadata_complete"] {
        if let Some(val) = required_fields.get(*field) {
            if !val.is_boolean() {
                return Err(format!("'{field}' must be a boolean"));
            }
        }
    }

    // Validate settings array.
    if let Some(settings) = required_fields.get("settings") {
        let arr = settings
            .as_array()
            .ok_or_else(|| "'settings' must be an array of strings".to_string())?;

        if arr.len() > MAX_SETTINGS_KEYS {
            return Err(format!(
                "Too many settings keys: {} (max {MAX_SETTINGS_KEYS})",
                arr.len()
            ));
        }

        for (i, item) in arr.iter().enumerate() {
            let s = item
                .as_str()
                .ok_or_else(|| format!("settings[{i}] must be a string"))?;

            if s.is_empty() {
                return Err(format!("settings[{i}] must not be empty"));
            }
            if s.len() > MAX_SETTINGS_KEY_LENGTH {
                return Err(format!(
                    "settings[{i}] exceeds maximum length of {MAX_SETTINGS_KEY_LENGTH}"
                ));
            }
        }
    }

    Ok(())
}

/// Parse `ReadinessCriteria` from a `criteria_json` JSONB value.
pub fn parse_criteria_json(json: &serde_json::Value) -> Result<ReadinessCriteria, String> {
    let obj = json
        .as_object()
        .ok_or_else(|| "criteria_json must be a JSON object".to_string())?;

    let required_fields = obj.get("required_fields").and_then(|v| v.as_object());

    match required_fields {
        Some(rf) => {
            let source_image = rf
                .get("source_image")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let approved_variant = rf
                .get("approved_variant")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let metadata_complete = rf
                .get("metadata_complete")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let settings = rf
                .get("settings")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            Ok(ReadinessCriteria {
                source_image,
                approved_variant,
                metadata_complete,
                settings,
            })
        }
        None => Ok(ReadinessCriteria::default()),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- ReadinessState -------------------------------------------------------

    #[test]
    fn readiness_state_from_str_ready() {
        assert_eq!(
            ReadinessState::from_str_value("ready").unwrap(),
            ReadinessState::Ready
        );
    }

    #[test]
    fn readiness_state_from_str_partially_ready() {
        assert_eq!(
            ReadinessState::from_str_value("partially_ready").unwrap(),
            ReadinessState::PartiallyReady
        );
    }

    #[test]
    fn readiness_state_from_str_not_started() {
        assert_eq!(
            ReadinessState::from_str_value("not_started").unwrap(),
            ReadinessState::NotStarted
        );
    }

    #[test]
    fn readiness_state_from_str_invalid() {
        let result = ReadinessState::from_str_value("unknown");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid readiness state"));
    }

    #[test]
    fn readiness_state_as_str_round_trip() {
        for state in &[
            ReadinessState::Ready,
            ReadinessState::PartiallyReady,
            ReadinessState::NotStarted,
        ] {
            assert_eq!(
                ReadinessState::from_str_value(state.as_str()).unwrap(),
                *state
            );
        }
    }

    // -- MissingItemType ------------------------------------------------------

    #[test]
    fn missing_item_source_image_label() {
        assert_eq!(MissingItemType::SourceImage.label(), "source_image");
    }

    #[test]
    fn missing_item_approved_variant_label() {
        assert_eq!(MissingItemType::ApprovedVariant.label(), "approved_variant");
    }

    #[test]
    fn missing_item_metadata_complete_label() {
        assert_eq!(
            MissingItemType::MetadataComplete.label(),
            "metadata_complete"
        );
    }

    #[test]
    fn missing_item_setting_key_label() {
        let item = MissingItemType::SettingKey {
            key: "a2c4_model".to_string(),
        };
        assert_eq!(item.label(), "a2c4_model");
    }

    // -- compute_readiness_pct ------------------------------------------------

    #[test]
    fn pct_zero_total_returns_zero() {
        assert_eq!(compute_readiness_pct(0, 0), 0);
    }

    #[test]
    fn pct_all_met_returns_100() {
        assert_eq!(compute_readiness_pct(5, 5), 100);
    }

    #[test]
    fn pct_none_met_returns_zero() {
        assert_eq!(compute_readiness_pct(5, 0), 0);
    }

    #[test]
    fn pct_half_met_returns_50() {
        assert_eq!(compute_readiness_pct(4, 2), 50);
    }

    #[test]
    fn pct_rounds_correctly() {
        // 2/3 = 66.67 -> rounds to 67
        assert_eq!(compute_readiness_pct(3, 2), 67);
    }

    #[test]
    fn pct_never_exceeds_100() {
        assert_eq!(compute_readiness_pct(1, 5), 100);
    }

    // -- evaluate_readiness ---------------------------------------------------

    #[test]
    fn all_criteria_met_is_ready() {
        let criteria = ReadinessCriteria::default();
        let settings = vec![
            "a2c4_model".to_string(),
            "elevenlabs_voice".to_string(),
            "avatar_json".to_string(),
        ];

        let result = evaluate_readiness(1, &criteria, true, true, true, &settings);
        assert_eq!(result.state, ReadinessState::Ready);
        assert!(result.missing_items.is_empty());
        assert_eq!(result.readiness_pct, 100);
    }

    #[test]
    fn no_criteria_met_is_not_started() {
        let criteria = ReadinessCriteria::default();
        let result = evaluate_readiness(1, &criteria, false, false, false, &[]);
        assert_eq!(result.state, ReadinessState::NotStarted);
        assert_eq!(result.readiness_pct, 0);
        assert_eq!(result.missing_items.len(), 6); // 3 bools + 3 settings
    }

    #[test]
    fn some_criteria_met_is_partially_ready() {
        let criteria = ReadinessCriteria::default();
        let settings = vec!["a2c4_model".to_string()];

        let result = evaluate_readiness(1, &criteria, true, false, false, &settings);
        assert_eq!(result.state, ReadinessState::PartiallyReady);
        assert!(result.readiness_pct > 0);
        assert!(result.readiness_pct < 100);
    }

    #[test]
    fn evaluate_returns_correct_character_id() {
        let criteria = ReadinessCriteria::default();
        let result = evaluate_readiness(
            42,
            &criteria,
            true,
            true,
            true,
            &[
                "a2c4_model".to_string(),
                "elevenlabs_voice".to_string(),
                "avatar_json".to_string(),
            ],
        );
        assert_eq!(result.character_id, 42);
    }

    #[test]
    fn missing_only_source_image() {
        let criteria = ReadinessCriteria {
            source_image: true,
            approved_variant: false,
            metadata_complete: false,
            settings: vec![],
        };

        let result = evaluate_readiness(1, &criteria, false, false, false, &[]);
        assert_eq!(result.state, ReadinessState::NotStarted);
        assert_eq!(result.missing_items, vec!["source_image"]);
        assert_eq!(result.readiness_pct, 0);
    }

    #[test]
    fn missing_single_setting_key() {
        let criteria = ReadinessCriteria {
            source_image: false,
            approved_variant: false,
            metadata_complete: false,
            settings: vec!["a2c4_model".to_string(), "elevenlabs_voice".to_string()],
        };

        let result = evaluate_readiness(
            1,
            &criteria,
            false,
            false,
            false,
            &["a2c4_model".to_string()],
        );
        assert_eq!(result.state, ReadinessState::PartiallyReady);
        assert_eq!(result.missing_items, vec!["elevenlabs_voice"]);
        assert_eq!(result.readiness_pct, 50);
    }

    #[test]
    fn empty_criteria_is_ready() {
        let criteria = ReadinessCriteria {
            source_image: false,
            approved_variant: false,
            metadata_complete: false,
            settings: vec![],
        };

        let result = evaluate_readiness(1, &criteria, false, false, false, &[]);
        // No criteria to check, so readiness_pct is 0 from compute (total=0).
        // But no missing items means state is Ready.
        assert_eq!(result.state, ReadinessState::Ready);
        assert!(result.missing_items.is_empty());
    }

    // -- validate_scope_type --------------------------------------------------

    #[test]
    fn valid_scope_studio() {
        assert!(validate_scope_type("studio").is_ok());
    }

    #[test]
    fn valid_scope_project() {
        assert!(validate_scope_type("project").is_ok());
    }

    #[test]
    fn invalid_scope_rejected() {
        let result = validate_scope_type("global");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid scope type"));
    }

    #[test]
    fn empty_scope_rejected() {
        assert!(validate_scope_type("").is_err());
    }

    #[test]
    fn case_sensitive_scope() {
        assert!(validate_scope_type("Studio").is_err());
        assert!(validate_scope_type("PROJECT").is_err());
    }

    // -- validate_readiness_state ---------------------------------------------

    #[test]
    fn valid_readiness_states() {
        assert!(validate_readiness_state("ready").is_ok());
        assert!(validate_readiness_state("partially_ready").is_ok());
        assert!(validate_readiness_state("not_started").is_ok());
    }

    #[test]
    fn invalid_readiness_state_rejected() {
        let result = validate_readiness_state("pending");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid readiness state"));
    }

    // -- validate_criteria_json -----------------------------------------------

    #[test]
    fn valid_criteria_json() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {
                "source_image": true,
                "approved_variant": true,
                "metadata_complete": true,
                "settings": ["a2c4_model", "elevenlabs_voice"]
            }
        });
        assert!(validate_criteria_json(&json).is_ok());
    }

    #[test]
    fn criteria_json_not_object_rejected() {
        let json: serde_json::Value = serde_json::json!("not an object");
        let result = validate_criteria_json(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a JSON object"));
    }

    #[test]
    fn criteria_json_missing_required_fields_rejected() {
        let json: serde_json::Value = serde_json::json!({});
        let result = validate_criteria_json(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("required_fields"));
    }

    #[test]
    fn criteria_json_boolean_field_not_bool_rejected() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {
                "source_image": "yes"
            }
        });
        let result = validate_criteria_json(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a boolean"));
    }

    #[test]
    fn criteria_json_settings_not_array_rejected() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {
                "settings": "not an array"
            }
        });
        let result = validate_criteria_json(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be an array"));
    }

    #[test]
    fn criteria_json_settings_item_not_string_rejected() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {
                "settings": [123]
            }
        });
        let result = validate_criteria_json(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a string"));
    }

    #[test]
    fn criteria_json_settings_empty_string_rejected() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {
                "settings": [""]
            }
        });
        let result = validate_criteria_json(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }

    // -- parse_criteria_json --------------------------------------------------

    #[test]
    fn parse_full_criteria() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {
                "source_image": true,
                "approved_variant": false,
                "metadata_complete": true,
                "settings": ["a2c4_model"]
            }
        });

        let criteria = parse_criteria_json(&json).unwrap();
        assert!(criteria.source_image);
        assert!(!criteria.approved_variant);
        assert!(criteria.metadata_complete);
        assert_eq!(criteria.settings, vec!["a2c4_model"]);
    }

    #[test]
    fn parse_missing_fields_defaults_to_false() {
        let json: serde_json::Value = serde_json::json!({
            "required_fields": {}
        });

        let criteria = parse_criteria_json(&json).unwrap();
        assert!(!criteria.source_image);
        assert!(!criteria.approved_variant);
        assert!(!criteria.metadata_complete);
        assert!(criteria.settings.is_empty());
    }

    #[test]
    fn parse_no_required_fields_returns_default() {
        let json: serde_json::Value = serde_json::json!({});
        let criteria = parse_criteria_json(&json).unwrap();
        // Default: all true with 3 settings
        assert!(criteria.source_image);
        assert!(criteria.approved_variant);
        assert!(criteria.metadata_complete);
        assert_eq!(criteria.settings.len(), 3);
    }

    #[test]
    fn parse_not_object_rejected() {
        let json: serde_json::Value = serde_json::json!(42);
        assert!(parse_criteria_json(&json).is_err());
    }

    // -- ReadinessCriteria default ---------------------------------------------

    #[test]
    fn default_criteria_has_all_enabled() {
        let criteria = ReadinessCriteria::default();
        assert!(criteria.source_image);
        assert!(criteria.approved_variant);
        assert!(criteria.metadata_complete);
        assert_eq!(criteria.settings.len(), 3);
    }

    // -- ReadinessSummary construction ----------------------------------------

    #[test]
    fn readiness_summary_construction() {
        let summary = ReadinessSummary {
            total: 10,
            ready: 5,
            partially_ready: 3,
            not_started: 2,
        };
        assert_eq!(summary.total, 10);
        assert_eq!(summary.ready, 5);
        assert_eq!(summary.partially_ready, 3);
        assert_eq!(summary.not_started, 2);
    }

    // -- Constant completeness ------------------------------------------------

    #[test]
    fn scope_types_complete() {
        assert_eq!(VALID_SCOPE_TYPES.len(), 2);
    }

    #[test]
    fn readiness_states_complete() {
        assert_eq!(VALID_READINESS_STATES.len(), 3);
    }
}
