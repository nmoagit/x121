//! Resolution tier constants and validation for the Multi-Resolution Pipeline (PRD-59).
//!
//! Provides named constants for tier IDs and names, plus validation functions
//! for dimensions, speed factors, upscale eligibility, and delivery readiness.

use crate::error::CoreError;

/* --------------------------------------------------------------------------
Named constants
-------------------------------------------------------------------------- */

/// Tier name: draft (lowest quality, fastest iteration).
pub const TIER_DRAFT: &str = "draft";

/// Tier name: preview (intermediate quality).
pub const TIER_PREVIEW: &str = "preview";

/// Tier name: production (final delivery quality).
pub const TIER_PRODUCTION: &str = "production";

/// Tier ID for draft (matches seed data).
pub const TIER_ID_DRAFT: i64 = 1;

/// Tier ID for preview (matches seed data).
pub const TIER_ID_PREVIEW: i64 = 2;

/// Tier ID for production (matches seed data).
pub const TIER_ID_PRODUCTION: i64 = 3;

/// All recognized tier names.
pub const ALL_TIER_NAMES: &[&str] = &[TIER_DRAFT, TIER_PREVIEW, TIER_PRODUCTION];

/// Maximum dimension (width or height) allowed.
const MAX_DIMENSION: i32 = 7680;

/* --------------------------------------------------------------------------
Validation functions
-------------------------------------------------------------------------- */

/// Validate that the given name is a recognized tier name.
pub fn validate_tier_name(name: &str) -> Result<(), CoreError> {
    if ALL_TIER_NAMES.contains(&name) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown resolution tier name: '{}'. Valid tiers: {}",
            name,
            ALL_TIER_NAMES.join(", ")
        )))
    }
}

/// Validate that width and height are positive and within bounds.
pub fn validate_dimensions(width: i32, height: i32) -> Result<(), CoreError> {
    if width <= 0 || height <= 0 {
        return Err(CoreError::Validation(
            "Width and height must be greater than 0".to_string(),
        ));
    }
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(CoreError::Validation(format!(
            "Dimensions must not exceed {MAX_DIMENSION}px (got {width}x{height})"
        )));
    }
    Ok(())
}

/// Validate that the speed factor is positive.
pub fn validate_speed_factor(factor: f64) -> Result<(), CoreError> {
    if factor <= 0.0 {
        return Err(CoreError::Validation(
            "Speed factor must be greater than 0".to_string(),
        ));
    }
    Ok(())
}

/// Validate that an upscale moves from a lower tier to a higher tier.
///
/// Tier IDs are ordered: draft (1) < preview (2) < production (3).
/// Upscaling must go from a lower ID to a strictly higher ID.
pub fn can_upscale(from_tier_id: i64, to_tier_id: i64) -> Result<(), CoreError> {
    if to_tier_id <= from_tier_id {
        return Err(CoreError::Validation(format!(
            "Cannot upscale from tier {} to tier {}: target must be a higher tier",
            from_tier_id, to_tier_id
        )));
    }
    Ok(())
}

/// Check whether the given tier ID is the production tier.
pub fn is_production_tier(tier_id: i64) -> bool {
    tier_id == TIER_ID_PRODUCTION
}

/// Validate that a scene's tier is production-grade before delivery.
///
/// Only scenes at the production tier may be included in a delivery package.
pub fn validate_delivery_tier(tier_id: i64) -> Result<(), CoreError> {
    if !is_production_tier(tier_id) {
        return Err(CoreError::Validation(
            "Only production-tier scenes can be delivered".to_string(),
        ));
    }
    Ok(())
}

/* --------------------------------------------------------------------------
Tests
-------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_tier_name --

    #[test]
    fn valid_tier_names_accepted() {
        assert!(validate_tier_name(TIER_DRAFT).is_ok());
        assert!(validate_tier_name(TIER_PREVIEW).is_ok());
        assert!(validate_tier_name(TIER_PRODUCTION).is_ok());
    }

    #[test]
    fn unknown_tier_name_rejected() {
        let result = validate_tier_name("ultra");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Unknown resolution tier name"));
    }

    // -- validate_dimensions --

    #[test]
    fn valid_dimensions_accepted() {
        assert!(validate_dimensions(1920, 1080).is_ok());
        assert!(validate_dimensions(1, 1).is_ok());
        assert!(validate_dimensions(7680, 4320).is_ok());
    }

    #[test]
    fn zero_dimension_rejected() {
        assert!(validate_dimensions(0, 1080).is_err());
        assert!(validate_dimensions(1920, 0).is_err());
    }

    #[test]
    fn negative_dimension_rejected() {
        assert!(validate_dimensions(-1, 1080).is_err());
        assert!(validate_dimensions(1920, -1).is_err());
    }

    #[test]
    fn oversized_dimension_rejected() {
        let result = validate_dimensions(7681, 1080);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("must not exceed 7680"));
    }

    // -- validate_speed_factor --

    #[test]
    fn positive_speed_factor_accepted() {
        assert!(validate_speed_factor(1.0).is_ok());
        assert!(validate_speed_factor(5.0).is_ok());
        assert!(validate_speed_factor(0.1).is_ok());
    }

    #[test]
    fn zero_speed_factor_rejected() {
        assert!(validate_speed_factor(0.0).is_err());
    }

    #[test]
    fn negative_speed_factor_rejected() {
        assert!(validate_speed_factor(-1.0).is_err());
    }

    // -- can_upscale --

    #[test]
    fn upscale_to_higher_tier_allowed() {
        assert!(can_upscale(TIER_ID_DRAFT, TIER_ID_PREVIEW).is_ok());
        assert!(can_upscale(TIER_ID_DRAFT, TIER_ID_PRODUCTION).is_ok());
        assert!(can_upscale(TIER_ID_PREVIEW, TIER_ID_PRODUCTION).is_ok());
    }

    #[test]
    fn upscale_to_same_tier_rejected() {
        assert!(can_upscale(TIER_ID_PRODUCTION, TIER_ID_PRODUCTION).is_err());
    }

    #[test]
    fn downscale_rejected() {
        assert!(can_upscale(TIER_ID_PRODUCTION, TIER_ID_DRAFT).is_err());
    }

    // -- is_production_tier --

    #[test]
    fn production_tier_detected() {
        assert!(is_production_tier(TIER_ID_PRODUCTION));
        assert!(!is_production_tier(TIER_ID_DRAFT));
        assert!(!is_production_tier(TIER_ID_PREVIEW));
    }

    // -- validate_delivery_tier --

    #[test]
    fn production_tier_delivery_allowed() {
        assert!(validate_delivery_tier(TIER_ID_PRODUCTION).is_ok());
    }

    #[test]
    fn non_production_tier_delivery_rejected() {
        assert!(validate_delivery_tier(TIER_ID_DRAFT).is_err());
        assert!(validate_delivery_tier(TIER_ID_PREVIEW).is_err());
    }
}
