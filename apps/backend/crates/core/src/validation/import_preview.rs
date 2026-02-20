//! Import preview types for dry-run analysis.

use serde::{Deserialize, Serialize};

use super::conflict::FieldConflict;
use super::rules::ValidationResult;
use crate::types::DbId;

/// Action to be taken for an import record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportAction {
    Create,
    Update,
    Skip,
    Reject,
}

impl ImportAction {
    /// Stable string representation matching serde's `rename_all = "snake_case"`.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Create => "create",
            Self::Update => "update",
            Self::Skip => "skip",
            Self::Reject => "reject",
        }
    }
}

/// Field-level diff between current and incoming value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDiff {
    pub field: String,
    pub current_value: Option<serde_json::Value>,
    pub incoming_value: serde_json::Value,
}

/// Preview entry for a single record in the import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreviewEntry {
    pub record_index: usize,
    pub action: ImportAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<DbId>,
    pub validation_result: ValidationResult,
    pub field_diffs: Vec<FieldDiff>,
    pub conflicts: Vec<FieldConflict>,
}

/// Aggregated import preview showing what would happen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub total_records: usize,
    pub to_create: Vec<ImportPreviewEntry>,
    pub to_update: Vec<ImportPreviewEntry>,
    pub to_skip: Vec<ImportPreviewEntry>,
    pub invalid: Vec<ImportPreviewEntry>,
}

impl ImportPreview {
    /// Create an empty preview for a given record count.
    pub fn new(total_records: usize) -> Self {
        Self {
            total_records,
            to_create: Vec::new(),
            to_update: Vec::new(),
            to_skip: Vec::new(),
            invalid: Vec::new(),
        }
    }

    /// Add a preview entry to the appropriate bucket.
    pub fn push(&mut self, entry: ImportPreviewEntry) {
        match entry.action {
            ImportAction::Create => self.to_create.push(entry),
            ImportAction::Update => self.to_update.push(entry),
            ImportAction::Skip => self.to_skip.push(entry),
            ImportAction::Reject => self.invalid.push(entry),
        }
    }
}
