//! Video specification validation (PRD-113).
//!
//! Validates video file properties against a specification, reporting
//! any violations (resolution mismatch, framerate mismatch, etc.).

use serde::Serialize;

/// Detected properties of a video file.
#[derive(Debug, Clone)]
pub struct VideoProperties {
    /// Path to the video file (for reporting).
    pub file_path: String,
    /// Detected framerate (fps).
    pub framerate: Option<f64>,
    /// Duration in seconds.
    pub duration_secs: Option<f64>,
    /// Width in pixels.
    pub width: Option<i32>,
    /// Height in pixels.
    pub height: Option<i32>,
    /// Video codec (e.g. "h264", "h265").
    pub codec: Option<String>,
    /// Container format (e.g. "mp4", "mkv").
    pub container: Option<String>,
    /// File size in bytes.
    pub file_size_bytes: Option<i64>,
}

/// Target video specification to validate against.
#[derive(Debug, Clone)]
pub struct VideoSpec {
    pub framerate: Option<f64>,
    pub min_duration_secs: Option<f64>,
    pub max_duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
}

/// Result of validating a video against a spec.
#[derive(Debug, Clone, Serialize)]
pub struct VideoValidationResult {
    /// Whether the video meets all spec requirements.
    pub is_valid: bool,
    /// List of violations, if any.
    pub violations: Vec<VideoSpecViolation>,
}

/// A single spec violation.
#[derive(Debug, Clone, Serialize)]
pub struct VideoSpecViolation {
    /// The property that failed validation.
    pub field: String,
    /// Expected value from the spec.
    pub expected: String,
    /// Actual value from the video.
    pub actual: String,
    /// Human-readable description.
    pub message: String,
}

/// Framerate tolerance for floating-point comparison (0.5 fps).
const FRAMERATE_TOLERANCE: f64 = 0.5;

/// Validate video properties against a specification.
///
/// Only checks properties that are defined in the spec. If a spec field is
/// `None`, that property is not validated.
pub fn validate_video(props: &VideoProperties, spec: &VideoSpec) -> VideoValidationResult {
    let mut violations = Vec::new();

    // Framerate check.
    if let (Some(expected), Some(actual)) = (spec.framerate, props.framerate) {
        if (expected - actual).abs() > FRAMERATE_TOLERANCE {
            violations.push(VideoSpecViolation {
                field: "framerate".to_string(),
                expected: format!("{expected} fps"),
                actual: format!("{actual} fps"),
                message: format!("Framerate mismatch: expected {expected} fps, got {actual} fps"),
            });
        }
    }

    // Duration range check.
    if let Some(actual_dur) = props.duration_secs {
        if let Some(min_dur) = spec.min_duration_secs {
            if actual_dur < min_dur {
                violations.push(VideoSpecViolation {
                    field: "duration".to_string(),
                    expected: format!(">= {min_dur}s"),
                    actual: format!("{actual_dur}s"),
                    message: format!("Duration {actual_dur}s is below minimum {min_dur}s"),
                });
            }
        }
        if let Some(max_dur) = spec.max_duration_secs {
            if actual_dur > max_dur {
                violations.push(VideoSpecViolation {
                    field: "duration".to_string(),
                    expected: format!("<= {max_dur}s"),
                    actual: format!("{actual_dur}s"),
                    message: format!("Duration {actual_dur}s exceeds maximum {max_dur}s"),
                });
            }
        }
    }

    // Resolution check.
    if let (Some(expected_w), Some(actual_w)) = (spec.width, props.width) {
        if expected_w != actual_w {
            violations.push(VideoSpecViolation {
                field: "width".to_string(),
                expected: format!("{expected_w}px"),
                actual: format!("{actual_w}px"),
                message: format!("Width mismatch: expected {expected_w}px, got {actual_w}px"),
            });
        }
    }
    if let (Some(expected_h), Some(actual_h)) = (spec.height, props.height) {
        if expected_h != actual_h {
            violations.push(VideoSpecViolation {
                field: "height".to_string(),
                expected: format!("{expected_h}px"),
                actual: format!("{actual_h}px"),
                message: format!("Height mismatch: expected {expected_h}px, got {actual_h}px"),
            });
        }
    }

    // Codec check (case-insensitive).
    if let (Some(ref expected), Some(ref actual)) = (&spec.codec, &props.codec) {
        if expected.to_lowercase() != actual.to_lowercase() {
            violations.push(VideoSpecViolation {
                field: "codec".to_string(),
                expected: expected.clone(),
                actual: actual.clone(),
                message: format!("Codec mismatch: expected '{expected}', got '{actual}'"),
            });
        }
    }

    // Container check (case-insensitive).
    if let (Some(ref expected), Some(ref actual)) = (&spec.container, &props.container) {
        if expected.to_lowercase() != actual.to_lowercase() {
            violations.push(VideoSpecViolation {
                field: "container".to_string(),
                expected: expected.clone(),
                actual: actual.clone(),
                message: format!("Container mismatch: expected '{expected}', got '{actual}'"),
            });
        }
    }

    // File size check.
    if let (Some(max_size), Some(actual_size)) = (spec.max_file_size_bytes, props.file_size_bytes) {
        if actual_size > max_size {
            violations.push(VideoSpecViolation {
                field: "file_size".to_string(),
                expected: format!("<= {max_size} bytes"),
                actual: format!("{actual_size} bytes"),
                message: format!("File size {actual_size} bytes exceeds maximum {max_size} bytes"),
            });
        }
    }

    let is_valid = violations.is_empty();

    VideoValidationResult {
        is_valid,
        violations,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_props() -> VideoProperties {
        VideoProperties {
            file_path: "test.mp4".to_string(),
            framerate: Some(30.0),
            duration_secs: Some(5.0),
            width: Some(1920),
            height: Some(1080),
            codec: Some("h264".to_string()),
            container: Some("mp4".to_string()),
            file_size_bytes: Some(1_000_000),
        }
    }

    fn base_spec() -> VideoSpec {
        VideoSpec {
            framerate: Some(30.0),
            min_duration_secs: Some(1.0),
            max_duration_secs: Some(10.0),
            width: Some(1920),
            height: Some(1080),
            codec: Some("h264".to_string()),
            container: Some("mp4".to_string()),
            max_file_size_bytes: Some(10_000_000),
        }
    }

    #[test]
    fn all_pass() {
        let result = validate_video(&base_props(), &base_spec());
        assert!(result.is_valid);
        assert!(result.violations.is_empty());
    }

    #[test]
    fn framerate_mismatch() {
        let mut props = base_props();
        props.framerate = Some(24.0);
        let result = validate_video(&props, &base_spec());
        assert!(!result.is_valid);
        assert_eq!(result.violations[0].field, "framerate");
    }

    #[test]
    fn framerate_within_tolerance() {
        let mut props = base_props();
        props.framerate = Some(30.3);
        let result = validate_video(&props, &base_spec());
        assert!(result.is_valid);
    }

    #[test]
    fn duration_below_min() {
        let mut props = base_props();
        props.duration_secs = Some(0.5);
        let result = validate_video(&props, &base_spec());
        assert!(!result.is_valid);
        assert!(result.violations[0].message.contains("below minimum"));
    }

    #[test]
    fn duration_above_max() {
        let mut props = base_props();
        props.duration_secs = Some(15.0);
        let result = validate_video(&props, &base_spec());
        assert!(!result.is_valid);
        assert!(result.violations[0].message.contains("exceeds maximum"));
    }

    #[test]
    fn resolution_mismatch() {
        let mut props = base_props();
        props.width = Some(1280);
        props.height = Some(720);
        let result = validate_video(&props, &base_spec());
        assert!(!result.is_valid);
        assert_eq!(result.violations.len(), 2);
    }

    #[test]
    fn codec_mismatch() {
        let mut props = base_props();
        props.codec = Some("h265".to_string());
        let result = validate_video(&props, &base_spec());
        assert!(!result.is_valid);
        assert_eq!(result.violations[0].field, "codec");
    }

    #[test]
    fn codec_case_insensitive() {
        let mut props = base_props();
        props.codec = Some("H264".to_string());
        let result = validate_video(&props, &base_spec());
        assert!(result.is_valid);
    }

    #[test]
    fn file_size_exceeded() {
        let mut props = base_props();
        props.file_size_bytes = Some(20_000_000);
        let result = validate_video(&props, &base_spec());
        assert!(!result.is_valid);
        assert_eq!(result.violations[0].field, "file_size");
    }

    #[test]
    fn all_none_spec_passes() {
        let spec = VideoSpec {
            framerate: None,
            min_duration_secs: None,
            max_duration_secs: None,
            width: None,
            height: None,
            codec: None,
            container: None,
            max_file_size_bytes: None,
        };
        let result = validate_video(&base_props(), &spec);
        assert!(result.is_valid);
        assert!(result.violations.is_empty());
    }

    #[test]
    fn all_none_props_with_spec() {
        let props = VideoProperties {
            file_path: "test.mp4".to_string(),
            framerate: None,
            duration_secs: None,
            width: None,
            height: None,
            codec: None,
            container: None,
            file_size_bytes: None,
        };
        let result = validate_video(&props, &base_spec());
        // Properties are unknown, so no violations (cannot check what we don't know).
        assert!(result.is_valid);
    }
}
