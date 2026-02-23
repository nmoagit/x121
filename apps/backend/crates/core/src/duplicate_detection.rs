//! Character duplicate detection constants, validation, and similarity logic (PRD-79).
//!
//! Provides in-memory cosine similarity, check-type / resolution validation,
//! and batch cross-match computation. No database access — pure domain logic.

use crate::error::CoreError;
use serde::Serialize;

// ---------------------------------------------------------------------------
// Check type constants
// ---------------------------------------------------------------------------

pub const CHECK_TYPE_UPLOAD: &str = "upload";
pub const CHECK_TYPE_BATCH: &str = "batch";
pub const CHECK_TYPE_MANUAL: &str = "manual";
pub const VALID_CHECK_TYPES: &[&str] = &[CHECK_TYPE_UPLOAD, CHECK_TYPE_BATCH, CHECK_TYPE_MANUAL];

// ---------------------------------------------------------------------------
// Resolution constants
// ---------------------------------------------------------------------------

pub const RESOLUTION_CREATE_NEW: &str = "create_new";
pub const RESOLUTION_MERGE: &str = "merge";
pub const RESOLUTION_DISMISS: &str = "dismiss";
pub const RESOLUTION_SKIP: &str = "skip";
pub const VALID_RESOLUTIONS: &[&str] = &[
    RESOLUTION_CREATE_NEW,
    RESOLUTION_MERGE,
    RESOLUTION_DISMISS,
    RESOLUTION_SKIP,
];

// ---------------------------------------------------------------------------
// Status constants (match seed data order in duplicate_check_statuses)
// ---------------------------------------------------------------------------

pub const STATUS_NO_MATCH: &str = "no_match";
pub const STATUS_MATCH_FOUND: &str = "match_found";
pub const STATUS_CONFIRMED_DUPLICATE: &str = "confirmed_duplicate";
pub const STATUS_DISMISSED: &str = "dismissed";
pub const STATUS_MERGED: &str = "merged";

/// Status ID for "no_match" (id = 1 in seed data).
pub const STATUS_NO_MATCH_ID: i16 = 1;
/// Status ID for "match_found" (id = 2 in seed data).
pub const STATUS_MATCH_FOUND_ID: i16 = 2;
/// Status ID for "confirmed_duplicate" (id = 3 in seed data).
pub const STATUS_CONFIRMED_DUPLICATE_ID: i16 = 3;
/// Status ID for "dismissed" (id = 4 in seed data).
pub const STATUS_DISMISSED_ID: i16 = 4;
/// Status ID for "merged" (id = 5 in seed data).
pub const STATUS_MERGED_ID: i16 = 5;

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

pub const DEFAULT_SIMILARITY_THRESHOLD: f64 = 0.90;
pub const MIN_SIMILARITY_THRESHOLD: f64 = 0.50;
pub const MAX_SIMILARITY_THRESHOLD: f64 = 1.00;

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

/// Compute cosine similarity between two embedding vectors.
///
/// Returns a value in `[-1.0, 1.0]`. Returns `0.0` if vectors have different
/// lengths, are empty, or either has zero magnitude.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f64 = a
        .iter()
        .zip(b)
        .map(|(x, y)| (*x as f64) * (*y as f64))
        .sum();

    let norm_a: f64 = a.iter().map(|x| (*x as f64) * (*x as f64)).sum::<f64>().sqrt();
    let norm_b: f64 = b.iter().map(|x| (*x as f64) * (*x as f64)).sum::<f64>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate that `ct` is one of the allowed check types.
pub fn validate_check_type(ct: &str) -> Result<(), CoreError> {
    if VALID_CHECK_TYPES.contains(&ct) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid check type '{ct}'. Must be one of: {}",
            VALID_CHECK_TYPES.join(", ")
        )))
    }
}

/// Validate that `res` is one of the allowed resolution values.
pub fn validate_resolution(res: &str) -> Result<(), CoreError> {
    if VALID_RESOLUTIONS.contains(&res) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid resolution '{res}'. Must be one of: {}",
            VALID_RESOLUTIONS.join(", ")
        )))
    }
}

/// Validate that `threshold` is within the accepted range `[MIN, MAX]`.
pub fn validate_threshold(threshold: f64) -> Result<(), CoreError> {
    if !(MIN_SIMILARITY_THRESHOLD..=MAX_SIMILARITY_THRESHOLD).contains(&threshold) {
        return Err(CoreError::Validation(format!(
            "Similarity threshold must be between {MIN_SIMILARITY_THRESHOLD} and {MAX_SIMILARITY_THRESHOLD}, got {threshold}"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Batch cross-match
// ---------------------------------------------------------------------------

/// A pair of characters that exceeds the similarity threshold.
#[derive(Debug, Serialize)]
pub struct CrossMatch {
    pub character_a_id: i64,
    pub character_b_id: i64,
    pub similarity_score: f64,
}

/// Find all pairs of characters whose embedding similarity exceeds `threshold`.
///
/// Each entry in `embeddings` is `(character_id, embedding_vector)`.
/// Only unique pairs are returned (no duplicates, no self-matches).
pub fn find_cross_matches(
    embeddings: &[(i64, Vec<f32>)],
    threshold: f64,
) -> Vec<CrossMatch> {
    let mut matches = Vec::new();

    for i in 0..embeddings.len() {
        for j in (i + 1)..embeddings.len() {
            let score = cosine_similarity(&embeddings[i].1, &embeddings[j].1);
            if score >= threshold {
                matches.push(CrossMatch {
                    character_a_id: embeddings[i].0,
                    character_b_id: embeddings[j].0,
                    similarity_score: score,
                });
            }
        }
    }

    matches
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Cosine similarity ---------------------------------------------------

    #[test]
    fn cosine_identical_vectors_returns_one() {
        let v = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(&v, &v);
        assert!((score - 1.0).abs() < 1e-9);
    }

    #[test]
    fn cosine_orthogonal_vectors_returns_zero() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let score = cosine_similarity(&a, &b);
        assert!(score.abs() < 1e-9);
    }

    #[test]
    fn cosine_opposite_vectors_returns_negative_one() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let score = cosine_similarity(&a, &b);
        assert!((score + 1.0).abs() < 1e-9);
    }

    #[test]
    fn cosine_different_lengths_returns_zero() {
        let a = vec![1.0, 2.0];
        let b = vec![1.0, 2.0, 3.0];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn cosine_empty_vectors_returns_zero() {
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
    }

    #[test]
    fn cosine_zero_magnitude_returns_zero() {
        let a = vec![0.0, 0.0];
        let b = vec![1.0, 2.0];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    // -- Validation ----------------------------------------------------------

    #[test]
    fn validate_check_type_accepts_valid() {
        assert!(validate_check_type("upload").is_ok());
        assert!(validate_check_type("batch").is_ok());
        assert!(validate_check_type("manual").is_ok());
    }

    #[test]
    fn validate_check_type_rejects_invalid() {
        assert!(validate_check_type("auto").is_err());
        assert!(validate_check_type("").is_err());
    }

    #[test]
    fn validate_resolution_accepts_valid() {
        assert!(validate_resolution("create_new").is_ok());
        assert!(validate_resolution("merge").is_ok());
        assert!(validate_resolution("dismiss").is_ok());
        assert!(validate_resolution("skip").is_ok());
    }

    #[test]
    fn validate_resolution_rejects_invalid() {
        assert!(validate_resolution("delete").is_err());
        assert!(validate_resolution("").is_err());
    }

    #[test]
    fn validate_threshold_accepts_boundaries() {
        assert!(validate_threshold(0.50).is_ok());
        assert!(validate_threshold(0.90).is_ok());
        assert!(validate_threshold(1.00).is_ok());
    }

    #[test]
    fn validate_threshold_rejects_out_of_range() {
        assert!(validate_threshold(0.49).is_err());
        assert!(validate_threshold(1.01).is_err());
    }

    // -- Cross-match ---------------------------------------------------------

    #[test]
    fn find_cross_matches_returns_above_threshold() {
        let embeddings = vec![
            (1, vec![1.0, 0.0, 0.0]),
            (2, vec![1.0, 0.1, 0.0]), // very similar to 1
            (3, vec![0.0, 0.0, 1.0]), // orthogonal to 1
        ];
        let matches = find_cross_matches(&embeddings, 0.90);

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].character_a_id, 1);
        assert_eq!(matches[0].character_b_id, 2);
        assert!(matches[0].similarity_score > 0.90);
    }

    #[test]
    fn find_cross_matches_returns_empty_when_below_threshold() {
        let embeddings = vec![
            (1, vec![1.0, 0.0, 0.0]),
            (2, vec![0.0, 1.0, 0.0]),
            (3, vec![0.0, 0.0, 1.0]),
        ];
        let matches = find_cross_matches(&embeddings, 0.90);
        assert!(matches.is_empty());
    }

    #[test]
    fn find_cross_matches_no_duplicate_pairs() {
        let embeddings = vec![
            (1, vec![1.0, 0.0]),
            (2, vec![1.0, 0.0]),
        ];
        let matches = find_cross_matches(&embeddings, 0.50);
        // Should return exactly one pair (1,2), not also (2,1).
        assert_eq!(matches.len(), 1);
    }
}
