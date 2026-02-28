//! Video compliance rule types, validation logic, and check functions (PRD-102).
//!
//! Provides constants for valid compliance rule types, individual check functions
//! for resolution, framerate, duration, filesize, and naming, and a summary
//! aggregator for batch compliance results.

use serde::Serialize;

// ---------------------------------------------------------------------------
// Rule type constants
// ---------------------------------------------------------------------------

/// Resolution compliance (e.g. minimum width/height).
pub const RULE_TYPE_RESOLUTION: &str = "resolution";

/// Framerate compliance (e.g. must be 30fps within tolerance).
pub const RULE_TYPE_FRAMERATE: &str = "framerate";

/// Codec compliance (e.g. must be h264).
pub const RULE_TYPE_CODEC: &str = "codec";

/// Duration compliance (e.g. within min/max seconds).
pub const RULE_TYPE_DURATION: &str = "duration";

/// Filesize compliance (e.g. must not exceed max bytes).
pub const RULE_TYPE_FILESIZE: &str = "filesize";

/// Naming convention compliance (regex pattern match).
pub const RULE_TYPE_NAMING: &str = "naming";

/// Custom compliance rule evaluated via config_json.
pub const RULE_TYPE_CUSTOM: &str = "custom";

/// All valid rule type values.
pub const VALID_RULE_TYPES: &[&str] = &[
    RULE_TYPE_RESOLUTION,
    RULE_TYPE_FRAMERATE,
    RULE_TYPE_CODEC,
    RULE_TYPE_DURATION,
    RULE_TYPE_FILESIZE,
    RULE_TYPE_NAMING,
    RULE_TYPE_CUSTOM,
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a rule type string is one of the accepted values.
pub fn validate_rule_type(rule_type: &str) -> Result<(), String> {
    if VALID_RULE_TYPES.contains(&rule_type) {
        Ok(())
    } else {
        Err(format!(
            "Invalid rule type '{rule_type}'. Must be one of: {}",
            VALID_RULE_TYPES.join(", ")
        ))
    }
}

// ---------------------------------------------------------------------------
// Check result types
// ---------------------------------------------------------------------------

/// The result of a single compliance check.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ComplianceResult {
    pub passed: bool,
    pub actual_value: String,
    pub expected_value: String,
    pub message: String,
}

/// Summary of multiple compliance check results.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ComplianceSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub pass_rate: f64,
}

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

/// Check that actual resolution meets minimum width and height requirements.
pub fn check_resolution(actual_w: u32, actual_h: u32, min_w: u32, min_h: u32) -> ComplianceResult {
    let passed = actual_w >= min_w && actual_h >= min_h;
    ComplianceResult {
        passed,
        actual_value: format!("{actual_w}x{actual_h}"),
        expected_value: format!(">={min_w}x{min_h}"),
        message: if passed {
            format!("Resolution {actual_w}x{actual_h} meets minimum {min_w}x{min_h}")
        } else {
            format!("Resolution {actual_w}x{actual_h} below minimum {min_w}x{min_h}")
        },
    }
}

/// Check that actual framerate matches the required value within a tolerance.
///
/// `tolerance` is an absolute value (e.g. 0.5 means +/- 0.5 fps).
pub fn check_framerate(actual: f64, required: f64, tolerance: f64) -> ComplianceResult {
    let diff = (actual - required).abs();
    let passed = diff <= tolerance;
    ComplianceResult {
        passed,
        actual_value: format!("{actual:.2}"),
        expected_value: format!("{required:.2} (±{tolerance:.2})"),
        message: if passed {
            format!("Framerate {actual:.2} fps within tolerance of {required:.2} fps")
        } else {
            format!(
                "Framerate {actual:.2} fps deviates by {diff:.2} from required {required:.2} fps (tolerance: ±{tolerance:.2})"
            )
        },
    }
}

/// Check that actual duration falls within the specified range.
pub fn check_duration(actual_secs: f64, min_secs: f64, max_secs: f64) -> ComplianceResult {
    let passed = actual_secs >= min_secs && actual_secs <= max_secs;
    ComplianceResult {
        passed,
        actual_value: format!("{actual_secs:.2}s"),
        expected_value: format!("{min_secs:.2}s - {max_secs:.2}s"),
        message: if passed {
            format!("Duration {actual_secs:.2}s within range [{min_secs:.2}s, {max_secs:.2}s]")
        } else if actual_secs < min_secs {
            format!("Duration {actual_secs:.2}s below minimum {min_secs:.2}s")
        } else {
            format!("Duration {actual_secs:.2}s exceeds maximum {max_secs:.2}s")
        },
    }
}

/// Check that actual file size does not exceed the maximum allowed bytes.
pub fn check_filesize(actual_bytes: u64, max_bytes: u64) -> ComplianceResult {
    let passed = actual_bytes <= max_bytes;
    ComplianceResult {
        passed,
        actual_value: format!("{actual_bytes}"),
        expected_value: format!("<={max_bytes}"),
        message: if passed {
            format!("File size {actual_bytes} bytes within limit of {max_bytes} bytes")
        } else {
            format!("File size {actual_bytes} bytes exceeds limit of {max_bytes} bytes")
        },
    }
}

/// Check that a filename matches the given regex pattern.
///
/// Returns a failure if the pattern is invalid regex or if the filename
/// does not match.
pub fn check_naming(filename: &str, pattern: &str) -> ComplianceResult {
    let re = match regex::Regex::new(pattern) {
        Ok(r) => r,
        Err(e) => {
            return ComplianceResult {
                passed: false,
                actual_value: filename.to_string(),
                expected_value: pattern.to_string(),
                message: format!("Invalid regex pattern: {e}"),
            };
        }
    };

    let passed = re.is_match(filename);
    ComplianceResult {
        passed,
        actual_value: filename.to_string(),
        expected_value: pattern.to_string(),
        message: if passed {
            format!("Filename '{filename}' matches pattern '{pattern}'")
        } else {
            format!("Filename '{filename}' does not match pattern '{pattern}'")
        },
    }
}

/// Aggregate multiple compliance results into a summary.
pub fn summarize_checks(results: &[ComplianceResult]) -> ComplianceSummary {
    let total = results.len();
    let passed = results.iter().filter(|r| r.passed).count();
    let failed = total - passed;
    let pass_rate = if total > 0 {
        passed as f64 / total as f64
    } else {
        0.0
    };

    ComplianceSummary {
        total,
        passed,
        failed,
        pass_rate,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_rule_type tests --

    #[test]
    fn test_valid_rule_types_accepted() {
        for rt in VALID_RULE_TYPES {
            assert!(
                validate_rule_type(rt).is_ok(),
                "Expected '{rt}' to be valid"
            );
        }
    }

    #[test]
    fn test_invalid_rule_type_rejected() {
        let result = validate_rule_type("unknown");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid rule type"));
    }

    #[test]
    fn test_empty_rule_type_rejected() {
        assert!(validate_rule_type("").is_err());
    }

    // -- check_resolution tests --

    #[test]
    fn test_resolution_pass_exact() {
        let r = check_resolution(1920, 1080, 1920, 1080);
        assert!(r.passed);
        assert_eq!(r.actual_value, "1920x1080");
    }

    #[test]
    fn test_resolution_pass_exceeds() {
        let r = check_resolution(3840, 2160, 1920, 1080);
        assert!(r.passed);
    }

    #[test]
    fn test_resolution_fail_width() {
        let r = check_resolution(1280, 1080, 1920, 1080);
        assert!(!r.passed);
        assert!(r.message.contains("below minimum"));
    }

    #[test]
    fn test_resolution_fail_height() {
        let r = check_resolution(1920, 720, 1920, 1080);
        assert!(!r.passed);
    }

    // -- check_framerate tests --

    #[test]
    fn test_framerate_pass_exact() {
        let r = check_framerate(30.0, 30.0, 0.5);
        assert!(r.passed);
    }

    #[test]
    fn test_framerate_pass_within_tolerance() {
        let r = check_framerate(29.97, 30.0, 0.5);
        assert!(r.passed);
    }

    #[test]
    fn test_framerate_fail_outside_tolerance() {
        let r = check_framerate(25.0, 30.0, 0.5);
        assert!(!r.passed);
        assert!(r.message.contains("deviates"));
    }

    // -- check_duration tests --

    #[test]
    fn test_duration_pass_within_range() {
        let r = check_duration(5.0, 3.0, 10.0);
        assert!(r.passed);
    }

    #[test]
    fn test_duration_pass_at_boundaries() {
        assert!(check_duration(3.0, 3.0, 10.0).passed);
        assert!(check_duration(10.0, 3.0, 10.0).passed);
    }

    #[test]
    fn test_duration_fail_too_short() {
        let r = check_duration(2.0, 3.0, 10.0);
        assert!(!r.passed);
        assert!(r.message.contains("below minimum"));
    }

    #[test]
    fn test_duration_fail_too_long() {
        let r = check_duration(15.0, 3.0, 10.0);
        assert!(!r.passed);
        assert!(r.message.contains("exceeds maximum"));
    }

    // -- check_filesize tests --

    #[test]
    fn test_filesize_pass_under_limit() {
        let r = check_filesize(500_000, 1_000_000);
        assert!(r.passed);
    }

    #[test]
    fn test_filesize_pass_at_limit() {
        let r = check_filesize(1_000_000, 1_000_000);
        assert!(r.passed);
    }

    #[test]
    fn test_filesize_fail_over_limit() {
        let r = check_filesize(2_000_000, 1_000_000);
        assert!(!r.passed);
        assert!(r.message.contains("exceeds limit"));
    }

    // -- check_naming tests --

    #[test]
    fn test_naming_pass_matches_pattern() {
        let r = check_naming("scene_001_v2.mp4", r"^scene_\d+_v\d+\.mp4$");
        assert!(r.passed);
    }

    #[test]
    fn test_naming_fail_no_match() {
        let r = check_naming("random_file.avi", r"^scene_\d+_v\d+\.mp4$");
        assert!(!r.passed);
        assert!(r.message.contains("does not match"));
    }

    #[test]
    fn test_naming_fail_invalid_regex() {
        let r = check_naming("test.mp4", r"[invalid");
        assert!(!r.passed);
        assert!(r.message.contains("Invalid regex"));
    }

    // -- summarize_checks tests --

    #[test]
    fn test_summarize_all_pass() {
        let results = vec![
            ComplianceResult {
                passed: true,
                actual_value: "a".into(),
                expected_value: "a".into(),
                message: "ok".into(),
            },
            ComplianceResult {
                passed: true,
                actual_value: "b".into(),
                expected_value: "b".into(),
                message: "ok".into(),
            },
        ];
        let s = summarize_checks(&results);
        assert_eq!(s.total, 2);
        assert_eq!(s.passed, 2);
        assert_eq!(s.failed, 0);
        assert!((s.pass_rate - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_summarize_mixed() {
        let results = vec![
            ComplianceResult {
                passed: true,
                actual_value: "a".into(),
                expected_value: "a".into(),
                message: "ok".into(),
            },
            ComplianceResult {
                passed: false,
                actual_value: "b".into(),
                expected_value: "c".into(),
                message: "fail".into(),
            },
            ComplianceResult {
                passed: false,
                actual_value: "d".into(),
                expected_value: "e".into(),
                message: "fail".into(),
            },
        ];
        let s = summarize_checks(&results);
        assert_eq!(s.total, 3);
        assert_eq!(s.passed, 1);
        assert_eq!(s.failed, 2);
        assert!((s.pass_rate - 1.0 / 3.0).abs() < 0.001);
    }

    #[test]
    fn test_summarize_empty() {
        let s = summarize_checks(&[]);
        assert_eq!(s.total, 0);
        assert_eq!(s.passed, 0);
        assert_eq!(s.failed, 0);
        assert!((s.pass_rate - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_valid_rule_types_count() {
        assert_eq!(VALID_RULE_TYPES.len(), 7);
    }
}
