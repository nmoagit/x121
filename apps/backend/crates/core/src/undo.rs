//! Undo/redo tree constants and validation (PRD-51).

use crate::error::CoreError;

/// Maximum depth of an undo tree (number of nodes from root to deepest leaf).
pub const MAX_TREE_DEPTH: usize = 500;

/// Maximum number of branches (children) any single node may have.
pub const MAX_BRANCHES_PER_NODE: usize = 50;

/// Entity types that support undo/redo trees.
pub const VALID_ENTITY_TYPES: &[&str] = &["character", "scene", "segment", "project"];

/// Action types that cannot be undone.
pub const NON_UNDOABLE_ACTIONS: &[&str] =
    &["completed_generation", "disk_reclamation", "audit_log_entry"];

/// Validate that an entity type is one of the known undoable types.
pub fn validate_entity_type(entity_type: &str) -> Result<(), CoreError> {
    if VALID_ENTITY_TYPES.contains(&entity_type) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid entity type '{entity_type}'. Must be one of: {}",
            VALID_ENTITY_TYPES.join(", ")
        )))
    }
}

/// Returns `true` if the given action type cannot be undone.
pub fn is_non_undoable(action_type: &str) -> bool {
    NON_UNDOABLE_ACTIONS.contains(&action_type)
}

/// Validate that tree_json is a JSON object (not null, array, string, etc.).
pub fn validate_tree_json(tree_json: &serde_json::Value) -> Result<(), CoreError> {
    if tree_json.is_object() {
        Ok(())
    } else {
        Err(CoreError::Validation(
            "tree_json must be a JSON object".to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_entity_types() {
        assert!(validate_entity_type("character").is_ok());
        assert!(validate_entity_type("scene").is_ok());
        assert!(validate_entity_type("segment").is_ok());
        assert!(validate_entity_type("project").is_ok());
    }

    #[test]
    fn test_invalid_entity_type() {
        let result = validate_entity_type("widget");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("widget"));
    }

    #[test]
    fn test_empty_entity_type_is_invalid() {
        assert!(validate_entity_type("").is_err());
    }

    #[test]
    fn test_non_undoable_actions() {
        assert!(is_non_undoable("completed_generation"));
        assert!(is_non_undoable("disk_reclamation"));
        assert!(is_non_undoable("audit_log_entry"));
    }

    #[test]
    fn test_undoable_actions() {
        assert!(!is_non_undoable("move_node"));
        assert!(!is_non_undoable("rename"));
        assert!(!is_non_undoable(""));
    }

    #[test]
    fn test_validate_tree_json_object() {
        let obj = serde_json::json!({});
        assert!(validate_tree_json(&obj).is_ok());

        let obj_with_data = serde_json::json!({"nodes": {}, "rootId": "root"});
        assert!(validate_tree_json(&obj_with_data).is_ok());
    }

    #[test]
    fn test_validate_tree_json_rejects_non_objects() {
        assert!(validate_tree_json(&serde_json::json!(null)).is_err());
        assert!(validate_tree_json(&serde_json::json!([])).is_err());
        assert!(validate_tree_json(&serde_json::json!("string")).is_err());
        assert!(validate_tree_json(&serde_json::json!(42)).is_err());
        assert!(validate_tree_json(&serde_json::json!(true)).is_err());
    }

    #[test]
    fn test_constants_values() {
        assert_eq!(MAX_TREE_DEPTH, 500);
        assert_eq!(MAX_BRANCHES_PER_NODE, 50);
        assert_eq!(VALID_ENTITY_TYPES.len(), 4);
        assert_eq!(NON_UNDOABLE_ACTIONS.len(), 3);
    }
}
