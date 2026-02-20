//! Conflict detection and resolution between existing and incoming data.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A field-level mismatch between existing DB data and incoming import data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldConflict {
    pub field: String,
    pub db_value: Value,
    pub file_value: Value,
    pub suggested_resolution: ConflictResolution,
}

/// How to resolve a field conflict.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    KeepDb,
    KeepFile,
    Merge,
}

/// User-chosen resolution for a single field conflict.
#[derive(Debug, Clone, Deserialize)]
pub struct ConflictResolutionChoice {
    pub field: String,
    pub resolution: ConflictResolution,
    #[serde(default)]
    pub custom_value: Option<Value>,
}

/// Detect field-level conflicts between existing and incoming data.
///
/// Fields listed in `ignore_fields` are skipped (e.g., `id`, `created_at`,
/// `updated_at`).
pub fn detect_conflicts(
    existing: &serde_json::Map<String, Value>,
    incoming: &serde_json::Map<String, Value>,
    ignore_fields: &[&str],
) -> Vec<FieldConflict> {
    let mut conflicts = Vec::new();

    for (key, incoming_val) in incoming {
        if ignore_fields.contains(&key.as_str()) {
            continue;
        }
        if let Some(existing_val) = existing.get(key) {
            if existing_val != incoming_val {
                conflicts.push(FieldConflict {
                    field: key.clone(),
                    db_value: existing_val.clone(),
                    file_value: incoming_val.clone(),
                    suggested_resolution: suggest_resolution(key),
                });
            }
        }
    }

    conflicts
}

/// Apply user-chosen conflict resolutions to produce the final record.
pub fn apply_resolutions(
    existing: &serde_json::Map<String, Value>,
    incoming: &serde_json::Map<String, Value>,
    resolutions: &[ConflictResolutionChoice],
) -> serde_json::Map<String, Value> {
    let mut result = incoming.clone();

    for choice in resolutions {
        match choice.resolution {
            ConflictResolution::KeepDb => {
                if let Some(val) = existing.get(&choice.field) {
                    result.insert(choice.field.clone(), val.clone());
                }
            }
            ConflictResolution::KeepFile => { /* already in result */ }
            ConflictResolution::Merge => {
                if let Some(custom) = &choice.custom_value {
                    result.insert(choice.field.clone(), custom.clone());
                }
            }
        }
    }

    result
}

/// Heuristic: timestamps keep DB value, content fields keep file value.
fn suggest_resolution(field: &str) -> ConflictResolution {
    if field.ends_with("_at") || field == "id" {
        ConflictResolution::KeepDb
    } else {
        ConflictResolution::KeepFile
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn map(pairs: &[(&str, Value)]) -> serde_json::Map<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn no_conflicts_when_same() {
        let existing = map(&[("name", json!("Alice"))]);
        let incoming = map(&[("name", json!("Alice"))]);
        assert!(detect_conflicts(&existing, &incoming, &[]).is_empty());
    }

    #[test]
    fn detects_conflict() {
        let existing = map(&[("name", json!("Alice"))]);
        let incoming = map(&[("name", json!("Bob"))]);
        let conflicts = detect_conflicts(&existing, &incoming, &[]);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].field, "name");
        assert_eq!(conflicts[0].db_value, json!("Alice"));
        assert_eq!(conflicts[0].file_value, json!("Bob"));
    }

    #[test]
    fn ignores_specified_fields() {
        let existing = map(&[("id", json!(1)), ("name", json!("Alice"))]);
        let incoming = map(&[("id", json!(2)), ("name", json!("Bob"))]);
        let conflicts = detect_conflicts(&existing, &incoming, &["id"]);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].field, "name");
    }

    #[test]
    fn timestamp_suggests_keep_db() {
        let existing = map(&[("updated_at", json!("2024-01-01"))]);
        let incoming = map(&[("updated_at", json!("2024-06-01"))]);
        let conflicts = detect_conflicts(&existing, &incoming, &[]);
        assert_eq!(
            conflicts[0].suggested_resolution,
            ConflictResolution::KeepDb
        );
    }

    #[test]
    fn content_field_suggests_keep_file() {
        let existing = map(&[("name", json!("Alice"))]);
        let incoming = map(&[("name", json!("Bob"))]);
        let conflicts = detect_conflicts(&existing, &incoming, &[]);
        assert_eq!(
            conflicts[0].suggested_resolution,
            ConflictResolution::KeepFile
        );
    }

    #[test]
    fn apply_keep_db() {
        let existing = map(&[("name", json!("Alice"))]);
        let incoming = map(&[("name", json!("Bob"))]);
        let resolutions = vec![ConflictResolutionChoice {
            field: "name".to_string(),
            resolution: ConflictResolution::KeepDb,
            custom_value: None,
        }];
        let result = apply_resolutions(&existing, &incoming, &resolutions);
        assert_eq!(result["name"], json!("Alice"));
    }

    #[test]
    fn apply_keep_file() {
        let existing = map(&[("name", json!("Alice"))]);
        let incoming = map(&[("name", json!("Bob"))]);
        let resolutions = vec![ConflictResolutionChoice {
            field: "name".to_string(),
            resolution: ConflictResolution::KeepFile,
            custom_value: None,
        }];
        let result = apply_resolutions(&existing, &incoming, &resolutions);
        assert_eq!(result["name"], json!("Bob"));
    }

    #[test]
    fn apply_merge_with_custom_value() {
        let existing = map(&[("name", json!("Alice"))]);
        let incoming = map(&[("name", json!("Bob"))]);
        let resolutions = vec![ConflictResolutionChoice {
            field: "name".to_string(),
            resolution: ConflictResolution::Merge,
            custom_value: Some(json!("Charlie")),
        }];
        let result = apply_resolutions(&existing, &incoming, &resolutions);
        assert_eq!(result["name"], json!("Charlie"));
    }
}
