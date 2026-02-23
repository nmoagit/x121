//! Re-stitching constants, validation, and boundary quality logic (PRD-25).
//!
//! Provides SSIM thresholds, smoothing method definitions, boundary quality
//! classification, and downstream impact estimation for the Incremental
//! Re-stitching & Smoothing feature.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// SSIM threshold constants
// ---------------------------------------------------------------------------

/// Default SSIM threshold below which a boundary is considered discontinuous.
pub const DEFAULT_SSIM_THRESHOLD: f64 = 0.85;

/// SSIM threshold above which a boundary is considered good (no warning).
pub const SSIM_WARNING_THRESHOLD: f64 = 0.92;

// ---------------------------------------------------------------------------
// Smoothing method
// ---------------------------------------------------------------------------

/// Methods available for smoothing a boundary between adjacent segments.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmoothingMethod {
    /// Cross-fade overlapping frames at the boundary.
    FrameBlending,
    /// Re-extract the boundary frame from a wider temporal window.
    ReExtraction,
    /// Accept the boundary as-is without modification.
    ManualAccept,
}

/// String label for [`SmoothingMethod::FrameBlending`].
pub const SMOOTHING_FRAME_BLENDING: &str = "frame_blending";
/// String label for [`SmoothingMethod::ReExtraction`].
pub const SMOOTHING_RE_EXTRACTION: &str = "re_extraction";
/// String label for [`SmoothingMethod::ManualAccept`].
pub const SMOOTHING_MANUAL_ACCEPT: &str = "manual_accept";

/// All valid smoothing method labels.
pub const VALID_SMOOTHING_METHODS: &[&str] = &[
    SMOOTHING_FRAME_BLENDING,
    SMOOTHING_RE_EXTRACTION,
    SMOOTHING_MANUAL_ACCEPT,
];

// ---------------------------------------------------------------------------
// Boundary position
// ---------------------------------------------------------------------------

/// Which side of a segment the boundary refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundaryPosition {
    /// The transition from the previous segment into this segment.
    Before,
    /// The transition from this segment into the next segment.
    After,
}

// ---------------------------------------------------------------------------
// Boundary quality classification
// ---------------------------------------------------------------------------

/// Qualitative rating of a boundary based on SSIM score.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundaryQuality {
    /// SSIM >= warning threshold — seamless transition.
    Good,
    /// SSIM >= fail threshold but < warning threshold — acceptable, minor artifacts possible.
    Warning,
    /// SSIM < fail threshold — visible discontinuity, smoothing recommended.
    Discontinuity,
}

/// Classify boundary quality based on SSIM score and threshold.
///
/// - `Good` when `ssim >= SSIM_WARNING_THRESHOLD`
/// - `Warning` when `ssim >= threshold` (the fail threshold)
/// - `Discontinuity` when `ssim < threshold`
pub fn classify_boundary_quality(ssim: f64, threshold: f64) -> BoundaryQuality {
    if ssim >= SSIM_WARNING_THRESHOLD {
        BoundaryQuality::Good
    } else if ssim >= threshold {
        BoundaryQuality::Warning
    } else {
        BoundaryQuality::Discontinuity
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that an SSIM threshold is within the valid range `[0.0, 1.0]`.
pub fn validate_ssim_threshold(threshold: f64) -> Result<(), CoreError> {
    crate::threshold_validation::validate_unit_range(threshold, "SSIM threshold")
}

/// Parse and validate a smoothing method string.
pub fn validate_smoothing_method(method: &str) -> Result<SmoothingMethod, CoreError> {
    match method {
        SMOOTHING_FRAME_BLENDING => Ok(SmoothingMethod::FrameBlending),
        SMOOTHING_RE_EXTRACTION => Ok(SmoothingMethod::ReExtraction),
        SMOOTHING_MANUAL_ACCEPT => Ok(SmoothingMethod::ManualAccept),
        _ => Err(CoreError::Validation(format!(
            "Unknown smoothing method: '{method}'. Valid methods: {}",
            VALID_SMOOTHING_METHODS.join(", ")
        ))),
    }
}

// ---------------------------------------------------------------------------
// Downstream impact estimation
// ---------------------------------------------------------------------------

/// Estimate how many downstream segments are affected by regenerating a
/// segment at the given index within a scene of `total_segments` segments.
///
/// Returns the count of segments after the regenerated one.
pub fn estimate_downstream_impact(segment_index: i32, total_segments: i32) -> i32 {
    if segment_index >= total_segments - 1 {
        0
    } else {
        total_segments - segment_index - 1
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- classify_boundary_quality ------------------------------------------

    #[test]
    fn quality_good_above_warning_threshold() {
        assert_eq!(
            classify_boundary_quality(0.95, DEFAULT_SSIM_THRESHOLD),
            BoundaryQuality::Good,
        );
    }

    #[test]
    fn quality_good_at_warning_threshold() {
        assert_eq!(
            classify_boundary_quality(SSIM_WARNING_THRESHOLD, DEFAULT_SSIM_THRESHOLD),
            BoundaryQuality::Good,
        );
    }

    #[test]
    fn quality_warning_between_thresholds() {
        assert_eq!(
            classify_boundary_quality(0.88, DEFAULT_SSIM_THRESHOLD),
            BoundaryQuality::Warning,
        );
    }

    #[test]
    fn quality_warning_at_fail_threshold() {
        assert_eq!(
            classify_boundary_quality(DEFAULT_SSIM_THRESHOLD, DEFAULT_SSIM_THRESHOLD),
            BoundaryQuality::Warning,
        );
    }

    #[test]
    fn quality_discontinuity_below_threshold() {
        assert_eq!(
            classify_boundary_quality(0.70, DEFAULT_SSIM_THRESHOLD),
            BoundaryQuality::Discontinuity,
        );
    }

    // -- validate_ssim_threshold --------------------------------------------

    #[test]
    fn valid_ssim_thresholds() {
        assert!(validate_ssim_threshold(0.0).is_ok());
        assert!(validate_ssim_threshold(0.85).is_ok());
        assert!(validate_ssim_threshold(1.0).is_ok());
    }

    #[test]
    fn invalid_ssim_threshold_negative() {
        assert!(validate_ssim_threshold(-0.01).is_err());
    }

    #[test]
    fn invalid_ssim_threshold_above_one() {
        assert!(validate_ssim_threshold(1.01).is_err());
    }

    // -- validate_smoothing_method ------------------------------------------

    #[test]
    fn valid_smoothing_methods() {
        assert_eq!(
            validate_smoothing_method("frame_blending").unwrap(),
            SmoothingMethod::FrameBlending,
        );
        assert_eq!(
            validate_smoothing_method("re_extraction").unwrap(),
            SmoothingMethod::ReExtraction,
        );
        assert_eq!(
            validate_smoothing_method("manual_accept").unwrap(),
            SmoothingMethod::ManualAccept,
        );
    }

    #[test]
    fn invalid_smoothing_method() {
        assert!(validate_smoothing_method("unknown").is_err());
    }

    // -- estimate_downstream_impact -----------------------------------------

    #[test]
    fn impact_middle_segment() {
        // Regenerating segment 3 in a 10-segment scene affects 6 downstream.
        assert_eq!(estimate_downstream_impact(3, 10), 6);
    }

    #[test]
    fn impact_first_segment() {
        assert_eq!(estimate_downstream_impact(0, 10), 9);
    }

    #[test]
    fn impact_last_segment() {
        assert_eq!(estimate_downstream_impact(9, 10), 0);
    }

    #[test]
    fn impact_single_segment_scene() {
        assert_eq!(estimate_downstream_impact(0, 1), 0);
    }
}
