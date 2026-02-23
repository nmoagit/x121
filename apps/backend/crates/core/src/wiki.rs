//! Wiki article validation, slug generation, and line-diff utilities (PRD-56).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future CLI or worker tooling.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Category constants
// ---------------------------------------------------------------------------

pub const CATEGORY_PLATFORM: &str = "platform";
pub const CATEGORY_WORKFLOW: &str = "workflow";
pub const CATEGORY_TROUBLESHOOTING: &str = "troubleshooting";
pub const CATEGORY_TUTORIAL: &str = "tutorial";
pub const CATEGORY_REFERENCE: &str = "reference";

/// All valid wiki article categories.
pub const VALID_CATEGORIES: &[&str] = &[
    CATEGORY_PLATFORM,
    CATEGORY_WORKFLOW,
    CATEGORY_TROUBLESHOOTING,
    CATEGORY_TUTORIAL,
    CATEGORY_REFERENCE,
];

// ---------------------------------------------------------------------------
// Pin location constants
// ---------------------------------------------------------------------------

pub const PIN_DASHBOARD: &str = "dashboard";

/// All valid pin locations for wiki articles.
pub const VALID_PIN_LOCATIONS: &[&str] = &[PIN_DASHBOARD];

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/// Generate a URL-safe slug from an article title.
///
/// Converts to lowercase, replaces spaces and special characters with hyphens,
/// collapses consecutive hyphens, and trims leading/trailing hyphens.
pub fn generate_slug(title: &str) -> String {
    let slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else {
                '-'
            }
        })
        .collect();

    // Collapse consecutive hyphens.
    let mut result = String::with_capacity(slug.len());
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen {
                result.push('-');
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }

    // Trim leading/trailing hyphens.
    result.trim_matches('-').to_string()
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a wiki article title (non-empty, <= 200 chars).
pub fn validate_title(title: &str) -> Result<(), CoreError> {
    if title.trim().is_empty() {
        return Err(CoreError::Validation("Title must not be empty".into()));
    }
    if title.len() > 200 {
        return Err(CoreError::Validation(
            "Title must be at most 200 characters".into(),
        ));
    }
    Ok(())
}

/// Validate a wiki article slug (non-empty, only lowercase alphanumeric + hyphens).
pub fn validate_slug(slug: &str) -> Result<(), CoreError> {
    if slug.is_empty() {
        return Err(CoreError::Validation("Slug must not be empty".into()));
    }
    if !slug
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(CoreError::Validation(
            "Slug must contain only lowercase alphanumeric characters and hyphens".into(),
        ));
    }
    Ok(())
}

/// Validate a wiki article category against the known set.
pub fn validate_category(cat: &str) -> Result<(), CoreError> {
    if !VALID_CATEGORIES.contains(&cat) {
        return Err(CoreError::Validation(format!(
            "Invalid category '{}'. Valid categories: {}",
            cat,
            VALID_CATEGORIES.join(", ")
        )));
    }
    Ok(())
}

/// Validate a pin location against the known set.
pub fn validate_pin_location(loc: &str) -> Result<(), CoreError> {
    if !VALID_PIN_LOCATIONS.contains(&loc) {
        return Err(CoreError::Validation(format!(
            "Invalid pin location '{}'. Valid locations: {}",
            loc,
            VALID_PIN_LOCATIONS.join(", ")
        )));
    }
    Ok(())
}

/// Validate article tags (each non-empty, <= 50 chars, max 20 tags).
pub fn validate_tags(tags: &[String]) -> Result<(), CoreError> {
    if tags.len() > 20 {
        return Err(CoreError::Validation(
            "A maximum of 20 tags is allowed".into(),
        ));
    }
    for tag in tags {
        if tag.trim().is_empty() {
            return Err(CoreError::Validation("Tags must not be empty".into()));
        }
        if tag.len() > 50 {
            return Err(CoreError::Validation(
                "Each tag must be at most 50 characters".into(),
            ));
        }
    }
    Ok(())
}

/// Validate article content (max 100 000 chars).
pub fn validate_content(content: &str) -> Result<(), CoreError> {
    if content.len() > 100_000 {
        return Err(CoreError::Validation(
            "Content must be at most 100000 characters".into(),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Simple line-level diff
// ---------------------------------------------------------------------------

/// The type of a line in a diff result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffLineType {
    Added,
    Removed,
    Unchanged,
}

/// A single line in a diff result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub line_type: DiffLineType,
    pub content: String,
}

/// Compute a simple line-level diff between two texts using LCS.
///
/// Returns a list of [`DiffLine`] entries indicating which lines were added,
/// removed, or left unchanged.
pub fn compute_line_diff(old: &str, new: &str) -> Vec<DiffLine> {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    let m = old_lines.len();
    let n = new_lines.len();

    // Build LCS table.
    let mut lcs = vec![vec![0u32; n + 1]; m + 1];
    for i in 1..=m {
        for j in 1..=n {
            if old_lines[i - 1] == new_lines[j - 1] {
                lcs[i][j] = lcs[i - 1][j - 1] + 1;
            } else {
                lcs[i][j] = lcs[i - 1][j].max(lcs[i][j - 1]);
            }
        }
    }

    // Backtrack to produce diff.
    let mut result = Vec::new();
    let mut i = m;
    let mut j = n;
    while i > 0 || j > 0 {
        if i > 0 && j > 0 && old_lines[i - 1] == new_lines[j - 1] {
            result.push(DiffLine {
                line_type: DiffLineType::Unchanged,
                content: old_lines[i - 1].to_string(),
            });
            i -= 1;
            j -= 1;
        } else if j > 0 && (i == 0 || lcs[i][j - 1] >= lcs[i - 1][j]) {
            result.push(DiffLine {
                line_type: DiffLineType::Added,
                content: new_lines[j - 1].to_string(),
            });
            j -= 1;
        } else {
            result.push(DiffLine {
                line_type: DiffLineType::Removed,
                content: old_lines[i - 1].to_string(),
            });
            i -= 1;
        }
    }

    result.reverse();
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- generate_slug -------------------------------------------------------

    #[test]
    fn slug_basic_title() {
        assert_eq!(generate_slug("Getting Started"), "getting-started");
    }

    #[test]
    fn slug_special_characters() {
        assert_eq!(
            generate_slug("How to: Use Workflows (v2)"),
            "how-to-use-workflows-v2"
        );
    }

    #[test]
    fn slug_collapses_consecutive_hyphens() {
        assert_eq!(generate_slug("foo---bar"), "foo-bar");
    }

    #[test]
    fn slug_trims_leading_trailing_hyphens() {
        assert_eq!(generate_slug("--hello--"), "hello");
    }

    // -- validate_title ------------------------------------------------------

    #[test]
    fn title_valid() {
        assert!(validate_title("My Article").is_ok());
    }

    #[test]
    fn title_empty_rejected() {
        assert!(validate_title("").is_err());
        assert!(validate_title("   ").is_err());
    }

    #[test]
    fn title_too_long_rejected() {
        let long = "a".repeat(201);
        assert!(validate_title(&long).is_err());
    }

    // -- validate_slug -------------------------------------------------------

    #[test]
    fn slug_valid() {
        assert!(validate_slug("getting-started").is_ok());
    }

    #[test]
    fn slug_empty_rejected() {
        assert!(validate_slug("").is_err());
    }

    #[test]
    fn slug_uppercase_rejected() {
        assert!(validate_slug("Hello-World").is_err());
    }

    // -- validate_category ---------------------------------------------------

    #[test]
    fn category_valid() {
        assert!(validate_category("platform").is_ok());
        assert!(validate_category("tutorial").is_ok());
    }

    #[test]
    fn category_invalid() {
        assert!(validate_category("unknown").is_err());
    }

    // -- validate_tags -------------------------------------------------------

    #[test]
    fn tags_valid() {
        let tags = vec!["rust".to_string(), "wiki".to_string()];
        assert!(validate_tags(&tags).is_ok());
    }

    #[test]
    fn tags_too_many_rejected() {
        let tags: Vec<String> = (0..21).map(|i| format!("tag-{i}")).collect();
        assert!(validate_tags(&tags).is_err());
    }

    #[test]
    fn tags_empty_string_rejected() {
        let tags = vec!["".to_string()];
        assert!(validate_tags(&tags).is_err());
    }

    // -- validate_content ----------------------------------------------------

    #[test]
    fn content_valid() {
        assert!(validate_content("Hello world").is_ok());
    }

    #[test]
    fn content_too_long_rejected() {
        let long = "x".repeat(100_001);
        assert!(validate_content(&long).is_err());
    }

    // -- compute_line_diff ---------------------------------------------------

    #[test]
    fn diff_identical_texts() {
        let diff = compute_line_diff("line1\nline2", "line1\nline2");
        assert_eq!(diff.len(), 2);
        assert!(diff.iter().all(|d| d.line_type == DiffLineType::Unchanged));
    }

    #[test]
    fn diff_added_line() {
        let diff = compute_line_diff("line1", "line1\nline2");
        assert_eq!(diff.len(), 2);
        assert_eq!(diff[0].line_type, DiffLineType::Unchanged);
        assert_eq!(diff[1].line_type, DiffLineType::Added);
        assert_eq!(diff[1].content, "line2");
    }

    #[test]
    fn diff_removed_line() {
        let diff = compute_line_diff("line1\nline2", "line1");
        assert_eq!(diff.len(), 2);
        assert_eq!(diff[0].line_type, DiffLineType::Unchanged);
        assert_eq!(diff[1].line_type, DiffLineType::Removed);
        assert_eq!(diff[1].content, "line2");
    }

    #[test]
    fn diff_changed_line() {
        let diff = compute_line_diff("hello", "world");
        // Should see one removed and one added.
        assert_eq!(diff.len(), 2);
        let types: Vec<_> = diff.iter().map(|d| &d.line_type).collect();
        assert!(types.contains(&&DiffLineType::Removed));
        assert!(types.contains(&&DiffLineType::Added));
    }
}
