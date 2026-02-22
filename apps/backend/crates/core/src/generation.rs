//! Generation loop constants, stop-decision logic, and validation (PRD-24).
//!
//! Reuses [`ClipPosition`] from [`crate::scene_type_config`] for prompt
//! position determination.  Frame extraction utilities live in
//! [`crate::ffmpeg`] and are *not* re-exported here to avoid duplication.

use crate::error::CoreError;
use crate::scene_type_config::ClipPosition;

// ---------------------------------------------------------------------------
// Boundary selection modes
// ---------------------------------------------------------------------------

/// Select boundary frame automatically (last N frames scored by quality).
pub const BOUNDARY_AUTO: &str = "auto";
/// User manually picks the boundary frame.
pub const BOUNDARY_MANUAL: &str = "manual";
/// Always use the very last frame as the boundary.
pub const BOUNDARY_LAST: &str = "last";

/// All valid boundary selection modes.
pub const VALID_BOUNDARY_MODES: &[&str] = &[BOUNDARY_AUTO, BOUNDARY_MANUAL, BOUNDARY_LAST];

// ---------------------------------------------------------------------------
// Generation defaults
// ---------------------------------------------------------------------------

/// Default length of each generated segment in seconds.
pub const DEFAULT_SEGMENT_DURATION_SECS: f64 = 5.0;
/// Allowed overshoot past target duration before forcing a stop.
pub const DEFAULT_ELASTIC_TOLERANCE_SECS: f64 = 2.0;
/// Hard ceiling on segments per scene to prevent runaway loops.
pub const MAX_SEGMENTS_PER_SCENE: u32 = 200;
/// Number of trailing frames inspected for automatic boundary selection.
pub const BOUNDARY_FRAME_COUNT: u32 = 10;

// ---------------------------------------------------------------------------
// Stop decision
// ---------------------------------------------------------------------------

/// Result of evaluating whether the generation loop should continue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopDecision {
    /// More segments are needed — keep generating.
    Continue,
    /// Cumulative duration is within tolerance — okay to stop, not required.
    ElasticStop,
    /// Cumulative duration has reached or exceeded the hard limit — stop now.
    Stop,
}

/// Decide whether the generation loop should continue, allow an elastic stop,
/// or force-stop.
///
/// - **Continue**: `cumulative + current < target - tolerance`
/// - **ElasticStop**: `target - tolerance <= cumulative + current < target + tolerance`
/// - **Stop**: `cumulative + current >= target + tolerance`
pub fn should_stop_generation(
    cumulative_duration: f64,
    target_duration: f64,
    tolerance: f64,
    current_segment_duration: f64,
) -> StopDecision {
    let total = cumulative_duration + current_segment_duration;
    if total >= target_duration + tolerance {
        StopDecision::Stop
    } else if total >= target_duration - tolerance {
        StopDecision::ElasticStop
    } else {
        StopDecision::Continue
    }
}

// ---------------------------------------------------------------------------
// Clip position determination
// ---------------------------------------------------------------------------

/// Determine the [`ClipPosition`] for a segment based on its index and the
/// estimated total number of segments.
///
/// - Index 0 with total == 1 -> `FullClip`
/// - Index 0 with total > 1 -> `StartClip`
/// - Any other index -> `ContinuationClip`
pub fn determine_clip_position(segment_index: u32, total_estimated: u32) -> ClipPosition {
    if segment_index == 0 {
        if total_estimated <= 1 {
            ClipPosition::FullClip
        } else {
            ClipPosition::StartClip
        }
    } else {
        ClipPosition::ContinuationClip
    }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate that a boundary selection mode is one of the known constants.
pub fn validate_boundary_mode(mode: &str) -> Result<(), CoreError> {
    if VALID_BOUNDARY_MODES.contains(&mode) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid boundary mode '{mode}'. Must be one of: {}",
            VALID_BOUNDARY_MODES.join(", ")
        )))
    }
}

/// Estimate the number of segments required to fill `target_duration_secs`
/// given a fixed `segment_duration_secs`.
///
/// Always returns at least 1. The result is capped at [`MAX_SEGMENTS_PER_SCENE`].
pub fn estimate_segments(target_duration_secs: f64, segment_duration_secs: f64) -> u32 {
    if segment_duration_secs <= 0.0 || target_duration_secs <= 0.0 {
        return 1;
    }
    let raw = (target_duration_secs / segment_duration_secs).ceil() as u32;
    raw.clamp(1, MAX_SEGMENTS_PER_SCENE)
}

/// Validate pre-conditions before starting generation for a scene.
///
/// - The scene must have a seed image variant (`has_seed_variant`).
/// - A positive `target_duration` must be set.
pub fn validate_generation_start(
    has_seed_variant: bool,
    target_duration: Option<f64>,
) -> Result<(), CoreError> {
    if !has_seed_variant {
        return Err(CoreError::Validation(
            "Scene must have a seed image variant before generation can start".to_string(),
        ));
    }
    match target_duration {
        None => Err(CoreError::Validation(
            "target_duration must be set before generation can start".to_string(),
        )),
        Some(d) if d <= 0.0 => Err(CoreError::Validation(
            "target_duration must be positive".to_string(),
        )),
        Some(_) => Ok(()),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Stop decisions --

    #[test]
    fn stop_continues_when_well_under_target() {
        assert_eq!(
            should_stop_generation(5.0, 30.0, 2.0, 5.0),
            StopDecision::Continue
        );
    }

    #[test]
    fn stop_elastic_when_within_tolerance_below() {
        // cumulative=25 + current=5 = 30 which is in [28,32]
        assert_eq!(
            should_stop_generation(25.0, 30.0, 2.0, 5.0),
            StopDecision::ElasticStop
        );
    }

    #[test]
    fn stop_elastic_at_exact_lower_bound() {
        // cumulative=23 + current=5 = 28 == target - tolerance
        assert_eq!(
            should_stop_generation(23.0, 30.0, 2.0, 5.0),
            StopDecision::ElasticStop
        );
    }

    #[test]
    fn stop_forced_when_exceeds_upper_bound() {
        // cumulative=28 + current=5 = 33 >= 32
        assert_eq!(
            should_stop_generation(28.0, 30.0, 2.0, 5.0),
            StopDecision::Stop
        );
    }

    #[test]
    fn stop_forced_at_exact_upper_bound() {
        // cumulative=27 + current=5 = 32 == target + tolerance
        assert_eq!(
            should_stop_generation(27.0, 30.0, 2.0, 5.0),
            StopDecision::Stop
        );
    }

    // -- Clip position --

    #[test]
    fn clip_position_full_when_single_segment() {
        assert_eq!(determine_clip_position(0, 1), ClipPosition::FullClip);
    }

    #[test]
    fn clip_position_start_for_first_of_many() {
        assert_eq!(determine_clip_position(0, 6), ClipPosition::StartClip);
    }

    #[test]
    fn clip_position_continuation_for_middle() {
        assert_eq!(
            determine_clip_position(3, 6),
            ClipPosition::ContinuationClip
        );
    }

    #[test]
    fn clip_position_continuation_for_last() {
        assert_eq!(
            determine_clip_position(5, 6),
            ClipPosition::ContinuationClip
        );
    }

    // -- Segment estimation --

    #[test]
    fn estimate_exact_fit() {
        assert_eq!(estimate_segments(30.0, 5.0), 6);
    }

    #[test]
    fn estimate_rounds_up() {
        assert_eq!(estimate_segments(31.0, 5.0), 7);
    }

    #[test]
    fn estimate_minimum_one() {
        assert_eq!(estimate_segments(0.5, 5.0), 1);
    }

    #[test]
    fn estimate_capped_at_max() {
        assert_eq!(estimate_segments(100_000.0, 1.0), MAX_SEGMENTS_PER_SCENE);
    }

    #[test]
    fn estimate_zero_duration_returns_one() {
        assert_eq!(estimate_segments(0.0, 5.0), 1);
    }

    // -- Validation --

    #[test]
    fn validate_boundary_mode_valid() {
        assert!(validate_boundary_mode("auto").is_ok());
        assert!(validate_boundary_mode("manual").is_ok());
        assert!(validate_boundary_mode("last").is_ok());
    }

    #[test]
    fn validate_boundary_mode_invalid() {
        assert!(validate_boundary_mode("random").is_err());
    }

    #[test]
    fn validate_generation_start_success() {
        assert!(validate_generation_start(true, Some(30.0)).is_ok());
    }

    #[test]
    fn validate_generation_start_no_seed() {
        assert!(validate_generation_start(false, Some(30.0)).is_err());
    }

    #[test]
    fn validate_generation_start_no_duration() {
        assert!(validate_generation_start(true, None).is_err());
    }

    #[test]
    fn validate_generation_start_zero_duration() {
        assert!(validate_generation_start(true, Some(0.0)).is_err());
    }
}
