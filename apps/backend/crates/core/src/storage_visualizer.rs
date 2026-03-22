//! Storage visualizer constants, validation, and treemap hierarchy building (PRD-19).
//!
//! Provides entity type validation, file-extension classification, hierarchical
//! treemap node construction, and file-type breakdown computation for the
//! disk-space visualizer UI.

use crate::error::CoreError;
use serde::Serialize;

// ---------------------------------------------------------------------------
// Entity type constants
// ---------------------------------------------------------------------------

/// Segment entity type identifier.
pub const ENTITY_SEGMENT: &str = "segment";

/// Scene entity type identifier.
pub const ENTITY_SCENE: &str = "scene";

/// Avatar entity type identifier.
pub const ENTITY_AVATAR: &str = "avatar";

/// Project entity type identifier.
pub const ENTITY_PROJECT: &str = "project";

/// All valid entity types for storage snapshots.
pub const VALID_ENTITY_TYPES: &[&str] = &[
    ENTITY_SEGMENT,
    ENTITY_SCENE,
    ENTITY_AVATAR,
    ENTITY_PROJECT,
];

// ---------------------------------------------------------------------------
// File category constants
// ---------------------------------------------------------------------------

/// Video file category name.
pub const CATEGORY_VIDEO: &str = "video";

/// Image file category name.
pub const CATEGORY_IMAGE: &str = "image";

/// Intermediate/processing file category name.
pub const CATEGORY_INTERMEDIATE: &str = "intermediate";

/// Metadata/config file category name.
pub const CATEGORY_METADATA: &str = "metadata";

/// AI model file category name.
pub const CATEGORY_MODEL: &str = "model";

/// Fallback category for unrecognized extensions.
pub const CATEGORY_OTHER: &str = "other";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that `entity_type` is one of the recognized entity types.
pub fn validate_entity_type(entity_type: &str) -> Result<(), CoreError> {
    if VALID_ENTITY_TYPES.contains(&entity_type) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid entity type '{entity_type}'. Must be one of: {VALID_ENTITY_TYPES:?}"
        )))
    }
}

// ---------------------------------------------------------------------------
// Extension classification
// ---------------------------------------------------------------------------

/// Classify a file extension into a storage category.
///
/// Returns `CATEGORY_OTHER` for unrecognized extensions.
/// The extension should be lowercase and without a leading dot.
pub fn classify_extension(ext: &str) -> &'static str {
    let lower = ext.to_lowercase();
    let ext_ref = lower.as_str();
    match ext_ref {
        // Video
        "mp4" | "webm" | "mov" | "avi" | "mkv" => CATEGORY_VIDEO,
        // Image
        "jpg" | "jpeg" | "png" | "webp" | "tiff" | "bmp" => CATEGORY_IMAGE,
        // Model weights
        "safetensors" | "onnx" | "pth" => CATEGORY_MODEL,
        // Intermediate / processing
        "pt" | "bin" | "ckpt" => CATEGORY_INTERMEDIATE,
        // Metadata
        "json" | "yaml" | "yml" | "toml" => CATEGORY_METADATA,
        _ => CATEGORY_OTHER,
    }
}

// ---------------------------------------------------------------------------
// Storage snapshot (input data)
// ---------------------------------------------------------------------------

/// A storage usage snapshot for a single entity, used as input to hierarchy
/// building and breakdown computation.
#[derive(Debug, Clone)]
pub struct StorageSnapshot {
    /// Entity type (segment, scene, avatar, project).
    pub entity_type: String,
    /// Internal database ID of the entity.
    pub entity_id: i64,
    /// Human-readable name of the entity.
    pub entity_name: Option<String>,
    /// Parent entity type (e.g., scene for a segment).
    pub parent_entity_type: Option<String>,
    /// Parent entity's internal database ID.
    pub parent_entity_id: Option<i64>,
    /// Total storage in bytes.
    pub total_bytes: i64,
    /// Number of files.
    pub file_count: i32,
    /// Bytes that can be reclaimed.
    pub reclaimable_bytes: i64,
}

/// A detailed storage snapshot including per-category byte breakdown.
#[derive(Debug, Clone)]
pub struct DetailedSnapshot {
    /// Total storage in bytes.
    pub total_bytes: i64,
    /// Number of files.
    pub file_count: i32,
    /// Bytes used by video files.
    pub video_bytes: i64,
    /// Bytes used by image files.
    pub image_bytes: i64,
    /// Bytes used by intermediate files.
    pub intermediate_bytes: i64,
    /// Bytes used by metadata files.
    pub metadata_bytes: i64,
    /// Bytes used by model files.
    pub model_bytes: i64,
}

// ---------------------------------------------------------------------------
// Treemap node (output for D3 visualization)
// ---------------------------------------------------------------------------

/// A hierarchical node for the D3 treemap visualization.
///
/// The tree structure mirrors the project hierarchy:
/// project -> avatar -> scene -> segment.
#[derive(Debug, Clone, Serialize)]
pub struct TreemapNode {
    /// Display name for this node.
    pub name: String,
    /// Entity type (project, avatar, scene, segment).
    pub entity_type: String,
    /// Internal database ID.
    pub entity_id: i64,
    /// Total bytes consumed by this node and its children.
    pub size: i64,
    /// Total file count for this node and its children.
    pub file_count: i32,
    /// Bytes that can be reclaimed from this node and its children.
    pub reclaimable_bytes: i64,
    /// Child nodes in the hierarchy.
    pub children: Vec<TreemapNode>,
}

// ---------------------------------------------------------------------------
// File type breakdown (output for distribution chart)
// ---------------------------------------------------------------------------

/// Aggregated storage breakdown for a single file type category.
#[derive(Debug, Clone, Serialize)]
pub struct FileTypeBreakdown {
    /// Category name (video, image, intermediate, metadata, model).
    pub category: String,
    /// Total bytes for this category.
    pub total_bytes: i64,
    /// Number of files in this category.
    pub file_count: i32,
    /// Percentage of total storage this category represents.
    pub percentage: f64,
}

// ---------------------------------------------------------------------------
// Hierarchy building
// ---------------------------------------------------------------------------

/// Build a hierarchical tree of [`TreemapNode`]s from a flat list of snapshots.
///
/// Snapshots are grouped by parent references. Nodes without parents become
/// root-level entries. The function assumes snapshots are consistent (i.e.,
/// each node's parent actually exists in the list or is absent).
pub fn build_hierarchy(snapshots: &[StorageSnapshot]) -> Vec<TreemapNode> {
    use std::collections::HashMap;

    // Index snapshots by (entity_type, entity_id) for child lookup.
    let mut children_map: HashMap<(String, i64), Vec<&StorageSnapshot>> = HashMap::new();
    let mut roots: Vec<&StorageSnapshot> = Vec::new();

    for snap in snapshots {
        if let (Some(ref parent_type), Some(parent_id)) =
            (&snap.parent_entity_type, snap.parent_entity_id)
        {
            children_map
                .entry((parent_type.clone(), parent_id))
                .or_default()
                .push(snap);
        } else {
            roots.push(snap);
        }
    }

    fn build_node(
        snap: &StorageSnapshot,
        children_map: &HashMap<(String, i64), Vec<&StorageSnapshot>>,
    ) -> TreemapNode {
        let key = (snap.entity_type.clone(), snap.entity_id);
        let children: Vec<TreemapNode> = children_map
            .get(&key)
            .map(|kids| {
                kids.iter()
                    .map(|child| build_node(child, children_map))
                    .collect()
            })
            .unwrap_or_default();

        TreemapNode {
            name: snap
                .entity_name
                .clone()
                .unwrap_or_else(|| format!("{}:{}", snap.entity_type, snap.entity_id)),
            entity_type: snap.entity_type.clone(),
            entity_id: snap.entity_id,
            size: snap.total_bytes,
            file_count: snap.file_count,
            reclaimable_bytes: snap.reclaimable_bytes,
            children,
        }
    }

    roots
        .iter()
        .map(|root| build_node(root, &children_map))
        .collect()
}

// ---------------------------------------------------------------------------
// Breakdown computation
// ---------------------------------------------------------------------------

/// Compute file-type distribution from a list of detailed snapshots.
///
/// Aggregates bytes and file counts across all snapshots for each known
/// category. Categories with zero bytes are included for completeness.
pub fn compute_breakdown(snapshots: &[DetailedSnapshot]) -> Vec<FileTypeBreakdown> {
    let mut video_bytes: i64 = 0;
    let mut image_bytes: i64 = 0;
    let mut intermediate_bytes: i64 = 0;
    let mut metadata_bytes: i64 = 0;
    let mut model_bytes: i64 = 0;
    let mut total: i64 = 0;

    for snap in snapshots {
        video_bytes += snap.video_bytes;
        image_bytes += snap.image_bytes;
        intermediate_bytes += snap.intermediate_bytes;
        metadata_bytes += snap.metadata_bytes;
        model_bytes += snap.model_bytes;
        total += snap.total_bytes;
    }

    let pct = |bytes: i64| -> f64 {
        if total == 0 {
            0.0
        } else {
            bytes as f64 / total as f64
        }
    };

    // Estimate file_count proportionally from bytes if we only have totals.
    // In practice, the repo queries provide per-category counts, but for
    // aggregation across snapshots we approximate.
    let total_files: i32 = snapshots.iter().map(|s| s.file_count).sum();
    let file_pct = |bytes: i64| -> i32 {
        if total == 0 {
            0
        } else {
            ((bytes as f64 / total as f64) * total_files as f64).round() as i32
        }
    };

    vec![
        FileTypeBreakdown {
            category: CATEGORY_VIDEO.to_string(),
            total_bytes: video_bytes,
            file_count: file_pct(video_bytes),
            percentage: pct(video_bytes),
        },
        FileTypeBreakdown {
            category: CATEGORY_IMAGE.to_string(),
            total_bytes: image_bytes,
            file_count: file_pct(image_bytes),
            percentage: pct(image_bytes),
        },
        FileTypeBreakdown {
            category: CATEGORY_INTERMEDIATE.to_string(),
            total_bytes: intermediate_bytes,
            file_count: file_pct(intermediate_bytes),
            percentage: pct(intermediate_bytes),
        },
        FileTypeBreakdown {
            category: CATEGORY_METADATA.to_string(),
            total_bytes: metadata_bytes,
            file_count: file_pct(metadata_bytes),
            percentage: pct(metadata_bytes),
        },
        FileTypeBreakdown {
            category: CATEGORY_MODEL.to_string(),
            total_bytes: model_bytes,
            file_count: file_pct(model_bytes),
            percentage: pct(model_bytes),
        },
    ]
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/// Compute the total bytes across all snapshots.
pub fn compute_total_bytes(snapshots: &[StorageSnapshot]) -> i64 {
    snapshots.iter().map(|s| s.total_bytes).sum()
}

/// Compute the fraction of reclaimable bytes relative to total (0.0 to 1.0).
///
/// Returns 0.0 when `total` is zero to avoid division by zero.
///
/// The frontend `formatPercent()` expects a 0-1 fraction, so this function
/// returns a ratio, not a percentage.
pub fn compute_reclaimable_fraction(reclaimable: i64, total: i64) -> f64 {
    if total == 0 {
        0.0
    } else {
        reclaimable as f64 / total as f64
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Entity type validation --

    #[test]
    fn validate_entity_type_segment() {
        assert!(validate_entity_type("segment").is_ok());
    }

    #[test]
    fn validate_entity_type_scene() {
        assert!(validate_entity_type("scene").is_ok());
    }

    #[test]
    fn validate_entity_type_avatar() {
        assert!(validate_entity_type("avatar").is_ok());
    }

    #[test]
    fn validate_entity_type_project() {
        assert!(validate_entity_type("project").is_ok());
    }

    #[test]
    fn validate_entity_type_invalid() {
        assert!(validate_entity_type("folder").is_err());
        assert!(validate_entity_type("").is_err());
        assert!(validate_entity_type("PROJECT").is_err());
    }

    // -- Extension classification --

    #[test]
    fn classify_video_extensions() {
        assert_eq!(classify_extension("mp4"), CATEGORY_VIDEO);
        assert_eq!(classify_extension("webm"), CATEGORY_VIDEO);
        assert_eq!(classify_extension("mov"), CATEGORY_VIDEO);
        assert_eq!(classify_extension("avi"), CATEGORY_VIDEO);
        assert_eq!(classify_extension("mkv"), CATEGORY_VIDEO);
    }

    #[test]
    fn classify_image_extensions() {
        assert_eq!(classify_extension("jpg"), CATEGORY_IMAGE);
        assert_eq!(classify_extension("jpeg"), CATEGORY_IMAGE);
        assert_eq!(classify_extension("png"), CATEGORY_IMAGE);
        assert_eq!(classify_extension("webp"), CATEGORY_IMAGE);
        assert_eq!(classify_extension("tiff"), CATEGORY_IMAGE);
        assert_eq!(classify_extension("bmp"), CATEGORY_IMAGE);
    }

    #[test]
    fn classify_intermediate_extensions() {
        assert_eq!(classify_extension("pt"), CATEGORY_INTERMEDIATE);
        assert_eq!(classify_extension("bin"), CATEGORY_INTERMEDIATE);
        assert_eq!(classify_extension("ckpt"), CATEGORY_INTERMEDIATE);
    }

    #[test]
    fn classify_metadata_extensions() {
        assert_eq!(classify_extension("json"), CATEGORY_METADATA);
        assert_eq!(classify_extension("yaml"), CATEGORY_METADATA);
        assert_eq!(classify_extension("yml"), CATEGORY_METADATA);
        assert_eq!(classify_extension("toml"), CATEGORY_METADATA);
    }

    #[test]
    fn classify_model_extensions() {
        assert_eq!(classify_extension("safetensors"), CATEGORY_MODEL);
        assert_eq!(classify_extension("onnx"), CATEGORY_MODEL);
        assert_eq!(classify_extension("pth"), CATEGORY_MODEL);
    }

    #[test]
    fn classify_unknown_extension_returns_other() {
        assert_eq!(classify_extension("exe"), CATEGORY_OTHER);
        assert_eq!(classify_extension("txt"), CATEGORY_OTHER);
        assert_eq!(classify_extension("zip"), CATEGORY_OTHER);
    }

    #[test]
    fn classify_extension_case_insensitive() {
        assert_eq!(classify_extension("MP4"), CATEGORY_VIDEO);
        assert_eq!(classify_extension("PNG"), CATEGORY_IMAGE);
        assert_eq!(classify_extension("Json"), CATEGORY_METADATA);
    }

    // -- Treemap hierarchy --

    fn make_snapshot(
        entity_type: &str,
        entity_id: i64,
        name: &str,
        parent_type: Option<&str>,
        parent_id: Option<i64>,
        total_bytes: i64,
    ) -> StorageSnapshot {
        StorageSnapshot {
            entity_type: entity_type.to_string(),
            entity_id,
            entity_name: Some(name.to_string()),
            parent_entity_type: parent_type.map(String::from),
            parent_entity_id: parent_id,
            total_bytes,
            file_count: 1,
            reclaimable_bytes: 0,
        }
    }

    #[test]
    fn build_hierarchy_empty_input() {
        let result = build_hierarchy(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn build_hierarchy_single_root() {
        let snapshots = vec![make_snapshot("project", 1, "Project A", None, None, 1000)];
        let tree = build_hierarchy(&snapshots);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].name, "Project A");
        assert_eq!(tree[0].entity_type, "project");
        assert_eq!(tree[0].size, 1000);
        assert!(tree[0].children.is_empty());
    }

    #[test]
    fn build_hierarchy_parent_child() {
        let snapshots = vec![
            make_snapshot("project", 1, "Project A", None, None, 5000),
            make_snapshot("avatar", 10, "Char 1", Some("project"), Some(1), 3000),
            make_snapshot("avatar", 11, "Char 2", Some("project"), Some(1), 2000),
        ];
        let tree = build_hierarchy(&snapshots);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].children.len(), 2);
    }

    #[test]
    fn build_hierarchy_three_levels() {
        let snapshots = vec![
            make_snapshot("project", 1, "Project A", None, None, 10000),
            make_snapshot("avatar", 10, "Char 1", Some("project"), Some(1), 5000),
            make_snapshot("scene", 100, "Scene 1", Some("avatar"), Some(10), 3000),
        ];
        let tree = build_hierarchy(&snapshots);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].children.len(), 1);
        assert_eq!(tree[0].children[0].children.len(), 1);
        assert_eq!(tree[0].children[0].children[0].name, "Scene 1");
    }

    #[test]
    fn build_hierarchy_multiple_roots() {
        let snapshots = vec![
            make_snapshot("project", 1, "Project A", None, None, 5000),
            make_snapshot("project", 2, "Project B", None, None, 3000),
        ];
        let tree = build_hierarchy(&snapshots);
        assert_eq!(tree.len(), 2);
    }

    #[test]
    fn build_hierarchy_missing_name_uses_fallback() {
        let snapshots = vec![StorageSnapshot {
            entity_type: "project".to_string(),
            entity_id: 42,
            entity_name: None,
            parent_entity_type: None,
            parent_entity_id: None,
            total_bytes: 100,
            file_count: 1,
            reclaimable_bytes: 0,
        }];
        let tree = build_hierarchy(&snapshots);
        assert_eq!(tree[0].name, "project:42");
    }

    // -- Breakdown computation --

    fn make_detailed(
        total: i64,
        video: i64,
        image: i64,
        intermediate: i64,
        metadata: i64,
        model: i64,
        files: i32,
    ) -> DetailedSnapshot {
        DetailedSnapshot {
            total_bytes: total,
            file_count: files,
            video_bytes: video,
            image_bytes: image,
            intermediate_bytes: intermediate,
            metadata_bytes: metadata,
            model_bytes: model,
        }
    }

    #[test]
    fn compute_breakdown_empty() {
        let result = compute_breakdown(&[]);
        assert_eq!(result.len(), 5);
        for b in &result {
            assert_eq!(b.total_bytes, 0);
            assert!((b.percentage - 0.0).abs() < f64::EPSILON);
        }
    }

    #[test]
    fn compute_breakdown_single_snapshot() {
        let snapshots = vec![make_detailed(1000, 500, 200, 100, 100, 100, 10)];
        let result = compute_breakdown(&snapshots);
        assert_eq!(result.len(), 5);

        let video = result.iter().find(|b| b.category == "video").unwrap();
        assert_eq!(video.total_bytes, 500);
        assert!((video.percentage - 0.5).abs() < 0.001);

        let image = result.iter().find(|b| b.category == "image").unwrap();
        assert_eq!(image.total_bytes, 200);
        assert!((image.percentage - 0.2).abs() < 0.001);
    }

    #[test]
    fn compute_breakdown_multiple_snapshots() {
        let snapshots = vec![
            make_detailed(1000, 500, 200, 100, 100, 100, 10),
            make_detailed(2000, 1000, 400, 200, 200, 200, 20),
        ];
        let result = compute_breakdown(&snapshots);
        let video = result.iter().find(|b| b.category == "video").unwrap();
        assert_eq!(video.total_bytes, 1500);
        // 1500 / 3000 = 0.5
        assert!((video.percentage - 0.5).abs() < 0.001);
    }

    // -- Total bytes computation --

    #[test]
    fn compute_total_bytes_empty() {
        assert_eq!(compute_total_bytes(&[]), 0);
    }

    #[test]
    fn compute_total_bytes_multiple() {
        let snapshots = vec![
            make_snapshot("project", 1, "A", None, None, 1000),
            make_snapshot("project", 2, "B", None, None, 2000),
        ];
        assert_eq!(compute_total_bytes(&snapshots), 3000);
    }

    // -- Reclaimable percentage --

    #[test]
    fn reclaimable_fraction_zero_total() {
        assert!((compute_reclaimable_fraction(100, 0) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn reclaimable_fraction_half() {
        let frac = compute_reclaimable_fraction(500, 1000);
        assert!((frac - 0.5).abs() < 0.001);
    }

    #[test]
    fn reclaimable_fraction_full() {
        let frac = compute_reclaimable_fraction(1000, 1000);
        assert!((frac - 1.0).abs() < 0.001);
    }

    #[test]
    fn reclaimable_fraction_zero_reclaimable() {
        let frac = compute_reclaimable_fraction(0, 5000);
        assert!((frac - 0.0).abs() < f64::EPSILON);
    }
}
