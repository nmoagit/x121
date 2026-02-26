//! Core types, constants, and pure validation for the legacy data import
//! and migration toolkit (PRD-86).
//!
//! This module has zero external dependencies (no DB, no async, no I/O).
//! It provides:
//!
//! - Status and action enums with string conversions
//! - Path mapping rule types and default rules
//! - Validation functions for source paths and mapping config
//! - Pattern matching for path-to-entity inference
//! - Gap analysis types

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum length of a source path.
pub const MAX_SOURCE_PATH_LENGTH: usize = 4096;

/// Maximum number of mapping rules allowed.
pub const MAX_MAPPING_RULES: usize = 50;

/// Maximum length of match key string.
pub const MAX_MATCH_KEY_LENGTH: usize = 64;

/// Default match key used for entity matching.
pub const DEFAULT_MATCH_KEY: &str = "name";

// ---------------------------------------------------------------------------
// Import Run Status
// ---------------------------------------------------------------------------

/// Status of a legacy import run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportRunStatus {
    Scanning,
    Mapping,
    Preview,
    Importing,
    Completed,
    Partial,
    Failed,
    Cancelled,
}

impl ImportRunStatus {
    /// Return the status name as stored in the database.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Scanning => "scanning",
            Self::Mapping => "mapping",
            Self::Preview => "preview",
            Self::Importing => "importing",
            Self::Completed => "completed",
            Self::Partial => "partial",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    /// Parse a status string. Returns `None` for unknown values.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "scanning" => Some(Self::Scanning),
            "mapping" => Some(Self::Mapping),
            "preview" => Some(Self::Preview),
            "importing" => Some(Self::Importing),
            "completed" => Some(Self::Completed),
            "partial" => Some(Self::Partial),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }

    /// All valid status values.
    pub const ALL: &'static [&'static str] = &[
        "scanning",
        "mapping",
        "preview",
        "importing",
        "completed",
        "partial",
        "failed",
        "cancelled",
    ];
}

impl std::fmt::Display for ImportRunStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Entity Action
// ---------------------------------------------------------------------------

/// Action taken on an entity during import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityAction {
    Created,
    Updated,
    Skipped,
    Failed,
    Duplicate,
}

impl EntityAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Updated => "updated",
            Self::Skipped => "skipped",
            Self::Failed => "failed",
            Self::Duplicate => "duplicate",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "created" => Some(Self::Created),
            "updated" => Some(Self::Updated),
            "skipped" => Some(Self::Skipped),
            "failed" => Some(Self::Failed),
            "duplicate" => Some(Self::Duplicate),
            _ => None,
        }
    }

    /// All valid action values.
    pub const ALL: &'static [&'static str] =
        &["created", "updated", "skipped", "failed", "duplicate"];
}

impl std::fmt::Display for EntityAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Path Mapping
// ---------------------------------------------------------------------------

/// A rule for mapping filesystem paths to entity types.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathMappingRule {
    /// Glob or regex pattern to match against relative paths.
    pub pattern: String,
    /// The entity type this pattern maps to (e.g. "character", "scene", "image").
    pub entity_type: String,
    /// Named capture groups extracted from the pattern (e.g. "name", "category").
    pub captures: Vec<String>,
}

/// An entity inferred from a path via mapping rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferredEntity {
    /// The source file path that was matched.
    pub source_path: String,
    /// The entity type derived from the matching rule.
    pub entity_type: String,
    /// Key-value pairs extracted from pattern captures.
    pub captured_values: HashMap<String, String>,
    /// The inferred entity name (from the match key).
    pub inferred_name: String,
}

/// Returns the default set of path mapping rules for typical
/// legacy folder structures.
///
/// Default convention:
/// - `{name}/**` -> character by folder name
/// - `{name}/scenes/{scene}/**` -> scene by subfolder
/// - `{name}/images/**` -> source image files
pub fn default_mapping_rules() -> Vec<PathMappingRule> {
    vec![
        PathMappingRule {
            pattern: "{name}/**".to_string(),
            entity_type: "character".to_string(),
            captures: vec!["name".to_string()],
        },
        PathMappingRule {
            pattern: "{name}/scenes/{scene}/**".to_string(),
            entity_type: "scene".to_string(),
            captures: vec!["name".to_string(), "scene".to_string()],
        },
        PathMappingRule {
            pattern: "{name}/images/*".to_string(),
            entity_type: "image".to_string(),
            captures: vec!["name".to_string()],
        },
    ]
}

// ---------------------------------------------------------------------------
// Pattern Matching
// ---------------------------------------------------------------------------

/// Attempt to match a file path against a simple pattern with `{key}`
/// placeholders. Returns captured key-value pairs on match.
///
/// Patterns use `{key}` for single path segments and `**` for any suffix.
/// For example, `{name}/scenes/{scene}/**` matches `Alice/scenes/intro/file.png`.
pub fn match_path_pattern(path: &str, pattern: &str) -> Option<HashMap<String, String>> {
    let path_parts: Vec<&str> = path.split('/').collect();
    let pattern_parts: Vec<&str> = pattern.split('/').collect();
    let mut captures = HashMap::new();
    let mut pi = 0; // path index
    let mut pati = 0; // pattern index

    while pati < pattern_parts.len() {
        let pat = pattern_parts[pati];

        if pat == "**" {
            // `**` matches the rest of the path.
            return Some(captures);
        }

        if pi >= path_parts.len() {
            return None; // Path too short.
        }

        if pat == "*" {
            // `*` matches any single segment.
            pi += 1;
            pati += 1;
            continue;
        }

        if pat.starts_with('{') && pat.ends_with('}') {
            // Capture group.
            let key = &pat[1..pat.len() - 1];
            captures.insert(key.to_string(), path_parts[pi].to_string());
            pi += 1;
            pati += 1;
            continue;
        }

        // Literal match.
        if pat != path_parts[pi] {
            return None;
        }

        pi += 1;
        pati += 1;
    }

    // Pattern fully consumed; path must also be fully consumed.
    if pi == path_parts.len() {
        Some(captures)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Gap Analysis
// ---------------------------------------------------------------------------

/// Type of gap found during analysis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GapType {
    /// Character folder exists but has no metadata file.
    MissingMetadata,
    /// Character metadata references an image that was not found.
    MissingSourceImage,
    /// Character folder has no scene subfolders.
    MissingScene,
}

impl GapType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MissingMetadata => "missing_metadata",
            Self::MissingSourceImage => "missing_source_image",
            Self::MissingScene => "missing_scene",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "missing_metadata" => Some(Self::MissingMetadata),
            "missing_source_image" => Some(Self::MissingSourceImage),
            "missing_scene" => Some(Self::MissingScene),
            _ => None,
        }
    }
}

impl std::fmt::Display for GapType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Valid match key values.
pub const VALID_MATCH_KEYS: &[&str] = &["name", "id", "path", "hash"];

/// Validate that a source path is well-formed and within length limits.
pub fn validate_source_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Source path cannot be empty".to_string());
    }
    if path.len() > MAX_SOURCE_PATH_LENGTH {
        return Err(format!(
            "Source path exceeds maximum length of {MAX_SOURCE_PATH_LENGTH} characters"
        ));
    }
    // Reject paths with null bytes.
    if path.contains('\0') {
        return Err("Source path contains null bytes".to_string());
    }
    // Must be absolute or a recognizable relative path.
    if !path.starts_with('/') && !path.starts_with("./") && !path.contains('/') {
        return Err(
            "Source path must be an absolute path or contain directory separators".to_string(),
        );
    }
    Ok(())
}

/// Validate a mapping configuration JSON value.
///
/// Expects either an empty object (use defaults) or an object with a
/// `rules` array, where each rule has `pattern`, `entity_type`, and
/// optional `captures`.
pub fn validate_mapping_config(config: &serde_json::Value) -> Result<(), String> {
    if config.is_null() {
        return Ok(());
    }
    if !config.is_object() {
        return Err("Mapping config must be a JSON object".to_string());
    }
    let obj = config.as_object().unwrap();

    // Empty object means use defaults.
    if obj.is_empty() {
        return Ok(());
    }

    if let Some(rules) = obj.get("rules") {
        if !rules.is_array() {
            return Err("Mapping config 'rules' must be an array".to_string());
        }
        let rules_arr = rules.as_array().unwrap();
        if rules_arr.len() > MAX_MAPPING_RULES {
            return Err(format!(
                "Mapping config exceeds maximum of {MAX_MAPPING_RULES} rules"
            ));
        }
        for (i, rule) in rules_arr.iter().enumerate() {
            if !rule.is_object() {
                return Err(format!("Rule at index {i} must be a JSON object"));
            }
            let rule_obj = rule.as_object().unwrap();
            if !rule_obj.contains_key("pattern") {
                return Err(format!("Rule at index {i} is missing 'pattern' field"));
            }
            if !rule_obj.contains_key("entity_type") {
                return Err(format!("Rule at index {i} is missing 'entity_type' field"));
            }
        }
    }

    Ok(())
}

/// Validate match key value.
pub fn validate_match_key(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("Match key cannot be empty".to_string());
    }
    if key.len() > MAX_MATCH_KEY_LENGTH {
        return Err(format!(
            "Match key exceeds maximum length of {MAX_MATCH_KEY_LENGTH} characters"
        ));
    }
    if !VALID_MATCH_KEYS.contains(&key) {
        return Err(format!(
            "Invalid match key '{}'. Must be one of: {}",
            key,
            VALID_MATCH_KEYS.join(", ")
        ));
    }
    Ok(())
}

/// Validate entity action string.
pub fn validate_entity_action(action: &str) -> Result<(), String> {
    if EntityAction::from_str(action).is_some() {
        Ok(())
    } else {
        Err(format!(
            "Invalid entity action '{}'. Must be one of: {}",
            action,
            EntityAction::ALL.join(", ")
        ))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- ImportRunStatus tests ------------------------------------------------

    #[test]
    fn status_round_trip() {
        for s in ImportRunStatus::ALL {
            let status = ImportRunStatus::from_str(s).unwrap();
            assert_eq!(status.as_str(), *s);
        }
    }

    #[test]
    fn status_unknown_returns_none() {
        assert!(ImportRunStatus::from_str("nonexistent").is_none());
    }

    #[test]
    fn status_display_matches_as_str() {
        let s = ImportRunStatus::Scanning;
        assert_eq!(format!("{s}"), "scanning");
    }

    #[test]
    fn status_all_has_eight_entries() {
        assert_eq!(ImportRunStatus::ALL.len(), 8);
    }

    // -- EntityAction tests ---------------------------------------------------

    #[test]
    fn action_round_trip() {
        for s in EntityAction::ALL {
            let action = EntityAction::from_str(s).unwrap();
            assert_eq!(action.as_str(), *s);
        }
    }

    #[test]
    fn action_unknown_returns_none() {
        assert!(EntityAction::from_str("merged").is_none());
    }

    #[test]
    fn action_display_matches_as_str() {
        let a = EntityAction::Created;
        assert_eq!(format!("{a}"), "created");
    }

    #[test]
    fn action_all_has_five_entries() {
        assert_eq!(EntityAction::ALL.len(), 5);
    }

    // -- validate_source_path tests -------------------------------------------

    #[test]
    fn valid_absolute_path() {
        assert!(validate_source_path("/data/legacy/characters").is_ok());
    }

    #[test]
    fn valid_relative_path() {
        assert!(validate_source_path("./data/characters").is_ok());
    }

    #[test]
    fn valid_path_with_slashes() {
        assert!(validate_source_path("data/legacy/exports").is_ok());
    }

    #[test]
    fn empty_path_rejected() {
        let result = validate_source_path("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn path_exceeding_max_rejected() {
        let long_path = "/".to_string() + &"a".repeat(MAX_SOURCE_PATH_LENGTH);
        assert!(validate_source_path(&long_path).is_err());
    }

    #[test]
    fn path_with_null_rejected() {
        assert!(validate_source_path("/data/\0/bad").is_err());
    }

    #[test]
    fn bare_filename_rejected() {
        assert!(validate_source_path("justfile").is_err());
    }

    // -- validate_mapping_config tests ----------------------------------------

    #[test]
    fn null_config_accepted() {
        assert!(validate_mapping_config(&serde_json::Value::Null).is_ok());
    }

    #[test]
    fn empty_object_accepted() {
        let config = serde_json::json!({});
        assert!(validate_mapping_config(&config).is_ok());
    }

    #[test]
    fn valid_config_with_rules() {
        let config = serde_json::json!({
            "rules": [
                { "pattern": "{name}/**", "entity_type": "character" },
                { "pattern": "{name}/scenes/{scene}/**", "entity_type": "scene" }
            ]
        });
        assert!(validate_mapping_config(&config).is_ok());
    }

    #[test]
    fn non_object_rejected() {
        let config = serde_json::json!("string_value");
        assert!(validate_mapping_config(&config).is_err());
    }

    #[test]
    fn rules_not_array_rejected() {
        let config = serde_json::json!({ "rules": "not_array" });
        assert!(validate_mapping_config(&config).is_err());
    }

    #[test]
    fn too_many_rules_rejected() {
        let rules: Vec<serde_json::Value> = (0..MAX_MAPPING_RULES + 1)
            .map(|i| serde_json::json!({ "pattern": format!("p{i}"), "entity_type": "char" }))
            .collect();
        let config = serde_json::json!({ "rules": rules });
        assert!(validate_mapping_config(&config).is_err());
    }

    #[test]
    fn rule_missing_pattern_rejected() {
        let config = serde_json::json!({
            "rules": [{ "entity_type": "character" }]
        });
        let result = validate_mapping_config(&config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("missing 'pattern'"));
    }

    #[test]
    fn rule_missing_entity_type_rejected() {
        let config = serde_json::json!({
            "rules": [{ "pattern": "{name}/**" }]
        });
        let result = validate_mapping_config(&config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("missing 'entity_type'"));
    }

    // -- validate_match_key tests ---------------------------------------------

    #[test]
    fn valid_match_keys() {
        for key in VALID_MATCH_KEYS {
            assert!(validate_match_key(key).is_ok());
        }
    }

    #[test]
    fn invalid_match_key_rejected() {
        assert!(validate_match_key("unknown_key").is_err());
    }

    #[test]
    fn empty_match_key_rejected() {
        assert!(validate_match_key("").is_err());
    }

    // -- validate_entity_action tests -----------------------------------------

    #[test]
    fn valid_actions_accepted() {
        for action in EntityAction::ALL {
            assert!(validate_entity_action(action).is_ok());
        }
    }

    #[test]
    fn invalid_action_rejected() {
        assert!(validate_entity_action("merged").is_err());
    }

    // -- match_path_pattern tests ---------------------------------------------

    #[test]
    fn simple_capture_match() {
        let captures = match_path_pattern("Alice/portrait.png", "{name}/*").unwrap();
        assert_eq!(captures.get("name").unwrap(), "Alice");
    }

    #[test]
    fn multi_capture_match() {
        let captures =
            match_path_pattern("Alice/scenes/intro/file.png", "{name}/scenes/{scene}/**").unwrap();
        assert_eq!(captures.get("name").unwrap(), "Alice");
        assert_eq!(captures.get("scene").unwrap(), "intro");
    }

    #[test]
    fn literal_match() {
        let captures = match_path_pattern("images/test.png", "images/*").unwrap();
        assert!(captures.is_empty());
    }

    #[test]
    fn no_match_returns_none() {
        assert!(match_path_pattern("Alice/portrait.png", "images/*").is_none());
    }

    #[test]
    fn globstar_matches_rest() {
        let captures = match_path_pattern("Alice/deep/nested/path/file.png", "{name}/**").unwrap();
        assert_eq!(captures.get("name").unwrap(), "Alice");
    }

    #[test]
    fn path_too_short_returns_none() {
        assert!(match_path_pattern("Alice", "{name}/{sub}/*").is_none());
    }

    #[test]
    fn exact_match_no_wildcards() {
        let captures = match_path_pattern("config.json", "config.json").unwrap();
        assert!(captures.is_empty());
    }

    // -- default_mapping_rules tests ------------------------------------------

    #[test]
    fn default_rules_has_three_entries() {
        let rules = default_mapping_rules();
        assert_eq!(rules.len(), 3);
    }

    #[test]
    fn default_rules_entity_types() {
        let rules = default_mapping_rules();
        assert_eq!(rules[0].entity_type, "character");
        assert_eq!(rules[1].entity_type, "scene");
        assert_eq!(rules[2].entity_type, "image");
    }

    #[test]
    fn default_rules_have_captures() {
        let rules = default_mapping_rules();
        assert!(!rules[0].captures.is_empty());
        assert!(rules[1].captures.contains(&"scene".to_string()));
    }

    // -- GapType tests --------------------------------------------------------

    #[test]
    fn gap_type_round_trip() {
        let types = [
            ("missing_metadata", GapType::MissingMetadata),
            ("missing_source_image", GapType::MissingSourceImage),
            ("missing_scene", GapType::MissingScene),
        ];
        for (s, expected) in types {
            let gap = GapType::from_str(s).unwrap();
            assert_eq!(gap, expected);
            assert_eq!(gap.as_str(), s);
        }
    }

    #[test]
    fn gap_type_unknown_returns_none() {
        assert!(GapType::from_str("nonexistent").is_none());
    }

    #[test]
    fn gap_type_display() {
        assert_eq!(format!("{}", GapType::MissingMetadata), "missing_metadata");
    }

    // -- constant checks ------------------------------------------------------

    #[test]
    fn max_source_path_is_4096() {
        assert_eq!(MAX_SOURCE_PATH_LENGTH, 4096);
    }

    #[test]
    fn max_mapping_rules_is_50() {
        assert_eq!(MAX_MAPPING_RULES, 50);
    }

    #[test]
    fn valid_match_keys_list_complete() {
        assert_eq!(VALID_MATCH_KEYS.len(), 4);
    }
}
