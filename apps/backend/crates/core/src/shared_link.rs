//! Shareable preview link business logic (PRD-84).
//!
//! Pure validation and token generation utilities with no database dependencies.
//! Used by the API and repository layers for external review links.

use crate::hashing::sha256_hex;

// ---------------------------------------------------------------------------
// Scope type constants
// ---------------------------------------------------------------------------

/// Scope type for a single segment.
pub const SCOPE_SEGMENT: &str = "segment";
/// Scope type for a full scene.
pub const SCOPE_SCENE: &str = "scene";
/// Scope type for a avatar.
pub const SCOPE_AVATAR: &str = "avatar";
/// Scope type for an entire project.
pub const SCOPE_PROJECT: &str = "project";

/// All valid scope types for shared links.
pub const VALID_SCOPE_TYPES: &[&str] =
    &[SCOPE_SEGMENT, SCOPE_SCENE, SCOPE_AVATAR, SCOPE_PROJECT];

// ---------------------------------------------------------------------------
// Decision constants
// ---------------------------------------------------------------------------

/// Reviewer decision: approved.
pub const DECISION_APPROVED: &str = "approved";
/// Reviewer decision: rejected.
pub const DECISION_REJECTED: &str = "rejected";

/// All valid reviewer decisions.
pub const VALID_DECISIONS: &[&str] = &[DECISION_APPROVED, DECISION_REJECTED];

// ---------------------------------------------------------------------------
// Default expiry durations (hours)
// ---------------------------------------------------------------------------

/// 24-hour link expiry.
pub const EXPIRY_24H: i64 = 24;
/// 7-day link expiry.
pub const EXPIRY_7D: i64 = 168;
/// 30-day link expiry.
pub const EXPIRY_30D: i64 = 720;

// ---------------------------------------------------------------------------
// Token length
// ---------------------------------------------------------------------------

/// Length of the generated share token (alphanumeric avatars).
const TOKEN_LENGTH: usize = 43;

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/// Generate a cryptographic token and its SHA-256 hash.
///
/// Returns `(plain_token, token_hash)`. The plain token is a 43-avatar
/// URL-safe alphanumeric string. The hash is a 64-avatar hex SHA-256 digest.
///
/// The plain token is shown to the user once; only the hash is stored.
pub fn generate_token() -> (String, String) {
    use rand::Rng;
    let plain: String = rand::rng()
        .sample_iter(&rand::distr::Alphanumeric)
        .take(TOKEN_LENGTH)
        .map(char::from)
        .collect();
    let hash = sha256_hex(plain.as_bytes());
    (plain, hash)
}

/// Hash a plain token for database lookup.
pub fn hash_token(plain_token: &str) -> String {
    sha256_hex(plain_token.as_bytes())
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate that a scope type is one of the allowed values.
pub fn validate_scope_type(scope_type: &str) -> Result<(), String> {
    if VALID_SCOPE_TYPES.contains(&scope_type) {
        Ok(())
    } else {
        Err(format!(
            "Invalid scope_type '{}'. Must be one of: {}",
            scope_type,
            VALID_SCOPE_TYPES.join(", ")
        ))
    }
}

/// Validate that a decision is one of the allowed values.
pub fn validate_decision(decision: &str) -> Result<(), String> {
    if VALID_DECISIONS.contains(&decision) {
        Ok(())
    } else {
        Err(format!(
            "Invalid decision '{}'. Must be one of: {}",
            decision,
            VALID_DECISIONS.join(", ")
        ))
    }
}

/// Validate that expiry hours are within the allowed range (1 to 2160 = 90 days).
pub fn validate_expiry_hours(hours: i64) -> Result<(), String> {
    if hours < 1 {
        Err("Expiry must be at least 1 hour".to_string())
    } else if hours > 2160 {
        Err("Expiry cannot exceed 90 days (2160 hours)".to_string())
    } else {
        Ok(())
    }
}

/// Validate that max_views is within the allowed range (1 to 10000).
pub fn validate_max_views(max_views: i32) -> Result<(), String> {
    if max_views < 1 {
        Err("max_views must be at least 1".to_string())
    } else if max_views > 10000 {
        Err("max_views cannot exceed 10000".to_string())
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Link validity check
// ---------------------------------------------------------------------------

/// Errors that can occur when checking whether a shared link is still valid.
#[derive(Debug, Clone, PartialEq)]
pub enum LinkValidationError {
    /// The link has passed its expiry time.
    Expired,
    /// The link has reached its maximum view count.
    ViewLimitReached,
    /// The link has been explicitly revoked.
    Revoked,
}

impl std::fmt::Display for LinkValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Expired => write!(f, "This link has expired"),
            Self::ViewLimitReached => write!(f, "View limit has been reached for this link"),
            Self::Revoked => write!(f, "This link has been revoked"),
        }
    }
}

/// Check whether a shared link is still valid.
///
/// A link is invalid if it is revoked, expired, or has reached its view limit.
pub fn check_link_validity(
    is_revoked: bool,
    expires_at: chrono::DateTime<chrono::Utc>,
    max_views: Option<i32>,
    current_views: i32,
) -> Result<(), LinkValidationError> {
    if is_revoked {
        return Err(LinkValidationError::Revoked);
    }
    if chrono::Utc::now() > expires_at {
        return Err(LinkValidationError::Expired);
    }
    if let Some(max) = max_views {
        if current_views >= max {
            return Err(LinkValidationError::ViewLimitReached);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};

    // -- Token generation ---------------------------------------------------

    #[test]
    fn test_generate_token_format() {
        let (plain, hash) = generate_token();
        // Plain token is URL-safe alphanumeric
        assert_eq!(plain.len(), TOKEN_LENGTH);
        assert!(
            plain.chars().all(|c| c.is_ascii_alphanumeric()),
            "Token must be alphanumeric"
        );
        // Hash is 64-char hex SHA-256
        assert_eq!(hash.len(), 64);
        assert!(
            hash.chars().all(|c| c.is_ascii_hexdigit()),
            "Hash must be hex"
        );
    }

    #[test]
    fn test_hash_token_consistency() {
        let (plain, _) = generate_token();
        let h1 = hash_token(&plain);
        let h2 = hash_token(&plain);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_token_different_inputs() {
        let (a, _) = generate_token();
        let (b, _) = generate_token();
        assert_ne!(hash_token(&a), hash_token(&b));
    }

    // -- Scope type validation ----------------------------------------------

    #[test]
    fn test_validate_scope_type_valid() {
        for scope in VALID_SCOPE_TYPES {
            assert!(
                validate_scope_type(scope).is_ok(),
                "'{scope}' should be valid"
            );
        }
    }

    #[test]
    fn test_validate_scope_type_invalid() {
        assert!(validate_scope_type("workflow").is_err());
        assert!(validate_scope_type("").is_err());
        assert!(validate_scope_type("SEGMENT").is_err());
    }

    // -- Decision validation ------------------------------------------------

    #[test]
    fn test_validate_decision_valid() {
        assert!(validate_decision("approved").is_ok());
        assert!(validate_decision("rejected").is_ok());
    }

    #[test]
    fn test_validate_decision_invalid() {
        assert!(validate_decision("maybe").is_err());
        assert!(validate_decision("").is_err());
        assert!(validate_decision("APPROVED").is_err());
    }

    // -- Expiry hours validation --------------------------------------------

    #[test]
    fn test_validate_expiry_hours_valid() {
        assert!(validate_expiry_hours(1).is_ok());
        assert!(validate_expiry_hours(EXPIRY_24H).is_ok());
        assert!(validate_expiry_hours(2160).is_ok());
    }

    #[test]
    fn test_validate_expiry_hours_too_low() {
        assert!(validate_expiry_hours(0).is_err());
        assert!(validate_expiry_hours(-1).is_err());
    }

    #[test]
    fn test_validate_expiry_hours_too_high() {
        assert!(validate_expiry_hours(2161).is_err());
        assert!(validate_expiry_hours(99999).is_err());
    }

    // -- Max views validation -----------------------------------------------

    #[test]
    fn test_validate_max_views_valid() {
        assert!(validate_max_views(1).is_ok());
        assert!(validate_max_views(100).is_ok());
        assert!(validate_max_views(10000).is_ok());
    }

    #[test]
    fn test_validate_max_views_invalid() {
        assert!(validate_max_views(0).is_err());
        assert!(validate_max_views(-1).is_err());
        assert!(validate_max_views(10001).is_err());
    }

    // -- Link validity check ------------------------------------------------

    #[test]
    fn test_check_link_validity_valid() {
        let future = Utc::now() + Duration::hours(24);
        assert!(check_link_validity(false, future, Some(100), 5).is_ok());
    }

    #[test]
    fn test_check_link_validity_revoked() {
        let future = Utc::now() + Duration::hours(24);
        assert_eq!(
            check_link_validity(true, future, None, 0),
            Err(LinkValidationError::Revoked)
        );
    }

    #[test]
    fn test_check_link_validity_expired() {
        let past = Utc::now() - Duration::hours(1);
        assert_eq!(
            check_link_validity(false, past, None, 0),
            Err(LinkValidationError::Expired)
        );
    }

    #[test]
    fn test_check_link_validity_view_limit() {
        let future = Utc::now() + Duration::hours(24);
        assert_eq!(
            check_link_validity(false, future, Some(10), 10),
            Err(LinkValidationError::ViewLimitReached)
        );
    }

    #[test]
    fn test_check_link_validity_unlimited_views() {
        let future = Utc::now() + Duration::hours(24);
        // None max_views means unlimited -- any current_views count is fine
        assert!(check_link_validity(false, future, None, 999_999).is_ok());
    }
}
