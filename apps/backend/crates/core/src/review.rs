//! Review note constants and validation functions (PRD-38).
//!
//! Defines valid note statuses, tag categories, and validation helpers
//! used by the DB and API layers for collaborative review notes.

use crate::error::CoreError;

/* --------------------------------------------------------------------------
Constants
-------------------------------------------------------------------------- */

/// Maximum length for a review note's text content.
pub const MAX_NOTE_LENGTH: usize = 10_000;

/// Maximum length for a voice memo transcript.
pub const MAX_VOICE_MEMO_TRANSCRIPT_LENGTH: usize = 50_000;

/// Maximum length for an abort reason.
pub const MAX_ABORT_REASON_LENGTH: usize = 2_000;

/// Note is open and unresolved.
pub const NOTE_STATUS_OPEN: &str = "open";

/// Note has been resolved.
pub const NOTE_STATUS_RESOLVED: &str = "resolved";

/// Note will not be fixed.
pub const NOTE_STATUS_WONT_FIX: &str = "wont_fix";

/// All valid note status values.
pub const VALID_NOTE_STATUSES: &[&str] =
    &[NOTE_STATUS_OPEN, NOTE_STATUS_RESOLVED, NOTE_STATUS_WONT_FIX];

/// All valid tag category values.
pub const VALID_TAG_CATEGORIES: &[&str] = &[
    "face",
    "motion",
    "transition",
    "body",
    "lighting",
    "general",
];

/* --------------------------------------------------------------------------
Validation functions
-------------------------------------------------------------------------- */

/// Validate that a note status string is one of the accepted values.
pub fn validate_note_status(status: &str) -> Result<(), CoreError> {
    if VALID_NOTE_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid note status '{status}'. Must be one of: {}",
            VALID_NOTE_STATUSES.join(", ")
        )))
    }
}

/// Validate that a tag color is in hex format `#RRGGBB`.
pub fn validate_tag_color(color: &str) -> Result<(), CoreError> {
    if color.len() != 7 {
        return Err(CoreError::Validation(format!(
            "Invalid color '{color}'. Must be in #RRGGBB hex format"
        )));
    }

    if !color.starts_with('#') {
        return Err(CoreError::Validation(format!(
            "Invalid color '{color}'. Must start with '#'"
        )));
    }

    let hex_part = &color[1..];
    if !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(CoreError::Validation(format!(
            "Invalid color '{color}'. Must contain only hex digits after '#'"
        )));
    }

    Ok(())
}

/// Validate a timecode string.
///
/// Accepts either `HH:MM:SS:FF` format or a plain frame number string.
pub fn validate_timecode(timecode: &str) -> Result<(), CoreError> {
    if timecode.is_empty() {
        return Err(CoreError::Validation(
            "Timecode must not be empty".to_string(),
        ));
    }

    // Allow plain frame number (all digits).
    if timecode.chars().all(|c| c.is_ascii_digit()) {
        return Ok(());
    }

    // Check HH:MM:SS:FF format.
    let parts: Vec<&str> = timecode.split(':').collect();
    if parts.len() != 4 {
        return Err(CoreError::Validation(format!(
            "Invalid timecode '{timecode}'. Expected HH:MM:SS:FF format or a frame number"
        )));
    }

    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()) {
            return Err(CoreError::Validation(format!(
                "Invalid timecode '{timecode}'. Segment {i} must be numeric"
            )));
        }
    }

    Ok(())
}

/// Validate note content: at least one of text content or voice memo path must be present.
pub fn validate_note_content(
    text: &Option<String>,
    voice_path: &Option<String>,
) -> Result<(), CoreError> {
    let has_text = text.as_ref().is_some_and(|t| !t.trim().is_empty());
    let has_voice = voice_path.as_ref().is_some_and(|p| !p.trim().is_empty());

    if !has_text && !has_voice {
        return Err(CoreError::Validation(
            "A review note must have either text content or a voice memo".to_string(),
        ));
    }

    if let Some(t) = text {
        if t.len() > MAX_NOTE_LENGTH {
            return Err(CoreError::Validation(format!(
                "Note text exceeds maximum length of {MAX_NOTE_LENGTH} characters"
            )));
        }
    }

    Ok(())
}

/* --------------------------------------------------------------------------
Tests
-------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_note_statuses_accepted() {
        assert!(validate_note_status(NOTE_STATUS_OPEN).is_ok());
        assert!(validate_note_status(NOTE_STATUS_RESOLVED).is_ok());
        assert!(validate_note_status(NOTE_STATUS_WONT_FIX).is_ok());
    }

    #[test]
    fn test_invalid_note_status_rejected() {
        let result = validate_note_status("invalid");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid note status"));
    }

    #[test]
    fn test_empty_note_status_rejected() {
        assert!(validate_note_status("").is_err());
    }

    #[test]
    fn test_valid_hex_colors_accepted() {
        assert!(validate_tag_color("#FF4444").is_ok());
        assert!(validate_tag_color("#000000").is_ok());
        assert!(validate_tag_color("#ffffff").is_ok());
        assert!(validate_tag_color("#aaBBcc").is_ok());
    }

    #[test]
    fn test_invalid_hex_color_rejected() {
        assert!(validate_tag_color("FF4444").is_err()); // Missing #
        assert!(validate_tag_color("#F44").is_err()); // Too short
        assert!(validate_tag_color("#FF44441").is_err()); // Too long
        assert!(validate_tag_color("#GGGGGG").is_err()); // Invalid hex
        assert!(validate_tag_color("").is_err()); // Empty
    }

    #[test]
    fn test_valid_timecodes_accepted() {
        assert!(validate_timecode("01:02:03:04").is_ok());
        assert!(validate_timecode("00:00:00:00").is_ok());
        assert!(validate_timecode("23:59:59:29").is_ok());
    }

    #[test]
    fn test_frame_number_timecode_accepted() {
        assert!(validate_timecode("0").is_ok());
        assert!(validate_timecode("1234").is_ok());
        assert!(validate_timecode("999999").is_ok());
    }

    #[test]
    fn test_invalid_timecode_rejected() {
        assert!(validate_timecode("").is_err());
        assert!(validate_timecode("01:02:03").is_err()); // Only 3 parts
        assert!(validate_timecode("01:02:03:04:05").is_err()); // 5 parts
        assert!(validate_timecode("aa:bb:cc:dd").is_err()); // Non-numeric
    }

    #[test]
    fn test_note_content_text_only() {
        let result = validate_note_content(&Some("Some text".to_string()), &None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_note_content_voice_only() {
        let result = validate_note_content(&None, &Some("/path/to/memo.webm".to_string()));
        assert!(result.is_ok());
    }

    #[test]
    fn test_note_content_both_present() {
        let result = validate_note_content(
            &Some("Some text".to_string()),
            &Some("/path/to/memo.webm".to_string()),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_note_content_neither_present() {
        let result = validate_note_content(&None, &None);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("text content or a voice memo"));
    }

    #[test]
    fn test_note_content_empty_strings_rejected() {
        let result = validate_note_content(&Some("   ".to_string()), &Some("  ".to_string()));
        assert!(result.is_err());
    }

    #[test]
    fn test_note_content_exceeds_max_length() {
        let long_text = "x".repeat(MAX_NOTE_LENGTH + 1);
        let result = validate_note_content(&Some(long_text), &None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("maximum length"));
    }
}
