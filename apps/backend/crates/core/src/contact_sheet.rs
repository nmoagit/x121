//! Pure logic for contact sheet grid configuration and frame selection (PRD-103).
//!
//! This module contains no database dependencies. All functions operate
//! on plain data structures and can be tested in isolation.

use crate::error::CoreError;

/// Default number of columns in the contact sheet grid.
pub const DEFAULT_GRID_COLS: u32 = 4;

/// Default number of rows in the contact sheet grid.
pub const DEFAULT_GRID_ROWS: u32 = 4;

/// Maximum number of images allowed in a single contact sheet.
pub const MAX_IMAGES: usize = 64;

/// Minimum allowed grid dimension (rows or columns).
const MIN_GRID_DIM: u32 = 1;

/// Maximum allowed grid dimension (rows or columns).
const MAX_GRID_DIM: u32 = 8;

/// Valid export formats for contact sheet output.
const VALID_EXPORT_FORMATS: [&str; 2] = ["png", "pdf"];

/// Validate that the grid dimensions are within allowed bounds.
///
/// Both `cols` and `rows` must be between 1 and 8 inclusive.
/// Returns `CoreError::Validation` on failure, consistent with other core
/// validators (DRY-498).
pub fn validate_grid_size(cols: u32, rows: u32) -> Result<(), CoreError> {
    if !(MIN_GRID_DIM..=MAX_GRID_DIM).contains(&cols) {
        return Err(CoreError::Validation(format!(
            "Grid columns must be between {MIN_GRID_DIM} and {MAX_GRID_DIM}, got {cols}"
        )));
    }
    if !(MIN_GRID_DIM..=MAX_GRID_DIM).contains(&rows) {
        return Err(CoreError::Validation(format!(
            "Grid rows must be between {MIN_GRID_DIM} and {MAX_GRID_DIM}, got {rows}"
        )));
    }
    Ok(())
}

/// Validate that the export format is one of the accepted values.
///
/// Accepted formats: `"png"`, `"pdf"`.
/// Returns `CoreError::Validation` on failure, consistent with other core
/// validators (DRY-498).
pub fn validate_export_format(format: &str) -> Result<(), CoreError> {
    if VALID_EXPORT_FORMATS.contains(&format) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid export format '{format}'. Must be one of: {}",
            VALID_EXPORT_FORMATS.join(", ")
        )))
    }
}

/// Given a slice of confidence scores, return the indices of the top `max_count`
/// entries sorted by confidence descending.
///
/// If the slice has fewer entries than `max_count`, all indices are returned.
pub fn select_best_frames(confidence_scores: &[f64], max_count: usize) -> Vec<usize> {
    let mut indexed: Vec<(usize, f64)> = confidence_scores.iter().copied().enumerate().collect();
    // Sort descending by confidence score; for ties, prefer lower index (stable sort).
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    indexed
        .into_iter()
        .take(max_count)
        .map(|(i, _)| i)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // validate_grid_size
    // -----------------------------------------------------------------------

    #[test]
    fn valid_default_grid_size() {
        assert!(validate_grid_size(DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS).is_ok());
    }

    #[test]
    fn valid_min_grid_size() {
        assert!(validate_grid_size(1, 1).is_ok());
    }

    #[test]
    fn valid_max_grid_size() {
        assert!(validate_grid_size(8, 8).is_ok());
    }

    #[test]
    fn invalid_grid_cols_zero() {
        let err = validate_grid_size(0, 4).unwrap_err().to_string();
        assert!(err.contains("columns"));
        assert!(err.contains('0'));
    }

    #[test]
    fn invalid_grid_cols_too_large() {
        let err = validate_grid_size(9, 4).unwrap_err().to_string();
        assert!(err.contains("columns"));
    }

    #[test]
    fn invalid_grid_rows_zero() {
        let err = validate_grid_size(4, 0).unwrap_err().to_string();
        assert!(err.contains("rows"));
    }

    #[test]
    fn invalid_grid_rows_too_large() {
        let err = validate_grid_size(4, 9).unwrap_err().to_string();
        assert!(err.contains("rows"));
    }

    // -----------------------------------------------------------------------
    // validate_export_format
    // -----------------------------------------------------------------------

    #[test]
    fn valid_export_format_png() {
        assert!(validate_export_format("png").is_ok());
    }

    #[test]
    fn valid_export_format_pdf() {
        assert!(validate_export_format("pdf").is_ok());
    }

    #[test]
    fn invalid_export_format() {
        let err = validate_export_format("jpg").unwrap_err().to_string();
        assert!(err.contains("jpg"));
        assert!(err.contains("png"));
        assert!(err.contains("pdf"));
    }

    // -----------------------------------------------------------------------
    // select_best_frames
    // -----------------------------------------------------------------------

    #[test]
    fn select_best_frames_picks_top_n() {
        let scores = vec![0.5, 0.95, 0.7, 0.3, 0.85];
        let result = select_best_frames(&scores, 3);
        assert_eq!(result.len(), 3);
        // Indices of top 3: 0.95 (idx 1), 0.85 (idx 4), 0.7 (idx 2)
        assert_eq!(result, vec![1, 4, 2]);
    }

    #[test]
    fn select_best_frames_empty_input() {
        let result = select_best_frames(&[], 5);
        assert!(result.is_empty());
    }

    #[test]
    fn select_best_frames_max_exceeds_length() {
        let scores = vec![0.5, 0.9];
        let result = select_best_frames(&scores, 10);
        assert_eq!(result.len(), 2);
        assert_eq!(result, vec![1, 0]);
    }

    #[test]
    fn select_best_frames_single_element() {
        let scores = vec![0.8];
        let result = select_best_frames(&scores, 1);
        assert_eq!(result, vec![0]);
    }

    #[test]
    fn select_best_frames_zero_max_count() {
        let scores = vec![0.5, 0.9];
        let result = select_best_frames(&scores, 0);
        assert!(result.is_empty());
    }
}
