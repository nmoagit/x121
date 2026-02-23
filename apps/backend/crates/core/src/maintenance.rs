//! Bulk Data Maintenance constants, validators, and field registries (PRD-18).
//!
//! Provides operation type/status enums, input validators, advisory lock
//! constants, and a registry of searchable/path fields for find/replace
//! and re-pathing operations.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Operation type constants
// ---------------------------------------------------------------------------

/// Find and replace across metadata fields.
pub const OP_TYPE_FIND_REPLACE: &str = "find_replace";
/// Bulk update of file path references.
pub const OP_TYPE_REPATH: &str = "repath";
/// Batch field update across entities.
pub const OP_TYPE_BATCH_UPDATE: &str = "batch_update";

/// All valid operation types.
pub const VALID_OP_TYPES: &[&str] = &[OP_TYPE_FIND_REPLACE, OP_TYPE_REPATH, OP_TYPE_BATCH_UPDATE];

// ---------------------------------------------------------------------------
// Operation status constants
// ---------------------------------------------------------------------------

/// Preview generated, awaiting confirmation.
pub const STATUS_PREVIEW: &str = "preview";
/// Operation in progress.
pub const STATUS_EXECUTING: &str = "executing";
/// Operation completed successfully.
pub const STATUS_COMPLETED: &str = "completed";
/// Operation failed and was rolled back.
pub const STATUS_FAILED: &str = "failed";
/// Operation was undone by admin.
pub const STATUS_UNDONE: &str = "undone";

/// All valid operation statuses.
pub const VALID_STATUSES: &[&str] = &[
    STATUS_PREVIEW,
    STATUS_EXECUTING,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_UNDONE,
];

// ---------------------------------------------------------------------------
// Advisory lock constant
// ---------------------------------------------------------------------------

/// PostgreSQL advisory lock ID for maintenance operations.
/// Only one bulk maintenance operation can run at a time.
pub const MAINTENANCE_LOCK_ID: i64 = 918_273_645;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// Maximum length for a search term.
pub const MAX_SEARCH_TERM_LEN: usize = 1_000;

/// Maximum length for a replacement string.
pub const MAX_REPLACEMENT_LEN: usize = 10_000;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Bulk operation type enum with string conversion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulkOperationType {
    FindReplace,
    Repath,
    BatchUpdate,
}

impl BulkOperationType {
    /// Return the database string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FindReplace => OP_TYPE_FIND_REPLACE,
            Self::Repath => OP_TYPE_REPATH,
            Self::BatchUpdate => OP_TYPE_BATCH_UPDATE,
        }
    }

    /// Parse from a string, returning an error for unknown types.
    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            OP_TYPE_FIND_REPLACE => Ok(Self::FindReplace),
            OP_TYPE_REPATH => Ok(Self::Repath),
            OP_TYPE_BATCH_UPDATE => Ok(Self::BatchUpdate),
            other => Err(CoreError::Validation(format!(
                "Unknown operation type: '{other}'. Valid types: {}",
                VALID_OP_TYPES.join(", ")
            ))),
        }
    }
}

/// Bulk operation status enum with string conversion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulkOperationStatus {
    Preview,
    Executing,
    Completed,
    Failed,
    Undone,
}

impl BulkOperationStatus {
    /// Return the database string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Preview => STATUS_PREVIEW,
            Self::Executing => STATUS_EXECUTING,
            Self::Completed => STATUS_COMPLETED,
            Self::Failed => STATUS_FAILED,
            Self::Undone => STATUS_UNDONE,
        }
    }

    /// Parse from a string, returning an error for unknown statuses.
    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            STATUS_PREVIEW => Ok(Self::Preview),
            STATUS_EXECUTING => Ok(Self::Executing),
            STATUS_COMPLETED => Ok(Self::Completed),
            STATUS_FAILED => Ok(Self::Failed),
            STATUS_UNDONE => Ok(Self::Undone),
            other => Err(CoreError::Validation(format!(
                "Unknown operation status: '{other}'. Valid statuses: {}",
                VALID_STATUSES.join(", ")
            ))),
        }
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that a search term is non-empty and within length limits.
pub fn validate_search_term(term: &str) -> Result<(), CoreError> {
    if term.is_empty() {
        return Err(CoreError::Validation(
            "Search term must not be empty".to_string(),
        ));
    }
    if term.len() > MAX_SEARCH_TERM_LEN {
        return Err(CoreError::Validation(format!(
            "Search term exceeds maximum length of {MAX_SEARCH_TERM_LEN} characters"
        )));
    }
    Ok(())
}

/// Validate that a regex pattern compiles successfully.
pub fn validate_regex_pattern(pattern: &str) -> Result<(), CoreError> {
    if pattern.is_empty() {
        return Err(CoreError::Validation(
            "Regex pattern must not be empty".to_string(),
        ));
    }
    regex::Regex::new(pattern).map_err(|e| {
        CoreError::Validation(format!("Invalid regex pattern: {e}"))
    })?;
    Ok(())
}

/// Validate that a path prefix is non-empty and starts with `/`.
pub fn validate_path_prefix(prefix: &str) -> Result<(), CoreError> {
    if prefix.is_empty() {
        return Err(CoreError::Validation(
            "Path prefix must not be empty".to_string(),
        ));
    }
    if !prefix.starts_with('/') {
        return Err(CoreError::Validation(
            "Path prefix must start with '/'".to_string(),
        ));
    }
    Ok(())
}

/// Validate that a replacement string is within length limits.
pub fn validate_replacement(replacement: &str) -> Result<(), CoreError> {
    if replacement.len() > MAX_REPLACEMENT_LEN {
        return Err(CoreError::Validation(format!(
            "Replacement exceeds maximum length of {MAX_REPLACEMENT_LEN} characters"
        )));
    }
    Ok(())
}

/// Check whether an operation in the given status can be undone.
/// Only completed operations can be undone.
pub fn can_undo_operation(status: &BulkOperationStatus) -> bool {
    matches!(status, BulkOperationStatus::Completed)
}

/// Check whether an operation in the given status can be executed.
/// Only previewed operations can be executed.
pub fn can_execute_operation(status: &BulkOperationStatus) -> bool {
    matches!(status, BulkOperationStatus::Preview)
}

/// Validate an operation type string is one of the known types.
pub fn validate_operation_type(op_type: &str) -> Result<(), CoreError> {
    if VALID_OP_TYPES.contains(&op_type) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown operation type: '{op_type}'. Valid types: {}",
            VALID_OP_TYPES.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Searchable field registry
// ---------------------------------------------------------------------------

/// Describes a text field that can be searched or re-pathed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchableField {
    /// Logical entity type (e.g. "character", "project").
    pub entity_type: &'static str,
    /// Database table name.
    pub table_name: &'static str,
    /// Column name within the table.
    pub column_name: &'static str,
}

/// Return all text fields that can be searched via find/replace.
///
/// If `entity_type` is `Some`, only fields for that entity type are returned.
pub fn get_searchable_fields(entity_type: Option<&str>) -> Vec<SearchableField> {
    let mut fields = vec![
        SearchableField {
            entity_type: "project",
            table_name: "projects",
            column_name: "name",
        },
        SearchableField {
            entity_type: "project",
            table_name: "projects",
            column_name: "description",
        },
        SearchableField {
            entity_type: "character",
            table_name: "characters",
            column_name: "name",
        },
        SearchableField {
            entity_type: "scene_type",
            table_name: "scene_types",
            column_name: "name",
        },
        SearchableField {
            entity_type: "scene_type",
            table_name: "scene_types",
            column_name: "prompt_template",
        },
        SearchableField {
            entity_type: "source_image",
            table_name: "source_images",
            column_name: "description",
        },
        SearchableField {
            entity_type: "derived_image",
            table_name: "derived_images",
            column_name: "description",
        },
        SearchableField {
            entity_type: "derived_image",
            table_name: "derived_images",
            column_name: "variant_type",
        },
        SearchableField {
            entity_type: "image_variant",
            table_name: "image_variants",
            column_name: "variant_label",
        },
    ];

    if let Some(et) = entity_type {
        fields.retain(|f| f.entity_type == et);
    }
    fields
}

/// Return all file-path fields that can be re-pathed.
///
/// If `entity_type` is `Some`, only fields for that entity type are returned.
pub fn get_path_fields(entity_type: Option<&str>) -> Vec<SearchableField> {
    let mut fields = vec![
        SearchableField {
            entity_type: "source_image",
            table_name: "source_images",
            column_name: "file_path",
        },
        SearchableField {
            entity_type: "derived_image",
            table_name: "derived_images",
            column_name: "file_path",
        },
        SearchableField {
            entity_type: "image_variant",
            table_name: "image_variants",
            column_name: "file_path",
        },
        SearchableField {
            entity_type: "segment",
            table_name: "segments",
            column_name: "seed_frame_path",
        },
        SearchableField {
            entity_type: "segment",
            table_name: "segments",
            column_name: "output_video_path",
        },
        SearchableField {
            entity_type: "segment",
            table_name: "segments",
            column_name: "last_frame_path",
        },
    ];

    if let Some(et) = entity_type {
        fields.retain(|f| f.entity_type == et);
    }
    fields
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- BulkOperationType ----------------------------------------------------

    #[test]
    fn op_type_as_str() {
        assert_eq!(BulkOperationType::FindReplace.as_str(), "find_replace");
        assert_eq!(BulkOperationType::Repath.as_str(), "repath");
        assert_eq!(BulkOperationType::BatchUpdate.as_str(), "batch_update");
    }

    #[test]
    fn op_type_from_str_valid() {
        assert_eq!(
            BulkOperationType::from_str("find_replace").unwrap(),
            BulkOperationType::FindReplace
        );
        assert_eq!(
            BulkOperationType::from_str("repath").unwrap(),
            BulkOperationType::Repath
        );
        assert_eq!(
            BulkOperationType::from_str("batch_update").unwrap(),
            BulkOperationType::BatchUpdate
        );
    }

    #[test]
    fn op_type_from_str_invalid() {
        assert!(BulkOperationType::from_str("unknown").is_err());
        assert!(BulkOperationType::from_str("").is_err());
    }

    // -- BulkOperationStatus --------------------------------------------------

    #[test]
    fn status_as_str() {
        assert_eq!(BulkOperationStatus::Preview.as_str(), "preview");
        assert_eq!(BulkOperationStatus::Executing.as_str(), "executing");
        assert_eq!(BulkOperationStatus::Completed.as_str(), "completed");
        assert_eq!(BulkOperationStatus::Failed.as_str(), "failed");
        assert_eq!(BulkOperationStatus::Undone.as_str(), "undone");
    }

    #[test]
    fn status_from_str_valid() {
        assert_eq!(
            BulkOperationStatus::from_str("preview").unwrap(),
            BulkOperationStatus::Preview
        );
        assert_eq!(
            BulkOperationStatus::from_str("executing").unwrap(),
            BulkOperationStatus::Executing
        );
        assert_eq!(
            BulkOperationStatus::from_str("completed").unwrap(),
            BulkOperationStatus::Completed
        );
        assert_eq!(
            BulkOperationStatus::from_str("failed").unwrap(),
            BulkOperationStatus::Failed
        );
        assert_eq!(
            BulkOperationStatus::from_str("undone").unwrap(),
            BulkOperationStatus::Undone
        );
    }

    #[test]
    fn status_from_str_invalid() {
        assert!(BulkOperationStatus::from_str("running").is_err());
        assert!(BulkOperationStatus::from_str("").is_err());
    }

    // -- validate_search_term -------------------------------------------------

    #[test]
    fn valid_search_term() {
        assert!(validate_search_term("hello").is_ok());
        assert!(validate_search_term("a").is_ok());
    }

    #[test]
    fn empty_search_term_rejected() {
        assert!(validate_search_term("").is_err());
    }

    #[test]
    fn long_search_term_rejected() {
        let long = "x".repeat(MAX_SEARCH_TERM_LEN + 1);
        assert!(validate_search_term(&long).is_err());
    }

    #[test]
    fn max_length_search_term_accepted() {
        let exact = "x".repeat(MAX_SEARCH_TERM_LEN);
        assert!(validate_search_term(&exact).is_ok());
    }

    // -- validate_regex_pattern -----------------------------------------------

    #[test]
    fn valid_regex_accepted() {
        assert!(validate_regex_pattern(r"\d+").is_ok());
        assert!(validate_regex_pattern(r"[a-z]+").is_ok());
        assert!(validate_regex_pattern("hello").is_ok());
    }

    #[test]
    fn empty_regex_rejected() {
        assert!(validate_regex_pattern("").is_err());
    }

    #[test]
    fn invalid_regex_rejected() {
        assert!(validate_regex_pattern("[unclosed").is_err());
        assert!(validate_regex_pattern("*invalid").is_err());
    }

    // -- validate_path_prefix -------------------------------------------------

    #[test]
    fn valid_path_prefix() {
        assert!(validate_path_prefix("/mnt/assets").is_ok());
        assert!(validate_path_prefix("/").is_ok());
    }

    #[test]
    fn empty_path_prefix_rejected() {
        assert!(validate_path_prefix("").is_err());
    }

    #[test]
    fn path_prefix_without_slash_rejected() {
        assert!(validate_path_prefix("mnt/assets").is_err());
        assert!(validate_path_prefix("relative/path").is_err());
    }

    // -- validate_replacement -------------------------------------------------

    #[test]
    fn valid_replacement() {
        assert!(validate_replacement("new value").is_ok());
        assert!(validate_replacement("").is_ok()); // empty is valid
    }

    #[test]
    fn long_replacement_rejected() {
        let long = "x".repeat(MAX_REPLACEMENT_LEN + 1);
        assert!(validate_replacement(&long).is_err());
    }

    #[test]
    fn max_length_replacement_accepted() {
        let exact = "x".repeat(MAX_REPLACEMENT_LEN);
        assert!(validate_replacement(&exact).is_ok());
    }

    // -- can_undo_operation ---------------------------------------------------

    #[test]
    fn can_undo_completed() {
        assert!(can_undo_operation(&BulkOperationStatus::Completed));
    }

    #[test]
    fn cannot_undo_preview() {
        assert!(!can_undo_operation(&BulkOperationStatus::Preview));
    }

    #[test]
    fn cannot_undo_executing() {
        assert!(!can_undo_operation(&BulkOperationStatus::Executing));
    }

    #[test]
    fn cannot_undo_failed() {
        assert!(!can_undo_operation(&BulkOperationStatus::Failed));
    }

    #[test]
    fn cannot_undo_undone() {
        assert!(!can_undo_operation(&BulkOperationStatus::Undone));
    }

    // -- can_execute_operation ------------------------------------------------

    #[test]
    fn can_execute_preview() {
        assert!(can_execute_operation(&BulkOperationStatus::Preview));
    }

    #[test]
    fn cannot_execute_completed() {
        assert!(!can_execute_operation(&BulkOperationStatus::Completed));
    }

    #[test]
    fn cannot_execute_executing() {
        assert!(!can_execute_operation(&BulkOperationStatus::Executing));
    }

    #[test]
    fn cannot_execute_failed() {
        assert!(!can_execute_operation(&BulkOperationStatus::Failed));
    }

    // -- validate_operation_type ----------------------------------------------

    #[test]
    fn valid_operation_types_accepted() {
        assert!(validate_operation_type("find_replace").is_ok());
        assert!(validate_operation_type("repath").is_ok());
        assert!(validate_operation_type("batch_update").is_ok());
    }

    #[test]
    fn invalid_operation_type_rejected() {
        assert!(validate_operation_type("unknown").is_err());
        assert!(validate_operation_type("").is_err());
    }

    // -- get_searchable_fields ------------------------------------------------

    #[test]
    fn all_searchable_fields_returned() {
        let fields = get_searchable_fields(None);
        assert!(fields.len() >= 9);
    }

    #[test]
    fn searchable_fields_filter_by_entity_type() {
        let fields = get_searchable_fields(Some("character"));
        assert!(!fields.is_empty());
        for f in &fields {
            assert_eq!(f.entity_type, "character");
        }
    }

    #[test]
    fn searchable_fields_unknown_entity_empty() {
        let fields = get_searchable_fields(Some("nonexistent"));
        assert!(fields.is_empty());
    }

    #[test]
    fn searchable_fields_contain_project_name() {
        let fields = get_searchable_fields(Some("project"));
        assert!(fields.iter().any(|f| f.column_name == "name"));
    }

    // -- get_path_fields ------------------------------------------------------

    #[test]
    fn all_path_fields_returned() {
        let fields = get_path_fields(None);
        assert!(fields.len() >= 6);
    }

    #[test]
    fn path_fields_filter_by_entity_type() {
        let fields = get_path_fields(Some("segment"));
        assert!(!fields.is_empty());
        for f in &fields {
            assert_eq!(f.entity_type, "segment");
        }
    }

    #[test]
    fn path_fields_unknown_entity_empty() {
        let fields = get_path_fields(Some("nonexistent"));
        assert!(fields.is_empty());
    }

    #[test]
    fn path_fields_contain_source_image_file_path() {
        let fields = get_path_fields(Some("source_image"));
        assert!(fields.iter().any(|f| f.column_name == "file_path"));
    }

    #[test]
    fn segment_has_three_path_fields() {
        let fields = get_path_fields(Some("segment"));
        assert_eq!(fields.len(), 3);
        let cols: Vec<&str> = fields.iter().map(|f| f.column_name).collect();
        assert!(cols.contains(&"seed_frame_path"));
        assert!(cols.contains(&"output_video_path"));
        assert!(cols.contains(&"last_frame_path"));
    }

    // -- SearchableField struct -----------------------------------------------

    #[test]
    fn searchable_field_equality() {
        let a = SearchableField {
            entity_type: "character",
            table_name: "characters",
            column_name: "name",
        };
        let b = a.clone();
        assert_eq!(a, b);
    }

    // -- Constant values ------------------------------------------------------

    #[test]
    fn maintenance_lock_id_is_correct() {
        assert_eq!(MAINTENANCE_LOCK_ID, 918_273_645);
    }

    #[test]
    fn max_search_term_len_is_1000() {
        assert_eq!(MAX_SEARCH_TERM_LEN, 1_000);
    }

    #[test]
    fn max_replacement_len_is_10000() {
        assert_eq!(MAX_REPLACEMENT_LEN, 10_000);
    }
}
