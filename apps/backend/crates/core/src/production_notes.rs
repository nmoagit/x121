//! Production notes constants and validation functions (PRD-95).
//!
//! Provides visibility levels, category labels, entity type validation,
//! content validation, and mention extraction for the freeform note system.

use crate::roles::{ROLE_ADMIN, ROLE_REVIEWER};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum length of note content in characters.
pub const MAX_NOTE_CONTENT_LENGTH: usize = 10_000;

/// Maximum length of a category name.
pub const MAX_CATEGORY_NAME_LENGTH: usize = 50;

/// Maximum length of a category color string (e.g. "#FF4444FF").
pub const MAX_CATEGORY_COLOR_LENGTH: usize = 9;

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/// Note visibility level: who can see a given note.
pub const VISIBILITY_PRIVATE: &str = "private";
pub const VISIBILITY_TEAM: &str = "team";
pub const VISIBILITY_ADMIN_ONLY: &str = "admin_only";
pub const VISIBILITY_CREATOR_ONLY: &str = "creator_only";
pub const VISIBILITY_REVIEWER_ONLY: &str = "reviewer_only";

/// All valid visibility values.
pub const VALID_VISIBILITIES: &[&str] = &[
    VISIBILITY_PRIVATE,
    VISIBILITY_TEAM,
    VISIBILITY_ADMIN_ONLY,
    VISIBILITY_CREATOR_ONLY,
    VISIBILITY_REVIEWER_ONLY,
];

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/// Built-in category names matching the seed data.
pub const CATEGORY_INSTRUCTION: &str = "instruction";
pub const CATEGORY_BLOCKER: &str = "blocker";
pub const CATEGORY_FYI: &str = "fyi";
pub const CATEGORY_CUSTOM: &str = "custom";

/// All built-in category names.
pub const BUILT_IN_CATEGORIES: &[&str] = &[
    CATEGORY_INSTRUCTION,
    CATEGORY_BLOCKER,
    CATEGORY_FYI,
    CATEGORY_CUSTOM,
];

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

/// Entity types that production notes can be attached to.
pub const VALID_ENTITY_TYPES: &[&str] = &[
    "project",
    "character",
    "scene",
    "segment",
    "scene_type",
    "workflow",
];

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that the entity type is one of the allowed values.
pub fn validate_entity_type(entity_type: &str) -> Result<(), String> {
    if VALID_ENTITY_TYPES.contains(&entity_type) {
        Ok(())
    } else {
        Err(format!(
            "Invalid entity type '{entity_type}'. Must be one of: {}",
            VALID_ENTITY_TYPES.join(", ")
        ))
    }
}

/// Validate note content: must be non-empty and within the length limit.
pub fn validate_note_content(content: &str) -> Result<(), String> {
    if content.is_empty() {
        return Err("Note content cannot be empty".to_string());
    }
    if content.len() > MAX_NOTE_CONTENT_LENGTH {
        return Err(format!(
            "Note content exceeds maximum length of {MAX_NOTE_CONTENT_LENGTH} characters"
        ));
    }
    Ok(())
}

/// Validate that the visibility string is one of the accepted values.
pub fn validate_visibility(visibility: &str) -> Result<(), String> {
    if VALID_VISIBILITIES.contains(&visibility) {
        Ok(())
    } else {
        Err(format!(
            "Invalid visibility '{visibility}'. Must be one of: {}",
            VALID_VISIBILITIES.join(", ")
        ))
    }
}

/// Check whether a user role can view a note with the given visibility.
///
/// - `private` / `creator_only` → only the creator can see it (not role-based).
/// - `team` → any role can see it.
/// - `admin_only` → only admins.
/// - `reviewer_only` → reviewers and admins.
pub fn can_view_note(note_visibility: &str, user_role: &str) -> bool {
    match note_visibility {
        VISIBILITY_TEAM => true,
        VISIBILITY_ADMIN_ONLY => user_role == ROLE_ADMIN,
        VISIBILITY_REVIEWER_ONLY => user_role == ROLE_REVIEWER || user_role == ROLE_ADMIN,
        // private and creator_only require creator check, not role-based.
        VISIBILITY_PRIVATE | VISIBILITY_CREATOR_ONLY => false,
        _ => false,
    }
}

/// Extract `@username` mentions from Markdown content.
///
/// Finds all `@` followed by one or more word characters and returns
/// the usernames (without the leading `@`).
pub fn extract_mentions(content: &str) -> Vec<String> {
    let mut mentions = Vec::new();
    let bytes = content.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] == b'@' {
            // Check that `@` is at the start or preceded by whitespace/punctuation.
            let at_boundary = i == 0 || !bytes[i - 1].is_ascii_alphanumeric();
            if at_boundary {
                let start = i + 1;
                let mut end = start;
                while end < len
                    && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_' || bytes[end] == b'-')
                {
                    end += 1;
                }
                if end > start {
                    mentions.push(content[start..end].to_string());
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }

    mentions
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_entity_type ------------------------------------------------

    #[test]
    fn valid_entity_types_accepted() {
        assert!(validate_entity_type("project").is_ok());
        assert!(validate_entity_type("character").is_ok());
        assert!(validate_entity_type("scene").is_ok());
        assert!(validate_entity_type("segment").is_ok());
        assert!(validate_entity_type("scene_type").is_ok());
        assert!(validate_entity_type("workflow").is_ok());
    }

    #[test]
    fn invalid_entity_type_rejected() {
        let result = validate_entity_type("unknown");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid entity type"));
    }

    #[test]
    fn empty_entity_type_rejected() {
        assert!(validate_entity_type("").is_err());
    }

    #[test]
    fn case_sensitive_entity_type() {
        assert!(validate_entity_type("Project").is_err());
        assert!(validate_entity_type("SCENE").is_err());
    }

    // -- validate_note_content -----------------------------------------------

    #[test]
    fn valid_content_accepted() {
        assert!(validate_note_content("Hello, world!").is_ok());
    }

    #[test]
    fn empty_content_rejected() {
        let result = validate_note_content("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn content_at_max_length_accepted() {
        let content = "a".repeat(MAX_NOTE_CONTENT_LENGTH);
        assert!(validate_note_content(&content).is_ok());
    }

    #[test]
    fn content_over_max_length_rejected() {
        let content = "a".repeat(MAX_NOTE_CONTENT_LENGTH + 1);
        let result = validate_note_content(&content);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exceeds maximum length"));
    }

    // -- validate_visibility -------------------------------------------------

    #[test]
    fn valid_visibilities_accepted() {
        assert!(validate_visibility("private").is_ok());
        assert!(validate_visibility("team").is_ok());
        assert!(validate_visibility("admin_only").is_ok());
        assert!(validate_visibility("creator_only").is_ok());
        assert!(validate_visibility("reviewer_only").is_ok());
    }

    #[test]
    fn invalid_visibility_rejected() {
        let result = validate_visibility("public");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid visibility"));
    }

    #[test]
    fn empty_visibility_rejected() {
        assert!(validate_visibility("").is_err());
    }

    // -- can_view_note -------------------------------------------------------

    #[test]
    fn team_visible_to_all_roles() {
        assert!(can_view_note("team", "admin"));
        assert!(can_view_note("team", "creator"));
        assert!(can_view_note("team", "reviewer"));
        assert!(can_view_note("team", "viewer"));
    }

    #[test]
    fn admin_only_visible_to_admin() {
        assert!(can_view_note("admin_only", "admin"));
        assert!(!can_view_note("admin_only", "creator"));
        assert!(!can_view_note("admin_only", "reviewer"));
    }

    #[test]
    fn reviewer_only_visible_to_reviewer_and_admin() {
        assert!(can_view_note("reviewer_only", "reviewer"));
        assert!(can_view_note("reviewer_only", "admin"));
        assert!(!can_view_note("reviewer_only", "creator"));
    }

    #[test]
    fn private_not_role_based() {
        assert!(!can_view_note("private", "admin"));
        assert!(!can_view_note("private", "creator"));
    }

    #[test]
    fn creator_only_not_role_based() {
        assert!(!can_view_note("creator_only", "admin"));
        assert!(!can_view_note("creator_only", "creator"));
    }

    #[test]
    fn unknown_visibility_returns_false() {
        assert!(!can_view_note("nonexistent", "admin"));
    }

    // -- extract_mentions ----------------------------------------------------

    #[test]
    fn extract_single_mention() {
        let mentions = extract_mentions("Hey @alice, check this out");
        assert_eq!(mentions, vec!["alice"]);
    }

    #[test]
    fn extract_multiple_mentions() {
        let mentions = extract_mentions("@bob and @carol should review");
        assert_eq!(mentions, vec!["bob", "carol"]);
    }

    #[test]
    fn extract_mention_with_underscores() {
        let mentions = extract_mentions("Assigned to @john_doe");
        assert_eq!(mentions, vec!["john_doe"]);
    }

    #[test]
    fn extract_mention_with_hyphens() {
        let mentions = extract_mentions("CC @jane-smith");
        assert_eq!(mentions, vec!["jane-smith"]);
    }

    #[test]
    fn no_mentions_returns_empty() {
        let mentions = extract_mentions("No mentions here");
        assert!(mentions.is_empty());
    }

    #[test]
    fn email_not_treated_as_mention() {
        let mentions = extract_mentions("Email user@example.com please");
        assert!(mentions.is_empty());
    }

    #[test]
    fn mention_at_start_of_string() {
        let mentions = extract_mentions("@admin please fix");
        assert_eq!(mentions, vec!["admin"]);
    }

    #[test]
    fn bare_at_sign_ignored() {
        let mentions = extract_mentions("Just an @ symbol");
        assert!(mentions.is_empty());
    }

    // -- constant checks -----------------------------------------------------

    #[test]
    fn entity_types_list_complete() {
        assert_eq!(VALID_ENTITY_TYPES.len(), 6);
    }

    #[test]
    fn visibility_list_complete() {
        assert_eq!(VALID_VISIBILITIES.len(), 5);
    }

    #[test]
    fn built_in_categories_complete() {
        assert_eq!(BUILT_IN_CATEGORIES.len(), 4);
    }

    #[test]
    fn max_content_length_is_ten_thousand() {
        assert_eq!(MAX_NOTE_CONTENT_LENGTH, 10_000);
    }
}
