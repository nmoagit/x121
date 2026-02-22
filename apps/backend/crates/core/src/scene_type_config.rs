//! Scene type configuration constants, prompt template resolution,
//! and validation helpers (PRD-23).

use std::collections::HashMap;
use std::sync::LazyLock;

/// Regex matching `{placeholder}` tokens in prompt templates.
static PLACEHOLDER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\{(\w+)\}").expect("valid regex"));

// ---------------------------------------------------------------------------
// Variant applicability
// ---------------------------------------------------------------------------

pub const VARIANT_CLOTHED: &str = "clothed";
pub const VARIANT_TOPLESS: &str = "topless";
pub const VARIANT_BOTH: &str = "both";
pub const VARIANT_CLOTHES_OFF: &str = "clothes_off";

pub const VALID_VARIANT_TYPES: &[&str] = &[
    VARIANT_CLOTHED,
    VARIANT_TOPLESS,
    VARIANT_BOTH,
    VARIANT_CLOTHES_OFF,
];

/// Expand a variant_applicability value into the concrete variant labels.
pub fn expand_variants(variant_applicability: &str) -> Vec<&'static str> {
    match variant_applicability {
        VARIANT_CLOTHED => vec![VARIANT_CLOTHED],
        VARIANT_TOPLESS => vec![VARIANT_TOPLESS],
        VARIANT_BOTH => vec![VARIANT_CLOTHED, VARIANT_TOPLESS],
        VARIANT_CLOTHES_OFF => vec![VARIANT_CLOTHED, VARIANT_TOPLESS], // both, with transition
        _ => vec![VARIANT_CLOTHED, VARIANT_TOPLESS],                  // default to both
    }
}

pub fn validate_variant_applicability(value: &str) -> Result<(), String> {
    if VALID_VARIANT_TYPES.contains(&value) {
        Ok(())
    } else {
        Err(format!(
            "Invalid variant_applicability '{value}'. Must be one of: {}",
            VALID_VARIANT_TYPES.join(", ")
        ))
    }
}

// ---------------------------------------------------------------------------
// Clip positions
// ---------------------------------------------------------------------------

pub const CLIP_FULL: &str = "full_clip";
pub const CLIP_START: &str = "start_clip";
pub const CLIP_CONTINUATION: &str = "continuation_clip";

pub const VALID_CLIP_POSITIONS: &[&str] = &[CLIP_FULL, CLIP_START, CLIP_CONTINUATION];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClipPosition {
    FullClip,
    StartClip,
    ContinuationClip,
}

impl ClipPosition {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            CLIP_FULL => Ok(Self::FullClip),
            CLIP_START => Ok(Self::StartClip),
            CLIP_CONTINUATION => Ok(Self::ContinuationClip),
            _ => Err(format!(
                "Invalid clip_position '{s}'. Must be one of: {}",
                VALID_CLIP_POSITIONS.join(", ")
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Prompt template resolution
// ---------------------------------------------------------------------------

/// Result of resolving a prompt template against character metadata.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ResolvedPrompt {
    pub text: String,
    pub unresolved_placeholders: Vec<String>,
}

/// Resolve `{placeholder}` tokens in a template using character metadata values.
///
/// Unknown placeholders are left in place and listed in `unresolved_placeholders`.
/// Empty metadata values resolve to empty string.
pub fn resolve_prompt_template(
    template: &str,
    metadata: &HashMap<String, String>,
) -> ResolvedPrompt {
    let mut unresolved = Vec::new();
    let text = PLACEHOLDER_RE
        .replace_all(template, |caps: &regex::Captures| {
            let key = &caps[1];
            match metadata.get(key) {
                Some(value) => value.clone(),
                None => {
                    unresolved.push(key.to_string());
                    caps[0].to_string()
                }
            }
        })
        .to_string();
    ResolvedPrompt {
        text,
        unresolved_placeholders: unresolved,
    }
}

/// Select the prompt template for a given clip position.
///
/// Falls back to `full_clip_prompt` when position-specific prompt is None.
pub fn select_prompt_for_position<'a>(
    full_clip_prompt: Option<&'a str>,
    start_clip_prompt: Option<&'a str>,
    continuation_clip_prompt: Option<&'a str>,
    position: ClipPosition,
) -> Option<&'a str> {
    let fallback = full_clip_prompt;
    match position {
        ClipPosition::FullClip => full_clip_prompt,
        ClipPosition::StartClip => start_clip_prompt.or(fallback),
        ClipPosition::ContinuationClip => continuation_clip_prompt.or(fallback),
    }
}

// ---------------------------------------------------------------------------
// Duration validation
// ---------------------------------------------------------------------------

/// Validate duration configuration. Returns an error message if invalid.
pub fn validate_duration_config(
    target_duration_secs: Option<i32>,
    segment_duration_secs: Option<i32>,
    duration_tolerance_secs: Option<i32>,
) -> Result<(), String> {
    if let Some(target) = target_duration_secs {
        if target <= 0 {
            return Err("target_duration_secs must be positive".to_string());
        }
    }
    if let Some(segment) = segment_duration_secs {
        if segment <= 0 {
            return Err("segment_duration_secs must be positive".to_string());
        }
    }
    if let Some(tolerance) = duration_tolerance_secs {
        if tolerance < 0 {
            return Err("duration_tolerance_secs must be non-negative".to_string());
        }
    }
    if let (Some(target), Some(segment)) = (target_duration_secs, segment_duration_secs) {
        if segment > target {
            return Err(format!(
                "segment_duration_secs ({segment}) must not exceed target_duration_secs ({target})"
            ));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Known placeholder fields (for validation hints)
// ---------------------------------------------------------------------------

/// Well-known character metadata fields usable as prompt placeholders.
pub const KNOWN_PLACEHOLDERS: &[&str] = &[
    "character_name",
    "hair_color",
    "eye_color",
    "build",
    "height",
    "description",
];

/// Extract placeholder keys from a template string.
pub fn extract_placeholders(template: &str) -> Vec<String> {
    PLACEHOLDER_RE
        .captures_iter(template)
        .map(|cap| cap[1].to_string())
        .collect()
}

/// Validate that all placeholders in a template are known fields.
/// Returns unknown placeholders as warnings (not errors).
pub fn validate_placeholders(template: &str) -> Vec<String> {
    extract_placeholders(template)
        .into_iter()
        .filter(|p| !KNOWN_PLACEHOLDERS.contains(&p.as_str()))
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Variant expansion --

    #[test]
    fn expand_clothed_only() {
        assert_eq!(expand_variants(VARIANT_CLOTHED), vec!["clothed"]);
    }

    #[test]
    fn expand_topless_only() {
        assert_eq!(expand_variants(VARIANT_TOPLESS), vec!["topless"]);
    }

    #[test]
    fn expand_both_variants() {
        assert_eq!(expand_variants(VARIANT_BOTH), vec!["clothed", "topless"]);
    }

    #[test]
    fn expand_clothes_off() {
        assert_eq!(
            expand_variants(VARIANT_CLOTHES_OFF),
            vec!["clothed", "topless"]
        );
    }

    #[test]
    fn validate_variant_valid() {
        assert!(validate_variant_applicability("clothed").is_ok());
        assert!(validate_variant_applicability("both").is_ok());
    }

    #[test]
    fn validate_variant_invalid() {
        assert!(validate_variant_applicability("naked").is_err());
        assert!(validate_variant_applicability("").is_err());
    }

    // -- Clip position --

    #[test]
    fn parse_clip_positions() {
        assert_eq!(
            ClipPosition::parse("full_clip").unwrap(),
            ClipPosition::FullClip
        );
        assert_eq!(
            ClipPosition::parse("start_clip").unwrap(),
            ClipPosition::StartClip
        );
        assert_eq!(
            ClipPosition::parse("continuation_clip").unwrap(),
            ClipPosition::ContinuationClip
        );
    }

    #[test]
    fn parse_invalid_clip_position() {
        assert!(ClipPosition::parse("middle_clip").is_err());
    }

    // -- Prompt resolution --

    #[test]
    fn resolve_all_placeholders() {
        let mut meta = HashMap::new();
        meta.insert("character_name".to_string(), "Alice".to_string());
        meta.insert("hair_color".to_string(), "red".to_string());
        let result =
            resolve_prompt_template("Photo of {character_name} with {hair_color} hair", &meta);
        assert_eq!(result.text, "Photo of Alice with red hair");
        assert!(result.unresolved_placeholders.is_empty());
    }

    #[test]
    fn resolve_missing_placeholder() {
        let meta = HashMap::new();
        let result = resolve_prompt_template("Photo of {character_name}", &meta);
        assert_eq!(result.text, "Photo of {character_name}");
        assert_eq!(result.unresolved_placeholders, vec!["character_name"]);
    }

    #[test]
    fn resolve_empty_value() {
        let mut meta = HashMap::new();
        meta.insert("character_name".to_string(), String::new());
        let result = resolve_prompt_template("Photo of {character_name}", &meta);
        assert_eq!(result.text, "Photo of ");
        assert!(result.unresolved_placeholders.is_empty());
    }

    #[test]
    fn resolve_no_placeholders() {
        let meta = HashMap::new();
        let result = resolve_prompt_template("A plain prompt with no placeholders", &meta);
        assert_eq!(result.text, "A plain prompt with no placeholders");
        assert!(result.unresolved_placeholders.is_empty());
    }

    // -- Prompt position selection --

    #[test]
    fn select_full_clip() {
        let result = select_prompt_for_position(
            Some("full"),
            Some("start"),
            Some("cont"),
            ClipPosition::FullClip,
        );
        assert_eq!(result, Some("full"));
    }

    #[test]
    fn select_start_clip_with_override() {
        let result = select_prompt_for_position(
            Some("full"),
            Some("start"),
            None,
            ClipPosition::StartClip,
        );
        assert_eq!(result, Some("start"));
    }

    #[test]
    fn select_start_clip_fallback() {
        let result =
            select_prompt_for_position(Some("full"), None, None, ClipPosition::StartClip);
        assert_eq!(result, Some("full"));
    }

    #[test]
    fn select_continuation_clip_fallback() {
        let result = select_prompt_for_position(
            Some("full"),
            None,
            None,
            ClipPosition::ContinuationClip,
        );
        assert_eq!(result, Some("full"));
    }

    // -- Duration validation --

    #[test]
    fn duration_valid() {
        assert!(validate_duration_config(Some(30), Some(5), Some(2)).is_ok());
    }

    #[test]
    fn duration_segment_exceeds_target() {
        assert!(validate_duration_config(Some(5), Some(10), Some(2)).is_err());
    }

    #[test]
    fn duration_negative_target() {
        assert!(validate_duration_config(Some(-1), Some(5), Some(2)).is_err());
    }

    // -- Placeholder validation --

    #[test]
    fn validate_known_placeholders() {
        let unknown = validate_placeholders("Photo of {character_name} in {custom_field}");
        assert_eq!(unknown, vec!["custom_field"]);
    }

    #[test]
    fn extract_placeholder_keys() {
        let keys = extract_placeholders("{a} and {b} and {a}");
        assert_eq!(keys, vec!["a", "b", "a"]);
    }
}
