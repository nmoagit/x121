//! Prompt editor types and validation (PRD-63).
//!
//! Provides constants, validation functions, placeholder extraction,
//! token estimation, and diff computation for prompt versioning.

use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;

use crate::error::CoreError;
use crate::provenance::MAX_PROMPT_LENGTH;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum length for negative prompts in characters.
pub const MAX_NEGATIVE_PROMPT_LENGTH: usize = 5_000;

/// Maximum length for version change notes in characters.
pub const MAX_CHANGE_NOTES_LENGTH: usize = 1_000;

/// Maximum length for a prompt library entry name.
pub const MAX_LIBRARY_NAME_LENGTH: usize = 200;

/// Maximum number of tags on a prompt library entry.
pub const MAX_TAGS_COUNT: usize = 20;

/// Regex pattern matching `{placeholder}` tokens in prompt templates.
pub const PLACEHOLDER_PATTERN: &str = r"\{[a-zA-Z_][a-zA-Z0-9_.]*\}";

/// Compiled regex for `{placeholder}` extraction. Compiled once, reused forever.
static PLACEHOLDER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(PLACEHOLDER_PATTERN).expect("valid regex"));

/// Multiplier for rough CLIP token estimation from word count.
const TOKEN_ESTIMATE_MULTIPLIER: f64 = 1.3;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a positive prompt: must be non-empty and within length limit.
pub fn validate_prompt(text: &str) -> Result<(), CoreError> {
    if text.is_empty() {
        return Err(CoreError::Validation(
            "Positive prompt must not be empty".to_string(),
        ));
    }
    if text.len() > MAX_PROMPT_LENGTH {
        return Err(CoreError::Validation(format!(
            "Positive prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters (got {})",
            text.len()
        )));
    }
    Ok(())
}

/// Validate a negative prompt: length check only (can be empty).
pub fn validate_negative_prompt(text: &str) -> Result<(), CoreError> {
    if text.len() > MAX_NEGATIVE_PROMPT_LENGTH {
        return Err(CoreError::Validation(format!(
            "Negative prompt exceeds maximum length of {MAX_NEGATIVE_PROMPT_LENGTH} characters (got {})",
            text.len()
        )));
    }
    Ok(())
}

/// Validate change notes: length check only.
pub fn validate_change_notes(notes: &str) -> Result<(), CoreError> {
    if notes.len() > MAX_CHANGE_NOTES_LENGTH {
        return Err(CoreError::Validation(format!(
            "Change notes exceed maximum length of {MAX_CHANGE_NOTES_LENGTH} characters (got {})",
            notes.len()
        )));
    }
    Ok(())
}

/// Validate a prompt library entry name: must be non-empty and within length limit.
pub fn validate_library_name(name: &str) -> Result<(), CoreError> {
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Library entry name must not be empty".to_string(),
        ));
    }
    if name.len() > MAX_LIBRARY_NAME_LENGTH {
        return Err(CoreError::Validation(format!(
            "Library entry name exceeds maximum length of {MAX_LIBRARY_NAME_LENGTH} characters (got {})",
            name.len()
        )));
    }
    Ok(())
}

/// Validate tags count: must not exceed the maximum.
pub fn validate_tags(tags: &[String]) -> Result<(), CoreError> {
    if tags.len() > MAX_TAGS_COUNT {
        return Err(CoreError::Validation(format!(
            "Tag count exceeds maximum of {MAX_TAGS_COUNT} (got {})",
            tags.len()
        )));
    }
    Ok(())
}

/// Validate a library entry rating: must be between 1.0 and 5.0 inclusive.
pub fn validate_rating(rating: f64) -> Result<(), CoreError> {
    if !(1.0..=5.0).contains(&rating) {
        return Err(CoreError::Validation(format!(
            "Rating must be between 1.0 and 5.0 (got {rating})"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Placeholder extraction
// ---------------------------------------------------------------------------

/// Extract all `{placeholder}` tokens from a template string.
///
/// Returns a de-duplicated, sorted list of placeholder names (without braces).
pub fn extract_placeholders(template: &str) -> Vec<String> {
    let mut placeholders: Vec<String> = PLACEHOLDER_RE
        .find_iter(template)
        .map(|m| {
            let s = m.as_str();
            // Strip surrounding braces.
            s[1..s.len() - 1].to_string()
        })
        .collect();
    placeholders.sort();
    placeholders.dedup();
    placeholders
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/// Rough CLIP token estimate based on word count.
///
/// Uses the heuristic: tokens ~= words * 1.3.
pub fn estimate_token_count(text: &str) -> usize {
    let word_count = text.split_whitespace().count();
    (word_count as f64 * TOKEN_ESTIMATE_MULTIPLIER).ceil() as usize
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/// Summary of differences between two prompt versions.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PromptDiff {
    /// Whether the positive prompt text changed.
    pub positive_changed: bool,
    /// Whether the negative prompt text changed.
    pub negative_changed: bool,
    /// Number of words added to the positive prompt.
    pub positive_additions: usize,
    /// Number of words removed from the positive prompt.
    pub positive_removals: usize,
}

/// Compute a diff summary between two prompt versions.
///
/// Compares old and new positive/negative prompts and returns a summary
/// of what changed, including word-level addition/removal counts.
pub fn compute_diff(
    old_positive: &str,
    new_positive: &str,
    old_negative: Option<&str>,
    new_negative: Option<&str>,
) -> PromptDiff {
    let positive_changed = old_positive != new_positive;
    let negative_changed = old_negative != new_negative;

    let (positive_additions, positive_removals) = if positive_changed {
        word_diff_counts(old_positive, new_positive)
    } else {
        (0, 0)
    };

    PromptDiff {
        positive_changed,
        negative_changed,
        positive_additions,
        positive_removals,
    }
}

/// Count word-level additions and removals between two texts.
///
/// Uses simple set-difference on word bags (not order-sensitive).
fn word_diff_counts(old_text: &str, new_text: &str) -> (usize, usize) {
    use std::collections::HashSet;

    let old_words: Vec<&str> = old_text.split_whitespace().collect();
    let new_words: Vec<&str> = new_text.split_whitespace().collect();

    let old_set: HashSet<&str> = old_words.iter().copied().collect();
    let new_set: HashSet<&str> = new_words.iter().copied().collect();

    let additions = new_words.iter().filter(|w| !old_set.contains(**w)).count();
    let removals = old_words.iter().filter(|w| !new_set.contains(**w)).count();

    (additions, removals)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_prompt --

    #[test]
    fn valid_prompt_passes() {
        assert!(validate_prompt("a beautiful landscape").is_ok());
    }

    #[test]
    fn empty_prompt_rejected() {
        let err = validate_prompt("").unwrap_err();
        assert!(err.to_string().contains("must not be empty"));
    }

    #[test]
    fn too_long_prompt_rejected() {
        let long = "x".repeat(MAX_PROMPT_LENGTH + 1);
        let err = validate_prompt(&long).unwrap_err();
        assert!(err.to_string().contains("exceeds maximum length"));
    }

    #[test]
    fn boundary_prompt_length_passes() {
        let exact = "x".repeat(MAX_PROMPT_LENGTH);
        assert!(validate_prompt(&exact).is_ok());
    }

    // -- validate_negative_prompt --

    #[test]
    fn valid_negative_prompt_passes() {
        assert!(validate_negative_prompt("blurry, low quality").is_ok());
    }

    #[test]
    fn empty_negative_prompt_passes() {
        assert!(validate_negative_prompt("").is_ok());
    }

    #[test]
    fn too_long_negative_prompt_rejected() {
        let long = "x".repeat(MAX_NEGATIVE_PROMPT_LENGTH + 1);
        let err = validate_negative_prompt(&long).unwrap_err();
        assert!(err.to_string().contains("Negative prompt exceeds"));
    }

    // -- validate_change_notes --

    #[test]
    fn valid_change_notes_passes() {
        assert!(validate_change_notes("Updated lighting keywords").is_ok());
    }

    #[test]
    fn too_long_change_notes_rejected() {
        let long = "x".repeat(MAX_CHANGE_NOTES_LENGTH + 1);
        let err = validate_change_notes(&long).unwrap_err();
        assert!(err.to_string().contains("Change notes exceed"));
    }

    // -- validate_library_name --

    #[test]
    fn valid_library_name_passes() {
        assert!(validate_library_name("Cinematic Portrait").is_ok());
    }

    #[test]
    fn empty_library_name_rejected() {
        let err = validate_library_name("").unwrap_err();
        assert!(err.to_string().contains("must not be empty"));
    }

    #[test]
    fn too_long_library_name_rejected() {
        let long = "x".repeat(MAX_LIBRARY_NAME_LENGTH + 1);
        let err = validate_library_name(&long).unwrap_err();
        assert!(err.to_string().contains("exceeds maximum length"));
    }

    // -- validate_tags --

    #[test]
    fn valid_tags_passes() {
        let tags: Vec<String> = (0..MAX_TAGS_COUNT).map(|i| format!("tag{i}")).collect();
        assert!(validate_tags(&tags).is_ok());
    }

    #[test]
    fn too_many_tags_rejected() {
        let tags: Vec<String> = (0..MAX_TAGS_COUNT + 1).map(|i| format!("tag{i}")).collect();
        let err = validate_tags(&tags).unwrap_err();
        assert!(err.to_string().contains("Tag count exceeds"));
    }

    // -- validate_rating --

    #[test]
    fn valid_rating_passes() {
        assert!(validate_rating(1.0).is_ok());
        assert!(validate_rating(3.5).is_ok());
        assert!(validate_rating(5.0).is_ok());
    }

    #[test]
    fn rating_below_one_rejected() {
        let err = validate_rating(0.5).unwrap_err();
        assert!(err.to_string().contains("must be between 1.0 and 5.0"));
    }

    #[test]
    fn rating_above_five_rejected() {
        let err = validate_rating(5.1).unwrap_err();
        assert!(err.to_string().contains("must be between 1.0 and 5.0"));
    }

    // -- extract_placeholders --

    #[test]
    fn extracts_simple_placeholders() {
        let result = extract_placeholders("A {style} photo of {subject}");
        assert_eq!(result, vec!["style", "subject"]);
    }

    #[test]
    fn extracts_nested_dot_placeholders() {
        let result = extract_placeholders("{scene.lighting} at {scene.time_of_day}");
        assert_eq!(result, vec!["scene.lighting", "scene.time_of_day"]);
    }

    #[test]
    fn deduplicates_placeholders() {
        let result = extract_placeholders("{style} photo, {style} image");
        assert_eq!(result, vec!["style"]);
    }

    #[test]
    fn no_placeholders_returns_empty() {
        let result = extract_placeholders("A simple prompt with no tokens");
        assert!(result.is_empty());
    }

    #[test]
    fn ignores_invalid_placeholders() {
        // Placeholder must start with letter or underscore.
        let result = extract_placeholders("Value is {123invalid}");
        assert!(result.is_empty());
    }

    // -- estimate_token_count --

    #[test]
    fn token_count_for_empty_string() {
        assert_eq!(estimate_token_count(""), 0);
    }

    #[test]
    fn token_count_for_single_word() {
        // 1 word * 1.3 = 1.3, ceil = 2
        assert_eq!(estimate_token_count("hello"), 2);
    }

    #[test]
    fn token_count_for_multiple_words() {
        // 5 words * 1.3 = 6.5, ceil = 7
        assert_eq!(estimate_token_count("a beautiful sunset over ocean"), 7);
    }

    // -- compute_diff --

    #[test]
    fn identical_prompts_no_diff() {
        let diff = compute_diff("hello world", "hello world", Some("neg"), Some("neg"));
        assert!(!diff.positive_changed);
        assert!(!diff.negative_changed);
        assert_eq!(diff.positive_additions, 0);
        assert_eq!(diff.positive_removals, 0);
    }

    #[test]
    fn positive_only_change() {
        let diff = compute_diff("old text", "new text", Some("neg"), Some("neg"));
        assert!(diff.positive_changed);
        assert!(!diff.negative_changed);
        assert_eq!(diff.positive_additions, 1); // "new"
        assert_eq!(diff.positive_removals, 1); // "old"
    }

    #[test]
    fn negative_only_change() {
        let diff = compute_diff("same", "same", Some("old neg"), Some("new neg"));
        assert!(!diff.positive_changed);
        assert!(diff.negative_changed);
    }

    #[test]
    fn both_changed() {
        let diff = compute_diff("a b c", "a d e", Some("x"), Some("y"));
        assert!(diff.positive_changed);
        assert!(diff.negative_changed);
        assert_eq!(diff.positive_additions, 2); // "d", "e"
        assert_eq!(diff.positive_removals, 2); // "b", "c"
    }

    #[test]
    fn negative_none_to_some() {
        let diff = compute_diff("prompt", "prompt", None, Some("added"));
        assert!(!diff.positive_changed);
        assert!(diff.negative_changed);
    }

    #[test]
    fn negative_some_to_none() {
        let diff = compute_diff("prompt", "prompt", Some("removed"), None);
        assert!(!diff.positive_changed);
        assert!(diff.negative_changed);
    }
}
