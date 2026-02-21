//! Metadata schema definitions, serialization helpers, and staleness detection
//! for the dual-metadata system (PRD-13).
//!
//! Defines the JSON structure for `character_metadata.json` and
//! `video_metadata.json`, with constants for schema versioning and entity/file
//! type classification.

use serde::{Deserialize, Serialize};

use crate::types::DbId;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Current schema version for character metadata files.
pub const CHARACTER_SCHEMA_VERSION: &str = "1.0";

/// Current schema version for video metadata files.
pub const VIDEO_SCHEMA_VERSION: &str = "1.0";

/// File type identifier for character metadata.
pub const FILE_TYPE_CHARACTER: &str = "character_metadata";

/// File type identifier for video metadata.
pub const FILE_TYPE_VIDEO: &str = "video_metadata";

/// Entity type identifier for characters.
pub const ENTITY_TYPE_CHARACTER: &str = "character";

/// Entity type identifier for scenes.
pub const ENTITY_TYPE_SCENE: &str = "scene";

// ---------------------------------------------------------------------------
// Character metadata schema
// ---------------------------------------------------------------------------

/// Top-level structure for `character_metadata.json`.
///
/// Serialized via serde to produce a schema-versioned JSON file containing
/// biographical data, physical attributes, image references, and generation
/// provenance.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CharacterMetadata {
    pub schema_version: String,
    pub character_id: DbId,
    pub name: String,
    pub project_id: DbId,
    pub project_name: String,

    /// Biographical data (description, tags).
    pub biographical: BiographicalData,

    /// Physical attributes (height, build, etc.).
    pub physical_attributes: PhysicalAttributes,

    /// Primary source image reference.
    pub source_image: Option<ImageReference>,

    /// Derived images generated from the source.
    pub derived_images: Vec<ImageReference>,

    /// Custom metadata (extensible key-value pairs from the character's
    /// `metadata` JSONB column).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_fields: Option<serde_json::Value>,

    /// ISO 8601 timestamp of when this metadata was generated.
    pub generated_at: String,

    /// ISO 8601 timestamp of the source entity's last update.
    pub source_updated_at: String,
}

/// Biographical details for a character.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiographicalData {
    pub description: Option<String>,
    pub tags: Vec<String>,
}

/// Physical attributes of a character.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PhysicalAttributes {
    pub height: Option<String>,
    pub build: Option<String>,
    pub hair_color: Option<String>,
    pub eye_color: Option<String>,
}

/// Reference to an image file in the system.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageReference {
    pub image_id: DbId,
    pub filename: String,
    pub path: String,
    pub image_type: String,
}

// ---------------------------------------------------------------------------
// Video metadata schema
// ---------------------------------------------------------------------------

/// Top-level structure for `video_metadata.json`.
///
/// Contains technical video information per scene, including segment details,
/// provenance, and optional quality scores.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VideoMetadata {
    pub schema_version: String,
    pub scene_id: DbId,
    pub character_id: DbId,
    pub character_name: String,
    pub scene_type: String,

    /// Technical video information (resolution, codec, fps, etc.).
    pub technical: VideoTechnicalInfo,

    /// Per-segment detail records.
    pub segments: Vec<SegmentInfo>,

    /// Provenance: workflow, model, and LoRA version information.
    pub provenance: ProvenanceInfo,

    /// Quality scores from auto-QA (PRD-049). `None` until QA data is available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality_scores: Option<QualityScores>,

    /// ISO 8601 timestamp of when this metadata was generated.
    pub generated_at: String,

    /// ISO 8601 timestamp of the source entity's last update.
    pub source_updated_at: String,
}

/// Technical details about the generated video.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VideoTechnicalInfo {
    pub duration_seconds: f64,
    pub resolution: String,
    pub codec: String,
    pub fps: f64,
    pub segment_count: i32,
}

/// Detail record for a single video segment.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SegmentInfo {
    pub segment_id: DbId,
    pub sequence_index: i32,
    pub seed_frame_path: String,
    pub output_video_path: String,
    pub last_frame_path: String,
    pub status: String,
}

/// Provenance information recording how the video was generated.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProvenanceInfo {
    pub workflow_name: String,
    pub model_version: Option<String>,
    pub lora_versions: Vec<String>,
    pub generation_parameters: serde_json::Value,
}

/// Quality scores from the auto-QA system.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QualityScores {
    pub overall_score: f64,
    pub per_segment_scores: Vec<f64>,
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/// Serialize any metadata struct to pretty-printed JSON (2-space indent).
pub fn serialize_metadata<T: Serialize>(metadata: &T) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(metadata)
}

/// Compute a SHA-256 hex digest of the given bytes.
///
/// Re-exports [`crate::hashing::sha256_hex`] for backward compatibility.
pub fn sha256_hex(data: &[u8]) -> String {
    crate::hashing::sha256_hex(data)
}

// ---------------------------------------------------------------------------
// Staleness detection
// ---------------------------------------------------------------------------

/// Returns `true` if the metadata is stale (i.e. the source entity has been
/// updated since the metadata was last generated).
///
/// Compares the `source_updated_at` snapshot stored with the generation record
/// against the entity's current `updated_at` timestamp.
pub fn is_stale(
    metadata_source_updated_at: &chrono::DateTime<chrono::Utc>,
    entity_current_updated_at: &chrono::DateTime<chrono::Utc>,
) -> bool {
    metadata_source_updated_at < entity_current_updated_at
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_character_metadata() -> CharacterMetadata {
        CharacterMetadata {
            schema_version: CHARACTER_SCHEMA_VERSION.to_string(),
            character_id: 42,
            name: "Alice".to_string(),
            project_id: 1,
            project_name: "Test Project".to_string(),
            biographical: BiographicalData {
                description: Some("A test character".to_string()),
                tags: vec!["hero".to_string(), "protagonist".to_string()],
            },
            physical_attributes: PhysicalAttributes {
                height: Some("170cm".to_string()),
                build: Some("Athletic".to_string()),
                hair_color: Some("Brown".to_string()),
                eye_color: Some("Green".to_string()),
            },
            source_image: Some(ImageReference {
                image_id: 100,
                filename: "source.png".to_string(),
                path: "/images/source.png".to_string(),
                image_type: "source".to_string(),
            }),
            derived_images: vec![ImageReference {
                image_id: 101,
                filename: "derived_01.png".to_string(),
                path: "/images/derived_01.png".to_string(),
                image_type: "derived".to_string(),
            }],
            custom_fields: Some(serde_json::json!({ "mood": "happy" })),
            generated_at: "2026-02-21T10:00:00Z".to_string(),
            source_updated_at: "2026-02-21T09:55:00Z".to_string(),
        }
    }

    fn sample_video_metadata() -> VideoMetadata {
        VideoMetadata {
            schema_version: VIDEO_SCHEMA_VERSION.to_string(),
            scene_id: 10,
            character_id: 42,
            character_name: "Alice".to_string(),
            scene_type: "full_body".to_string(),
            technical: VideoTechnicalInfo {
                duration_seconds: 12.5,
                resolution: "1920x1080".to_string(),
                codec: "h264".to_string(),
                fps: 30.0,
                segment_count: 3,
            },
            segments: vec![
                SegmentInfo {
                    segment_id: 1,
                    sequence_index: 0,
                    seed_frame_path: "/frames/seed_0.png".to_string(),
                    output_video_path: "/video/seg_0.mp4".to_string(),
                    last_frame_path: "/frames/last_0.png".to_string(),
                    status: "completed".to_string(),
                },
                SegmentInfo {
                    segment_id: 2,
                    sequence_index: 1,
                    seed_frame_path: "/frames/seed_1.png".to_string(),
                    output_video_path: "/video/seg_1.mp4".to_string(),
                    last_frame_path: "/frames/last_1.png".to_string(),
                    status: "completed".to_string(),
                },
                SegmentInfo {
                    segment_id: 3,
                    sequence_index: 2,
                    seed_frame_path: "/frames/seed_2.png".to_string(),
                    output_video_path: "/video/seg_2.mp4".to_string(),
                    last_frame_path: "/frames/last_2.png".to_string(),
                    status: "completed".to_string(),
                },
            ],
            provenance: ProvenanceInfo {
                workflow_name: "standard_gen_v2".to_string(),
                model_version: Some("sd-1.5".to_string()),
                lora_versions: vec!["face_fix_v3".to_string()],
                generation_parameters: serde_json::json!({
                    "steps": 30,
                    "cfg_scale": 7.5,
                }),
            },
            quality_scores: Some(QualityScores {
                overall_score: 0.92,
                per_segment_scores: vec![0.95, 0.90, 0.91],
            }),
            generated_at: "2026-02-21T10:00:00Z".to_string(),
            source_updated_at: "2026-02-21T09:55:00Z".to_string(),
        }
    }

    #[test]
    fn character_metadata_round_trip() {
        let meta = sample_character_metadata();
        let json = serialize_metadata(&meta).expect("serialization should succeed");
        let deserialized: CharacterMetadata =
            serde_json::from_str(&json).expect("deserialization should succeed");
        assert_eq!(meta, deserialized);
    }

    #[test]
    fn video_metadata_round_trip() {
        let meta = sample_video_metadata();
        let json = serialize_metadata(&meta).expect("serialization should succeed");
        let deserialized: VideoMetadata =
            serde_json::from_str(&json).expect("deserialization should succeed");
        assert_eq!(meta, deserialized);
    }

    #[test]
    fn schema_version_is_present_in_character_json() {
        let meta = sample_character_metadata();
        let json = serialize_metadata(&meta).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["schema_version"], CHARACTER_SCHEMA_VERSION);
    }

    #[test]
    fn schema_version_is_present_in_video_json() {
        let meta = sample_video_metadata();
        let json = serialize_metadata(&meta).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["schema_version"], VIDEO_SCHEMA_VERSION);
    }

    #[test]
    fn optional_quality_scores_omitted_when_none() {
        let mut meta = sample_video_metadata();
        meta.quality_scores = None;
        let json = serialize_metadata(&meta).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("quality_scores").is_none());
    }

    #[test]
    fn optional_custom_fields_omitted_when_none() {
        let mut meta = sample_character_metadata();
        meta.custom_fields = None;
        let json = serialize_metadata(&meta).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("custom_fields").is_none());
    }

    #[test]
    fn staleness_detection_works() {
        use chrono::{TimeZone, Utc};

        let gen_time = Utc.with_ymd_and_hms(2026, 2, 21, 9, 0, 0).unwrap();
        let entity_same = Utc.with_ymd_and_hms(2026, 2, 21, 9, 0, 0).unwrap();
        let entity_newer = Utc.with_ymd_and_hms(2026, 2, 21, 10, 0, 0).unwrap();
        let entity_older = Utc.with_ymd_and_hms(2026, 2, 21, 8, 0, 0).unwrap();

        // Same timestamp => not stale.
        assert!(!is_stale(&gen_time, &entity_same));
        // Entity updated after generation => stale.
        assert!(is_stale(&gen_time, &entity_newer));
        // Entity older than generation => not stale.
        assert!(!is_stale(&gen_time, &entity_older));
    }

    #[test]
    fn sha256_hex_produces_correct_hash() {
        // SHA-256 of empty string is well-known.
        let hash = sha256_hex(b"");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn sha256_hex_produces_consistent_output() {
        let data = b"hello world";
        let hash1 = sha256_hex(data);
        let hash2 = sha256_hex(data);
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64); // SHA-256 hex digest is 64 chars.
    }
}
