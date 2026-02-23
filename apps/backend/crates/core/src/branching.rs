//! Content Branching & Exploration constants, validation, and comparison logic (PRD-50).
//!
//! Provides limits for branch nesting and per-scene counts, name validation,
//! and a key-by-key parameter diff used for side-by-side branch comparison.

use crate::diff::DiffStatus;
use crate::error::CoreError;
use serde::Serialize;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum allowed length for a branch name.
pub const MAX_BRANCH_NAME_LENGTH: usize = 100;

/// Maximum allowed length for a branch description.
pub const MAX_BRANCH_DESCRIPTION_LENGTH: usize = 1000;

/// Maximum nesting depth (parent chain length) for branches.
pub const MAX_NESTING_DEPTH: i32 = 3;

/// Maximum number of branches allowed per scene.
pub const MAX_BRANCHES_PER_SCENE: i64 = 20;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a branch name: must be non-empty, trimmed, and within
/// [`MAX_BRANCH_NAME_LENGTH`].
pub fn validate_branch_name(name: &str) -> Result<(), CoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Branch name must not be empty".to_string(),
        ));
    }
    if trimmed.len() != name.len() {
        return Err(CoreError::Validation(
            "Branch name must not have leading or trailing whitespace".to_string(),
        ));
    }
    if name.len() > MAX_BRANCH_NAME_LENGTH {
        return Err(CoreError::Validation(format!(
            "Branch name must not exceed {MAX_BRANCH_NAME_LENGTH} characters, got {}",
            name.len()
        )));
    }
    Ok(())
}

/// Validate that the current branch depth is within [`MAX_NESTING_DEPTH`].
pub fn validate_branch_depth(current_depth: i32) -> Result<(), CoreError> {
    if current_depth >= MAX_NESTING_DEPTH {
        return Err(CoreError::Validation(format!(
            "Maximum branch nesting depth is {MAX_NESTING_DEPTH}, current depth is {current_depth}"
        )));
    }
    Ok(())
}

/// Validate that the branch count for a scene does not exceed
/// [`MAX_BRANCHES_PER_SCENE`].
pub fn validate_branch_count(current_count: i64) -> Result<(), CoreError> {
    if current_count >= MAX_BRANCHES_PER_SCENE {
        return Err(CoreError::Validation(format!(
            "Maximum branches per scene is {MAX_BRANCHES_PER_SCENE}, \
             scene already has {current_count}"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Comparison types
// ---------------------------------------------------------------------------

/// Summary of a single branch used in side-by-side comparisons.
#[derive(Debug, Clone, Serialize)]
pub struct BranchComparisonEntry {
    pub branch_id: i64,
    pub branch_name: String,
    pub segment_count: i64,
    pub parameters_snapshot: serde_json::Value,
}

/// A single parameter difference between two branch snapshots.
#[derive(Debug, Clone, Serialize)]
pub struct ParameterDiff {
    pub key: String,
    pub value_a: Option<String>,
    pub value_b: Option<String>,
    pub status: DiffStatus,
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

/// Compare two parameter snapshots key-by-key.
///
/// Both values are expected to be JSON objects (`serde_json::Value::Object`).
/// Non-object inputs are treated as empty objects.
///
/// Returns a `Vec<ParameterDiff>` sorted by key name.
pub fn compare_branch_parameters(
    a: &serde_json::Value,
    b: &serde_json::Value,
) -> Vec<ParameterDiff> {
    let map_a = a.as_object();
    let map_b = b.as_object();

    let empty = serde_json::Map::new();
    let a_obj = map_a.unwrap_or(&empty);
    let b_obj = map_b.unwrap_or(&empty);

    // Collect all unique keys.
    let mut keys: Vec<&String> = a_obj.keys().chain(b_obj.keys()).collect();
    keys.sort();
    keys.dedup();

    keys.into_iter()
        .map(|key| {
            let val_a = a_obj.get(key);
            let val_b = b_obj.get(key);

            let (value_a, value_b, status) = match (val_a, val_b) {
                (Some(va), Some(vb)) => {
                    let sa = va.to_string();
                    let sb = vb.to_string();
                    let status = if sa == sb {
                        DiffStatus::Unchanged
                    } else {
                        DiffStatus::Changed
                    };
                    (Some(sa), Some(sb), status)
                }
                (Some(va), None) => (Some(va.to_string()), None, DiffStatus::Removed),
                (None, Some(vb)) => (None, Some(vb.to_string()), DiffStatus::Added),
                (None, None) => unreachable!("key must exist in at least one map"),
            };

            ParameterDiff {
                key: key.clone(),
                value_a,
                value_b,
                status,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- validate_branch_name ------------------------------------------------

    #[test]
    fn valid_short_name() {
        assert!(validate_branch_name("main").is_ok());
    }

    #[test]
    fn valid_name_at_max_length() {
        let name = "a".repeat(MAX_BRANCH_NAME_LENGTH);
        assert!(validate_branch_name(&name).is_ok());
    }

    #[test]
    fn rejects_empty_name() {
        assert!(validate_branch_name("").is_err());
    }

    #[test]
    fn rejects_whitespace_only_name() {
        assert!(validate_branch_name("   ").is_err());
    }

    #[test]
    fn rejects_leading_whitespace() {
        assert!(validate_branch_name(" test").is_err());
    }

    #[test]
    fn rejects_trailing_whitespace() {
        assert!(validate_branch_name("test ").is_err());
    }

    #[test]
    fn rejects_name_exceeding_max() {
        let name = "a".repeat(MAX_BRANCH_NAME_LENGTH + 1);
        assert!(validate_branch_name(&name).is_err());
    }

    // -- validate_branch_depth -----------------------------------------------

    #[test]
    fn valid_depth_zero() {
        assert!(validate_branch_depth(0).is_ok());
    }

    #[test]
    fn valid_depth_below_max() {
        assert!(validate_branch_depth(MAX_NESTING_DEPTH - 1).is_ok());
    }

    #[test]
    fn rejects_depth_at_max() {
        assert!(validate_branch_depth(MAX_NESTING_DEPTH).is_err());
    }

    #[test]
    fn rejects_depth_above_max() {
        assert!(validate_branch_depth(MAX_NESTING_DEPTH + 1).is_err());
    }

    // -- validate_branch_count -----------------------------------------------

    #[test]
    fn valid_count_zero() {
        assert!(validate_branch_count(0).is_ok());
    }

    #[test]
    fn valid_count_below_max() {
        assert!(validate_branch_count(MAX_BRANCHES_PER_SCENE - 1).is_ok());
    }

    #[test]
    fn rejects_count_at_max() {
        assert!(validate_branch_count(MAX_BRANCHES_PER_SCENE).is_err());
    }

    #[test]
    fn rejects_count_above_max() {
        assert!(validate_branch_count(MAX_BRANCHES_PER_SCENE + 1).is_err());
    }

    // -- compare_branch_parameters -------------------------------------------

    #[test]
    fn diff_identical_objects() {
        let a = json!({"strength": 0.8, "seed": 42});
        let b = json!({"strength": 0.8, "seed": 42});
        let diffs = compare_branch_parameters(&a, &b);
        assert_eq!(diffs.len(), 2);
        assert!(diffs.iter().all(|d| d.status == DiffStatus::Unchanged));
    }

    #[test]
    fn diff_changed_value() {
        let a = json!({"strength": 0.8});
        let b = json!({"strength": 0.9});
        let diffs = compare_branch_parameters(&a, &b);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, DiffStatus::Changed);
        assert_eq!(diffs[0].key, "strength");
    }

    #[test]
    fn diff_added_key() {
        let a = json!({"strength": 0.8});
        let b = json!({"strength": 0.8, "seed": 42});
        let diffs = compare_branch_parameters(&a, &b);
        let added = diffs.iter().find(|d| d.key == "seed").unwrap();
        assert_eq!(added.status, DiffStatus::Added);
        assert!(added.value_a.is_none());
        assert!(added.value_b.is_some());
    }

    #[test]
    fn diff_removed_key() {
        let a = json!({"strength": 0.8, "seed": 42});
        let b = json!({"strength": 0.8});
        let diffs = compare_branch_parameters(&a, &b);
        let removed = diffs.iter().find(|d| d.key == "seed").unwrap();
        assert_eq!(removed.status, DiffStatus::Removed);
        assert!(removed.value_a.is_some());
        assert!(removed.value_b.is_none());
    }

    #[test]
    fn diff_empty_objects() {
        let a = json!({});
        let b = json!({});
        let diffs = compare_branch_parameters(&a, &b);
        assert!(diffs.is_empty());
    }

    #[test]
    fn diff_non_object_treated_as_empty() {
        let a = json!("not-an-object");
        let b = json!({"key": "value"});
        let diffs = compare_branch_parameters(&a, &b);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, DiffStatus::Added);
    }

    #[test]
    fn diff_keys_sorted_alphabetically() {
        let a = json!({"z_key": 1, "a_key": 2, "m_key": 3});
        let b = json!({"z_key": 1, "a_key": 2, "m_key": 3});
        let diffs = compare_branch_parameters(&a, &b);
        let keys: Vec<&str> = diffs.iter().map(|d| d.key.as_str()).collect();
        assert_eq!(keys, vec!["a_key", "m_key", "z_key"]);
    }

    #[test]
    fn diff_mixed_changes() {
        let a = json!({"unchanged": 1, "changed": "old", "removed": true});
        let b = json!({"unchanged": 1, "changed": "new", "added": false});
        let diffs = compare_branch_parameters(&a, &b);
        assert_eq!(diffs.len(), 4);

        let find = |k: &str| diffs.iter().find(|d| d.key == k).unwrap();
        assert_eq!(find("added").status, DiffStatus::Added);
        assert_eq!(find("changed").status, DiffStatus::Changed);
        assert_eq!(find("removed").status, DiffStatus::Removed);
        assert_eq!(find("unchanged").status, DiffStatus::Unchanged);
    }
}
