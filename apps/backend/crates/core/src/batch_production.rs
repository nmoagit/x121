//! Batch Production Orchestrator constants, types, and validation (PRD-57).
//!
//! Provides production run status constants, cell status classification,
//! matrix configuration validation, and delivery readiness checks.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Production run status constants (map to job_statuses seed data)
// ---------------------------------------------------------------------------

/// Draft: run created but not yet submitted.
pub const RUN_STATUS_DRAFT: &str = "draft";

/// Submitting: cells are being queued for generation.
pub const RUN_STATUS_SUBMITTING: &str = "submitting";

/// In progress: generation is underway.
pub const RUN_STATUS_IN_PROGRESS: &str = "in_progress";

/// Completed: all cells finished (some may have failed).
pub const RUN_STATUS_COMPLETED: &str = "completed";

/// Failed: the run itself failed (distinct from individual cell failures).
pub const RUN_STATUS_FAILED: &str = "failed";

/// Delivered: all cells approved and delivery package created.
pub const RUN_STATUS_DELIVERED: &str = "delivered";

/// All valid run status strings.
const ALL_RUN_STATUSES: &[&str] = &[
    RUN_STATUS_DRAFT,
    RUN_STATUS_SUBMITTING,
    RUN_STATUS_IN_PROGRESS,
    RUN_STATUS_COMPLETED,
    RUN_STATUS_FAILED,
    RUN_STATUS_DELIVERED,
];

/// Status IDs mapping to `job_statuses` seed data.
/// Draft maps to Pending (1), Submitting to Running (2), etc.
pub const RUN_STATUS_ID_DRAFT: i64 = 1;
pub const RUN_STATUS_ID_SUBMITTING: i64 = 2;
pub const RUN_STATUS_ID_IN_PROGRESS: i64 = 2;
pub const RUN_STATUS_ID_COMPLETED: i64 = 3;
pub const RUN_STATUS_ID_FAILED: i64 = 4;
pub const RUN_STATUS_ID_DELIVERED: i64 = 3;

// ---------------------------------------------------------------------------
// Cell status enum
// ---------------------------------------------------------------------------

/// Status of an individual cell in the production matrix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellStatus {
    /// Cell has not been submitted for generation.
    NotStarted,
    /// Cell is waiting on an upstream dependency.
    Blocked,
    /// Cell is queued for generation.
    Queued,
    /// Cell is currently being generated.
    Generating,
    /// Cell is awaiting QA review.
    QaReview,
    /// Cell has been approved.
    Approved,
    /// Cell generation or QA failed.
    Failed,
    /// Cell was rejected in QA.
    Rejected,
    /// Cell has been packaged for delivery.
    Delivered,
}

impl CellStatus {
    /// Human-readable label for display.
    pub fn label(self) -> &'static str {
        match self {
            Self::NotStarted => "Not Started",
            Self::Blocked => "Blocked",
            Self::Queued => "Queued",
            Self::Generating => "Generating",
            Self::QaReview => "QA Review",
            Self::Approved => "Approved",
            Self::Failed => "Failed",
            Self::Rejected => "Rejected",
            Self::Delivered => "Delivered",
        }
    }

    /// Numeric ID for database storage (maps to job_statuses where applicable).
    pub fn id(self) -> i16 {
        match self {
            Self::NotStarted => 0,
            Self::Blocked => 1,
            Self::Queued => 2,
            Self::Generating => 3,
            Self::QaReview => 4,
            Self::Approved => 5,
            Self::Failed => 6,
            Self::Rejected => 7,
            Self::Delivered => 8,
        }
    }
}

// ---------------------------------------------------------------------------
// Matrix config validation
// ---------------------------------------------------------------------------

/// Matrix configuration embedded in the production run's `matrix_config` JSONB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixConfig {
    pub character_ids: Vec<i64>,
    pub scene_type_ids: Vec<i64>,
}

/// Validate that a matrix configuration is well-formed.
///
/// Returns `Ok(())` if valid, or a `CoreError::Validation` describing the issue.
pub fn validate_matrix_config(config: &MatrixConfig) -> Result<(), CoreError> {
    if config.character_ids.is_empty() {
        return Err(CoreError::Validation(
            "Matrix config must include at least one character".to_string(),
        ));
    }
    if config.scene_type_ids.is_empty() {
        return Err(CoreError::Validation(
            "Matrix config must include at least one scene type".to_string(),
        ));
    }
    Ok(())
}

/// Validate that a run status string is recognized.
pub fn validate_run_status(status: &str) -> Result<(), CoreError> {
    if ALL_RUN_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown run status: '{status}'. Valid statuses: {}",
            ALL_RUN_STATUSES.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Delivery readiness
// ---------------------------------------------------------------------------

/// Check whether all cells are approved, which is required before delivery.
///
/// Returns `Ok(())` when every cell status is `Approved` or `Delivered`.
/// Returns `Err` with details when any cells are not ready.
pub fn validate_delivery_readiness(cell_statuses: &[CellStatus]) -> Result<(), CoreError> {
    if cell_statuses.is_empty() {
        return Err(CoreError::Validation(
            "Cannot deliver: no cells in the production run".to_string(),
        ));
    }

    let not_ready: Vec<&CellStatus> = cell_statuses
        .iter()
        .filter(|s| !matches!(s, CellStatus::Approved | CellStatus::Delivered))
        .collect();

    if not_ready.is_empty() {
        Ok(())
    } else {
        let failed = not_ready
            .iter()
            .filter(|s| matches!(s, CellStatus::Failed))
            .count();
        let rejected = not_ready
            .iter()
            .filter(|s| matches!(s, CellStatus::Rejected))
            .count();
        let in_progress = not_ready.len() - failed - rejected;

        Err(CoreError::Validation(format!(
            "Cannot deliver: {} cell(s) not ready ({} in progress, {} failed, {} rejected)",
            not_ready.len(),
            in_progress,
            failed,
            rejected,
        )))
    }
}

// ---------------------------------------------------------------------------
// Compute cell status from pipeline state
// ---------------------------------------------------------------------------

/// Determine the cell status based on pipeline state indicators.
///
/// The `has_*` flags represent which pipeline stages have completed for a
/// particular character x scene-type cell.
pub fn compute_cell_status(
    has_approved_variant: bool,
    has_scene: bool,
    scene_approved: bool,
    scene_failed: bool,
    scene_rejected: bool,
    is_generating: bool,
    is_queued: bool,
    is_delivered: bool,
) -> CellStatus {
    if is_delivered {
        return CellStatus::Delivered;
    }
    if scene_approved {
        return CellStatus::Approved;
    }
    if scene_rejected {
        return CellStatus::Rejected;
    }
    if scene_failed {
        return CellStatus::Failed;
    }
    if has_scene && !is_generating {
        return CellStatus::QaReview;
    }
    if is_generating {
        return CellStatus::Generating;
    }
    if is_queued {
        return CellStatus::Queued;
    }
    if !has_approved_variant {
        return CellStatus::Blocked;
    }
    CellStatus::NotStarted
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_matrix_config -----------------------------------------------

    #[test]
    fn valid_matrix_config_passes() {
        let config = MatrixConfig {
            character_ids: vec![1, 2],
            scene_type_ids: vec![10, 20],
        };
        assert!(validate_matrix_config(&config).is_ok());
    }

    #[test]
    fn empty_character_ids_rejected() {
        let config = MatrixConfig {
            character_ids: vec![],
            scene_type_ids: vec![10],
        };
        let err = validate_matrix_config(&config).unwrap_err();
        assert!(err.to_string().contains("at least one character"));
    }

    #[test]
    fn empty_scene_type_ids_rejected() {
        let config = MatrixConfig {
            character_ids: vec![1],
            scene_type_ids: vec![],
        };
        let err = validate_matrix_config(&config).unwrap_err();
        assert!(err.to_string().contains("at least one scene type"));
    }

    // -- validate_run_status --------------------------------------------------

    #[test]
    fn valid_run_statuses_accepted() {
        for status in ALL_RUN_STATUSES {
            assert!(validate_run_status(status).is_ok());
        }
    }

    #[test]
    fn invalid_run_status_rejected() {
        let err = validate_run_status("bogus").unwrap_err();
        assert!(err.to_string().contains("Unknown run status"));
    }

    // -- CellStatus -----------------------------------------------------------

    #[test]
    fn cell_status_labels_are_non_empty() {
        let statuses = [
            CellStatus::NotStarted,
            CellStatus::Blocked,
            CellStatus::Queued,
            CellStatus::Generating,
            CellStatus::QaReview,
            CellStatus::Approved,
            CellStatus::Failed,
            CellStatus::Rejected,
            CellStatus::Delivered,
        ];
        for s in statuses {
            assert!(!s.label().is_empty());
        }
    }

    #[test]
    fn cell_status_ids_are_unique() {
        let statuses = [
            CellStatus::NotStarted,
            CellStatus::Blocked,
            CellStatus::Queued,
            CellStatus::Generating,
            CellStatus::QaReview,
            CellStatus::Approved,
            CellStatus::Failed,
            CellStatus::Rejected,
            CellStatus::Delivered,
        ];
        let ids: Vec<i16> = statuses.iter().map(|s| s.id()).collect();
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len());
    }

    // -- validate_delivery_readiness ------------------------------------------

    #[test]
    fn delivery_readiness_all_approved() {
        let cells = vec![
            CellStatus::Approved,
            CellStatus::Approved,
            CellStatus::Delivered,
        ];
        assert!(validate_delivery_readiness(&cells).is_ok());
    }

    #[test]
    fn delivery_readiness_with_failed() {
        let cells = vec![CellStatus::Approved, CellStatus::Failed];
        let err = validate_delivery_readiness(&cells).unwrap_err();
        assert!(err.to_string().contains("1 failed"));
    }

    #[test]
    fn delivery_readiness_with_rejected() {
        let cells = vec![CellStatus::Approved, CellStatus::Rejected];
        let err = validate_delivery_readiness(&cells).unwrap_err();
        assert!(err.to_string().contains("1 rejected"));
    }

    #[test]
    fn delivery_readiness_empty_cells() {
        let err = validate_delivery_readiness(&[]).unwrap_err();
        assert!(err.to_string().contains("no cells"));
    }

    #[test]
    fn delivery_readiness_mixed_incomplete() {
        let cells = vec![
            CellStatus::Approved,
            CellStatus::Generating,
            CellStatus::Failed,
            CellStatus::Rejected,
        ];
        let err = validate_delivery_readiness(&cells).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("3 cell(s) not ready"));
        assert!(msg.contains("1 in progress"));
        assert!(msg.contains("1 failed"));
        assert!(msg.contains("1 rejected"));
    }

    // -- compute_cell_status --------------------------------------------------

    #[test]
    fn compute_delivered() {
        assert_eq!(
            compute_cell_status(true, true, true, false, false, false, false, true),
            CellStatus::Delivered,
        );
    }

    #[test]
    fn compute_approved() {
        assert_eq!(
            compute_cell_status(true, true, true, false, false, false, false, false),
            CellStatus::Approved,
        );
    }

    #[test]
    fn compute_rejected() {
        assert_eq!(
            compute_cell_status(true, true, false, false, true, false, false, false),
            CellStatus::Rejected,
        );
    }

    #[test]
    fn compute_failed() {
        assert_eq!(
            compute_cell_status(true, true, false, true, false, false, false, false),
            CellStatus::Failed,
        );
    }

    #[test]
    fn compute_qa_review() {
        assert_eq!(
            compute_cell_status(true, true, false, false, false, false, false, false),
            CellStatus::QaReview,
        );
    }

    #[test]
    fn compute_generating() {
        assert_eq!(
            compute_cell_status(true, false, false, false, false, true, false, false),
            CellStatus::Generating,
        );
    }

    #[test]
    fn compute_queued() {
        assert_eq!(
            compute_cell_status(true, false, false, false, false, false, true, false),
            CellStatus::Queued,
        );
    }

    #[test]
    fn compute_blocked_no_variant() {
        assert_eq!(
            compute_cell_status(false, false, false, false, false, false, false, false),
            CellStatus::Blocked,
        );
    }

    #[test]
    fn compute_not_started() {
        assert_eq!(
            compute_cell_status(true, false, false, false, false, false, false, false),
            CellStatus::NotStarted,
        );
    }
}
