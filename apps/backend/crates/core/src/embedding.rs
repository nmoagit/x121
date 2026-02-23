//! Face embedding constants, validation, and classification (PRD-76).
//!
//! The `EmbeddingStatus` enum mirrors the seeded rows in `embedding_statuses`.
//! `classify_extraction_result` determines the correct status after face
//! detection finishes, based on face count and confidence.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum confidence threshold below which an extraction is considered
/// unreliable. Used as the default when no custom threshold is provided.
pub const DEFAULT_CONFIDENCE_THRESHOLD: f64 = 0.7;

/// Dimensionality of face embeddings produced by the extraction model.
pub const EMBEDDING_DIMENSION: usize = 512;

// ---------------------------------------------------------------------------
// EmbeddingStatus enum
// ---------------------------------------------------------------------------

/// Face-embedding extraction status.
///
/// Discriminant values match the seeded rows in the `embedding_statuses`
/// lookup table (1-based).
#[repr(i16)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbeddingStatus {
    Pending = 1,
    Extracting = 2,
    Completed = 3,
    Failed = 4,
    LowConfidence = 5,
    MultiFacePending = 6,
}

impl EmbeddingStatus {
    /// Resolve a database status ID to the corresponding enum variant.
    pub fn from_id(id: i16) -> Option<Self> {
        match id {
            1 => Some(Self::Pending),
            2 => Some(Self::Extracting),
            3 => Some(Self::Completed),
            4 => Some(Self::Failed),
            5 => Some(Self::LowConfidence),
            6 => Some(Self::MultiFacePending),
            _ => None,
        }
    }

    /// Human-readable label matching the `label` column in `embedding_statuses`.
    pub fn label(&self) -> &str {
        match self {
            Self::Pending => "Pending",
            Self::Extracting => "Extracting",
            Self::Completed => "Completed",
            Self::Failed => "Failed",
            Self::LowConfidence => "Low Confidence",
            Self::MultiFacePending => "Multi-Face Pending",
        }
    }

    /// Return the database status ID.
    pub fn id(&self) -> i16 {
        *self as i16
    }
}

// ---------------------------------------------------------------------------
// BoundingBox
// ---------------------------------------------------------------------------

/// Axis-aligned bounding box for a detected face in pixel coordinates.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate that an embedding vector has the correct dimensionality.
pub fn validate_embedding_dimension(embedding: &[f32]) -> Result<(), CoreError> {
    if embedding.len() != EMBEDDING_DIMENSION {
        return Err(CoreError::Validation(format!(
            "Embedding must be {EMBEDDING_DIMENSION}-dimensional, got {}",
            embedding.len()
        )));
    }
    Ok(())
}

/// Validate that a confidence threshold is within `[0.0, 1.0]`.
pub fn validate_confidence_threshold(threshold: f64) -> Result<(), CoreError> {
    crate::threshold_validation::validate_unit_range(threshold, "Confidence threshold")
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/// Determine the appropriate `EmbeddingStatus` after face detection.
///
/// | Condition                              | Status            |
/// |----------------------------------------|-------------------|
/// | 0 faces detected                       | Failed            |
/// | 1 face, confidence >= threshold        | Completed         |
/// | 1 face, confidence < threshold         | LowConfidence     |
/// | >1 face                                | MultiFacePending  |
pub fn classify_extraction_result(
    face_count: usize,
    max_confidence: f64,
    threshold: f64,
) -> EmbeddingStatus {
    match face_count {
        0 => EmbeddingStatus::Failed,
        1 => {
            if max_confidence >= threshold {
                EmbeddingStatus::Completed
            } else {
                EmbeddingStatus::LowConfidence
            }
        }
        _ => EmbeddingStatus::MultiFacePending,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- EmbeddingStatus -----------------------------------------------------

    #[test]
    fn status_from_id_returns_correct_variant() {
        assert_eq!(EmbeddingStatus::from_id(1), Some(EmbeddingStatus::Pending));
        assert_eq!(
            EmbeddingStatus::from_id(2),
            Some(EmbeddingStatus::Extracting)
        );
        assert_eq!(
            EmbeddingStatus::from_id(3),
            Some(EmbeddingStatus::Completed)
        );
        assert_eq!(EmbeddingStatus::from_id(4), Some(EmbeddingStatus::Failed));
        assert_eq!(
            EmbeddingStatus::from_id(5),
            Some(EmbeddingStatus::LowConfidence)
        );
        assert_eq!(
            EmbeddingStatus::from_id(6),
            Some(EmbeddingStatus::MultiFacePending)
        );
    }

    #[test]
    fn status_from_id_returns_none_for_unknown() {
        assert_eq!(EmbeddingStatus::from_id(0), None);
        assert_eq!(EmbeddingStatus::from_id(7), None);
        assert_eq!(EmbeddingStatus::from_id(-1), None);
    }

    #[test]
    fn status_id_roundtrip() {
        for id in 1..=6 {
            let status = EmbeddingStatus::from_id(id).unwrap();
            assert_eq!(status.id(), id);
        }
    }

    #[test]
    fn status_labels_match_seed_data() {
        assert_eq!(EmbeddingStatus::Pending.label(), "Pending");
        assert_eq!(EmbeddingStatus::Extracting.label(), "Extracting");
        assert_eq!(EmbeddingStatus::Completed.label(), "Completed");
        assert_eq!(EmbeddingStatus::Failed.label(), "Failed");
        assert_eq!(EmbeddingStatus::LowConfidence.label(), "Low Confidence");
        assert_eq!(
            EmbeddingStatus::MultiFacePending.label(),
            "Multi-Face Pending"
        );
    }

    // -- BoundingBox ---------------------------------------------------------

    #[test]
    fn bounding_box_serializes_correctly() {
        let bbox = BoundingBox {
            x: 10,
            y: 20,
            width: 100,
            height: 150,
        };
        let json = serde_json::to_string(&bbox).unwrap();
        assert!(json.contains("\"x\":10"));
        assert!(json.contains("\"width\":100"));
    }

    #[test]
    fn bounding_box_deserializes_correctly() {
        let json = r#"{"x":5,"y":10,"width":200,"height":300}"#;
        let bbox: BoundingBox = serde_json::from_str(json).unwrap();
        assert_eq!(bbox.x, 5);
        assert_eq!(bbox.y, 10);
        assert_eq!(bbox.width, 200);
        assert_eq!(bbox.height, 300);
    }

    // -- Validation ----------------------------------------------------------

    #[test]
    fn validate_embedding_dimension_accepts_correct_size() {
        let embedding = vec![0.0f32; EMBEDDING_DIMENSION];
        assert!(validate_embedding_dimension(&embedding).is_ok());
    }

    #[test]
    fn validate_embedding_dimension_rejects_wrong_size() {
        let embedding = vec![0.0f32; 256];
        assert!(validate_embedding_dimension(&embedding).is_err());
    }

    #[test]
    fn validate_confidence_threshold_accepts_valid_range() {
        assert!(validate_confidence_threshold(0.0).is_ok());
        assert!(validate_confidence_threshold(0.5).is_ok());
        assert!(validate_confidence_threshold(1.0).is_ok());
    }

    #[test]
    fn validate_confidence_threshold_rejects_out_of_range() {
        assert!(validate_confidence_threshold(-0.1).is_err());
        assert!(validate_confidence_threshold(1.1).is_err());
    }

    // -- Classification ------------------------------------------------------

    #[test]
    fn classify_no_faces_returns_failed() {
        assert_eq!(
            classify_extraction_result(0, 0.0, DEFAULT_CONFIDENCE_THRESHOLD),
            EmbeddingStatus::Failed
        );
    }

    #[test]
    fn classify_single_face_above_threshold_returns_completed() {
        assert_eq!(
            classify_extraction_result(1, 0.95, DEFAULT_CONFIDENCE_THRESHOLD),
            EmbeddingStatus::Completed
        );
    }

    #[test]
    fn classify_single_face_below_threshold_returns_low_confidence() {
        assert_eq!(
            classify_extraction_result(1, 0.5, DEFAULT_CONFIDENCE_THRESHOLD),
            EmbeddingStatus::LowConfidence
        );
    }

    #[test]
    fn classify_multiple_faces_returns_multi_face_pending() {
        assert_eq!(
            classify_extraction_result(3, 0.99, DEFAULT_CONFIDENCE_THRESHOLD),
            EmbeddingStatus::MultiFacePending
        );
    }
}
