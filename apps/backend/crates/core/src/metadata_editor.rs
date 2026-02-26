//! Character metadata editor: field definitions, completeness calculation,
//! and CSV builder/parser helpers (PRD-66).
//!
//! This module has **zero database dependencies**. All types and logic are
//! purely in-memory, operating on `serde_json::Value` maps that the API
//! layer provides.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Field type and category enums
// ---------------------------------------------------------------------------

/// The data type of a metadata field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldType {
    Text,
    Number,
    Date,
    Select,
    MultiSelect,
}

/// Logical grouping for display in the form view.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldCategory {
    Biographical,
    Physical,
    Preferences,
    Production,
}

impl FieldCategory {
    /// Human-readable label for the category.
    pub fn label(self) -> &'static str {
        match self {
            Self::Biographical => "Biographical",
            Self::Physical => "Physical Attributes",
            Self::Preferences => "Preferences",
            Self::Production => "Production",
        }
    }
}

// ---------------------------------------------------------------------------
// Field definition
// ---------------------------------------------------------------------------

/// Definition of a single metadata field.
///
/// This is a compile-time schema rather than DB-stored rules. The PRD-014
/// validation layer can augment these definitions with dynamic rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataFieldDef {
    /// Machine-readable field name (matches the JSON key in `characters.metadata`).
    pub name: String,
    /// Human-readable display label.
    pub label: String,
    /// Data type.
    pub field_type: FieldType,
    /// Display category / group.
    pub category: FieldCategory,
    /// Whether the field is required for completeness tracking.
    pub is_required: bool,
    /// Allowed values for Select / MultiSelect fields.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
}

// ---------------------------------------------------------------------------
// Standard field definitions
// ---------------------------------------------------------------------------

/// Return the canonical set of character metadata field definitions.
///
/// These are the fields that the form view, spreadsheet, completeness
/// tracker, and CSV import/export all operate on.
pub fn standard_field_defs() -> Vec<MetadataFieldDef> {
    vec![
        // --- Biographical ---
        MetadataFieldDef {
            name: "full_name".into(),
            label: "Full Name".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Biographical,
            is_required: true,
            options: vec![],
        },
        MetadataFieldDef {
            name: "description".into(),
            label: "Description".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Biographical,
            is_required: true,
            options: vec![],
        },
        MetadataFieldDef {
            name: "age".into(),
            label: "Age".into(),
            field_type: FieldType::Number,
            category: FieldCategory::Biographical,
            is_required: false,
            options: vec![],
        },
        MetadataFieldDef {
            name: "gender".into(),
            label: "Gender".into(),
            field_type: FieldType::Select,
            category: FieldCategory::Biographical,
            is_required: false,
            options: vec![
                "Male".into(),
                "Female".into(),
                "Non-Binary".into(),
                "Other".into(),
            ],
        },
        MetadataFieldDef {
            name: "date_of_birth".into(),
            label: "Date of Birth".into(),
            field_type: FieldType::Date,
            category: FieldCategory::Biographical,
            is_required: false,
            options: vec![],
        },
        // --- Physical ---
        MetadataFieldDef {
            name: "height".into(),
            label: "Height".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Physical,
            is_required: false,
            options: vec![],
        },
        MetadataFieldDef {
            name: "weight".into(),
            label: "Weight".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Physical,
            is_required: false,
            options: vec![],
        },
        MetadataFieldDef {
            name: "hair_color".into(),
            label: "Hair Color".into(),
            field_type: FieldType::Select,
            category: FieldCategory::Physical,
            is_required: false,
            options: vec![
                "Black".into(),
                "Brown".into(),
                "Blonde".into(),
                "Red".into(),
                "Gray".into(),
                "White".into(),
                "Other".into(),
            ],
        },
        MetadataFieldDef {
            name: "eye_color".into(),
            label: "Eye Color".into(),
            field_type: FieldType::Select,
            category: FieldCategory::Physical,
            is_required: false,
            options: vec![
                "Brown".into(),
                "Blue".into(),
                "Green".into(),
                "Hazel".into(),
                "Gray".into(),
                "Other".into(),
            ],
        },
        MetadataFieldDef {
            name: "build".into(),
            label: "Build".into(),
            field_type: FieldType::Select,
            category: FieldCategory::Physical,
            is_required: false,
            options: vec![
                "Slim".into(),
                "Average".into(),
                "Athletic".into(),
                "Heavy".into(),
            ],
        },
        // --- Preferences ---
        MetadataFieldDef {
            name: "personality_traits".into(),
            label: "Personality Traits".into(),
            field_type: FieldType::MultiSelect,
            category: FieldCategory::Preferences,
            is_required: false,
            options: vec![
                "Introverted".into(),
                "Extroverted".into(),
                "Analytical".into(),
                "Creative".into(),
                "Empathetic".into(),
                "Assertive".into(),
            ],
        },
        MetadataFieldDef {
            name: "voice_type".into(),
            label: "Voice Type".into(),
            field_type: FieldType::Select,
            category: FieldCategory::Preferences,
            is_required: false,
            options: vec![
                "Soprano".into(),
                "Alto".into(),
                "Tenor".into(),
                "Baritone".into(),
                "Bass".into(),
            ],
        },
        MetadataFieldDef {
            name: "accent".into(),
            label: "Accent".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Preferences,
            is_required: false,
            options: vec![],
        },
        // --- Production ---
        MetadataFieldDef {
            name: "costume_notes".into(),
            label: "Costume Notes".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Production,
            is_required: false,
            options: vec![],
        },
        MetadataFieldDef {
            name: "special_requirements".into(),
            label: "Special Requirements".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Production,
            is_required: false,
            options: vec![],
        },
    ]
}

// ---------------------------------------------------------------------------
// Completeness calculation
// ---------------------------------------------------------------------------

/// Result of computing metadata completeness for a single character.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletenessResult {
    pub character_id: i64,
    pub total_required: usize,
    pub filled: usize,
    pub missing_fields: Vec<String>,
    pub percentage: f64,
}

/// Project-level completeness summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectCompleteness {
    pub total_characters: usize,
    pub complete_characters: usize,
    pub per_character: Vec<CompletenessResult>,
}

/// Check whether a JSON value counts as "filled" (non-null, non-empty).
fn is_field_filled(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Null => false,
        serde_json::Value::String(s) => !s.trim().is_empty(),
        serde_json::Value::Array(a) => !a.is_empty(),
        _ => true,
    }
}

/// Calculate completeness for one character given its metadata JSON map.
///
/// `character_id` is included in the result for convenient aggregation.
pub fn calculate_completeness(
    character_id: i64,
    metadata: &serde_json::Map<String, serde_json::Value>,
    fields: &[MetadataFieldDef],
) -> CompletenessResult {
    let required: Vec<&MetadataFieldDef> = fields.iter().filter(|f| f.is_required).collect();
    let total_required = required.len();

    let mut filled = 0usize;
    let mut missing_fields = Vec::new();

    for field in &required {
        let is_filled = metadata
            .get(&field.name)
            .map(is_field_filled)
            .unwrap_or(false);
        if is_filled {
            filled += 1;
        } else {
            missing_fields.push(field.name.clone());
        }
    }

    let percentage = if total_required > 0 {
        (filled as f64 / total_required as f64) * 100.0
    } else {
        100.0
    };

    CompletenessResult {
        character_id,
        total_required,
        filled,
        missing_fields,
        percentage,
    }
}

/// Calculate project-level completeness from a list of (character_id, metadata) pairs.
pub fn calculate_project_completeness(
    characters: &[(i64, serde_json::Map<String, serde_json::Value>)],
    fields: &[MetadataFieldDef],
) -> ProjectCompleteness {
    let mut per_character = Vec::with_capacity(characters.len());
    let mut complete_characters = 0usize;

    for (id, metadata) in characters {
        let result = calculate_completeness(*id, metadata, fields);
        if result.percentage >= 100.0 {
            complete_characters += 1;
        }
        per_character.push(result);
    }

    ProjectCompleteness {
        total_characters: characters.len(),
        complete_characters,
        per_character,
    }
}

// ---------------------------------------------------------------------------
// Metadata field validation (local, not PRD-014)
// ---------------------------------------------------------------------------

/// A simple validation error for a metadata field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataFieldError {
    pub field: String,
    pub message: String,
}

/// Validate a metadata update map against field definitions.
///
/// Checks that:
/// - Only known field names are present.
/// - Select fields have values within the allowed options.
/// - Number fields have numeric values.
///
/// Returns an empty vec when all fields pass.
pub fn validate_metadata_fields(
    updates: &serde_json::Map<String, serde_json::Value>,
    fields: &[MetadataFieldDef],
) -> Vec<MetadataFieldError> {
    let field_map: HashMap<&str, &MetadataFieldDef> =
        fields.iter().map(|f| (f.name.as_str(), f)).collect();

    let mut errors = Vec::new();

    for (key, value) in updates {
        let Some(def) = field_map.get(key.as_str()) else {
            errors.push(MetadataFieldError {
                field: key.clone(),
                message: format!("Unknown metadata field: {key}"),
            });
            continue;
        };

        // Skip null values (clearing a field).
        if value.is_null() {
            continue;
        }

        match def.field_type {
            FieldType::Number => {
                if !value.is_number() && !value.is_null() {
                    errors.push(MetadataFieldError {
                        field: key.clone(),
                        message: format!("Field '{}' must be a number", def.label),
                    });
                }
            }
            FieldType::Select => {
                if let Some(s) = value.as_str() {
                    if !def.options.is_empty() && !def.options.iter().any(|o| o == s) {
                        errors.push(MetadataFieldError {
                            field: key.clone(),
                            message: format!(
                                "Invalid value '{}' for field '{}'. Allowed: {}",
                                s,
                                def.label,
                                def.options.join(", ")
                            ),
                        });
                    }
                }
            }
            FieldType::MultiSelect => {
                if let Some(arr) = value.as_array() {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            if !def.options.is_empty() && !def.options.iter().any(|o| o == s) {
                                errors.push(MetadataFieldError {
                                    field: key.clone(),
                                    message: format!(
                                        "Invalid value '{}' in field '{}'. Allowed: {}",
                                        s,
                                        def.label,
                                        def.options.join(", ")
                                    ),
                                });
                            }
                        }
                    }
                }
            }
            // Text and Date: accept any string.
            _ => {}
        }
    }

    errors
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/// Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline.
fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// Convert a JSON value to a CSV-friendly string.
fn json_value_to_csv(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Array(arr) => {
            // Join multi-select values with semicolons.
            let items: Vec<String> = arr
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
            items.join(";")
        }
        serde_json::Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
    }
}

/// Build a CSV string from a list of characters.
///
/// Each character is represented as `(id, name, metadata_map)`.
/// The first row is a header with `id, name, <field_names...>`.
pub fn build_csv(
    characters: &[(i64, String, serde_json::Map<String, serde_json::Value>)],
    fields: &[MetadataFieldDef],
) -> String {
    let mut lines = Vec::with_capacity(characters.len() + 1);

    // Header row
    let mut header_parts = vec!["id".to_string(), "name".to_string()];
    for field in fields {
        header_parts.push(csv_escape(&field.name));
    }
    lines.push(header_parts.join(","));

    // Data rows
    for (id, name, metadata) in characters {
        let mut row_parts = vec![id.to_string(), csv_escape(name)];
        for field in fields {
            let value = metadata
                .get(&field.name)
                .unwrap_or(&serde_json::Value::Null);
            row_parts.push(csv_escape(&json_value_to_csv(value)));
        }
        lines.push(row_parts.join(","));
    }

    lines.join("\n")
}

/// A single parsed CSV record, keyed by column header.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvRecord {
    /// Character ID from the `id` column (for matching on re-import).
    pub id: Option<i64>,
    /// Character name from the `name` column.
    pub name: Option<String>,
    /// Metadata field values keyed by field name.
    pub fields: serde_json::Map<String, serde_json::Value>,
}

/// A diff entry showing what would change on import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvDiffEntry {
    pub character_id: i64,
    pub character_name: String,
    pub field_name: String,
    pub old_value: serde_json::Value,
    pub new_value: serde_json::Value,
}

/// Parse raw CSV bytes into a list of records.
///
/// Expects the first line to be a header. Handles basic quoting.
pub fn parse_csv(data: &[u8]) -> Result<Vec<CsvRecord>, String> {
    let text = std::str::from_utf8(data).map_err(|e| format!("Invalid UTF-8: {e}"))?;
    let mut lines = text.lines();

    let header_line = lines.next().ok_or("CSV is empty")?;
    let headers = parse_csv_line(header_line);

    if headers.is_empty() {
        return Err("CSV header row is empty".into());
    }

    let mut records = Vec::new();

    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let values = parse_csv_line(line);
        let mut id: Option<i64> = None;
        let mut name: Option<String> = None;
        let mut fields = serde_json::Map::new();

        for (i, header) in headers.iter().enumerate() {
            let value = values.get(i).map(|s| s.as_str()).unwrap_or("");
            match header.as_str() {
                "id" => {
                    id = value.parse::<i64>().ok();
                }
                "name" => {
                    name = Some(value.to_string());
                }
                field_name => {
                    if value.is_empty() {
                        fields.insert(field_name.to_string(), serde_json::Value::Null);
                    } else if value.contains(';') {
                        // Multi-select: split on semicolons.
                        let items: Vec<serde_json::Value> = value
                            .split(';')
                            .map(|s| serde_json::Value::String(s.trim().to_string()))
                            .collect();
                        fields.insert(field_name.to_string(), serde_json::Value::Array(items));
                    } else if let Ok(n) = value.parse::<f64>() {
                        // Try numeric.
                        fields.insert(
                            field_name.to_string(),
                            serde_json::Number::from_f64(n)
                                .map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::String(value.to_string())),
                        );
                    } else {
                        fields.insert(
                            field_name.to_string(),
                            serde_json::Value::String(value.to_string()),
                        );
                    }
                }
            }
        }

        records.push(CsvRecord { id, name, fields });
    }

    Ok(records)
}

/// Parse a single CSV line, handling quoted fields.
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    // Escaped quote.
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(ch);
            }
        } else if ch == '"' {
            in_quotes = true;
        } else if ch == ',' {
            result.push(current.clone());
            current.clear();
        } else {
            current.push(ch);
        }
    }
    result.push(current);
    result
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_fields() -> Vec<MetadataFieldDef> {
        standard_field_defs()
    }

    fn make_metadata(
        entries: &[(&str, serde_json::Value)],
    ) -> serde_json::Map<String, serde_json::Value> {
        let mut map = serde_json::Map::new();
        for (k, v) in entries {
            map.insert(k.to_string(), v.clone());
        }
        map
    }

    // --- Completeness tests ---

    #[test]
    fn completeness_empty_character_is_zero() {
        let fields = sample_fields();
        let metadata = serde_json::Map::new();
        let result = calculate_completeness(1, &metadata, &fields);

        assert_eq!(result.filled, 0);
        assert!(result.percentage < 1.0);
        // Both "full_name" and "description" are required.
        assert_eq!(result.total_required, 2);
        assert!(result.missing_fields.contains(&"full_name".to_string()));
        assert!(result.missing_fields.contains(&"description".to_string()));
    }

    #[test]
    fn completeness_all_required_filled_is_100() {
        let fields = sample_fields();
        let metadata = make_metadata(&[
            ("full_name", serde_json::Value::String("Alice".into())),
            ("description", serde_json::Value::String("A hero".into())),
        ]);
        let result = calculate_completeness(1, &metadata, &fields);

        assert_eq!(result.filled, 2);
        assert!((result.percentage - 100.0).abs() < f64::EPSILON);
        assert!(result.missing_fields.is_empty());
    }

    #[test]
    fn completeness_partial_fill() {
        let fields = sample_fields();
        let metadata = make_metadata(&[("full_name", serde_json::Value::String("Alice".into()))]);
        let result = calculate_completeness(1, &metadata, &fields);

        assert_eq!(result.filled, 1);
        assert_eq!(result.total_required, 2);
        assert!((result.percentage - 50.0).abs() < f64::EPSILON);
        assert_eq!(result.missing_fields, vec!["description".to_string()]);
    }

    #[test]
    fn completeness_null_and_empty_string_not_counted() {
        let fields = sample_fields();
        let metadata = make_metadata(&[
            ("full_name", serde_json::Value::Null),
            ("description", serde_json::Value::String("".into())),
        ]);
        let result = calculate_completeness(1, &metadata, &fields);

        assert_eq!(result.filled, 0);
        assert_eq!(result.missing_fields.len(), 2);
    }

    #[test]
    fn completeness_no_required_fields_is_100() {
        let fields = vec![MetadataFieldDef {
            name: "optional_field".into(),
            label: "Optional".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Biographical,
            is_required: false,
            options: vec![],
        }];
        let metadata = serde_json::Map::new();
        let result = calculate_completeness(1, &metadata, &fields);

        assert!((result.percentage - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn project_completeness_aggregates() {
        let fields = sample_fields();
        let characters = vec![
            (
                1,
                make_metadata(&[
                    ("full_name", serde_json::Value::String("Alice".into())),
                    ("description", serde_json::Value::String("Hero".into())),
                ]),
            ),
            (
                2,
                make_metadata(&[("full_name", serde_json::Value::String("Bob".into()))]),
            ),
            (3, serde_json::Map::new()),
        ];

        let result = calculate_project_completeness(&characters, &fields);

        assert_eq!(result.total_characters, 3);
        assert_eq!(result.complete_characters, 1);
        assert_eq!(result.per_character.len(), 3);
        assert!((result.per_character[0].percentage - 100.0).abs() < f64::EPSILON);
        assert!((result.per_character[1].percentage - 50.0).abs() < f64::EPSILON);
        assert!(result.per_character[2].percentage < 1.0);
    }

    // --- Validation tests ---

    #[test]
    fn validate_known_fields_pass() {
        let fields = sample_fields();
        let updates = make_metadata(&[
            ("full_name", serde_json::Value::String("Alice".into())),
            ("age", serde_json::json!(25)),
        ]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert!(errors.is_empty());
    }

    #[test]
    fn validate_unknown_field_rejected() {
        let fields = sample_fields();
        let updates =
            make_metadata(&[("nonexistent_field", serde_json::Value::String("x".into()))]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("Unknown"));
    }

    #[test]
    fn validate_number_field_rejects_string() {
        let fields = sample_fields();
        let updates = make_metadata(&[("age", serde_json::Value::String("not a number".into()))]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("number"));
    }

    #[test]
    fn validate_select_field_rejects_invalid_option() {
        let fields = sample_fields();
        let updates = make_metadata(&[("hair_color", serde_json::Value::String("Purple".into()))]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("Invalid value"));
    }

    #[test]
    fn validate_select_field_accepts_valid_option() {
        let fields = sample_fields();
        let updates = make_metadata(&[("hair_color", serde_json::Value::String("Black".into()))]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert!(errors.is_empty());
    }

    #[test]
    fn validate_null_value_accepted_for_any_field() {
        let fields = sample_fields();
        let updates = make_metadata(&[
            ("age", serde_json::Value::Null),
            ("hair_color", serde_json::Value::Null),
        ]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert!(errors.is_empty());
    }

    #[test]
    fn validate_multiselect_rejects_invalid_item() {
        let fields = sample_fields();
        let updates = make_metadata(&[(
            "personality_traits",
            serde_json::json!(["Introverted", "BadTrait"]),
        )]);
        let errors = validate_metadata_fields(&updates, &fields);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("BadTrait"));
    }

    // --- CSV tests ---

    #[test]
    fn csv_round_trip() {
        let fields = sample_fields();
        let characters = vec![
            (
                1,
                "Alice".to_string(),
                make_metadata(&[
                    ("full_name", serde_json::Value::String("Alice".into())),
                    ("description", serde_json::Value::String("The hero".into())),
                    ("age", serde_json::json!(25)),
                    (
                        "personality_traits",
                        serde_json::json!(["Creative", "Empathetic"]),
                    ),
                ]),
            ),
            (
                2,
                "Bob".to_string(),
                make_metadata(&[
                    ("full_name", serde_json::Value::String("Bob".into())),
                    (
                        "description",
                        serde_json::Value::String("The sidekick".into()),
                    ),
                ]),
            ),
        ];

        let csv = build_csv(&characters, &fields);

        // Header should start with id,name
        assert!(csv.starts_with("id,name"));

        // Parse it back
        let records = parse_csv(csv.as_bytes()).expect("CSV parse should succeed");

        assert_eq!(records.len(), 2);

        // First record
        assert_eq!(records[0].id, Some(1));
        assert_eq!(records[0].name.as_deref(), Some("Alice"));
        assert_eq!(
            records[0].fields.get("full_name").and_then(|v| v.as_str()),
            Some("Alice")
        );

        // Second record
        assert_eq!(records[1].id, Some(2));
        assert_eq!(records[1].name.as_deref(), Some("Bob"));
    }

    #[test]
    fn csv_handles_commas_in_values() {
        let fields = vec![MetadataFieldDef {
            name: "notes".into(),
            label: "Notes".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Production,
            is_required: false,
            options: vec![],
        }];

        let characters = vec![(
            1,
            "Alice".to_string(),
            make_metadata(&[("notes", serde_json::Value::String("Hello, World".into()))]),
        )];

        let csv = build_csv(&characters, &fields);
        let records = parse_csv(csv.as_bytes()).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0].fields.get("notes").and_then(|v| v.as_str()),
            Some("Hello, World")
        );
    }

    #[test]
    fn csv_handles_quotes_in_values() {
        let fields = vec![MetadataFieldDef {
            name: "notes".into(),
            label: "Notes".into(),
            field_type: FieldType::Text,
            category: FieldCategory::Production,
            is_required: false,
            options: vec![],
        }];

        let characters = vec![(
            1,
            "Alice".to_string(),
            make_metadata(&[(
                "notes",
                serde_json::Value::String("She said \"hello\"".into()),
            )]),
        )];

        let csv = build_csv(&characters, &fields);
        let records = parse_csv(csv.as_bytes()).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0].fields.get("notes").and_then(|v| v.as_str()),
            Some("She said \"hello\"")
        );
    }

    #[test]
    fn csv_empty_data() {
        let fields = sample_fields();
        let characters: Vec<(i64, String, serde_json::Map<String, serde_json::Value>)> = vec![];
        let csv = build_csv(&characters, &fields);

        // Should have only the header line
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].starts_with("id,name"));
    }

    #[test]
    fn csv_parse_empty_returns_error() {
        let result = parse_csv(b"");
        assert!(result.is_err());
    }

    #[test]
    fn field_defs_returns_non_empty() {
        let defs = standard_field_defs();
        assert!(!defs.is_empty());
        // Should have at least one required field.
        assert!(defs.iter().any(|f| f.is_required));
    }

    #[test]
    fn field_category_labels() {
        assert_eq!(FieldCategory::Biographical.label(), "Biographical");
        assert_eq!(FieldCategory::Physical.label(), "Physical Attributes");
        assert_eq!(FieldCategory::Preferences.label(), "Preferences");
        assert_eq!(FieldCategory::Production.label(), "Production");
    }
}
