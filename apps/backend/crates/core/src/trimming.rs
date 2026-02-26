//! Segment Trimming & Frame-Level Editing constants and validation (PRD-78).
//!
//! Provides constants for trim bounds, preset definitions, and validation
//! functions used by the API layer for in/out point trimming of segments.

use crate::error::CoreError;
use crate::threshold_validation::validate_count_range;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum number of frames that must remain after trimming.
pub const MIN_TRIMMED_FRAMES: i32 = 1;

/// Available preset frame counts for quick trim actions.
pub const MAX_TRIM_PRESETS: &[i32] = &[3, 5, 10];

/// Default preset value for quick trims (in frames).
pub const DEFAULT_TRIM_PRESET: i32 = 5;

/// Maximum number of segments in a single batch trim request.
pub const MAX_BATCH_TRIM_SIZE: usize = 100;

// ---------------------------------------------------------------------------
// Trim preset
// ---------------------------------------------------------------------------

/// A quick-trim preset that trims from the beginning or end of a segment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrimPreset {
    /// Keep only the first N frames.
    First(i32),
    /// Keep only the last N frames.
    Last(i32),
}

impl TrimPreset {
    /// Apply this preset to a segment with `total_frames` frames.
    ///
    /// Returns `(in_frame, out_frame)` representing the trimmed range.
    pub fn apply(&self, total_frames: i32) -> (i32, i32) {
        match *self {
            Self::First(n) => {
                let out = n.min(total_frames);
                (0, out)
            }
            Self::Last(n) => {
                let kept = n.min(total_frames);
                (total_frames - kept, total_frames)
            }
        }
    }

    /// Parse a preset string like `"first_5"` or `"last_10"` into a `TrimPreset`.
    pub fn parse(s: &str) -> Result<Self, CoreError> {
        let parts: Vec<&str> = s.split('_').collect();
        if parts.len() != 2 {
            return Err(CoreError::Validation(format!(
                "Invalid preset format: '{s}'. Expected 'first_N' or 'last_N'"
            )));
        }

        let frames: i32 = parts[1]
            .parse()
            .map_err(|_| CoreError::Validation(format!("Invalid frame count in preset: '{s}'")))?;

        match parts[0] {
            "first" => Ok(Self::First(frames)),
            "last" => Ok(Self::Last(frames)),
            _ => Err(CoreError::Validation(format!(
                "Invalid preset direction in '{s}'. Expected 'first' or 'last'"
            ))),
        }
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that trim in/out points are within valid bounds.
///
/// Checks:
/// - `in_frame >= 0`
/// - `out_frame > in_frame` (at least 1 frame)
/// - `out_frame <= total_frames`
/// - `(out_frame - in_frame) >= MIN_TRIMMED_FRAMES`
pub fn validate_trim_points(
    in_frame: i32,
    out_frame: i32,
    total_frames: i32,
) -> Result<(), CoreError> {
    if in_frame < 0 {
        return Err(CoreError::Validation(format!(
            "in_frame must be >= 0, got {in_frame}"
        )));
    }
    if out_frame <= in_frame {
        return Err(CoreError::Validation(format!(
            "out_frame ({out_frame}) must be greater than in_frame ({in_frame})"
        )));
    }
    if out_frame > total_frames {
        return Err(CoreError::Validation(format!(
            "out_frame ({out_frame}) exceeds total_frames ({total_frames})"
        )));
    }
    let trimmed = out_frame - in_frame;
    if trimmed < MIN_TRIMMED_FRAMES {
        return Err(CoreError::Validation(format!(
            "Trimmed frame count ({trimmed}) is below minimum of {MIN_TRIMMED_FRAMES}"
        )));
    }
    Ok(())
}

/// Validate that a batch trim size is within allowed bounds.
///
/// Delegates to [`validate_count_range`] from the shared threshold validation
/// module to avoid structural duplication (DRY-277).
pub fn validate_batch_trim_size(count: usize) -> Result<(), CoreError> {
    validate_count_range(count, MAX_BATCH_TRIM_SIZE, "Batch trim")
}

/// Validate that a preset frame value is positive.
pub fn validate_preset_value(frames: i32) -> Result<(), CoreError> {
    if frames <= 0 {
        return Err(CoreError::Validation(format!(
            "Preset frame count must be positive, got {frames}"
        )));
    }
    Ok(())
}

/// Compute the number of frames remaining after a trim.
pub fn compute_trimmed_frame_count(in_frame: i32, out_frame: i32) -> i32 {
    out_frame - in_frame
}

/// Compute the seed frame index after trimming.
///
/// The seed frame for the next segment is the last frame of the trimmed
/// region, i.e. `out_frame - 1`.
pub fn seed_frame_after_trim(out_frame: i32) -> i32 {
    out_frame - 1
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_trim_points ------------------------------------------------

    #[test]
    fn valid_trim_full_range() {
        assert!(validate_trim_points(0, 100, 100).is_ok());
    }

    #[test]
    fn valid_trim_partial_range() {
        assert!(validate_trim_points(10, 90, 100).is_ok());
    }

    #[test]
    fn valid_trim_single_frame() {
        assert!(validate_trim_points(5, 6, 100).is_ok());
    }

    #[test]
    fn rejects_negative_in_frame() {
        assert!(validate_trim_points(-1, 50, 100).is_err());
    }

    #[test]
    fn rejects_out_frame_equal_to_in_frame() {
        assert!(validate_trim_points(50, 50, 100).is_err());
    }

    #[test]
    fn rejects_out_frame_less_than_in_frame() {
        assert!(validate_trim_points(60, 50, 100).is_err());
    }

    #[test]
    fn rejects_out_frame_exceeding_total_frames() {
        assert!(validate_trim_points(0, 101, 100).is_err());
    }

    #[test]
    fn valid_trim_at_boundaries() {
        // First frame to last frame
        assert!(validate_trim_points(0, 1, 1).is_ok());
    }

    // -- validate_batch_trim_size --------------------------------------------

    #[test]
    fn valid_batch_trim_size() {
        assert!(validate_batch_trim_size(1).is_ok());
        assert!(validate_batch_trim_size(50).is_ok());
        assert!(validate_batch_trim_size(MAX_BATCH_TRIM_SIZE).is_ok());
    }

    #[test]
    fn rejects_empty_batch_trim() {
        assert!(validate_batch_trim_size(0).is_err());
    }

    #[test]
    fn rejects_batch_trim_above_max() {
        assert!(validate_batch_trim_size(MAX_BATCH_TRIM_SIZE + 1).is_err());
    }

    // -- validate_preset_value -----------------------------------------------

    #[test]
    fn valid_preset_values() {
        assert!(validate_preset_value(1).is_ok());
        assert!(validate_preset_value(5).is_ok());
        assert!(validate_preset_value(10).is_ok());
    }

    #[test]
    fn rejects_zero_preset() {
        assert!(validate_preset_value(0).is_err());
    }

    #[test]
    fn rejects_negative_preset() {
        assert!(validate_preset_value(-3).is_err());
    }

    // -- compute_trimmed_frame_count -----------------------------------------

    #[test]
    fn compute_full_range() {
        assert_eq!(compute_trimmed_frame_count(0, 100), 100);
    }

    #[test]
    fn compute_partial_range() {
        assert_eq!(compute_trimmed_frame_count(10, 90), 80);
    }

    #[test]
    fn compute_single_frame() {
        assert_eq!(compute_trimmed_frame_count(5, 6), 1);
    }

    // -- seed_frame_after_trim -----------------------------------------------

    #[test]
    fn seed_frame_at_end() {
        assert_eq!(seed_frame_after_trim(100), 99);
    }

    #[test]
    fn seed_frame_at_small_trim() {
        assert_eq!(seed_frame_after_trim(6), 5);
    }

    #[test]
    fn seed_frame_at_one() {
        assert_eq!(seed_frame_after_trim(1), 0);
    }

    // -- TrimPreset ----------------------------------------------------------

    #[test]
    fn preset_first_applies_correctly() {
        let preset = TrimPreset::First(5);
        assert_eq!(preset.apply(100), (0, 5));
    }

    #[test]
    fn preset_last_applies_correctly() {
        let preset = TrimPreset::Last(5);
        assert_eq!(preset.apply(100), (95, 100));
    }

    #[test]
    fn preset_first_clamped_to_total() {
        let preset = TrimPreset::First(200);
        assert_eq!(preset.apply(100), (0, 100));
    }

    #[test]
    fn preset_last_clamped_to_total() {
        let preset = TrimPreset::Last(200);
        assert_eq!(preset.apply(100), (0, 100));
    }

    #[test]
    fn preset_parse_first_5() {
        let preset = TrimPreset::parse("first_5").unwrap();
        assert_eq!(preset, TrimPreset::First(5));
    }

    #[test]
    fn preset_parse_last_10() {
        let preset = TrimPreset::parse("last_10").unwrap();
        assert_eq!(preset, TrimPreset::Last(10));
    }

    #[test]
    fn preset_parse_invalid_format() {
        assert!(TrimPreset::parse("invalid").is_err());
    }

    #[test]
    fn preset_parse_invalid_direction() {
        assert!(TrimPreset::parse("middle_5").is_err());
    }

    #[test]
    fn preset_parse_invalid_number() {
        assert!(TrimPreset::parse("first_abc").is_err());
    }
}
