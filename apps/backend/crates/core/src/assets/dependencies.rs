//! Asset dependency checking (PRD-17).
//!
//! Pure domain logic for evaluating whether an asset can safely be deleted.

use serde::Serialize;

/// Result of checking whether an asset can safely be deleted.
#[derive(Debug, Clone, Serialize)]
pub struct DeletionCheck {
    /// Whether the asset has zero active dependents and can be deleted.
    pub is_safe: bool,
    /// Number of entities that depend on this asset.
    pub dependent_count: i64,
    /// Human-readable summary of the check.
    pub message: String,
}

/// Evaluate whether an asset with the given number of dependents can be deleted.
pub fn check_deletion_safe(dependent_count: i64) -> DeletionCheck {
    if dependent_count == 0 {
        DeletionCheck {
            is_safe: true,
            dependent_count: 0,
            message: "No active dependents. Safe to delete.".to_string(),
        }
    } else {
        DeletionCheck {
            is_safe: false,
            dependent_count,
            message: format!(
                "Cannot delete: asset has {dependent_count} active dependent(s)."
            ),
        }
    }
}
