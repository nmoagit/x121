//! Configuration export/import constants and types (PRD-44).
//!
//! Defines the portable configuration snapshot structure, sensitive-key
//! exclusion list, and section name constants used by the config management
//! API handlers.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::Timestamp;

// ---------------------------------------------------------------------------
// Config export envelope
// ---------------------------------------------------------------------------

/// A portable snapshot of the platform configuration.
///
/// Exported as JSON. Each section maps a logical area (e.g. "themes",
/// "roles") to its serialised settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigExport {
    /// Platform version at the time of export (e.g. "0.1.0").
    pub version: String,
    /// UTC timestamp of the export.
    pub exported_at: Timestamp,
    /// Username or user ID of the person who triggered the export.
    pub exported_by: String,
    /// Configuration sections keyed by section name.
    pub sections: HashMap<String, serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Section name constants
// ---------------------------------------------------------------------------

pub const SECTION_THEMES: &str = "themes";
pub const SECTION_ROLES: &str = "roles";
pub const SECTION_SCENE_TYPES: &str = "scene_types";
pub const SECTION_NOTIFICATION_SETTINGS: &str = "notification_settings";
pub const SECTION_SCHEDULING_POLICIES: &str = "scheduling_policies";
pub const SECTION_VALIDATION_RULES: &str = "validation_rules";
pub const SECTION_KEYMAPS: &str = "keymaps";
pub const SECTION_EXTENSIONS: &str = "extensions";

/// All exportable section names.
pub const ALL_SECTIONS: &[&str] = &[
    SECTION_THEMES,
    SECTION_ROLES,
    SECTION_SCENE_TYPES,
    SECTION_NOTIFICATION_SETTINGS,
    SECTION_SCHEDULING_POLICIES,
    SECTION_VALIDATION_RULES,
    SECTION_KEYMAPS,
    SECTION_EXTENSIONS,
];

// ---------------------------------------------------------------------------
// Sensitive-key exclusion
// ---------------------------------------------------------------------------

/// Extra keys (beyond [`crate::audit::SENSITIVE_FIELDS`]) that must be
/// stripped or masked when exporting configuration.
///
/// The full sensitive-key check uses both [`crate::audit::SENSITIVE_FIELDS`]
/// and these additional config-specific keys.
pub const EXTRA_SENSITIVE_KEYS: &[&str] = &[
    "api_secret",
    "client_secret",
    "database_url",
    "connection_string",
];

/// The placeholder value that replaces redacted sensitive data.
pub const REDACTED_VALUE: &str = "***REDACTED***";

// ---------------------------------------------------------------------------
// Validation result for import
// ---------------------------------------------------------------------------

/// Result of validating a configuration archive before import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidationResult {
    /// Whether the archive is valid for import.
    pub is_valid: bool,
    /// Platform version the archive was exported from.
    pub export_version: String,
    /// Sections present in the archive.
    pub sections: Vec<String>,
    /// Warning messages (non-blocking).
    pub warnings: Vec<String>,
    /// Error messages (blocking).
    pub errors: Vec<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Check whether a JSON key is considered sensitive.
///
/// Checks against both [`crate::audit::SENSITIVE_FIELDS`] (shared with
/// audit log redaction) and [`EXTRA_SENSITIVE_KEYS`] (config-specific).
pub fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    crate::audit::SENSITIVE_FIELDS
        .iter()
        .chain(EXTRA_SENSITIVE_KEYS.iter())
        .any(|&k| lower.contains(k))
}

/// Recursively redact sensitive keys in a JSON value.
pub fn redact_sensitive(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                if is_sensitive_key(key) {
                    *val = serde_json::Value::String(REDACTED_VALUE.to_string());
                } else {
                    redact_sensitive(val);
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr.iter_mut() {
                redact_sensitive(item);
            }
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sensitive_key_detection() {
        assert!(is_sensitive_key("password"));
        assert!(is_sensitive_key("API_KEY"));
        assert!(is_sensitive_key("my_api_secret"));
        assert!(is_sensitive_key("DATABASE_URL"));
        assert!(is_sensitive_key("client_secret_value"));
        assert!(!is_sensitive_key("username"));
        assert!(!is_sensitive_key("display_name"));
        assert!(!is_sensitive_key("color"));
    }

    #[test]
    fn redact_simple_object() {
        let mut val = serde_json::json!({
            "name": "test",
            "password": "s3cret",
            "api_key": "abc123"
        });
        redact_sensitive(&mut val);

        assert_eq!(val["name"], "test");
        assert_eq!(val["password"], REDACTED_VALUE);
        assert_eq!(val["api_key"], REDACTED_VALUE);
    }

    #[test]
    fn redact_nested_object() {
        let mut val = serde_json::json!({
            "service": {
                "url": "https://example.com",
                "client_secret": "xyz"
            }
        });
        redact_sensitive(&mut val);

        assert_eq!(val["service"]["url"], "https://example.com");
        assert_eq!(val["service"]["client_secret"], REDACTED_VALUE);
    }

    #[test]
    fn redact_array_of_objects() {
        let mut val = serde_json::json!([
            { "name": "a", "secret": "hidden" },
            { "name": "b", "value": "visible" }
        ]);
        redact_sensitive(&mut val);

        assert_eq!(val[0]["secret"], REDACTED_VALUE);
        assert_eq!(val[1]["value"], "visible");
    }

    #[test]
    fn all_sections_are_non_empty() {
        assert!(!ALL_SECTIONS.is_empty());
        for s in ALL_SECTIONS {
            assert!(!s.is_empty());
        }
    }

    #[test]
    fn config_export_round_trip() {
        let export = ConfigExport {
            version: "0.1.0".to_string(),
            exported_at: chrono::Utc::now(),
            exported_by: "admin".to_string(),
            sections: HashMap::from([(
                SECTION_THEMES.to_string(),
                serde_json::json!([{ "name": "dark" }]),
            )]),
        };

        let json = serde_json::to_string(&export).unwrap();
        let parsed: ConfigExport = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.version, "0.1.0");
        assert_eq!(parsed.exported_by, "admin");
        assert!(parsed.sections.contains_key(SECTION_THEMES));
    }
}
