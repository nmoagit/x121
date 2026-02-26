//! Character library validation and field sync utilities (PRD-60).
//!
//! Provides constants, validation helpers, and field-level synchronisation
//! classification for the cross-project character library feature.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::error::CoreError;

/* --------------------------------------------------------------------------
Constants
-------------------------------------------------------------------------- */

/// Maximum number of linked fields allowed on a single project-character link.
pub const MAX_LINKED_FIELDS: usize = 50;

/// Valid link modes for a field.
pub const VALID_LINK_MODES: &[&str] = &["linked", "copied"];

/// Fields that cannot be linked (identity / system fields).
const NON_LINKABLE_FIELDS: &[&str] = &[
    "id",
    "project_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "status_id",
    "embedding_status_id",
    "embedding_extracted_at",
    "face_detection_confidence",
    "face_bounding_box",
];

/* --------------------------------------------------------------------------
Types
-------------------------------------------------------------------------- */

/// Per-field synchronisation status between a library character and a project copy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FieldSyncStatus {
    /// The metadata field key.
    pub field: String,
    /// One of: `"in_sync"`, `"diverged"`, `"library_only"`, `"project_only"`.
    pub status: String,
    /// The value in the library character's master_metadata (if present).
    pub library_value: Option<serde_json::Value>,
    /// The value in the project character's metadata (if present).
    pub project_value: Option<serde_json::Value>,
}

/* --------------------------------------------------------------------------
Validation
-------------------------------------------------------------------------- */

/// Validate a list of linked field names.
///
/// Rules:
/// - No empty strings
/// - No duplicates
/// - At most [`MAX_LINKED_FIELDS`] entries
pub fn validate_linked_fields(fields: &[String]) -> Result<(), CoreError> {
    if fields.len() > MAX_LINKED_FIELDS {
        return Err(CoreError::Validation(format!(
            "Too many linked fields: {} (max {MAX_LINKED_FIELDS})",
            fields.len()
        )));
    }

    let mut seen = HashSet::with_capacity(fields.len());
    for field in fields {
        if field.is_empty() {
            return Err(CoreError::Validation(
                "Linked field name must not be empty".to_string(),
            ));
        }
        if !seen.insert(field.as_str()) {
            return Err(CoreError::Validation(format!(
                "Duplicate linked field: {field}"
            )));
        }
    }

    Ok(())
}

/// Check whether a field name is eligible for cross-project linking.
///
/// Metadata fields (arbitrary JSON keys) are linkable; identity and system
/// columns are not.
pub fn is_field_linkable(field: &str) -> bool {
    !NON_LINKABLE_FIELDS.contains(&field)
}

/* --------------------------------------------------------------------------
Field sync classification
-------------------------------------------------------------------------- */

/// Classify every field across library and project metadata into a sync status.
///
/// Only considers the intersection with `linked_fields` (plus any fields
/// that appear in either metadata object). Fields not in `linked_fields`
/// are still reported but with `"project_only"` or `"library_only"` as
/// appropriate, giving callers a complete picture.
pub fn classify_field_sync(
    library_metadata: &serde_json::Value,
    project_metadata: &serde_json::Value,
    linked_fields: &[String],
) -> Vec<FieldSyncStatus> {
    let lib_obj = library_metadata.as_object();
    let proj_obj = project_metadata.as_object();
    let linked_set: HashSet<&str> = linked_fields.iter().map(|s| s.as_str()).collect();

    // Collect all unique field keys from both sides.
    let mut all_keys: Vec<String> = Vec::new();
    let mut seen = HashSet::new();

    if let Some(obj) = lib_obj {
        for key in obj.keys() {
            if seen.insert(key.clone()) {
                all_keys.push(key.clone());
            }
        }
    }
    if let Some(obj) = proj_obj {
        for key in obj.keys() {
            if seen.insert(key.clone()) {
                all_keys.push(key.clone());
            }
        }
    }

    // Also include any linked_fields that may not appear in either metadata yet.
    for field in linked_fields {
        if seen.insert(field.clone()) {
            all_keys.push(field.clone());
        }
    }

    all_keys.sort();

    all_keys
        .into_iter()
        .map(|key| {
            let lib_val = lib_obj.and_then(|o| o.get(&key));
            let proj_val = proj_obj.and_then(|o| o.get(&key));
            let is_linked = linked_set.contains(key.as_str());

            let status = match (lib_val, proj_val) {
                (Some(lv), Some(pv)) => {
                    if is_linked && lv == pv {
                        "in_sync"
                    } else if is_linked {
                        "diverged"
                    } else {
                        // Present in both but not linked -- treat as in_sync for display.
                        "in_sync"
                    }
                }
                (Some(_), None) => "library_only",
                (None, Some(_)) => "project_only",
                (None, None) => "library_only", // linked but absent from both
            };

            FieldSyncStatus {
                field: key,
                status: status.to_string(),
                library_value: lib_val.cloned(),
                project_value: proj_val.cloned(),
            }
        })
        .collect()
}

/* --------------------------------------------------------------------------
Tests
-------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validate_linked_fields_accepts_valid() {
        let fields = vec!["name".to_string(), "bio".to_string()];
        assert!(validate_linked_fields(&fields).is_ok());
    }

    #[test]
    fn validate_linked_fields_rejects_empty_string() {
        let fields = vec!["name".to_string(), "".to_string()];
        assert!(validate_linked_fields(&fields).is_err());
    }

    #[test]
    fn validate_linked_fields_rejects_duplicates() {
        let fields = vec!["name".to_string(), "name".to_string()];
        let err = validate_linked_fields(&fields).unwrap_err();
        assert!(err.to_string().contains("Duplicate"));
    }

    #[test]
    fn validate_linked_fields_rejects_too_many() {
        let fields: Vec<String> = (0..=MAX_LINKED_FIELDS)
            .map(|i| format!("field_{i}"))
            .collect();
        let err = validate_linked_fields(&fields).unwrap_err();
        assert!(err.to_string().contains("Too many"));
    }

    #[test]
    fn validate_linked_fields_accepts_empty_list() {
        assert!(validate_linked_fields(&[]).is_ok());
    }

    #[test]
    fn is_field_linkable_rejects_system_fields() {
        assert!(!is_field_linkable("id"));
        assert!(!is_field_linkable("created_at"));
        assert!(!is_field_linkable("deleted_at"));
    }

    #[test]
    fn is_field_linkable_accepts_metadata_fields() {
        assert!(is_field_linkable("name"));
        assert!(is_field_linkable("bio"));
        assert!(is_field_linkable("custom_field"));
    }

    #[test]
    fn classify_in_sync_fields() {
        let lib = json!({"name": "Alice", "bio": "Hello"});
        let proj = json!({"name": "Alice", "bio": "Hello"});
        let linked = vec!["name".to_string(), "bio".to_string()];

        let result = classify_field_sync(&lib, &proj, &linked);
        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|r| r.status == "in_sync"));
    }

    #[test]
    fn classify_diverged_fields() {
        let lib = json!({"name": "Alice"});
        let proj = json!({"name": "Bob"});
        let linked = vec!["name".to_string()];

        let result = classify_field_sync(&lib, &proj, &linked);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].status, "diverged");
        assert_eq!(result[0].library_value, Some(json!("Alice")));
        assert_eq!(result[0].project_value, Some(json!("Bob")));
    }

    #[test]
    fn classify_library_only_and_project_only() {
        let lib = json!({"lib_field": 1});
        let proj = json!({"proj_field": 2});
        let linked = vec!["lib_field".to_string()];

        let result = classify_field_sync(&lib, &proj, &linked);
        assert_eq!(result.len(), 2);

        let lib_entry = result.iter().find(|r| r.field == "lib_field").unwrap();
        assert_eq!(lib_entry.status, "library_only");

        let proj_entry = result.iter().find(|r| r.field == "proj_field").unwrap();
        assert_eq!(proj_entry.status, "project_only");
    }

    #[test]
    fn classify_empty_metadata() {
        let lib = json!({});
        let proj = json!({});
        let linked = vec!["name".to_string()];

        let result = classify_field_sync(&lib, &proj, &linked);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].field, "name");
        assert_eq!(result[0].status, "library_only");
    }
}
