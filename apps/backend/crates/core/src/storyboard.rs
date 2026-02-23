//! Storyboard View & Scene Thumbnails constants and validation (PRD-62).
//!
//! Provides constants for keyframe extraction intervals, thumbnail sizes,
//! limits, and validation functions used by the API and pipeline layers.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Keyframe interval constants
// ---------------------------------------------------------------------------

/// Default interval between extracted keyframes in seconds.
pub const DEFAULT_KEYFRAME_INTERVAL_SECS: f64 = 2.0;

/// Minimum allowed keyframe interval in seconds.
pub const MIN_KEYFRAME_INTERVAL_SECS: f64 = 0.5;

// ---------------------------------------------------------------------------
// Thumbnail constants
// ---------------------------------------------------------------------------

/// Default thumbnail height in pixels (width auto-scales to aspect ratio).
pub const DEFAULT_THUMBNAIL_HEIGHT: i32 = 200;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// Maximum number of keyframes allowed per segment.
pub const MAX_KEYFRAMES_PER_SEGMENT: usize = 500;

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that a keyframe interval is within allowed bounds.
///
/// The interval must be a positive number >= [`MIN_KEYFRAME_INTERVAL_SECS`].
/// NaN and infinity are rejected.
pub fn validate_keyframe_interval(interval: f64) -> Result<(), CoreError> {
    if interval.is_nan() || interval.is_infinite() {
        return Err(CoreError::Validation(
            "keyframe interval must be a finite number".to_string(),
        ));
    }
    if interval < MIN_KEYFRAME_INTERVAL_SECS {
        return Err(CoreError::Validation(format!(
            "keyframe interval must be >= {MIN_KEYFRAME_INTERVAL_SECS}, got {interval}"
        )));
    }
    Ok(())
}

/// Validate that a frame number is non-negative.
///
/// Frame numbers are zero-indexed; negative values are invalid.
pub fn validate_frame_number(frame: i32) -> Result<(), CoreError> {
    if frame < 0 {
        return Err(CoreError::Validation(format!(
            "frame_number must be >= 0, got {frame}"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_keyframe_interval ------------------------------------------

    #[test]
    fn valid_interval_at_minimum() {
        assert!(validate_keyframe_interval(MIN_KEYFRAME_INTERVAL_SECS).is_ok());
    }

    #[test]
    fn valid_interval_at_default() {
        assert!(validate_keyframe_interval(DEFAULT_KEYFRAME_INTERVAL_SECS).is_ok());
    }

    #[test]
    fn valid_interval_large_value() {
        assert!(validate_keyframe_interval(60.0).is_ok());
    }

    #[test]
    fn rejects_interval_below_minimum() {
        assert!(validate_keyframe_interval(0.1).is_err());
    }

    #[test]
    fn rejects_zero_interval() {
        assert!(validate_keyframe_interval(0.0).is_err());
    }

    #[test]
    fn rejects_negative_interval() {
        assert!(validate_keyframe_interval(-1.0).is_err());
    }

    #[test]
    fn rejects_nan_interval() {
        assert!(validate_keyframe_interval(f64::NAN).is_err());
    }

    #[test]
    fn rejects_infinite_interval() {
        assert!(validate_keyframe_interval(f64::INFINITY).is_err());
    }

    // -- validate_frame_number -----------------------------------------------

    #[test]
    fn valid_frame_number_zero() {
        assert!(validate_frame_number(0).is_ok());
    }

    #[test]
    fn valid_frame_number_positive() {
        assert!(validate_frame_number(100).is_ok());
    }

    #[test]
    fn rejects_negative_frame_number() {
        assert!(validate_frame_number(-1).is_err());
    }

    #[test]
    fn rejects_large_negative_frame_number() {
        assert!(validate_frame_number(-999).is_err());
    }
}
