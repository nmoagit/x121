//! Video source type constants.
//!
//! Used by the polymorphic `video_thumbnails` table and the video streaming
//! API to distinguish between segment videos and scene video versions.

/// A segment's output video (`segments.output_video_path`).
pub const VIDEO_SOURCE_SEGMENT: &str = "segment";

/// A scene video version (`scene_video_versions.file_path`).
pub const VIDEO_SOURCE_VERSION: &str = "version";

/// All valid source type values.
pub const VALID_SOURCE_TYPES: &[&str] = &[VIDEO_SOURCE_SEGMENT, VIDEO_SOURCE_VERSION];

/// Returns `true` if the given string is a valid video source type.
pub fn is_valid_source_type(s: &str) -> bool {
    VALID_SOURCE_TYPES.contains(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_source_types() {
        assert!(is_valid_source_type("segment"));
        assert!(is_valid_source_type("version"));
        assert!(!is_valid_source_type("invalid"));
        assert!(!is_valid_source_type(""));
    }

    #[test]
    fn test_constants_match_valid_list() {
        assert!(VALID_SOURCE_TYPES.contains(&VIDEO_SOURCE_SEGMENT));
        assert!(VALID_SOURCE_TYPES.contains(&VIDEO_SOURCE_VERSION));
    }
}
