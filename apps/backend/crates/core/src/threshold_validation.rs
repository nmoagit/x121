//! Shared threshold validation helpers.
//!
//! Provides reusable range-checking functions used by multiple domain modules.

use crate::error::CoreError;

/// Validate that a value falls within `[0.0, 1.0]`.
///
/// Returns a `CoreError::Validation` naming the field if out of range.
pub fn validate_unit_range(value: f64, name: &str) -> Result<(), CoreError> {
    if !(0.0..=1.0).contains(&value) {
        return Err(CoreError::Validation(format!(
            "{name} must be between 0.0 and 1.0, got {value}"
        )));
    }
    Ok(())
}

/// Validate that a count is at least 1 and at most `max`.
///
/// Returns a `CoreError::Validation` naming the context if out of range.
/// Shared by `validate_batch_size` (PRD-58) and `validate_estimate_count`
/// (PRD-61) to avoid structural duplication (DRY-277).
pub fn validate_count_range(count: usize, max: usize, label: &str) -> Result<(), CoreError> {
    if count == 0 {
        return Err(CoreError::Validation(format!(
            "{label} must contain at least one item"
        )));
    }
    if count > max {
        return Err(CoreError::Validation(format!(
            "{label} count {count} exceeds maximum of {max}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_unit_range --

    #[test]
    fn accepts_boundary_values() {
        assert!(validate_unit_range(0.0, "test").is_ok());
        assert!(validate_unit_range(0.5, "test").is_ok());
        assert!(validate_unit_range(1.0, "test").is_ok());
    }

    #[test]
    fn rejects_below_zero() {
        assert!(validate_unit_range(-0.01, "test").is_err());
    }

    #[test]
    fn rejects_above_one() {
        assert!(validate_unit_range(1.01, "test").is_err());
    }

    // -- validate_count_range --

    #[test]
    fn count_range_valid() {
        assert!(validate_count_range(1, 50, "Batch").is_ok());
        assert!(validate_count_range(25, 50, "Batch").is_ok());
        assert!(validate_count_range(50, 50, "Batch").is_ok());
    }

    #[test]
    fn count_range_rejects_zero() {
        assert!(validate_count_range(0, 50, "Batch").is_err());
    }

    #[test]
    fn count_range_rejects_over_max() {
        assert!(validate_count_range(51, 50, "Batch").is_err());
    }
}
