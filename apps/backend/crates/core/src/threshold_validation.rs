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

#[cfg(test)]
mod tests {
    use super::*;

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
}
