//! Pure logic for poster frame selection (PRD-96).
//!
//! This module contains no database dependencies. All functions operate
//! on plain data structures and can be tested in isolation.

use crate::types::DbId;

// Re-export so external users can still do `use x121_core::poster_frame::{ENTITY_TYPE_CHARACTER, ...}`.
pub use crate::metadata::{ENTITY_TYPE_CHARACTER, ENTITY_TYPE_SCENE};

/// Valid entity types for poster frames.
const VALID_ENTITY_TYPES: [&str; 2] = [ENTITY_TYPE_CHARACTER, ENTITY_TYPE_SCENE];

/// Validate that an entity type string is one of the accepted values.
///
/// Returns `Ok(())` if valid, or an error message string if not.
pub fn validate_entity_type(entity_type: &str) -> Result<(), String> {
    if VALID_ENTITY_TYPES.contains(&entity_type) {
        Ok(())
    } else {
        Err(format!(
            "Invalid entity_type '{entity_type}'. Must be one of: {}",
            VALID_ENTITY_TYPES.join(", ")
        ))
    }
}

/// Given a list of `(segment_id, face_confidence_score)` pairs, return the
/// segment ID with the highest face confidence score.
///
/// Returns `None` if `scores` is empty.
pub fn select_best_frame(scores: &[(DbId, f64)]) -> Option<DbId> {
    scores
        .iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(id, _)| *id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_entity_type_character() {
        assert!(validate_entity_type("character").is_ok());
    }

    #[test]
    fn test_validate_entity_type_scene() {
        assert!(validate_entity_type("scene").is_ok());
    }

    #[test]
    fn test_validate_entity_type_invalid() {
        let result = validate_entity_type("project");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("project"));
    }

    #[test]
    fn test_select_best_frame_picks_highest() {
        let scores = vec![(1, 0.5), (2, 0.95), (3, 0.7)];
        assert_eq!(select_best_frame(&scores), Some(2));
    }

    #[test]
    fn test_select_best_frame_empty() {
        let scores: Vec<(DbId, f64)> = vec![];
        assert_eq!(select_best_frame(&scores), None);
    }

    #[test]
    fn test_select_best_frame_single() {
        let scores = vec![(42, 0.8)];
        assert_eq!(select_best_frame(&scores), Some(42));
    }
}
