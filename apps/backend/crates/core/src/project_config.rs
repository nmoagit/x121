//! Project Configuration Templates constants, validation, and diffing (PRD-74).
//!
//! Provides domain types for exporting project configurations as reusable
//! templates and importing them (fully or selectively) into new projects.

use serde::{Deserialize, Serialize};

use crate::diff::DiffStatus;
use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum length of a config template name.
pub const MAX_CONFIG_NAME_LENGTH: usize = 200;

/// Maximum length of a config template description.
pub const MAX_CONFIG_DESCRIPTION_LENGTH: usize = 2000;

/// Maximum number of scene types allowed in a single config template.
pub const MAX_SCENE_TYPES_PER_CONFIG: usize = 100;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a config template name: must be non-empty, trimmed, and within
/// the maximum length limit.
pub fn validate_config_name(name: &str) -> Result<(), CoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Config name must not be empty".to_string(),
        ));
    }
    if trimmed.len() > MAX_CONFIG_NAME_LENGTH {
        return Err(CoreError::Validation(format!(
            "Config name exceeds maximum length of {MAX_CONFIG_NAME_LENGTH} characters"
        )));
    }
    Ok(())
}

/// Validate config JSON structure: must be an object with a "scene_types"
/// array key.
pub fn validate_config_json(json: &serde_json::Value) -> Result<(), CoreError> {
    let obj = json
        .as_object()
        .ok_or_else(|| CoreError::Validation("config_json must be a JSON object".to_string()))?;

    let scene_types = obj.get("scene_types").ok_or_else(|| {
        CoreError::Validation(
            "config_json must contain a 'scene_types' key".to_string(),
        )
    })?;

    let arr = scene_types.as_array().ok_or_else(|| {
        CoreError::Validation("'scene_types' must be an array".to_string())
    })?;

    if arr.len() > MAX_SCENE_TYPES_PER_CONFIG {
        return Err(CoreError::Validation(format!(
            "Config contains {} scene types, maximum is {MAX_SCENE_TYPES_PER_CONFIG}",
            arr.len()
        )));
    }

    Ok(())
}

/// Validate selective import: ensure every selected scene type name exists
/// in the config's scene_types array.
pub fn validate_selective_import(
    config_json: &serde_json::Value,
    selected_names: &[String],
) -> Result<(), CoreError> {
    let scene_types = config_json
        .get("scene_types")
        .and_then(|v| v.as_array())
        .unwrap_or(&Vec::new())
        .clone();

    let available_names: Vec<String> = scene_types
        .iter()
        .filter_map(|st| st.get("name").and_then(|n| n.as_str()))
        .map(|s| s.to_string())
        .collect();

    for name in selected_names {
        if !available_names.contains(name) {
            return Err(CoreError::Validation(format!(
                "Selected scene type '{name}' not found in config. \
                 Available: {}",
                available_names.join(", ")
            )));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Config diff types
// ---------------------------------------------------------------------------

/// A single entry in a config diff report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigDiffEntry {
    pub scene_type_name: String,
    pub status: DiffStatus,
    pub current_value: Option<serde_json::Value>,
    pub incoming_value: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/// Compare the scene_types arrays from two configs and return a structured diff.
///
/// - Scene types present only in `incoming_json` are marked `Added`.
/// - Scene types present in both but with different content are marked `Changed`.
/// - Scene types present in both with identical content are marked `Unchanged`.
pub fn compute_config_diff(
    current_json: &serde_json::Value,
    incoming_json: &serde_json::Value,
) -> Vec<ConfigDiffEntry> {
    let empty_vec = Vec::new();

    let current_scene_types = current_json
        .get("scene_types")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty_vec);

    let incoming_scene_types = incoming_json
        .get("scene_types")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty_vec);

    // Build lookup: name -> value for current scene types
    let mut current_map: std::collections::HashMap<String, &serde_json::Value> =
        std::collections::HashMap::new();
    for st in current_scene_types {
        if let Some(name) = st.get("name").and_then(|n| n.as_str()) {
            current_map.insert(name.to_string(), st);
        }
    }

    let mut entries: Vec<ConfigDiffEntry> = Vec::new();

    for incoming_st in incoming_scene_types {
        let name = match incoming_st.get("name").and_then(|n| n.as_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        match current_map.get(&name) {
            Some(current_st) => {
                if *current_st == incoming_st {
                    entries.push(ConfigDiffEntry {
                        scene_type_name: name,
                        status: DiffStatus::Unchanged,
                        current_value: Some((*current_st).clone()),
                        incoming_value: Some(incoming_st.clone()),
                    });
                } else {
                    entries.push(ConfigDiffEntry {
                        scene_type_name: name,
                        status: DiffStatus::Changed,
                        current_value: Some((*current_st).clone()),
                        incoming_value: Some(incoming_st.clone()),
                    });
                }
            }
            None => {
                entries.push(ConfigDiffEntry {
                    scene_type_name: name,
                    status: DiffStatus::Added,
                    current_value: None,
                    incoming_value: Some(incoming_st.clone()),
                });
            }
        }
    }

    entries
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- validate_config_name -----------------------------------------------

    #[test]
    fn valid_config_name() {
        assert!(validate_config_name("My Config").is_ok());
    }

    #[test]
    fn config_name_trimmed_is_valid() {
        assert!(validate_config_name("  trimmed  ").is_ok());
    }

    #[test]
    fn empty_config_name_rejects() {
        assert!(validate_config_name("").is_err());
    }

    #[test]
    fn whitespace_only_config_name_rejects() {
        assert!(validate_config_name("   ").is_err());
    }

    #[test]
    fn too_long_config_name_rejects() {
        let long = "a".repeat(MAX_CONFIG_NAME_LENGTH + 1);
        assert!(validate_config_name(&long).is_err());
    }

    #[test]
    fn max_length_config_name_ok() {
        let exact = "a".repeat(MAX_CONFIG_NAME_LENGTH);
        assert!(validate_config_name(&exact).is_ok());
    }

    // -- validate_config_json -----------------------------------------------

    #[test]
    fn valid_config_json() {
        let cfg = json!({ "scene_types": [{"name": "close-up"}] });
        assert!(validate_config_json(&cfg).is_ok());
    }

    #[test]
    fn config_json_non_object_rejects() {
        let cfg = json!("just a string");
        assert!(validate_config_json(&cfg).is_err());
    }

    #[test]
    fn config_json_missing_scene_types_rejects() {
        let cfg = json!({ "workflows": [] });
        assert!(validate_config_json(&cfg).is_err());
    }

    #[test]
    fn config_json_scene_types_not_array_rejects() {
        let cfg = json!({ "scene_types": "not-an-array" });
        assert!(validate_config_json(&cfg).is_err());
    }

    #[test]
    fn config_json_too_many_scene_types_rejects() {
        let many: Vec<serde_json::Value> = (0..=MAX_SCENE_TYPES_PER_CONFIG)
            .map(|i| json!({ "name": format!("type_{i}") }))
            .collect();
        let cfg = json!({ "scene_types": many });
        assert!(validate_config_json(&cfg).is_err());
    }

    #[test]
    fn config_json_empty_scene_types_ok() {
        let cfg = json!({ "scene_types": [] });
        assert!(validate_config_json(&cfg).is_ok());
    }

    #[test]
    fn config_json_max_scene_types_ok() {
        let types: Vec<serde_json::Value> = (0..MAX_SCENE_TYPES_PER_CONFIG)
            .map(|i| json!({ "name": format!("type_{i}") }))
            .collect();
        let cfg = json!({ "scene_types": types });
        assert!(validate_config_json(&cfg).is_ok());
    }

    // -- validate_selective_import ------------------------------------------

    #[test]
    fn selective_import_valid_names() {
        let cfg = json!({
            "scene_types": [
                {"name": "close-up"},
                {"name": "wide-shot"}
            ]
        });
        assert!(
            validate_selective_import(&cfg, &["close-up".to_string()]).is_ok()
        );
    }

    #[test]
    fn selective_import_missing_name_rejects() {
        let cfg = json!({
            "scene_types": [{"name": "close-up"}]
        });
        assert!(
            validate_selective_import(&cfg, &["wide-shot".to_string()]).is_err()
        );
    }

    #[test]
    fn selective_import_empty_selection_ok() {
        let cfg = json!({ "scene_types": [{"name": "close-up"}] });
        assert!(validate_selective_import(&cfg, &[]).is_ok());
    }

    #[test]
    fn selective_import_no_scene_types_rejects_any_selection() {
        let cfg = json!({ "other": "data" });
        assert!(
            validate_selective_import(&cfg, &["close-up".to_string()]).is_err()
        );
    }

    // -- compute_config_diff ------------------------------------------------

    #[test]
    fn diff_added_scene_type() {
        let current = json!({ "scene_types": [] });
        let incoming = json!({ "scene_types": [{"name": "new-type", "prompt": "test"}] });
        let diff = compute_config_diff(&current, &incoming);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].status, DiffStatus::Added);
        assert_eq!(diff[0].scene_type_name, "new-type");
        assert!(diff[0].current_value.is_none());
        assert!(diff[0].incoming_value.is_some());
    }

    #[test]
    fn diff_unchanged_scene_type() {
        let st = json!({"name": "close-up", "prompt": "test"});
        let current = json!({ "scene_types": [st.clone()] });
        let incoming = json!({ "scene_types": [st] });
        let diff = compute_config_diff(&current, &incoming);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].status, DiffStatus::Unchanged);
    }

    #[test]
    fn diff_changed_scene_type() {
        let current = json!({
            "scene_types": [{"name": "close-up", "prompt": "old"}]
        });
        let incoming = json!({
            "scene_types": [{"name": "close-up", "prompt": "new"}]
        });
        let diff = compute_config_diff(&current, &incoming);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].status, DiffStatus::Changed);
        assert!(diff[0].current_value.is_some());
        assert!(diff[0].incoming_value.is_some());
    }

    #[test]
    fn diff_mixed_results() {
        let current = json!({
            "scene_types": [
                {"name": "close-up", "prompt": "same"},
                {"name": "wide-shot", "prompt": "old"}
            ]
        });
        let incoming = json!({
            "scene_types": [
                {"name": "close-up", "prompt": "same"},
                {"name": "wide-shot", "prompt": "new"},
                {"name": "aerial", "prompt": "fresh"}
            ]
        });
        let diff = compute_config_diff(&current, &incoming);
        assert_eq!(diff.len(), 3);
        assert_eq!(diff[0].status, DiffStatus::Unchanged);
        assert_eq!(diff[1].status, DiffStatus::Changed);
        assert_eq!(diff[2].status, DiffStatus::Added);
    }

    #[test]
    fn diff_empty_configs() {
        let current = json!({ "scene_types": [] });
        let incoming = json!({ "scene_types": [] });
        let diff = compute_config_diff(&current, &incoming);
        assert!(diff.is_empty());
    }

    #[test]
    fn diff_missing_scene_types_key_treated_as_empty() {
        let current = json!({});
        let incoming = json!({ "scene_types": [{"name": "new"}] });
        let diff = compute_config_diff(&current, &incoming);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].status, DiffStatus::Added);
    }

    #[test]
    fn diff_skips_entries_without_name() {
        let current = json!({ "scene_types": [] });
        let incoming = json!({ "scene_types": [{"prompt": "no-name"}] });
        let diff = compute_config_diff(&current, &incoming);
        assert!(diff.is_empty());
    }

}
