//! Scene assembly & delivery packaging constants and validators (PRD-39).
//!
//! Provides status constants, format validators, resolution parsing,
//! and concat strategy determination for the delivery export pipeline.

use serde::Serialize;

use crate::error::CoreError;
use crate::types::DbId;

// ---------------------------------------------------------------------------
// Delivery export status constants (match seed data in 000078)
// ---------------------------------------------------------------------------

pub const EXPORT_STATUS_PENDING: &str = "pending";
pub const EXPORT_STATUS_ASSEMBLING: &str = "assembling";
pub const EXPORT_STATUS_TRANSCODING: &str = "transcoding";
pub const EXPORT_STATUS_PACKAGING: &str = "packaging";
pub const EXPORT_STATUS_VALIDATING: &str = "validating";
pub const EXPORT_STATUS_COMPLETED: &str = "completed";
pub const EXPORT_STATUS_FAILED: &str = "failed";

const ALL_EXPORT_STATUSES: &[&str] = &[
    EXPORT_STATUS_PENDING,
    EXPORT_STATUS_ASSEMBLING,
    EXPORT_STATUS_TRANSCODING,
    EXPORT_STATUS_PACKAGING,
    EXPORT_STATUS_VALIDATING,
    EXPORT_STATUS_COMPLETED,
    EXPORT_STATUS_FAILED,
];

// ---------------------------------------------------------------------------
// Export status IDs (match seed data in migration 000078)
// ---------------------------------------------------------------------------

/// Status ID for a pending export.
pub const EXPORT_STATUS_ID_PENDING: i16 = 1;
/// Status ID for an assembling export.
pub const EXPORT_STATUS_ID_ASSEMBLING: i16 = 2;
/// Status ID for a transcoding export.
pub const EXPORT_STATUS_ID_TRANSCODING: i16 = 3;
/// Status ID for a packaging export.
pub const EXPORT_STATUS_ID_PACKAGING: i16 = 4;
/// Status ID for a validating export.
pub const EXPORT_STATUS_ID_VALIDATING: i16 = 5;
/// Status ID for a completed export.
pub const EXPORT_STATUS_ID_COMPLETED: i16 = 6;
/// Status ID for a failed export.
pub const EXPORT_STATUS_ID_FAILED: i16 = 7;

// ---------------------------------------------------------------------------
// Known codecs, containers, pixel formats
// ---------------------------------------------------------------------------

pub const VALID_CODECS: &[&str] = &["h264", "h265", "hevc", "prores", "vp9", "av1"];
pub const VALID_CONTAINERS: &[&str] = &["mp4", "mov", "mkv", "webm"];
pub const VALID_PIXEL_FORMATS: &[&str] = &["yuv420p", "yuv422p", "yuv444p", "rgb24"];

// ---------------------------------------------------------------------------
// Watermark types and positions
// ---------------------------------------------------------------------------

pub const WATERMARK_TYPE_TEXT: &str = "text";
pub const WATERMARK_TYPE_IMAGE: &str = "image";
pub const VALID_WATERMARK_TYPES: &[&str] = &[WATERMARK_TYPE_TEXT, WATERMARK_TYPE_IMAGE];
pub const VALID_WATERMARK_POSITIONS: &[&str] = &[
    "center",
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
];

// ---------------------------------------------------------------------------
// Validation issue types
// ---------------------------------------------------------------------------

/// Severity level for a pre-export validation issue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Error,
    Warning,
}

/// A single validation issue found during pre-export checks.
#[derive(Debug, Clone, Serialize)]
pub struct ValidationIssue {
    pub severity: IssueSeverity,
    pub category: String,
    pub message: String,
    pub entity_id: Option<DbId>,
}

/// Aggregated result of a pre-export validation run.
#[derive(Debug, Clone, Serialize)]
pub struct ValidationResult {
    pub passed: bool,
    pub errors: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
}

impl ValidationResult {
    /// Build a result from a flat list of issues.
    pub fn from_issues(issues: Vec<ValidationIssue>) -> Self {
        let errors: Vec<_> = issues
            .iter()
            .filter(|i| i.severity == IssueSeverity::Error)
            .cloned()
            .collect();
        let warnings: Vec<_> = issues
            .iter()
            .filter(|i| i.severity == IssueSeverity::Warning)
            .cloned()
            .collect();
        let passed = errors.is_empty();
        Self {
            passed,
            errors,
            warnings,
        }
    }
}

// ---------------------------------------------------------------------------
// Resolution parsing
// ---------------------------------------------------------------------------

/// Parse a resolution string like `"1920x1080"` into `(width, height)`.
pub fn parse_resolution_str(s: &str) -> Result<(u32, u32), CoreError> {
    let parts: Vec<&str> = s.split('x').collect();
    if parts.len() != 2 {
        return Err(CoreError::Validation(format!(
            "Invalid resolution format '{s}': expected WIDTHxHEIGHT"
        )));
    }
    let width = parts[0]
        .parse::<u32>()
        .map_err(|_| CoreError::Validation(format!("Invalid width in resolution '{s}'")))?;
    let height = parts[1]
        .parse::<u32>()
        .map_err(|_| CoreError::Validation(format!("Invalid height in resolution '{s}'")))?;
    if width == 0 || height == 0 {
        return Err(CoreError::Validation(format!(
            "Resolution dimensions must be > 0, got '{s}'"
        )));
    }
    Ok((width, height))
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate that a codec name is in the known set.
pub fn validate_codec(codec: &str) -> Result<(), CoreError> {
    if VALID_CODECS.contains(&codec) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown codec '{codec}'. Valid: {VALID_CODECS:?}"
        )))
    }
}

/// Validate that a container name is in the known set.
pub fn validate_container(container: &str) -> Result<(), CoreError> {
    if VALID_CONTAINERS.contains(&container) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown container '{container}'. Valid: {VALID_CONTAINERS:?}"
        )))
    }
}

/// Validate that a pixel format is in the known set.
pub fn validate_pixel_format(format: &str) -> Result<(), CoreError> {
    if VALID_PIXEL_FORMATS.contains(&format) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown pixel format '{format}'. Valid: {VALID_PIXEL_FORMATS:?}"
        )))
    }
}

/// Validate watermark type.
pub fn validate_watermark_type(wt: &str) -> Result<(), CoreError> {
    if VALID_WATERMARK_TYPES.contains(&wt) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown watermark type '{wt}'. Valid: {VALID_WATERMARK_TYPES:?}"
        )))
    }
}

/// Validate watermark position.
pub fn validate_watermark_position(pos: &str) -> Result<(), CoreError> {
    if VALID_WATERMARK_POSITIONS.contains(&pos) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown watermark position '{pos}'. Valid: {VALID_WATERMARK_POSITIONS:?}"
        )))
    }
}

/// Validate opacity is in [0.0, 1.0].
pub fn validate_opacity(opacity: f32) -> Result<(), CoreError> {
    if (0.0..=1.0).contains(&opacity) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Opacity must be between 0.0 and 1.0, got {opacity}"
        )))
    }
}

/// Validate that a status string is a known export status.
pub fn validate_export_status(status: &str) -> Result<(), CoreError> {
    if ALL_EXPORT_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown export status '{status}'. Valid: {ALL_EXPORT_STATUSES:?}"
        )))
    }
}

/// Validate a resolution string format.
pub fn validate_resolution_str(s: &str) -> Result<(), CoreError> {
    parse_resolution_str(s).map(|_| ())
}

// ---------------------------------------------------------------------------
// Concat strategy determination
// ---------------------------------------------------------------------------

/// Strategy for concatenating multiple video clips.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConcatStrategy {
    /// All clips share the same codec, resolution, and framerate — use stream copy.
    StreamCopy,
    /// Re-encode is required due to mismatches.
    ReEncode { reason: String },
}

/// Determine the concatenation strategy based on the properties of source clips.
///
/// Stream-copy is preferred when all clips share the same codec, resolution,
/// and framerate. Any mismatch forces a re-encode.
pub fn determine_concat_strategy(
    codecs: &[&str],
    resolutions: &[(i32, i32)],
    framerates: &[f64],
) -> ConcatStrategy {
    if codecs.is_empty() {
        return ConcatStrategy::StreamCopy;
    }

    // Check codec uniformity.
    let first_codec = codecs[0];
    if codecs.iter().any(|c| *c != first_codec) {
        return ConcatStrategy::ReEncode {
            reason: "Mixed codecs".to_string(),
        };
    }

    // Check resolution uniformity.
    if !resolutions.is_empty() {
        let first_res = resolutions[0];
        if resolutions.iter().any(|r| *r != first_res) {
            return ConcatStrategy::ReEncode {
                reason: "Mixed resolutions".to_string(),
            };
        }
    }

    // Check framerate uniformity (within small tolerance).
    if !framerates.is_empty() {
        let first_fps = framerates[0];
        if framerates.iter().any(|f| (*f - first_fps).abs() > 0.01) {
            return ConcatStrategy::ReEncode {
                reason: "Mixed framerates".to_string(),
            };
        }
    }

    ConcatStrategy::StreamCopy
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Resolution parsing --

    #[test]
    fn parse_resolution_valid() {
        assert_eq!(parse_resolution_str("1920x1080").unwrap(), (1920, 1080));
    }

    #[test]
    fn parse_resolution_4k() {
        assert_eq!(parse_resolution_str("3840x2160").unwrap(), (3840, 2160));
    }

    #[test]
    fn parse_resolution_invalid_format() {
        assert!(parse_resolution_str("1920-1080").is_err());
    }

    #[test]
    fn parse_resolution_non_numeric() {
        assert!(parse_resolution_str("abcxdef").is_err());
    }

    #[test]
    fn parse_resolution_zero_dimension() {
        assert!(parse_resolution_str("0x1080").is_err());
        assert!(parse_resolution_str("1920x0").is_err());
    }

    // -- Codec validation --

    #[test]
    fn validate_codec_valid() {
        assert!(validate_codec("h264").is_ok());
        assert!(validate_codec("prores").is_ok());
        assert!(validate_codec("av1").is_ok());
    }

    #[test]
    fn validate_codec_invalid() {
        assert!(validate_codec("unknown_codec").is_err());
    }

    // -- Container validation --

    #[test]
    fn validate_container_valid() {
        assert!(validate_container("mp4").is_ok());
        assert!(validate_container("webm").is_ok());
    }

    #[test]
    fn validate_container_invalid() {
        assert!(validate_container("avi").is_err());
    }

    // -- Pixel format validation --

    #[test]
    fn validate_pixel_format_valid() {
        assert!(validate_pixel_format("yuv420p").is_ok());
        assert!(validate_pixel_format("rgb24").is_ok());
    }

    #[test]
    fn validate_pixel_format_invalid() {
        assert!(validate_pixel_format("nv12").is_err());
    }

    // -- Watermark validation --

    #[test]
    fn validate_watermark_type_valid() {
        assert!(validate_watermark_type("text").is_ok());
        assert!(validate_watermark_type("image").is_ok());
    }

    #[test]
    fn validate_watermark_type_invalid() {
        assert!(validate_watermark_type("video").is_err());
    }

    #[test]
    fn validate_watermark_position_valid() {
        assert!(validate_watermark_position("center").is_ok());
        assert!(validate_watermark_position("top_left").is_ok());
        assert!(validate_watermark_position("bottom_right").is_ok());
    }

    #[test]
    fn validate_watermark_position_invalid() {
        assert!(validate_watermark_position("middle").is_err());
    }

    // -- Opacity validation --

    #[test]
    fn validate_opacity_valid() {
        assert!(validate_opacity(0.0).is_ok());
        assert!(validate_opacity(0.5).is_ok());
        assert!(validate_opacity(1.0).is_ok());
    }

    #[test]
    fn validate_opacity_out_of_range() {
        assert!(validate_opacity(-0.1).is_err());
        assert!(validate_opacity(1.1).is_err());
    }

    // -- Export status validation --

    #[test]
    fn validate_export_status_valid() {
        assert!(validate_export_status("pending").is_ok());
        assert!(validate_export_status("completed").is_ok());
        assert!(validate_export_status("failed").is_ok());
    }

    #[test]
    fn validate_export_status_invalid() {
        assert!(validate_export_status("running").is_err());
    }

    // -- Resolution string validation --

    #[test]
    fn validate_resolution_str_valid() {
        assert!(validate_resolution_str("1280x720").is_ok());
    }

    #[test]
    fn validate_resolution_str_invalid() {
        assert!(validate_resolution_str("bad").is_err());
    }

    // -- Concat strategy --

    #[test]
    fn concat_strategy_empty_clips() {
        let s = determine_concat_strategy(&[], &[], &[]);
        assert_eq!(s, ConcatStrategy::StreamCopy);
    }

    #[test]
    fn concat_strategy_uniform_clips() {
        let s = determine_concat_strategy(
            &["h264", "h264"],
            &[(1920, 1080), (1920, 1080)],
            &[30.0, 30.0],
        );
        assert_eq!(s, ConcatStrategy::StreamCopy);
    }

    #[test]
    fn concat_strategy_mixed_codecs() {
        let s = determine_concat_strategy(
            &["h264", "h265"],
            &[(1920, 1080), (1920, 1080)],
            &[30.0, 30.0],
        );
        assert!(matches!(s, ConcatStrategy::ReEncode { reason } if reason.contains("codecs")));
    }

    #[test]
    fn concat_strategy_mixed_resolutions() {
        let s = determine_concat_strategy(
            &["h264", "h264"],
            &[(1920, 1080), (1280, 720)],
            &[30.0, 30.0],
        );
        assert!(matches!(s, ConcatStrategy::ReEncode { reason } if reason.contains("resolutions")));
    }

    #[test]
    fn concat_strategy_mixed_framerates() {
        let s = determine_concat_strategy(
            &["h264", "h264"],
            &[(1920, 1080), (1920, 1080)],
            &[30.0, 24.0],
        );
        assert!(matches!(s, ConcatStrategy::ReEncode { reason } if reason.contains("framerates")));
    }

    // -- ValidationResult builder --

    #[test]
    fn validation_result_from_issues_pass() {
        let result = ValidationResult::from_issues(vec![ValidationIssue {
            severity: IssueSeverity::Warning,
            category: "encoding".to_string(),
            message: "Low bitrate".to_string(),
            entity_id: None,
        }]);
        assert!(result.passed);
        assert_eq!(result.errors.len(), 0);
        assert_eq!(result.warnings.len(), 1);
    }

    #[test]
    fn validation_result_from_issues_fail() {
        let result = ValidationResult::from_issues(vec![
            ValidationIssue {
                severity: IssueSeverity::Error,
                category: "missing".to_string(),
                message: "No video file".to_string(),
                entity_id: Some(42),
            },
            ValidationIssue {
                severity: IssueSeverity::Warning,
                category: "encoding".to_string(),
                message: "Low bitrate".to_string(),
                entity_id: None,
            },
        ]);
        assert!(!result.passed);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.warnings.len(), 1);
    }
}
