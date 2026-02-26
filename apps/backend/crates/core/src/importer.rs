//! Core types, constants, and pure logic for the folder-to-entity bulk
//! importer (PRD-016).
//!
//! This module has zero external dependencies (no DB, no async, no I/O).
//! It provides:
//!
//! - Constants for import configuration (max depth, supported extensions, etc.)
//! - Types for parsed files, mapped entities, mapping rules, and uniqueness conflicts.
//! - Pure functions: extension-to-entity-type derivation, file-to-entity mapping,
//!   uniqueness conflict detection.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Constants ────────────────────────────────────────────────────────

/// Maximum folder nesting depth before the parser stops recursing.
pub const MAX_FOLDER_DEPTH: usize = 10;

/// Server-side staging directory prefix.
pub const STAGING_DIR_PREFIX: &str = "/tmp/x121/staging";

/// Image file extensions recognised by the importer.
pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "tiff", "bmp", "gif"];

/// Metadata file extensions.
pub const METADATA_EXTENSIONS: &[&str] = &["json", "yaml", "yml", "toml"];

/// Video file extensions.
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "webm", "avi", "mkv"];

/// All supported file extensions (union of the above).
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "tiff", "bmp", "gif", // images
    "json", "yaml", "yml", "toml", // metadata
    "mp4", "mov", "webm", "avi", "mkv", // video
];

// ── Import session status names ──────────────────────────────────────

pub const SESSION_STATUS_UPLOADING: &str = "uploading";
pub const SESSION_STATUS_PARSING: &str = "parsing";
pub const SESSION_STATUS_PREVIEW: &str = "preview";
pub const SESSION_STATUS_COMMITTING: &str = "committing";
pub const SESSION_STATUS_COMMITTED: &str = "committed";
pub const SESSION_STATUS_PARTIAL: &str = "partial";
pub const SESSION_STATUS_CANCELLED: &str = "cancelled";
pub const SESSION_STATUS_FAILED: &str = "failed";

// ── Types ────────────────────────────────────────────────────────────

/// A file discovered during folder tree parsing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedFile {
    /// Relative path from the import root (e.g. "Alice/images/portrait.png").
    pub relative_path: String,
    /// Just the file name (e.g. "portrait.png").
    pub file_name: String,
    /// Lowercase extension without the dot (e.g. "png").
    pub file_extension: String,
    /// File size in bytes.
    pub file_size_bytes: u64,
    /// Nesting depth (0 = file directly in root).
    pub depth: usize,
    /// Ordered list of parent folder names from root to the file's parent.
    pub parent_folders: Vec<String>,
}

/// The entity type derived from a file extension.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DerivedEntityType {
    Image,
    Metadata,
    Video,
    Unknown,
}

impl DerivedEntityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Metadata => "metadata",
            Self::Video => "video",
            Self::Unknown => "unknown",
        }
    }
}

impl std::fmt::Display for DerivedEntityType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A file that has been mapped to a platform entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappedEntity {
    /// Original relative path within the staging area.
    pub source_path: String,
    /// File name.
    pub file_name: String,
    /// File size in bytes.
    pub file_size_bytes: u64,
    /// Derived entity type from extension.
    pub entity_type: String,
    /// Entity name derived from folder structure (e.g. character name).
    pub entity_name: String,
    /// Optional subcategory from subfolder (e.g. "images", "bio").
    pub category: Option<String>,
    /// Lowercase file extension.
    pub file_extension: String,
}

/// Where to derive an entity name from.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NameSource {
    /// Use the folder name at this depth.
    FolderName,
    /// Use the file name (without extension).
    FileName,
    /// Use a custom fixed string.
    Custom(String),
}

/// A rule defining how a folder depth maps to an entity concept.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappingRule {
    /// Depth in the folder tree (0 = top-level folder).
    pub depth: usize,
    /// What this depth-level represents.
    pub entity_type: String,
    /// Where the name comes from.
    pub name_source: NameSource,
}

/// A uniqueness conflict: multiple source paths would create entities
/// with the same derived name.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniquenessConflict {
    /// The duplicated entity name.
    pub entity_name: String,
    /// All source paths that map to this name.
    pub paths: Vec<String>,
    /// Suggested resolution.
    pub suggested_action: UniquenessAction,
}

/// How to resolve a uniqueness conflict.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UniquenessAction {
    /// Merge files under a single entity.
    Merge,
    /// Rename entities using their full path as a prefix.
    RenameWithPath,
    /// Skip the conflicting entries.
    Skip,
}

// ── Pure Functions ───────────────────────────────────────────────────

/// Derive an entity type from a file extension (case-insensitive).
pub fn derive_entity_type(extension: &str) -> DerivedEntityType {
    let ext = extension.to_lowercase();
    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        DerivedEntityType::Image
    } else if METADATA_EXTENSIONS.contains(&ext.as_str()) {
        DerivedEntityType::Metadata
    } else if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        DerivedEntityType::Video
    } else {
        DerivedEntityType::Unknown
    }
}

/// Return the default mapping rules:
/// - depth 0 (top folder) = character name
/// - depth 1 (subfolder)  = category
pub fn default_mapping_rules() -> Vec<MappingRule> {
    vec![
        MappingRule {
            depth: 0,
            entity_type: "character".to_string(),
            name_source: NameSource::FolderName,
        },
        MappingRule {
            depth: 1,
            entity_type: "category".to_string(),
            name_source: NameSource::FolderName,
        },
    ]
}

/// Map a slice of parsed files to entity records using the given rules.
///
/// The default convention:
/// - `parent_folders[0]` -> character / entity name
/// - `parent_folders[1]` -> category (optional)
/// - file extension       -> entity type (image, metadata, video, unknown)
pub fn map_files_to_entities(files: &[ParsedFile], _rules: &[MappingRule]) -> Vec<MappedEntity> {
    files
        .iter()
        .map(|file| {
            let entity_name = file
                .parent_folders
                .first()
                .cloned()
                .unwrap_or_else(|| stem_from_filename(&file.file_name));
            let category = file.parent_folders.get(1).cloned();
            let entity_type = derive_entity_type(&file.file_extension);

            MappedEntity {
                source_path: file.relative_path.clone(),
                file_name: file.file_name.clone(),
                file_size_bytes: file.file_size_bytes,
                entity_type: entity_type.as_str().to_string(),
                entity_name,
                category,
                file_extension: file.file_extension.clone(),
            }
        })
        .collect()
}

/// Detect uniqueness conflicts: multiple source paths producing the
/// same `entity_name`.
pub fn detect_uniqueness_conflicts(mapped_entities: &[MappedEntity]) -> Vec<UniquenessConflict> {
    let mut name_to_paths: HashMap<String, Vec<String>> = HashMap::new();

    for entity in mapped_entities {
        name_to_paths
            .entry(entity.entity_name.clone())
            .or_default()
            .push(entity.source_path.clone());
    }

    let mut conflicts: Vec<UniquenessConflict> = name_to_paths
        .into_iter()
        .filter(|(_, paths)| paths.len() > 1)
        .map(|(name, paths)| UniquenessConflict {
            entity_name: name,
            paths,
            suggested_action: UniquenessAction::RenameWithPath,
        })
        .collect();

    // Sort by name for deterministic output.
    conflicts.sort_by(|a, b| a.entity_name.cmp(&b.entity_name));
    conflicts
}

/// Returns `true` if the file name represents a hidden or system file.
pub fn is_hidden_or_system(file_name: &str) -> bool {
    file_name.starts_with('.')
        || file_name == "Thumbs.db"
        || file_name == "desktop.ini"
        || file_name == ".DS_Store"
}

/// Returns `true` if the extension is recognised (image, metadata, or video).
pub fn is_supported_extension(extension: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&extension.to_lowercase().as_str())
}

// ── Private helpers ──────────────────────────────────────────────────

/// Extract a stem (name without extension) from a filename.
fn stem_from_filename(filename: &str) -> String {
    match filename.rfind('.') {
        Some(pos) if pos > 0 => filename[..pos].to_string(),
        _ => filename.to_string(),
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // -- derive_entity_type tests --

    #[test]
    fn test_image_extensions() {
        for ext in &["png", "jpg", "jpeg", "webp", "tiff", "bmp", "gif"] {
            assert_eq!(
                derive_entity_type(ext),
                DerivedEntityType::Image,
                "ext: {ext}"
            );
        }
    }

    #[test]
    fn test_image_extensions_case_insensitive() {
        assert_eq!(derive_entity_type("PNG"), DerivedEntityType::Image);
        assert_eq!(derive_entity_type("Jpg"), DerivedEntityType::Image);
    }

    #[test]
    fn test_metadata_extensions() {
        for ext in &["json", "yaml", "yml", "toml"] {
            assert_eq!(
                derive_entity_type(ext),
                DerivedEntityType::Metadata,
                "ext: {ext}"
            );
        }
    }

    #[test]
    fn test_video_extensions() {
        for ext in &["mp4", "mov", "webm", "avi", "mkv"] {
            assert_eq!(
                derive_entity_type(ext),
                DerivedEntityType::Video,
                "ext: {ext}"
            );
        }
    }

    #[test]
    fn test_unknown_extension() {
        assert_eq!(derive_entity_type("exe"), DerivedEntityType::Unknown);
        assert_eq!(derive_entity_type("txt"), DerivedEntityType::Unknown);
        assert_eq!(derive_entity_type(""), DerivedEntityType::Unknown);
    }

    // -- is_hidden_or_system tests --

    #[test]
    fn test_hidden_files() {
        assert!(is_hidden_or_system(".gitignore"));
        assert!(is_hidden_or_system(".DS_Store"));
        assert!(is_hidden_or_system("Thumbs.db"));
        assert!(is_hidden_or_system("desktop.ini"));
    }

    #[test]
    fn test_normal_files_not_hidden() {
        assert!(!is_hidden_or_system("portrait.png"));
        assert!(!is_hidden_or_system("metadata.json"));
    }

    // -- is_supported_extension tests --

    #[test]
    fn test_supported_extensions() {
        assert!(is_supported_extension("png"));
        assert!(is_supported_extension("json"));
        assert!(is_supported_extension("mp4"));
        assert!(is_supported_extension("PNG")); // case-insensitive
    }

    #[test]
    fn test_unsupported_extensions() {
        assert!(!is_supported_extension("exe"));
        assert!(!is_supported_extension("txt"));
        assert!(!is_supported_extension(""));
    }

    // -- map_files_to_entities tests --

    fn make_parsed_file(
        relative_path: &str,
        file_name: &str,
        extension: &str,
        parent_folders: Vec<&str>,
    ) -> ParsedFile {
        ParsedFile {
            relative_path: relative_path.to_string(),
            file_name: file_name.to_string(),
            file_extension: extension.to_string(),
            file_size_bytes: 1024,
            depth: parent_folders.len(),
            parent_folders: parent_folders.into_iter().map(String::from).collect(),
        }
    }

    #[test]
    fn test_map_top_folder_to_character_name() {
        let files = vec![make_parsed_file(
            "Alice/portrait.png",
            "portrait.png",
            "png",
            vec!["Alice"],
        )];
        let rules = default_mapping_rules();
        let mapped = map_files_to_entities(&files, &rules);

        assert_eq!(mapped.len(), 1);
        assert_eq!(mapped[0].entity_name, "Alice");
        assert_eq!(mapped[0].entity_type, "image");
        assert!(mapped[0].category.is_none());
    }

    #[test]
    fn test_map_subfolder_to_category() {
        let files = vec![make_parsed_file(
            "Alice/images/portrait.png",
            "portrait.png",
            "png",
            vec!["Alice", "images"],
        )];
        let rules = default_mapping_rules();
        let mapped = map_files_to_entities(&files, &rules);

        assert_eq!(mapped[0].entity_name, "Alice");
        assert_eq!(mapped[0].category.as_deref(), Some("images"));
        assert_eq!(mapped[0].entity_type, "image");
    }

    #[test]
    fn test_map_json_to_metadata() {
        let files = vec![make_parsed_file(
            "Alice/bio.json",
            "bio.json",
            "json",
            vec!["Alice"],
        )];
        let rules = default_mapping_rules();
        let mapped = map_files_to_entities(&files, &rules);

        assert_eq!(mapped[0].entity_type, "metadata");
    }

    #[test]
    fn test_map_video_to_video() {
        let files = vec![make_parsed_file(
            "Alice/intro.mp4",
            "intro.mp4",
            "mp4",
            vec!["Alice"],
        )];
        let rules = default_mapping_rules();
        let mapped = map_files_to_entities(&files, &rules);

        assert_eq!(mapped[0].entity_type, "video");
    }

    #[test]
    fn test_map_unknown_extension_flagged() {
        let files = vec![make_parsed_file(
            "Alice/readme.txt",
            "readme.txt",
            "txt",
            vec!["Alice"],
        )];
        let rules = default_mapping_rules();
        let mapped = map_files_to_entities(&files, &rules);

        assert_eq!(mapped[0].entity_type, "unknown");
    }

    #[test]
    fn test_map_root_file_uses_stem_as_name() {
        let files = vec![make_parsed_file(
            "landscape.png",
            "landscape.png",
            "png",
            vec![],
        )];
        let rules = default_mapping_rules();
        let mapped = map_files_to_entities(&files, &rules);

        assert_eq!(mapped[0].entity_name, "landscape");
    }

    // -- detect_uniqueness_conflicts tests --

    #[test]
    fn test_no_conflicts_with_unique_names() {
        let entities = vec![
            MappedEntity {
                source_path: "Alice/portrait.png".to_string(),
                file_name: "portrait.png".to_string(),
                file_size_bytes: 1024,
                entity_type: "image".to_string(),
                entity_name: "Alice".to_string(),
                category: None,
                file_extension: "png".to_string(),
            },
            MappedEntity {
                source_path: "Bob/portrait.png".to_string(),
                file_name: "portrait.png".to_string(),
                file_size_bytes: 2048,
                entity_type: "image".to_string(),
                entity_name: "Bob".to_string(),
                category: None,
                file_extension: "png".to_string(),
            },
        ];

        let conflicts = detect_uniqueness_conflicts(&entities);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_detects_duplicate_entity_names() {
        let entities = vec![
            MappedEntity {
                source_path: "folder1/Alice/portrait.png".to_string(),
                file_name: "portrait.png".to_string(),
                file_size_bytes: 1024,
                entity_type: "image".to_string(),
                entity_name: "Alice".to_string(),
                category: None,
                file_extension: "png".to_string(),
            },
            MappedEntity {
                source_path: "folder2/Alice/avatar.png".to_string(),
                file_name: "avatar.png".to_string(),
                file_size_bytes: 2048,
                entity_type: "image".to_string(),
                entity_name: "Alice".to_string(),
                category: None,
                file_extension: "png".to_string(),
            },
        ];

        let conflicts = detect_uniqueness_conflicts(&entities);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].entity_name, "Alice");
        assert_eq!(conflicts[0].paths.len(), 2);
        assert_eq!(
            conflicts[0].suggested_action,
            UniquenessAction::RenameWithPath
        );
    }

    #[test]
    fn test_no_false_positives_for_different_names() {
        let entities = vec![
            MappedEntity {
                source_path: "Alice/Bio/data.json".to_string(),
                file_name: "data.json".to_string(),
                file_size_bytes: 512,
                entity_type: "metadata".to_string(),
                entity_name: "Alice".to_string(),
                category: Some("Bio".to_string()),
                file_extension: "json".to_string(),
            },
            MappedEntity {
                source_path: "Bob/Bio/data.json".to_string(),
                file_name: "data.json".to_string(),
                file_size_bytes: 512,
                entity_type: "metadata".to_string(),
                entity_name: "Bob".to_string(),
                category: Some("Bio".to_string()),
                file_extension: "json".to_string(),
            },
        ];

        let conflicts = detect_uniqueness_conflicts(&entities);
        assert!(conflicts.is_empty());
    }

    // -- default_mapping_rules tests --

    #[test]
    fn test_default_rules_structure() {
        let rules = default_mapping_rules();
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].depth, 0);
        assert_eq!(rules[0].entity_type, "character");
        assert_eq!(rules[1].depth, 1);
        assert_eq!(rules[1].entity_type, "category");
    }

    // -- stem_from_filename tests --

    #[test]
    fn test_stem_from_filename() {
        assert_eq!(stem_from_filename("portrait.png"), "portrait");
        assert_eq!(stem_from_filename("my.file.name.jpg"), "my.file.name");
        assert_eq!(stem_from_filename("noext"), "noext");
        assert_eq!(stem_from_filename(".hidden"), ".hidden");
    }
}
