//! Batch metadata operations types and validation (PRD-088).
//!
//! Provides enums, validation functions, and pure computation logic for
//! batch metadata operations. The `core` crate contains no database
//! dependencies; all evaluation is done against data passed in by the caller.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of characters per batch operation.
pub const MAX_BATCH_SIZE: usize = 1000;

/// Minimum characters required for a batch operation.
pub const MIN_BATCH_SIZE: usize = 1;

/// Maximum search pattern length.
pub const MAX_PATTERN_LENGTH: usize = 500;

/// Maximum field name length.
pub const MAX_FIELD_NAME_LENGTH: usize = 100;

/// Valid operation type strings (stored in DB).
pub const OP_MULTI_SELECT_EDIT: &str = "multi_select_edit";
pub const OP_SEARCH_REPLACE: &str = "search_replace";
pub const OP_CSV_IMPORT: &str = "csv_import";
pub const OP_FIELD_OPERATION: &str = "field_operation";

/// All valid operation type strings.
pub const VALID_OPERATION_TYPES: &[&str] = &[
    OP_MULTI_SELECT_EDIT,
    OP_SEARCH_REPLACE,
    OP_CSV_IMPORT,
    OP_FIELD_OPERATION,
];

/// Valid status strings.
pub const STATUS_PREVIEW: &str = "preview";
pub const STATUS_APPLYING: &str = "applying";
pub const STATUS_COMPLETED: &str = "completed";
pub const STATUS_UNDONE: &str = "undone";
pub const STATUS_FAILED: &str = "failed";

/// All valid status strings.
pub const VALID_STATUSES: &[&str] = &[
    STATUS_PREVIEW,
    STATUS_APPLYING,
    STATUS_COMPLETED,
    STATUS_UNDONE,
    STATUS_FAILED,
];

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Types of batch metadata operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchOperationType {
    MultiSelectEdit,
    SearchReplace,
    CsvImport,
    FieldOperation,
}

impl BatchOperationType {
    /// Convert from a database string value.
    pub fn from_str_value(s: &str) -> Result<Self, String> {
        match s {
            OP_MULTI_SELECT_EDIT => Ok(Self::MultiSelectEdit),
            OP_SEARCH_REPLACE => Ok(Self::SearchReplace),
            OP_CSV_IMPORT => Ok(Self::CsvImport),
            OP_FIELD_OPERATION => Ok(Self::FieldOperation),
            _ => Err(format!(
                "Invalid operation type '{s}'. Must be one of: {}",
                VALID_OPERATION_TYPES.join(", ")
            )),
        }
    }

    /// Convert to the database string value.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MultiSelectEdit => OP_MULTI_SELECT_EDIT,
            Self::SearchReplace => OP_SEARCH_REPLACE,
            Self::CsvImport => OP_CSV_IMPORT,
            Self::FieldOperation => OP_FIELD_OPERATION,
        }
    }
}

/// Lifecycle statuses for batch operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchOperationStatus {
    Preview,
    Applying,
    Completed,
    Undone,
    Failed,
}

impl BatchOperationStatus {
    /// Convert from a database string value.
    pub fn from_str_value(s: &str) -> Result<Self, String> {
        match s {
            STATUS_PREVIEW => Ok(Self::Preview),
            STATUS_APPLYING => Ok(Self::Applying),
            STATUS_COMPLETED => Ok(Self::Completed),
            STATUS_UNDONE => Ok(Self::Undone),
            STATUS_FAILED => Ok(Self::Failed),
            _ => Err(format!(
                "Invalid status '{s}'. Must be one of: {}",
                VALID_STATUSES.join(", ")
            )),
        }
    }

    /// Convert to the database string value.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Preview => STATUS_PREVIEW,
            Self::Applying => STATUS_APPLYING,
            Self::Completed => STATUS_COMPLETED,
            Self::Undone => STATUS_UNDONE,
            Self::Failed => STATUS_FAILED,
        }
    }
}

/// Field-level operation types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldOperationType {
    Clear,
    SetDefault,
    CopyField,
    Concatenate,
}

impl FieldOperationType {
    /// Convert from a string value.
    pub fn from_str_value(s: &str) -> Result<Self, String> {
        match s {
            "clear" => Ok(Self::Clear),
            "set_default" => Ok(Self::SetDefault),
            "copy_field" => Ok(Self::CopyField),
            "concatenate" => Ok(Self::Concatenate),
            _ => Err(format!(
                "Invalid field operation type '{s}'. Must be one of: clear, set_default, copy_field, concatenate"
            )),
        }
    }

    /// Convert to the string value.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Clear => "clear",
            Self::SetDefault => "set_default",
            Self::CopyField => "copy_field",
            Self::Concatenate => "concatenate",
        }
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that an operation type string is valid.
pub fn validate_operation_type(op_type: &str) -> Result<(), String> {
    if VALID_OPERATION_TYPES.contains(&op_type) {
        Ok(())
    } else {
        Err(format!(
            "Invalid operation type '{op_type}'. Must be one of: {}",
            VALID_OPERATION_TYPES.join(", ")
        ))
    }
}

/// Validate a metadata field name.
pub fn validate_field_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Field name must not be empty".to_string());
    }
    if name.len() > MAX_FIELD_NAME_LENGTH {
        return Err(format!(
            "Field name exceeds maximum length of {MAX_FIELD_NAME_LENGTH}"
        ));
    }
    // Field names should be alphanumeric with underscores.
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(format!(
            "Field name '{name}' contains invalid characters. Only alphanumeric and underscore allowed."
        ));
    }
    Ok(())
}

/// Validate a search pattern, optionally as regex.
pub fn validate_search_pattern(pattern: &str, is_regex: bool) -> Result<(), String> {
    if pattern.is_empty() {
        return Err("Search pattern must not be empty".to_string());
    }
    if pattern.len() > MAX_PATTERN_LENGTH {
        return Err(format!(
            "Search pattern exceeds maximum length of {MAX_PATTERN_LENGTH}"
        ));
    }
    if is_regex {
        regex::Regex::new(pattern).map_err(|e| format!("Invalid regex pattern: {e}"))?;
    }
    Ok(())
}

/// Validate batch size is within allowed bounds.
pub fn validate_batch_size(count: usize) -> Result<(), String> {
    if count < MIN_BATCH_SIZE {
        return Err(format!("Batch size must be at least {MIN_BATCH_SIZE}"));
    }
    if count > MAX_BATCH_SIZE {
        return Err(format!(
            "Batch size {count} exceeds maximum of {MAX_BATCH_SIZE}"
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Computation functions
// ---------------------------------------------------------------------------

/// Compute a human-readable summary for a batch operation.
pub fn compute_batch_summary(
    op_type: &BatchOperationType,
    field_name: Option<&str>,
    count: usize,
) -> String {
    match op_type {
        BatchOperationType::MultiSelectEdit => {
            let field = field_name.unwrap_or("unknown");
            format!("Set '{field}' for {count} characters")
        }
        BatchOperationType::SearchReplace => {
            let field = field_name.unwrap_or("all fields");
            format!("Search & replace in {field} across {count} characters")
        }
        BatchOperationType::CsvImport => {
            format!("{count} characters updated from CSV import")
        }
        BatchOperationType::FieldOperation => {
            let field = field_name.unwrap_or("unknown");
            format!("Field operation on '{field}' for {count} characters")
        }
    }
}

/// Determine whether a batch operation can be undone based on its status.
pub fn can_undo_operation(status: &BatchOperationStatus) -> bool {
    matches!(status, BatchOperationStatus::Completed)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- BatchOperationType ---------------------------------------------------

    #[test]
    fn operation_type_from_str_multi_select_edit() {
        assert_eq!(
            BatchOperationType::from_str_value("multi_select_edit").unwrap(),
            BatchOperationType::MultiSelectEdit
        );
    }

    #[test]
    fn operation_type_from_str_search_replace() {
        assert_eq!(
            BatchOperationType::from_str_value("search_replace").unwrap(),
            BatchOperationType::SearchReplace
        );
    }

    #[test]
    fn operation_type_from_str_csv_import() {
        assert_eq!(
            BatchOperationType::from_str_value("csv_import").unwrap(),
            BatchOperationType::CsvImport
        );
    }

    #[test]
    fn operation_type_from_str_field_operation() {
        assert_eq!(
            BatchOperationType::from_str_value("field_operation").unwrap(),
            BatchOperationType::FieldOperation
        );
    }

    #[test]
    fn operation_type_from_str_invalid() {
        let result = BatchOperationType::from_str_value("delete_all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid operation type"));
    }

    #[test]
    fn operation_type_round_trip() {
        for op in &[
            BatchOperationType::MultiSelectEdit,
            BatchOperationType::SearchReplace,
            BatchOperationType::CsvImport,
            BatchOperationType::FieldOperation,
        ] {
            assert_eq!(
                BatchOperationType::from_str_value(op.as_str()).unwrap(),
                *op
            );
        }
    }

    // -- BatchOperationStatus -------------------------------------------------

    #[test]
    fn status_from_str_preview() {
        assert_eq!(
            BatchOperationStatus::from_str_value("preview").unwrap(),
            BatchOperationStatus::Preview
        );
    }

    #[test]
    fn status_from_str_applying() {
        assert_eq!(
            BatchOperationStatus::from_str_value("applying").unwrap(),
            BatchOperationStatus::Applying
        );
    }

    #[test]
    fn status_from_str_completed() {
        assert_eq!(
            BatchOperationStatus::from_str_value("completed").unwrap(),
            BatchOperationStatus::Completed
        );
    }

    #[test]
    fn status_from_str_undone() {
        assert_eq!(
            BatchOperationStatus::from_str_value("undone").unwrap(),
            BatchOperationStatus::Undone
        );
    }

    #[test]
    fn status_from_str_failed() {
        assert_eq!(
            BatchOperationStatus::from_str_value("failed").unwrap(),
            BatchOperationStatus::Failed
        );
    }

    #[test]
    fn status_from_str_invalid() {
        let result = BatchOperationStatus::from_str_value("cancelled");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid status"));
    }

    #[test]
    fn status_round_trip() {
        for status in &[
            BatchOperationStatus::Preview,
            BatchOperationStatus::Applying,
            BatchOperationStatus::Completed,
            BatchOperationStatus::Undone,
            BatchOperationStatus::Failed,
        ] {
            assert_eq!(
                BatchOperationStatus::from_str_value(status.as_str()).unwrap(),
                *status
            );
        }
    }

    // -- FieldOperationType ---------------------------------------------------

    #[test]
    fn field_op_from_str_clear() {
        assert_eq!(
            FieldOperationType::from_str_value("clear").unwrap(),
            FieldOperationType::Clear
        );
    }

    #[test]
    fn field_op_from_str_set_default() {
        assert_eq!(
            FieldOperationType::from_str_value("set_default").unwrap(),
            FieldOperationType::SetDefault
        );
    }

    #[test]
    fn field_op_from_str_copy_field() {
        assert_eq!(
            FieldOperationType::from_str_value("copy_field").unwrap(),
            FieldOperationType::CopyField
        );
    }

    #[test]
    fn field_op_from_str_concatenate() {
        assert_eq!(
            FieldOperationType::from_str_value("concatenate").unwrap(),
            FieldOperationType::Concatenate
        );
    }

    #[test]
    fn field_op_from_str_invalid() {
        let result = FieldOperationType::from_str_value("merge");
        assert!(result.is_err());
    }

    #[test]
    fn field_op_round_trip() {
        for op in &[
            FieldOperationType::Clear,
            FieldOperationType::SetDefault,
            FieldOperationType::CopyField,
            FieldOperationType::Concatenate,
        ] {
            assert_eq!(
                FieldOperationType::from_str_value(op.as_str()).unwrap(),
                *op
            );
        }
    }

    // -- validate_operation_type ----------------------------------------------

    #[test]
    fn valid_operation_types_accepted() {
        for op in VALID_OPERATION_TYPES {
            assert!(validate_operation_type(op).is_ok());
        }
    }

    #[test]
    fn invalid_operation_type_rejected() {
        let result = validate_operation_type("unknown_op");
        assert!(result.is_err());
    }

    // -- validate_field_name --------------------------------------------------

    #[test]
    fn valid_field_name_accepted() {
        assert!(validate_field_name("hair_color").is_ok());
        assert!(validate_field_name("agency").is_ok());
        assert!(validate_field_name("field123").is_ok());
    }

    #[test]
    fn empty_field_name_rejected() {
        assert!(validate_field_name("").is_err());
    }

    #[test]
    fn long_field_name_rejected() {
        let name = "a".repeat(MAX_FIELD_NAME_LENGTH + 1);
        assert!(validate_field_name(&name).is_err());
    }

    #[test]
    fn field_name_with_special_chars_rejected() {
        assert!(validate_field_name("hair-color").is_err());
        assert!(validate_field_name("hair.color").is_err());
        assert!(validate_field_name("hair color").is_err());
    }

    #[test]
    fn field_name_max_length_accepted() {
        let name = "a".repeat(MAX_FIELD_NAME_LENGTH);
        assert!(validate_field_name(&name).is_ok());
    }

    // -- validate_search_pattern ----------------------------------------------

    #[test]
    fn valid_exact_pattern_accepted() {
        assert!(validate_search_pattern("blonde", false).is_ok());
    }

    #[test]
    fn valid_regex_pattern_accepted() {
        assert!(validate_search_pattern(r"bl(ond|onde)", true).is_ok());
        assert!(validate_search_pattern(r"\d+", true).is_ok());
    }

    #[test]
    fn empty_pattern_rejected() {
        assert!(validate_search_pattern("", false).is_err());
    }

    #[test]
    fn long_pattern_rejected() {
        let pattern = "x".repeat(MAX_PATTERN_LENGTH + 1);
        assert!(validate_search_pattern(&pattern, false).is_err());
    }

    #[test]
    fn invalid_regex_pattern_rejected() {
        let result = validate_search_pattern("[invalid", true);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid regex pattern"));
    }

    #[test]
    fn invalid_regex_not_checked_when_not_regex() {
        // "[invalid" is invalid regex but should pass when is_regex=false.
        assert!(validate_search_pattern("[invalid", false).is_ok());
    }

    // -- validate_batch_size --------------------------------------------------

    #[test]
    fn valid_batch_sizes_accepted() {
        assert!(validate_batch_size(1).is_ok());
        assert!(validate_batch_size(100).is_ok());
        assert!(validate_batch_size(MAX_BATCH_SIZE).is_ok());
    }

    #[test]
    fn zero_batch_size_rejected() {
        assert!(validate_batch_size(0).is_err());
    }

    #[test]
    fn oversized_batch_rejected() {
        let result = validate_batch_size(MAX_BATCH_SIZE + 1);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exceeds maximum"));
    }

    // -- compute_batch_summary ------------------------------------------------

    #[test]
    fn summary_multi_select_edit() {
        let summary =
            compute_batch_summary(&BatchOperationType::MultiSelectEdit, Some("agency"), 42);
        assert_eq!(summary, "Set 'agency' for 42 characters");
    }

    #[test]
    fn summary_search_replace_specific_field() {
        let summary =
            compute_batch_summary(&BatchOperationType::SearchReplace, Some("hair_color"), 10);
        assert_eq!(
            summary,
            "Search & replace in hair_color across 10 characters"
        );
    }

    #[test]
    fn summary_search_replace_all_fields() {
        let summary = compute_batch_summary(&BatchOperationType::SearchReplace, None, 10);
        assert_eq!(
            summary,
            "Search & replace in all fields across 10 characters"
        );
    }

    #[test]
    fn summary_csv_import() {
        let summary = compute_batch_summary(&BatchOperationType::CsvImport, None, 25);
        assert_eq!(summary, "25 characters updated from CSV import");
    }

    #[test]
    fn summary_field_operation() {
        let summary =
            compute_batch_summary(&BatchOperationType::FieldOperation, Some("hair_color"), 5);
        assert_eq!(summary, "Field operation on 'hair_color' for 5 characters");
    }

    #[test]
    fn summary_with_no_field_name() {
        let summary = compute_batch_summary(&BatchOperationType::MultiSelectEdit, None, 3);
        assert_eq!(summary, "Set 'unknown' for 3 characters");
    }

    // -- can_undo_operation ---------------------------------------------------

    #[test]
    fn can_undo_completed() {
        assert!(can_undo_operation(&BatchOperationStatus::Completed));
    }

    #[test]
    fn cannot_undo_preview() {
        assert!(!can_undo_operation(&BatchOperationStatus::Preview));
    }

    #[test]
    fn cannot_undo_applying() {
        assert!(!can_undo_operation(&BatchOperationStatus::Applying));
    }

    #[test]
    fn cannot_undo_undone() {
        assert!(!can_undo_operation(&BatchOperationStatus::Undone));
    }

    #[test]
    fn cannot_undo_failed() {
        assert!(!can_undo_operation(&BatchOperationStatus::Failed));
    }

    // -- Constant completeness ------------------------------------------------

    #[test]
    fn operation_types_count() {
        assert_eq!(VALID_OPERATION_TYPES.len(), 4);
    }

    #[test]
    fn statuses_count() {
        assert_eq!(VALID_STATUSES.len(), 5);
    }
}
