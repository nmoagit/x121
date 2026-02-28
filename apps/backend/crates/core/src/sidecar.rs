//! VFX sidecar file generation and dataset export utilities (PRD-40).
//!
//! Provides format constants, filename derivation, sidecar format validation,
//! and training dataset split assignment logic.

// ---------------------------------------------------------------------------
// Sidecar format constants
// ---------------------------------------------------------------------------

/// XML sidecar format identifier.
pub const FORMAT_XML: &str = "xml";

/// CSV sidecar format identifier.
pub const FORMAT_CSV: &str = "csv";

/// All valid sidecar output formats.
pub const VALID_SIDECAR_FORMATS: &[&str] = &[FORMAT_XML, FORMAT_CSV];

// ---------------------------------------------------------------------------
// Re-export shared job status ID constants for backward compatibility
// ---------------------------------------------------------------------------

pub use crate::job_status::{
    JOB_STATUS_ID_COMPLETED, JOB_STATUS_ID_FAILED, JOB_STATUS_ID_PENDING,
    JOB_STATUS_ID_RUNNING,
};

// ---------------------------------------------------------------------------
// Dataset split labels
// ---------------------------------------------------------------------------

/// Training split label.
pub const SPLIT_TRAIN: &str = "train";

/// Validation split label.
pub const SPLIT_VALIDATION: &str = "validation";

/// Test split label.
pub const SPLIT_TEST: &str = "test";

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that `format` is a supported sidecar format (`xml` or `csv`).
pub fn validate_sidecar_format(format: &str) -> Result<(), String> {
    if VALID_SIDECAR_FORMATS.contains(&format) {
        Ok(())
    } else {
        Err(format!(
            "Invalid sidecar format '{}'. Must be one of: {}",
            format,
            VALID_SIDECAR_FORMATS.join(", ")
        ))
    }
}

/// Derive a sidecar filename from a video filename by replacing its extension.
///
/// For example, `"scene_video.mp4"` with format `"xml"` produces `"scene_video.xml"`.
/// If the video filename has no extension, the sidecar format is appended.
pub fn sidecar_filename(video_filename: &str, format: &str) -> String {
    match video_filename.rfind('.') {
        Some(dot_pos) => {
            let stem = &video_filename[..dot_pos];
            format!("{stem}.{format}")
        }
        None => format!("{video_filename}.{format}"),
    }
}

/// Validate that training dataset split percentages sum to approximately 1.0.
///
/// Each split must be non-negative, and the sum must be within `0.01` of `1.0`.
pub fn validate_splits(train: f32, validation: f32, test: f32) -> Result<(), String> {
    if train < 0.0 || validation < 0.0 || test < 0.0 {
        return Err("Split percentages must be non-negative".to_string());
    }

    let sum = train + validation + test;
    if (sum - 1.0).abs() > 0.01 {
        return Err(format!("Split percentages must sum to 1.0 (got {sum:.4})"));
    }

    Ok(())
}

/// Assign a dataset split label to a sample at the given `index` within `total` samples.
///
/// Samples are assigned sequentially: the first `train * total` samples go to
/// `"train"`, the next `validation * total` to `"validation"`, and the rest to
/// `"test"`.
pub fn assign_split(index: usize, total: usize, train: f32, validation: f32) -> &'static str {
    if total == 0 {
        return SPLIT_TRAIN;
    }

    let train_end = (train * total as f32).round() as usize;
    let val_end = train_end + (validation * total as f32).round() as usize;

    if index < train_end {
        SPLIT_TRAIN
    } else if index < val_end {
        SPLIT_VALIDATION
    } else {
        SPLIT_TEST
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_sidecar_format ---------------------------------------------

    #[test]
    fn valid_xml_format_accepted() {
        assert!(validate_sidecar_format("xml").is_ok());
    }

    #[test]
    fn valid_csv_format_accepted() {
        assert!(validate_sidecar_format("csv").is_ok());
    }

    #[test]
    fn invalid_format_rejected() {
        assert!(validate_sidecar_format("json").is_err());
        assert!(validate_sidecar_format("").is_err());
        assert!(validate_sidecar_format("XML").is_err());
        assert!(validate_sidecar_format("pdf").is_err());
    }

    // -- sidecar_filename ---------------------------------------------------

    #[test]
    fn sidecar_filename_replaces_mp4_with_xml() {
        assert_eq!(sidecar_filename("video.mp4", "xml"), "video.xml");
    }

    #[test]
    fn sidecar_filename_replaces_mp4_with_csv() {
        assert_eq!(sidecar_filename("scene_01.mp4", "csv"), "scene_01.csv");
    }

    #[test]
    fn sidecar_filename_replaces_multi_dot_extension() {
        assert_eq!(
            sidecar_filename("my.scene.video.mov", "xml"),
            "my.scene.video.xml"
        );
    }

    #[test]
    fn sidecar_filename_appends_when_no_extension() {
        assert_eq!(sidecar_filename("video", "xml"), "video.xml");
    }

    #[test]
    fn sidecar_filename_empty_stem() {
        assert_eq!(sidecar_filename(".mp4", "csv"), ".csv");
    }

    // -- validate_splits ----------------------------------------------------

    #[test]
    fn valid_splits_accepted() {
        assert!(validate_splits(0.8, 0.1, 0.1).is_ok());
        assert!(validate_splits(0.7, 0.15, 0.15).is_ok());
        assert!(validate_splits(1.0, 0.0, 0.0).is_ok());
    }

    #[test]
    fn splits_within_tolerance_accepted() {
        // 0.8 + 0.1 + 0.1 = 1.0 exactly; also test near-boundary.
        assert!(validate_splits(0.805, 0.1, 0.1).is_ok());
    }

    #[test]
    fn splits_exceeding_tolerance_rejected() {
        assert!(validate_splits(0.9, 0.1, 0.1).is_err());
        assert!(validate_splits(0.5, 0.1, 0.1).is_err());
    }

    #[test]
    fn negative_split_rejected() {
        assert!(validate_splits(-0.1, 0.6, 0.5).is_err());
    }

    // -- assign_split -------------------------------------------------------

    #[test]
    fn assign_split_with_standard_ratios() {
        // 10 samples: 0.8 train, 0.1 val, 0.1 test
        // train_end = round(0.8 * 10) = 8, val_end = 8 + round(0.1 * 10) = 9
        assert_eq!(assign_split(0, 10, 0.8, 0.1), SPLIT_TRAIN);
        assert_eq!(assign_split(7, 10, 0.8, 0.1), SPLIT_TRAIN);
        assert_eq!(assign_split(8, 10, 0.8, 0.1), SPLIT_VALIDATION);
        assert_eq!(assign_split(9, 10, 0.8, 0.1), SPLIT_TEST);
    }

    #[test]
    fn assign_split_all_train() {
        assert_eq!(assign_split(0, 5, 1.0, 0.0), SPLIT_TRAIN);
        assert_eq!(assign_split(4, 5, 1.0, 0.0), SPLIT_TRAIN);
    }

    #[test]
    fn assign_split_zero_total_returns_train() {
        assert_eq!(assign_split(0, 0, 0.8, 0.1), SPLIT_TRAIN);
    }

    // -- constant checks ----------------------------------------------------

    #[test]
    fn valid_formats_list_complete() {
        assert_eq!(VALID_SIDECAR_FORMATS.len(), 2);
        assert!(VALID_SIDECAR_FORMATS.contains(&FORMAT_XML));
        assert!(VALID_SIDECAR_FORMATS.contains(&FORMAT_CSV));
    }
}
