//! Filename parser for the derived clip naming convention.
//!
//! Parses folder and file names following the pattern:
//! `{pipeline}_{avatar}_{scene_type}_{track}_v{version}_[{labels}]_clip{NNNN}.mp4`
//!
//! Key rules:
//! - Underscores separate components; hyphens are used within avatar slugs.
//! - The `[...]` bracket section contains comma-separated labels.
//! - `_clip{NNNN}` and the file extension are optional (absent on folder names).

use std::fmt;

/// Parsed result from a clip filename or folder name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedClipFilename {
    /// Pipeline code (first component, e.g., `sdg`).
    pub pipeline_code: String,
    /// Avatar slug with hyphens preserved (e.g., `allie-nicole`, `la-sirena-69`).
    pub avatar_slug: String,
    /// Scene type slug (e.g., `idle`).
    pub scene_type_slug: String,
    /// Track slug (e.g., `topless`, `clothed`).
    pub track_slug: String,
    /// Version number from `_v{N}`.
    pub version: i32,
    /// Labels extracted from `[...]` brackets, comma-separated.
    pub labels: Vec<String>,
    /// Clip index from `_clip{NNNN}`, if present.
    pub clip_index: Option<i32>,
    /// File extension (e.g., `mp4`), empty string for folder names.
    pub extension: String,
}

/// Errors that can occur during filename parsing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// No `_v{N}` version marker found.
    MissingVersion,
    /// The version number after `_v` is not a valid integer.
    InvalidVersion(String),
    /// Not enough underscore-separated components before the version marker.
    /// Need at least 4: pipeline, avatar, scene_type, track.
    InsufficientComponents,
    /// The `_clip{NNNN}` suffix has an invalid number.
    InvalidClipIndex(String),
    /// General parse failure.
    InvalidFormat(String),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingVersion => write!(f, "No _v{{N}} version marker found"),
            Self::InvalidVersion(v) => write!(f, "Invalid version number: {v}"),
            Self::InsufficientComponents => {
                write!(
                    f,
                    "Need at least 4 components: pipeline_avatar_scene-type_track"
                )
            }
            Self::InvalidClipIndex(v) => write!(f, "Invalid clip index: {v}"),
            Self::InvalidFormat(msg) => write!(f, "Invalid format: {msg}"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Parse a clip filename or folder name.
///
/// Accepts either:
/// - A bare name: `sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]`
/// - A filename: `sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4`
/// - A full path: `/some/path/sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4`
///
/// For paths, only the final component (file or folder name) is parsed.
pub fn parse_clip_path(path: &str) -> Result<ParsedClipFilename, ParseError> {
    // Extract just the filename/foldername from a path.
    let name = path
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .rsplit('\\')
        .next()
        .unwrap_or(path);

    parse_clip_name(name)
}

/// Parse a clip name (not a full path).
fn parse_clip_name(name: &str) -> Result<ParsedClipFilename, ParseError> {
    // Step 1: Strip file extension if present.
    let (name_no_ext, extension) = strip_extension(name);

    // Step 2: Extract _clip{NNNN} suffix if present.
    let (name_no_clip, clip_index) = strip_clip_suffix(name_no_ext)?;

    // Step 3: Extract labels from [...] brackets.
    let (prefix, labels) = extract_labels(name_no_clip)?;

    // Step 4: Find the version marker `_v{N}` at the end of prefix.
    let (components_str, version) = extract_version(prefix)?;

    // Step 5: Split remaining components.
    // Format: {pipeline}_{avatar}_{scene_type}_{track}
    // Avatar slugs use hyphens, all other separators are underscores.
    let parts: Vec<&str> = components_str.split('_').collect();
    if parts.len() < 4 {
        return Err(ParseError::InsufficientComponents);
    }

    let pipeline_code = parts[0].to_string();
    let track_slug = parts[parts.len() - 1].to_string();
    let scene_type_slug = parts[parts.len() - 2].to_string();
    // Everything in between is the avatar slug (joined back with hyphens→underscores
    // are component separators, but within the avatar segment they used hyphens).
    // Actually: avatar slug components are separated by hyphens in the original name,
    // but in the filename convention, underscores separate top-level components.
    // So parts[1..len-2] are all part of the avatar slug, joined with underscores.
    // Wait — the convention says underscores between components, hyphens within avatar.
    // So `la-sirena-69` is a single underscore-delimited component.
    // But `allie-nicole` is also a single component.
    // The split on `_` already handles this correctly: `sdg_la-sirena-69_idle_clothed`
    // splits to ["sdg", "la-sirena-69", "idle", "clothed"].
    // But what if the avatar is multi-word with underscores? The convention says no —
    // avatar slugs use hyphens, not underscores.
    let avatar_slug = parts[1..parts.len() - 2].join("-");

    if avatar_slug.is_empty() {
        return Err(ParseError::InsufficientComponents);
    }

    Ok(ParsedClipFilename {
        pipeline_code,
        avatar_slug,
        scene_type_slug,
        track_slug,
        version,
        labels,
        clip_index,
        extension,
    })
}

/// Strip a file extension (`.mp4`, `.webm`, `.mov`) if present.
fn strip_extension(name: &str) -> (&str, String) {
    if let Some(dot_pos) = name.rfind('.') {
        let ext = &name[dot_pos + 1..];
        let known = ["mp4", "webm", "mov", "avi", "mkv"];
        if known.iter().any(|&k| k.eq_ignore_ascii_case(ext)) {
            return (&name[..dot_pos], ext.to_lowercase());
        }
    }
    (name, String::new())
}

/// Strip `_clip{NNNN}` suffix if present. Returns the remaining string and the clip index.
fn strip_clip_suffix(name: &str) -> Result<(&str, Option<i32>), ParseError> {
    // Look for `_clip` followed by digits at the end.
    if let Some(clip_pos) = name.rfind("_clip") {
        let after_clip = &name[clip_pos + 5..]; // skip "_clip"
        if !after_clip.is_empty() && after_clip.chars().all(|c| c.is_ascii_digit()) {
            let index: i32 = after_clip
                .parse()
                .map_err(|_| ParseError::InvalidClipIndex(after_clip.to_string()))?;
            return Ok((&name[..clip_pos], Some(index)));
        }
    }
    Ok((name, None))
}

/// Extract labels from `[...]` brackets. Returns the prefix (before `_[`) and labels.
fn extract_labels(name: &str) -> Result<(&str, Vec<String>), ParseError> {
    if let Some(bracket_start) = name.find("_[") {
        let after_bracket = &name[bracket_start + 2..];
        let bracket_end = after_bracket
            .find(']')
            .ok_or_else(|| ParseError::InvalidFormat("Opening '[' without closing ']'".into()))?;
        let label_str = &after_bracket[..bracket_end];
        let labels: Vec<String> = if label_str.is_empty() {
            Vec::new()
        } else {
            label_str.split(',').map(|s| s.trim().to_string()).collect()
        };
        Ok((&name[..bracket_start], labels))
    } else {
        // No brackets — no labels.
        Ok((name, Vec::new()))
    }
}

/// Extract version from `_v{N}` at the end of the prefix string.
fn extract_version(prefix: &str) -> Result<(&str, i32), ParseError> {
    // Find the last `_v` followed by digits.
    let mut search_from = prefix.len();
    loop {
        let haystack = &prefix[..search_from];
        if let Some(v_pos) = haystack.rfind("_v") {
            let after_v = &prefix[v_pos + 2..search_from];
            if !after_v.is_empty() && after_v.chars().all(|c| c.is_ascii_digit()) {
                let version: i32 = after_v
                    .parse()
                    .map_err(|_| ParseError::InvalidVersion(after_v.to_string()))?;
                return Ok((&prefix[..v_pos], version));
            }
            // This `_v` wasn't followed by pure digits; keep searching left.
            if v_pos == 0 {
                break;
            }
            search_from = v_pos;
        } else {
            break;
        }
    }
    Err(ParseError::MissingVersion)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_full_filename() {
        let result =
            parse_clip_path("sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4")
                .unwrap();
        assert_eq!(result.pipeline_code, "sdg");
        assert_eq!(result.avatar_slug, "allie-nicole");
        assert_eq!(result.scene_type_slug, "idle");
        assert_eq!(result.track_slug, "topless");
        assert_eq!(result.version, 1);
        assert_eq!(result.labels, vec!["#phase_2", "glitch"]);
        assert_eq!(result.clip_index, Some(3));
        assert_eq!(result.extension, "mp4");
    }

    #[test]
    fn parse_folder_name_no_clip_no_extension() {
        let result = parse_clip_path("sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]").unwrap();
        assert_eq!(result.pipeline_code, "sdg");
        assert_eq!(result.avatar_slug, "allie-nicole");
        assert_eq!(result.scene_type_slug, "idle");
        assert_eq!(result.track_slug, "topless");
        assert_eq!(result.version, 1);
        assert_eq!(result.labels, vec!["#phase_2", "glitch"]);
        assert_eq!(result.clip_index, None);
        assert_eq!(result.extension, "");
    }

    #[test]
    fn parse_avatar_with_multiple_hyphens() {
        let result =
            parse_clip_path("sdg_la-sirena-69_idle_clothed_v1_[#phase_2]_clip0000.mp4").unwrap();
        assert_eq!(result.avatar_slug, "la-sirena-69");
        assert_eq!(result.scene_type_slug, "idle");
        assert_eq!(result.track_slug, "clothed");
        assert_eq!(result.clip_index, Some(0));
    }

    #[test]
    fn parse_no_labels() {
        let result = parse_clip_path("sdg_avatar_idle_clothed_v1_clip0000.mp4").unwrap();
        assert_eq!(result.pipeline_code, "sdg");
        assert_eq!(result.avatar_slug, "avatar");
        assert_eq!(result.scene_type_slug, "idle");
        assert_eq!(result.track_slug, "clothed");
        assert_eq!(result.version, 1);
        assert!(result.labels.is_empty());
        assert_eq!(result.clip_index, Some(0));
        assert_eq!(result.extension, "mp4");
    }

    #[test]
    fn parse_version_greater_than_9() {
        let result = parse_clip_path("sdg_avatar_idle_clothed_v12_[label]_clip0000.mp4").unwrap();
        assert_eq!(result.version, 12);
        assert_eq!(result.labels, vec!["label"]);
    }

    #[test]
    fn parse_full_path() {
        let result = parse_clip_path(
            "/mnt/d/Storage/phase_2_chunked/sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4",
        )
        .unwrap();
        assert_eq!(result.pipeline_code, "sdg");
        assert_eq!(result.avatar_slug, "allie-nicole");
        assert_eq!(result.clip_index, Some(3));
    }

    #[test]
    fn parse_labels_with_special_chars() {
        let result = parse_clip_path(
            "sdg_avatar_idle_topless_v1_[#phase_2,motion_inconsistency,too_much_head_movement]_clip0001.mp4",
        )
        .unwrap();
        assert_eq!(
            result.labels,
            vec!["#phase_2", "motion_inconsistency", "too_much_head_movement",]
        );
    }

    #[test]
    fn error_missing_version() {
        let result = parse_clip_path("sdg_avatar_idle_clothed_[label]_clip0000.mp4");
        assert!(matches!(result, Err(ParseError::MissingVersion)));
    }

    #[test]
    fn error_insufficient_components() {
        let result = parse_clip_path("sdg_idle_v1_[label]_clip0000.mp4");
        assert!(matches!(result, Err(ParseError::InsufficientComponents)));
    }

    #[test]
    fn parse_empty_labels() {
        let result = parse_clip_path("sdg_avatar_idle_clothed_v1_[]_clip0000.mp4").unwrap();
        assert!(result.labels.is_empty());
    }
}
