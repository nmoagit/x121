//! Rule evaluator — pure logic, no database access.

use regex::Regex;
use serde_json::Value;

use super::rules::{FieldViolation, ValidationResult, ValidationRule, ValidationSeverity};

/// Evaluate all rules against a single data record.
pub fn evaluate_rules(
    rules: &[ValidationRule],
    data: &serde_json::Map<String, Value>,
) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for rule in rules {
        if let Some(violation) = evaluate_single_rule(rule, data) {
            match rule.severity {
                ValidationSeverity::Error => errors.push(violation),
                ValidationSeverity::Warning => warnings.push(violation),
            }
        }
    }

    ValidationResult {
        is_valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn evaluate_single_rule(
    rule: &ValidationRule,
    data: &serde_json::Map<String, Value>,
) -> Option<FieldViolation> {
    let field_value = data.get(&rule.field_name);

    match rule.rule_type.as_str() {
        "required" => evaluate_required(rule, field_value),
        "type_check" => evaluate_type_check(rule, field_value),
        "min_length" => evaluate_min_length(rule, field_value),
        "max_length" => evaluate_max_length(rule, field_value),
        "min_value" => evaluate_min_value(rule, field_value),
        "max_value" => evaluate_max_value(rule, field_value),
        "enum_values" => evaluate_enum_values(rule, field_value),
        "regex_pattern" => evaluate_regex_pattern(rule, field_value),
        _ => None, // Unknown rule types silently pass
    }
}

fn violation(rule: &ValidationRule, value: Option<&Value>) -> FieldViolation {
    FieldViolation {
        field: rule.field_name.clone(),
        rule_type: rule.rule_type.clone(),
        message: rule.error_message.clone(),
        value: value.cloned(),
    }
}

fn evaluate_required(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    match value {
        None | Some(Value::Null) => Some(violation(rule, value)),
        Some(Value::String(s)) if s.is_empty() => Some(violation(rule, value)),
        _ => None,
    }
}

fn evaluate_type_check(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let value = match value {
        Some(v) if !v.is_null() => v,
        _ => return None, // type_check doesn't enforce presence
    };
    let expected = rule
        .config
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("string");
    let matches = match expected {
        "string" => value.is_string(),
        "number" | "integer" | "float" => value.is_number(),
        "boolean" => value.is_boolean(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        _ => true,
    };
    if matches {
        None
    } else {
        Some(violation(rule, Some(value)))
    }
}

fn evaluate_min_length(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let s = value.and_then(|v| v.as_str())?;
    let min = rule.config.get("min").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if s.len() < min {
        Some(violation(rule, value))
    } else {
        None
    }
}

fn evaluate_max_length(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let s = value.and_then(|v| v.as_str())?;
    let max = rule
        .config
        .get("max")
        .and_then(|v| v.as_u64())
        .unwrap_or(usize::MAX as u64) as usize;
    if s.len() > max {
        Some(violation(rule, value))
    } else {
        None
    }
}

fn evaluate_min_value(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let num = value.and_then(|v| v.as_f64())?;
    let min = rule
        .config
        .get("min")
        .and_then(|v| v.as_f64())
        .unwrap_or(f64::NEG_INFINITY);
    if num < min {
        Some(violation(rule, value))
    } else {
        None
    }
}

fn evaluate_max_value(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let num = value.and_then(|v| v.as_f64())?;
    let max = rule
        .config
        .get("max")
        .and_then(|v| v.as_f64())
        .unwrap_or(f64::INFINITY);
    if num > max {
        Some(violation(rule, value))
    } else {
        None
    }
}

fn evaluate_enum_values(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let val = match value {
        Some(v) if !v.is_null() => v,
        _ => return None,
    };
    let allowed = rule.config.get("values").and_then(|v| v.as_array());
    match allowed {
        Some(arr) if !arr.contains(val) => Some(violation(rule, Some(val))),
        _ => None,
    }
}

fn evaluate_regex_pattern(rule: &ValidationRule, value: Option<&Value>) -> Option<FieldViolation> {
    let s = value.and_then(|v| v.as_str())?;
    let pattern = rule.config.get("pattern").and_then(|v| v.as_str())?;
    match Regex::new(pattern) {
        Ok(re) if re.is_match(s) => None,
        Ok(_) => Some(violation(rule, value)),
        Err(_) => None, // Invalid regex pattern silently passes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_rule(rule_type: &str, config: Value) -> ValidationRule {
        ValidationRule {
            id: 1,
            entity_type: "test".to_string(),
            field_name: "test_field".to_string(),
            rule_type: rule_type.to_string(),
            config,
            error_message: format!("{rule_type} failed"),
            severity: ValidationSeverity::Error,
        }
    }

    fn data(pairs: &[(&str, Value)]) -> serde_json::Map<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn required_passes_with_value() {
        let rule = make_rule("required", json!({}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn required_fails_missing_field() {
        let rule = make_rule("required", json!({}));
        let d = data(&[]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].rule_type, "required");
    }

    #[test]
    fn required_fails_null_value() {
        let rule = make_rule("required", json!({}));
        let d = data(&[("test_field", Value::Null)]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn required_fails_empty_string() {
        let rule = make_rule("required", json!({}));
        let d = data(&[("test_field", json!(""))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn max_length_passes_within_limit() {
        let rule = make_rule("max_length", json!({"max": 10}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn max_length_fails_over_limit() {
        let rule = make_rule("max_length", json!({"max": 3}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn min_length_passes_at_minimum() {
        let rule = make_rule("min_length", json!({"min": 5}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn min_length_fails_under_minimum() {
        let rule = make_rule("min_length", json!({"min": 10}));
        let d = data(&[("test_field", json!("hi"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn min_value_passes() {
        let rule = make_rule("min_value", json!({"min": 1}));
        let d = data(&[("test_field", json!(5))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn min_value_fails() {
        let rule = make_rule("min_value", json!({"min": 10}));
        let d = data(&[("test_field", json!(5))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn max_value_passes() {
        let rule = make_rule("max_value", json!({"max": 100}));
        let d = data(&[("test_field", json!(50))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn max_value_fails() {
        let rule = make_rule("max_value", json!({"max": 10}));
        let d = data(&[("test_field", json!(50))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn enum_values_passes() {
        let rule = make_rule("enum_values", json!({"values": ["a", "b", "c"]}));
        let d = data(&[("test_field", json!("b"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn enum_values_fails() {
        let rule = make_rule("enum_values", json!({"values": ["a", "b", "c"]}));
        let d = data(&[("test_field", json!("d"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn regex_pattern_passes() {
        let rule = make_rule("regex_pattern", json!({"pattern": "^[a-z]+$"}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn regex_pattern_fails() {
        let rule = make_rule("regex_pattern", json!({"pattern": "^[a-z]+$"}));
        let d = data(&[("test_field", json!("Hello123"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn type_check_string_passes() {
        let rule = make_rule("type_check", json!({"type": "string"}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }

    #[test]
    fn type_check_string_fails() {
        let rule = make_rule("type_check", json!({"type": "string"}));
        let d = data(&[("test_field", json!(42))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(!result.is_valid);
    }

    #[test]
    fn warnings_do_not_block_validation() {
        let mut rule = make_rule("max_length", json!({"max": 3}));
        rule.severity = ValidationSeverity::Warning;
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
        assert_eq!(result.warnings.len(), 1);
    }

    #[test]
    fn combined_rules() {
        let rules = vec![
            make_rule("required", json!({})),
            make_rule("max_length", json!({"max": 200})),
        ];
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&rules, &d);
        assert!(result.is_valid);
    }

    #[test]
    fn unknown_rule_type_passes() {
        let rule = make_rule("unknown_type", json!({}));
        let d = data(&[("test_field", json!("hello"))]);
        let result = evaluate_rules(&[rule], &d);
        assert!(result.is_valid);
    }
}
