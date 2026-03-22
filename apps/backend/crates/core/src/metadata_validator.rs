//! Metadata validation against template fields (PRD-113).
//!
//! Validates a avatar metadata JSON object against a set of template field
//! definitions, checking required fields, type constraints, and value constraints.

use serde::Serialize;

/// A template field definition used for validation.
#[derive(Debug, Clone)]
pub struct TemplateField {
    /// Field name (key in the metadata JSON).
    pub field_name: String,
    /// Expected JSON type: "string", "number", "boolean", "array", "object".
    pub field_type: String,
    /// Whether the field is required.
    pub is_required: bool,
    /// Optional constraints JSON with keys like `min`, `max`, `min_length`,
    /// `max_length`, `enum`, `pattern`.
    pub constraints: serde_json::Value,
}

/// Result of validating metadata against a template.
#[derive(Debug, Clone, Serialize)]
pub struct MetadataValidationResult {
    /// Whether all required checks passed.
    pub is_valid: bool,
    /// Hard errors that must be fixed.
    pub errors: Vec<MetadataFieldError>,
    /// Soft warnings (e.g. unknown keys).
    pub warnings: Vec<MetadataFieldError>,
}

/// A single validation error or warning.
#[derive(Debug, Clone, Serialize)]
pub struct MetadataFieldError {
    /// The field name (or "unknown" for extra fields).
    pub field: String,
    /// Human-readable message.
    pub message: String,
    /// "error" or "warning".
    pub severity: String,
}

/// Validate a metadata JSON object against a set of template fields.
///
/// Checks:
/// - Required fields are present
/// - Field types match
/// - Constraints (min/max, min_length/max_length, enum, pattern)
/// - Unknown keys produce warnings
pub fn validate_metadata(
    metadata: &serde_json::Map<String, serde_json::Value>,
    fields: &[TemplateField],
) -> MetadataValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Build a set of known field names.
    let known_fields: std::collections::HashSet<&str> =
        fields.iter().map(|f| f.field_name.as_str()).collect();

    // Check each template field.
    for field in fields {
        match metadata.get(&field.field_name) {
            None => {
                if field.is_required {
                    errors.push(MetadataFieldError {
                        field: field.field_name.clone(),
                        message: format!("Required field '{}' is missing", field.field_name),
                        severity: "error".to_string(),
                    });
                }
            }
            Some(value) => {
                // Type check.
                if let Some(err) = check_type(&field.field_name, value, &field.field_type) {
                    errors.push(err);
                    continue;
                }

                // Constraint checks.
                check_constraints(&field.field_name, value, &field.constraints, &mut errors);
            }
        }
    }

    // Warn about unknown keys.
    for key in metadata.keys() {
        if !known_fields.contains(key.as_str()) {
            warnings.push(MetadataFieldError {
                field: key.clone(),
                message: format!("Unknown field '{key}' not in template"),
                severity: "warning".to_string(),
            });
        }
    }

    let is_valid = errors.is_empty();

    MetadataValidationResult {
        is_valid,
        errors,
        warnings,
    }
}

/// Check if a JSON value matches the expected field type.
fn check_type(
    field_name: &str,
    value: &serde_json::Value,
    expected_type: &str,
) -> Option<MetadataFieldError> {
    let actual_type = match value {
        serde_json::Value::String(_) => "string",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::Bool(_) => "boolean",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
        serde_json::Value::Null => "null",
    };

    if actual_type == "null" {
        // Null is acceptable for optional fields (they exist but are null).
        return None;
    }

    if actual_type != expected_type {
        return Some(MetadataFieldError {
            field: field_name.to_string(),
            message: format!(
                "Field '{field_name}' expected type '{expected_type}', got '{actual_type}'"
            ),
            severity: "error".to_string(),
        });
    }

    None
}

/// Check value constraints from the template field's constraints JSON.
fn check_constraints(
    field_name: &str,
    value: &serde_json::Value,
    constraints: &serde_json::Value,
    errors: &mut Vec<MetadataFieldError>,
) {
    let obj = match constraints.as_object() {
        Some(o) if !o.is_empty() => o,
        _ => return,
    };

    // Numeric min/max.
    if let Some(num) = value.as_f64() {
        if let Some(min) = obj.get("min").and_then(|v| v.as_f64()) {
            if num < min {
                errors.push(MetadataFieldError {
                    field: field_name.to_string(),
                    message: format!("Field '{field_name}' value {num} is below minimum {min}"),
                    severity: "error".to_string(),
                });
            }
        }
        if let Some(max) = obj.get("max").and_then(|v| v.as_f64()) {
            if num > max {
                errors.push(MetadataFieldError {
                    field: field_name.to_string(),
                    message: format!("Field '{field_name}' value {num} exceeds maximum {max}"),
                    severity: "error".to_string(),
                });
            }
        }
    }

    // String min_length/max_length.
    if let Some(s) = value.as_str() {
        if let Some(min_len) = obj.get("min_length").and_then(|v| v.as_u64()) {
            if (s.len() as u64) < min_len {
                errors.push(MetadataFieldError {
                    field: field_name.to_string(),
                    message: format!(
                        "Field '{field_name}' length {} is below minimum {min_len}",
                        s.len()
                    ),
                    severity: "error".to_string(),
                });
            }
        }
        if let Some(max_len) = obj.get("max_length").and_then(|v| v.as_u64()) {
            if (s.len() as u64) > max_len {
                errors.push(MetadataFieldError {
                    field: field_name.to_string(),
                    message: format!(
                        "Field '{field_name}' length {} exceeds maximum {max_len}",
                        s.len()
                    ),
                    severity: "error".to_string(),
                });
            }
        }
    }

    // Enum constraint.
    if let Some(enum_values) = obj.get("enum").and_then(|v| v.as_array()) {
        if let Some(s) = value.as_str() {
            let allowed: Vec<&str> = enum_values.iter().filter_map(|v| v.as_str()).collect();
            if !allowed.contains(&s) {
                errors.push(MetadataFieldError {
                    field: field_name.to_string(),
                    message: format!(
                        "Field '{field_name}' value '{s}' not in allowed values: {allowed:?}"
                    ),
                    severity: "error".to_string(),
                });
            }
        }
    }

    // Pattern constraint (regex).
    if let Some(pattern_str) = obj.get("pattern").and_then(|v| v.as_str()) {
        if let Some(s) = value.as_str() {
            match regex::Regex::new(pattern_str) {
                Ok(re) => {
                    if !re.is_match(s) {
                        errors.push(MetadataFieldError {
                            field: field_name.to_string(),
                            message: format!(
                                "Field '{field_name}' value '{s}' does not match pattern '{pattern_str}'"
                            ),
                            severity: "error".to_string(),
                        });
                    }
                }
                Err(e) => {
                    errors.push(MetadataFieldError {
                        field: field_name.to_string(),
                        message: format!(
                            "Field '{field_name}' has invalid regex pattern '{pattern_str}': {e}"
                        ),
                        severity: "error".to_string(),
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_fields() -> Vec<TemplateField> {
        vec![
            TemplateField {
                field_name: "name".to_string(),
                field_type: "string".to_string(),
                is_required: true,
                constraints: json!({"min_length": 1, "max_length": 100}),
            },
            TemplateField {
                field_name: "age".to_string(),
                field_type: "string".to_string(),
                is_required: false,
                constraints: json!({}),
            },
            TemplateField {
                field_name: "gender".to_string(),
                field_type: "string".to_string(),
                is_required: false,
                constraints: json!({"enum": ["male", "female", "non-binary", "other"]}),
            },
            TemplateField {
                field_name: "score".to_string(),
                field_type: "number".to_string(),
                is_required: false,
                constraints: json!({"min": 0, "max": 200}),
            },
            TemplateField {
                field_name: "active".to_string(),
                field_type: "boolean".to_string(),
                is_required: false,
                constraints: json!({}),
            },
        ]
    }

    #[test]
    fn valid_metadata_passes() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "Test Avatar",
            "age": "25",
            "gender": "female",
            "score": 50,
            "active": true,
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn missing_required_field() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "age": "25",
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(!result.is_valid);
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].message.contains("Required field"));
    }

    #[test]
    fn wrong_type() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": 123,
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(!result.is_valid);
        assert!(result.errors[0].message.contains("expected type"));
    }

    #[test]
    fn number_below_min() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "Test",
            "score": -5,
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(!result.is_valid);
        assert!(result.errors[0].message.contains("below minimum"));
    }

    #[test]
    fn number_above_max() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "Test",
            "score": 999,
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(!result.is_valid);
        assert!(result.errors[0].message.contains("exceeds maximum"));
    }

    #[test]
    fn string_below_min_length() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "",
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(!result.is_valid);
        assert!(result.errors[0].message.contains("below minimum"));
    }

    #[test]
    fn enum_violation() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "Test",
            "gender": "invalid",
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(!result.is_valid);
        assert!(result.errors[0].message.contains("not in allowed values"));
    }

    #[test]
    fn unknown_key_produces_warning() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "Test",
            "unknown_field": "value",
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(result.is_valid);
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].message.contains("Unknown field"));
    }

    #[test]
    fn pattern_constraint() {
        let fields = vec![TemplateField {
            field_name: "code".to_string(),
            field_type: "string".to_string(),
            is_required: true,
            constraints: json!({"pattern": "^[A-Z]{3}$"}),
        }];

        // Valid
        let metadata: serde_json::Map<String, serde_json::Value> =
            serde_json::from_value(json!({"code": "ABC"})).unwrap();
        let result = validate_metadata(&metadata, &fields);
        assert!(result.is_valid);

        // Invalid
        let metadata: serde_json::Map<String, serde_json::Value> =
            serde_json::from_value(json!({"code": "abc123"})).unwrap();
        let result = validate_metadata(&metadata, &fields);
        assert!(!result.is_valid);
        assert!(result.errors[0].message.contains("does not match pattern"));
    }

    #[test]
    fn null_value_accepted_for_optional() {
        let metadata: serde_json::Map<String, serde_json::Value> = serde_json::from_value(json!({
            "name": "Test",
            "age": null,
        }))
        .unwrap();

        let result = validate_metadata(&metadata, &make_fields());
        assert!(result.is_valid);
    }

    #[test]
    fn empty_metadata_with_no_required_fields() {
        let fields = vec![TemplateField {
            field_name: "optional".to_string(),
            field_type: "string".to_string(),
            is_required: false,
            constraints: json!({}),
        }];

        let metadata = serde_json::Map::new();
        let result = validate_metadata(&metadata, &fields);
        assert!(result.is_valid);
    }
}
