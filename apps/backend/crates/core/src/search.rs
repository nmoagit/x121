//! Search & discovery constants and helpers (PRD-20).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future CLI or worker tooling.

// ---------------------------------------------------------------------------
// Relevance weights
// ---------------------------------------------------------------------------

/// PostgreSQL tsvector weight for name fields (highest priority).
pub const WEIGHT_NAME: char = 'A';

/// PostgreSQL tsvector weight for description fields.
pub const WEIGHT_DESCRIPTION: char = 'B';

/// PostgreSQL tsvector weight for tag and template fields.
pub const WEIGHT_TAGS: char = 'C';

/// PostgreSQL tsvector weight for metadata/other fields.
pub const WEIGHT_METADATA: char = 'D';

// ---------------------------------------------------------------------------
// Pagination defaults
// ---------------------------------------------------------------------------

/// Default number of search results per page.
pub const DEFAULT_SEARCH_LIMIT: i64 = 20;

/// Maximum number of search results per page.
pub const MAX_SEARCH_LIMIT: i64 = 100;

/// Default number of typeahead suggestions.
pub const DEFAULT_TYPEAHEAD_LIMIT: i64 = 10;

/// Maximum number of typeahead suggestions.
pub const MAX_TYPEAHEAD_LIMIT: i64 = 25;

/// Default similarity threshold for visual search (0.0 - 1.0).
pub const DEFAULT_SEARCH_SIMILARITY: f64 = 0.5;

/// Default number of similarity results.
pub const DEFAULT_SIMILARITY_LIMIT: i64 = 10;

/// Maximum number of similarity results.
pub const MAX_SIMILARITY_LIMIT: i64 = 50;

// ---------------------------------------------------------------------------
// Entity type constants
// ---------------------------------------------------------------------------

/// Valid entity types for unified search.
pub const SEARCHABLE_ENTITY_TYPES: &[&str] = &["character", "project", "scene_type"];

/// Check whether an entity type is searchable.
pub fn is_valid_entity_type(entity_type: &str) -> bool {
    SEARCHABLE_ENTITY_TYPES.contains(&entity_type)
}

// ---------------------------------------------------------------------------
// Query builder helpers
// ---------------------------------------------------------------------------

/// Sanitize user input into a list of terms suitable for tsquery construction.
///
/// - Splits on whitespace.
/// - Strips non-alphanumeric characters (except `_`) from each term.
/// - Drops empty terms.
///
/// Returns `None` if the input yields no usable terms.
fn sanitize_terms(query: &str) -> Option<Vec<&str>> {
    let terms: Vec<&str> = query
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric() && c != '_'))
        .filter(|t| !t.is_empty())
        .collect();

    if terms.is_empty() { None } else { Some(terms) }
}

/// Sanitize and convert user input into a PostgreSQL `tsquery` string.
///
/// - Whitespace-separated terms are joined with `&` (AND).
/// - Empty or whitespace-only input returns `None`.
/// - Special characters that could break tsquery parsing are stripped.
///
/// # Examples
///
/// ```
/// use trulience_core::search::build_tsquery;
/// assert_eq!(build_tsquery("john dance"), Some("john & dance".to_string()));
/// assert_eq!(build_tsquery("  "), None);
/// assert_eq!(build_tsquery("hello"), Some("hello".to_string()));
/// ```
pub fn build_tsquery(query: &str) -> Option<String> {
    sanitize_terms(query).map(|terms| terms.join(" & "))
}

/// Build a prefix tsquery for typeahead / search-as-you-type.
///
/// Appends `:*` to the last term for prefix matching.
///
/// # Examples
///
/// ```
/// use trulience_core::search::build_prefix_tsquery;
/// assert_eq!(build_prefix_tsquery("joh"), Some("joh:*".to_string()));
/// assert_eq!(build_prefix_tsquery("john da"), Some("john & da:*".to_string()));
/// assert_eq!(build_prefix_tsquery(""), None);
/// ```
pub fn build_prefix_tsquery(query: &str) -> Option<String> {
    let terms = sanitize_terms(query)?;

    if terms.len() == 1 {
        return Some(format!("{}:*", terms[0]));
    }

    // All terms except last are exact, last term gets prefix match.
    let exact = &terms[..terms.len() - 1];
    let prefix = terms[terms.len() - 1];
    Some(format!("{} & {}:*", exact.join(" & "), prefix))
}

/// Clamp a user-provided limit to valid bounds.
pub fn clamp_limit(limit: Option<i64>, default: i64, max: i64) -> i64 {
    limit.unwrap_or(default).max(1).min(max)
}

/// Clamp a user-provided offset to non-negative.
pub fn clamp_offset(offset: Option<i64>) -> i64 {
    offset.unwrap_or(0).max(0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- build_tsquery -------------------------------------------------------

    #[test]
    fn tsquery_single_term() {
        assert_eq!(build_tsquery("hello"), Some("hello".to_string()));
    }

    #[test]
    fn tsquery_multiple_terms_joined_with_and() {
        assert_eq!(
            build_tsquery("john dance"),
            Some("john & dance".to_string())
        );
    }

    #[test]
    fn tsquery_trims_special_characters() {
        assert_eq!(
            build_tsquery("hello! world?"),
            Some("hello & world".to_string())
        );
    }

    #[test]
    fn tsquery_empty_returns_none() {
        assert_eq!(build_tsquery(""), None);
    }

    #[test]
    fn tsquery_whitespace_only_returns_none() {
        assert_eq!(build_tsquery("   "), None);
    }

    #[test]
    fn tsquery_preserves_underscores() {
        assert_eq!(
            build_tsquery("scene_type main"),
            Some("scene_type & main".to_string())
        );
    }

    // -- build_prefix_tsquery ------------------------------------------------

    #[test]
    fn prefix_single_term() {
        assert_eq!(build_prefix_tsquery("joh"), Some("joh:*".to_string()));
    }

    #[test]
    fn prefix_multiple_terms() {
        assert_eq!(
            build_prefix_tsquery("john da"),
            Some("john & da:*".to_string())
        );
    }

    #[test]
    fn prefix_empty_returns_none() {
        assert_eq!(build_prefix_tsquery(""), None);
    }

    #[test]
    fn prefix_three_terms() {
        assert_eq!(
            build_prefix_tsquery("the quick fo"),
            Some("the & quick & fo:*".to_string())
        );
    }

    // -- clamp_limit ---------------------------------------------------------

    #[test]
    fn clamp_limit_uses_default_when_none() {
        assert_eq!(clamp_limit(None, 20, 100), 20);
    }

    #[test]
    fn clamp_limit_respects_max() {
        assert_eq!(clamp_limit(Some(200), 20, 100), 100);
    }

    #[test]
    fn clamp_limit_floors_at_one() {
        assert_eq!(clamp_limit(Some(-5), 20, 100), 1);
        assert_eq!(clamp_limit(Some(0), 20, 100), 1);
    }

    #[test]
    fn clamp_limit_passes_through_valid_value() {
        assert_eq!(clamp_limit(Some(50), 20, 100), 50);
    }

    // -- clamp_offset --------------------------------------------------------

    #[test]
    fn clamp_offset_defaults_to_zero() {
        assert_eq!(clamp_offset(None), 0);
    }

    #[test]
    fn clamp_offset_floors_at_zero() {
        assert_eq!(clamp_offset(Some(-10)), 0);
    }

    #[test]
    fn clamp_offset_passes_through_valid_value() {
        assert_eq!(clamp_offset(Some(40)), 40);
    }

    // -- is_valid_entity_type ------------------------------------------------

    #[test]
    fn valid_entity_types() {
        assert!(is_valid_entity_type("character"));
        assert!(is_valid_entity_type("project"));
        assert!(is_valid_entity_type("scene_type"));
    }

    #[test]
    fn invalid_entity_type() {
        assert!(!is_valid_entity_type("workflow"));
        assert!(!is_valid_entity_type(""));
        assert!(!is_valid_entity_type("CHARACTER"));
    }
}
