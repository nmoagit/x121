//! Approval decision constants and validation functions (PRD-35).
//!
//! Defines the valid decision values for segment review and provides
//! validation helpers used by both the DB and API layers.

/// Segment was approved and is ready for finalization.
pub const DECISION_APPROVED: &str = "approved";

/// Segment was rejected due to a defect.
pub const DECISION_REJECTED: &str = "rejected";

/// Segment was flagged for further discussion.
pub const DECISION_FLAGGED: &str = "flagged";

/// All valid decision values.
pub const VALID_DECISIONS: &[&str] = &[DECISION_APPROVED, DECISION_REJECTED, DECISION_FLAGGED];

/// Default delay in milliseconds before auto-advancing to the next segment.
pub const AUTO_ADVANCE_DELAY_MS: u64 = 500;

/// Validate that a decision string is one of the accepted values.
pub fn validate_decision(decision: &str) -> Result<(), String> {
    if VALID_DECISIONS.contains(&decision) {
        Ok(())
    } else {
        Err(format!(
            "Invalid decision '{decision}'. Must be one of: {}",
            VALID_DECISIONS.join(", ")
        ))
    }
}

/// Validate that a rejection includes a reason category.
///
/// When the decision is "rejected", a `reason_category_id` should be provided
/// for structured tracking. This is a soft validation (warning-level) — the
/// system allows rejections without a category but flags it.
pub fn validate_rejection_has_category(
    decision: &str,
    reason_category_id: Option<i64>,
) -> Result<(), String> {
    if decision == DECISION_REJECTED && reason_category_id.is_none() {
        return Err(
            "Rejections should include a reason_category_id for structured tracking".to_string(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_decisions_accepted() {
        assert!(validate_decision(DECISION_APPROVED).is_ok());
        assert!(validate_decision(DECISION_REJECTED).is_ok());
        assert!(validate_decision(DECISION_FLAGGED).is_ok());
    }

    #[test]
    fn test_invalid_decision_rejected() {
        let result = validate_decision("unknown");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid decision"));
    }

    #[test]
    fn test_empty_decision_rejected() {
        assert!(validate_decision("").is_err());
    }

    #[test]
    fn test_rejection_with_category_passes() {
        assert!(validate_rejection_has_category(DECISION_REJECTED, Some(1)).is_ok());
    }

    #[test]
    fn test_rejection_without_category_warns() {
        let result = validate_rejection_has_category(DECISION_REJECTED, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("reason_category_id"));
    }

    #[test]
    fn test_approval_without_category_passes() {
        assert!(validate_rejection_has_category(DECISION_APPROVED, None).is_ok());
    }

    #[test]
    fn test_flag_without_category_passes() {
        assert!(validate_rejection_has_category(DECISION_FLAGGED, None).is_ok());
    }

    #[test]
    fn test_auto_advance_delay_is_half_second() {
        assert_eq!(AUTO_ADVANCE_DELAY_MS, 500);
    }

    #[test]
    fn test_valid_decisions_contains_all_three() {
        assert_eq!(VALID_DECISIONS.len(), 3);
        assert!(VALID_DECISIONS.contains(&"approved"));
        assert!(VALID_DECISIONS.contains(&"rejected"));
        assert!(VALID_DECISIONS.contains(&"flagged"));
    }
}
