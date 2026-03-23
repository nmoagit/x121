//! Import rule matching engine (PRD-141).
//!
//! Classifies filenames against pipeline import rules to determine whether
//! a file is a seed image, video, metadata file, or unrecognized.

use std::collections::HashMap;

use regex::Regex;

use crate::pipeline::{ImportRules, MetadataPattern};

/// The classification result for a single filename.
#[derive(Debug, Clone, PartialEq)]
pub enum FileClassification {
    /// A seed image mapped to a named slot (e.g. "clothed", "reference").
    SeedImage { slot: String },
    /// A video file with a scene type and optional track.
    Video {
        scene_type: String,
        track: Option<String>,
    },
    /// A metadata file (e.g. "bio.json", "tov.json").
    Metadata { metadata_type: String },
    /// The filename did not match any import rule.
    Unrecognized,
}

/// Classify a filename using pipeline import rules.
///
/// Matching order: metadata patterns (exact match), then seed patterns,
/// then video patterns. Returns the first match found.
pub fn classify_file(filename: &str, rules: &ImportRules) -> FileClassification {
    let fname = if rules.case_sensitive {
        filename.to_string()
    } else {
        filename.to_lowercase()
    };

    // Check metadata patterns first (exact match).
    for mp in &rules.metadata_patterns {
        if match_metadata(&fname, mp, rules.case_sensitive) {
            return FileClassification::Metadata {
                metadata_type: mp.pattern_type.clone(),
            };
        }
    }

    // Check seed patterns.
    for sp in &rules.seed_patterns {
        if match_pattern(&fname, &sp.pattern, &sp.extensions, rules.case_sensitive) {
            return FileClassification::SeedImage {
                slot: sp.slot.clone(),
            };
        }
    }

    // Check video patterns.
    for vp in &rules.video_patterns {
        if let Some(captures) =
            match_pattern_with_captures(&fname, &vp.pattern, &vp.extensions, rules.case_sensitive)
        {
            return FileClassification::Video {
                scene_type: captures.get("scene_type").cloned().unwrap_or_default(),
                track: captures.get("track").cloned(),
            };
        }
    }

    FileClassification::Unrecognized
}

/// Check if a filename matches a metadata pattern (exact match).
fn match_metadata(filename: &str, mp: &MetadataPattern, case_sensitive: bool) -> bool {
    let pat = if case_sensitive {
        mp.pattern.clone()
    } else {
        mp.pattern.to_lowercase()
    };
    filename == pat
}

/// Check if a filename matches a pattern with token placeholders.
fn match_pattern(
    filename: &str,
    pattern: &str,
    extensions: &[String],
    case_sensitive: bool,
) -> bool {
    match_pattern_with_captures(filename, pattern, extensions, case_sensitive).is_some()
}

/// Match a filename against a pattern, returning captured token values.
///
/// Pattern tokens like `{avatar}`, `{scene_type}`, `{track}` match `[^._/\\]+`.
/// The special token `{ext}` matches any of the allowed extensions.
/// The `.` before `{ext}` is treated as a literal dot.
/// The match is anchored to the full filename.
fn match_pattern_with_captures(
    filename: &str,
    pattern: &str,
    extensions: &[String],
    case_sensitive: bool,
) -> Option<HashMap<String, String>> {
    let regex = build_pattern_regex(pattern, extensions, case_sensitive)?;

    let caps = regex.captures(filename)?;

    let mut result = HashMap::new();
    for name in &["avatar", "scene_type", "track", "slot_name", "ext"] {
        if let Some(m) = caps.name(name) {
            result.insert(name.to_string(), m.as_str().to_string());
        }
    }

    Some(result)
}

/// Build a regex from a pattern template and extension list.
///
/// Converts `{token}` placeholders to named capture groups:
/// - `{ext}` becomes an alternation of the allowed extensions
/// - Other tokens match `[^._/\\]+` (word-like segments)
fn build_pattern_regex(
    pattern: &str,
    extensions: &[String],
    case_sensitive: bool,
) -> Option<Regex> {
    let pat = if case_sensitive {
        pattern.to_string()
    } else {
        pattern.to_lowercase()
    };

    // Escape everything that is not a token placeholder.
    let mut regex_str = String::from("^");
    let mut chars = pat.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '{' {
            // Extract token name up to '}'.
            let mut token = String::new();
            for tc in chars.by_ref() {
                if tc == '}' {
                    break;
                }
                token.push(tc);
            }

            if token == "ext" {
                if extensions.is_empty() {
                    return None;
                }
                let alts: Vec<String> = extensions
                    .iter()
                    .map(|e| {
                        if case_sensitive {
                            regex::escape(e)
                        } else {
                            regex::escape(&e.to_lowercase())
                        }
                    })
                    .collect();
                regex_str.push_str(&format!("(?P<ext>{})", alts.join("|")));
            } else {
                // Named capture group matching word-like segments.
                regex_str.push_str(&format!("(?P<{token}>[^._/\\\\]+)"));
            }
        } else {
            // Escape literal characters (`.` becomes `\.`, etc.).
            regex_str.push_str(&regex::escape(&ch.to_string()));
        }
    }

    regex_str.push('$');

    Regex::new(&regex_str).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::{ImportRules, MetadataPattern, SeedPattern, VideoPattern};

    /// Build x121 import rules matching the seed migration.
    fn x121_rules() -> ImportRules {
        ImportRules {
            seed_patterns: vec![
                SeedPattern {
                    slot: "clothed".into(),
                    pattern: "{avatar}_clothed.{ext}".into(),
                    extensions: vec!["png".into(), "jpg".into(), "jpeg".into(), "webp".into()],
                },
                SeedPattern {
                    slot: "clothed".into(),
                    pattern: "clothed.{ext}".into(),
                    extensions: vec!["png".into(), "jpg".into(), "jpeg".into(), "webp".into()],
                },
                SeedPattern {
                    slot: "topless".into(),
                    pattern: "{avatar}_topless.{ext}".into(),
                    extensions: vec!["png".into(), "jpg".into(), "jpeg".into(), "webp".into()],
                },
                SeedPattern {
                    slot: "topless".into(),
                    pattern: "topless.{ext}".into(),
                    extensions: vec!["png".into(), "jpg".into(), "jpeg".into(), "webp".into()],
                },
            ],
            video_patterns: vec![
                VideoPattern {
                    pattern: "{scene_type}.{ext}".into(),
                    extensions: vec!["mp4".into()],
                },
                VideoPattern {
                    pattern: "{track}_{scene_type}.{ext}".into(),
                    extensions: vec!["mp4".into()],
                },
                VideoPattern {
                    pattern: "topless_{scene_type}.{ext}".into(),
                    extensions: vec!["mp4".into()],
                },
            ],
            metadata_patterns: vec![
                MetadataPattern {
                    pattern_type: "bio".into(),
                    pattern: "bio.json".into(),
                },
                MetadataPattern {
                    pattern_type: "tov".into(),
                    pattern: "tov.json".into(),
                },
                MetadataPattern {
                    pattern_type: "metadata".into(),
                    pattern: "metadata.json".into(),
                },
            ],
            case_sensitive: false,
        }
    }

    /// Build y122 import rules matching the seed migration.
    fn y122_rules() -> ImportRules {
        ImportRules {
            seed_patterns: vec![
                SeedPattern {
                    slot: "reference".into(),
                    pattern: "{avatar}.{ext}".into(),
                    extensions: vec!["png".into(), "jpg".into(), "jpeg".into(), "webp".into()],
                },
                SeedPattern {
                    slot: "reference".into(),
                    pattern: "reference.{ext}".into(),
                    extensions: vec!["png".into(), "jpg".into(), "jpeg".into(), "webp".into()],
                },
            ],
            video_patterns: vec![VideoPattern {
                pattern: "{scene_type}.{ext}".into(),
                extensions: vec!["mp4".into()],
            }],
            metadata_patterns: vec![
                MetadataPattern {
                    pattern_type: "bio".into(),
                    pattern: "bio.json".into(),
                },
                MetadataPattern {
                    pattern_type: "tov".into(),
                    pattern: "tov.json".into(),
                },
            ],
            case_sensitive: false,
        }
    }

    #[test]
    fn x121_clothed_png() {
        let result = classify_file("clothed.png", &x121_rules());
        assert_eq!(
            result,
            FileClassification::SeedImage {
                slot: "clothed".into()
            }
        );
    }

    #[test]
    fn x121_avatar_topless_jpg() {
        let result = classify_file("jane_topless.jpg", &x121_rules());
        assert_eq!(
            result,
            FileClassification::SeedImage {
                slot: "topless".into()
            }
        );
    }

    #[test]
    fn x121_video_simple() {
        let result = classify_file("bj.mp4", &x121_rules());
        assert_eq!(
            result,
            FileClassification::Video {
                scene_type: "bj".into(),
                track: None,
            }
        );
    }

    #[test]
    fn x121_video_with_track() {
        let result = classify_file("topless_dance.mp4", &x121_rules());
        // Should match the third video pattern: "topless_{scene_type}.{ext}"
        // which does not have a {track} token — "topless" is literal.
        // But it also matches the second pattern: "{track}_{scene_type}.{ext}"
        // which comes first and has track capture.
        assert_eq!(
            result,
            FileClassification::Video {
                scene_type: "dance".into(),
                track: Some("topless".into()),
            }
        );
    }

    #[test]
    fn y122_reference_png() {
        let result = classify_file("reference.png", &y122_rules());
        assert_eq!(
            result,
            FileClassification::SeedImage {
                slot: "reference".into()
            }
        );
    }

    #[test]
    fn metadata_bio_json() {
        let result = classify_file("bio.json", &x121_rules());
        assert_eq!(
            result,
            FileClassification::Metadata {
                metadata_type: "bio".into()
            }
        );
    }

    #[test]
    fn unrecognized_file() {
        let result = classify_file("random.txt", &x121_rules());
        assert_eq!(result, FileClassification::Unrecognized);
    }

    #[test]
    fn case_insensitive_match() {
        let result = classify_file("CLOTHED.PNG", &x121_rules());
        assert_eq!(
            result,
            FileClassification::SeedImage {
                slot: "clothed".into()
            }
        );
    }

    #[test]
    fn case_sensitive_no_match() {
        let mut rules = x121_rules();
        rules.case_sensitive = true;
        let result = classify_file("CLOTHED.PNG", &rules);
        assert_eq!(result, FileClassification::Unrecognized);
    }

    #[test]
    fn metadata_json_exact() {
        let result = classify_file("metadata.json", &x121_rules());
        assert_eq!(
            result,
            FileClassification::Metadata {
                metadata_type: "metadata".into()
            }
        );
    }

    #[test]
    fn tov_json() {
        let result = classify_file("tov.json", &x121_rules());
        assert_eq!(
            result,
            FileClassification::Metadata {
                metadata_type: "tov".into()
            }
        );
    }

    #[test]
    fn y122_avatar_named_seed() {
        let result = classify_file("alice.png", &y122_rules());
        assert_eq!(
            result,
            FileClassification::SeedImage {
                slot: "reference".into()
            }
        );
    }

    #[test]
    fn avatar_clothed_with_name() {
        let result = classify_file("alice_clothed.webp", &x121_rules());
        assert_eq!(
            result,
            FileClassification::SeedImage {
                slot: "clothed".into()
            }
        );
    }

    #[test]
    fn empty_extensions_no_panic() {
        let rules = ImportRules {
            seed_patterns: vec![SeedPattern {
                slot: "test".into(),
                pattern: "test.{ext}".into(),
                extensions: vec![],
            }],
            video_patterns: vec![],
            metadata_patterns: vec![],
            case_sensitive: false,
        };
        let result = classify_file("test.png", &rules);
        assert_eq!(result, FileClassification::Unrecognized);
    }
}
