//! Protection rule evaluation for the reclamation system.
//!
//! Given a set of protection rule definitions (loaded from the DB by the caller),
//! this module evaluates whether a specific condition is met. This is pure logic
//! with no database dependencies.

/// A simplified representation of a protection rule for evaluation.
#[derive(Debug, Clone)]
pub struct ProtectionCondition {
    pub entity_type: String,
    pub condition_field: String,
    pub condition_operator: String,
    pub condition_value: String,
}

/// Evaluate a single protection condition against a field value.
///
/// Returns `true` if the condition matches (i.e., the asset IS protected).
///
/// Supported operators:
/// - `eq`: field value equals condition value
/// - `neq`: field value does not equal condition value
/// - `is_not_null`: field value is present (non-empty)
/// - `is_null`: field value is absent (empty)
pub fn evaluate_condition(condition: &ProtectionCondition, field_value: Option<&str>) -> bool {
    match condition.condition_operator.as_str() {
        "eq" => field_value == Some(condition.condition_value.as_str()),
        "neq" => field_value != Some(condition.condition_value.as_str()),
        "is_not_null" => field_value.is_some() && !field_value.unwrap_or_default().is_empty(),
        "is_null" => field_value.is_none() || field_value.unwrap_or_default().is_empty(),
        _ => false,
    }
}

/// Check if any protection condition in the list matches the given field values.
///
/// `field_values` is a closure that returns the value for a given field name.
/// Returns `true` if at least one active rule protects the asset.
pub fn is_protected_by_rules<F>(conditions: &[ProtectionCondition], field_values: F) -> bool
where
    F: Fn(&str) -> Option<String>,
{
    conditions.iter().any(|cond| {
        let value = field_values(&cond.condition_field);
        evaluate_condition(cond, value.as_deref())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eq_operator_matches() {
        let cond = ProtectionCondition {
            entity_type: "image_variant".into(),
            condition_field: "status".into(),
            condition_operator: "eq".into(),
            condition_value: "approved".into(),
        };
        assert!(evaluate_condition(&cond, Some("approved")));
        assert!(!evaluate_condition(&cond, Some("rejected")));
        assert!(!evaluate_condition(&cond, None));
    }

    #[test]
    fn test_neq_operator() {
        let cond = ProtectionCondition {
            entity_type: "scene".into(),
            condition_field: "status".into(),
            condition_operator: "neq".into(),
            condition_value: "draft".into(),
        };
        assert!(evaluate_condition(&cond, Some("approved")));
        assert!(!evaluate_condition(&cond, Some("draft")));
    }

    #[test]
    fn test_is_not_null_operator() {
        let cond = ProtectionCondition {
            entity_type: "source_image".into(),
            condition_field: "id".into(),
            condition_operator: "is_not_null".into(),
            condition_value: "true".into(),
        };
        assert!(evaluate_condition(&cond, Some("42")));
        assert!(!evaluate_condition(&cond, None));
        assert!(!evaluate_condition(&cond, Some("")));
    }

    #[test]
    fn test_is_null_operator() {
        let cond = ProtectionCondition {
            entity_type: "scene".into(),
            condition_field: "file_path".into(),
            condition_operator: "is_null".into(),
            condition_value: "true".into(),
        };
        assert!(evaluate_condition(&cond, None));
        assert!(evaluate_condition(&cond, Some("")));
        assert!(!evaluate_condition(&cond, Some("path/to/file")));
    }

    #[test]
    fn test_is_protected_by_rules() {
        let rules = vec![
            ProtectionCondition {
                entity_type: "image_variant".into(),
                condition_field: "status".into(),
                condition_operator: "eq".into(),
                condition_value: "approved".into(),
            },
            ProtectionCondition {
                entity_type: "image_variant".into(),
                condition_field: "locked".into(),
                condition_operator: "eq".into(),
                condition_value: "true".into(),
            },
        ];

        // First rule matches.
        assert!(is_protected_by_rules(&rules, |field| {
            match field {
                "status" => Some("approved".into()),
                _ => None,
            }
        }));

        // No rules match.
        assert!(!is_protected_by_rules(&rules, |field| {
            match field {
                "status" => Some("rejected".into()),
                "locked" => Some("false".into()),
                _ => None,
            }
        }));
    }
}
