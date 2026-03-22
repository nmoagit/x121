//! Folder scanner and image classifier for the avatar ingest pipeline (PRD-113).
//!
//! Scans a root directory for avatar folders, detects images and metadata
//! files, and classifies images by filename patterns.

use std::path::Path;

use serde::Serialize;

use crate::name_parser;

/// A scanned avatar folder with its detected contents.
#[derive(Debug, Clone, Serialize)]
pub struct ScannedAvatarFolder {
    /// The original folder name.
    pub folder_name: String,
    /// The parsed avatar name with confidence.
    pub parsed_name: name_parser::ParsedName,
    /// Detected image files.
    pub images: Vec<DetectedImage>,
    /// Metadata file (e.g. `metadata.json`), if found.
    pub metadata_file: Option<DetectedFile>,
    /// Tone-of-voice file (e.g. `tov.json`), if found.
    pub tov_file: Option<DetectedFile>,
    /// Bio file (e.g. `bio.json` or `bio.txt`), if found.
    pub bio_file: Option<DetectedFile>,
    /// Other non-image, non-metadata files.
    pub other_files: Vec<DetectedFile>,
    /// Issues detected during scanning.
    pub issues: Vec<String>,
}

/// A detected image file with optional classification.
#[derive(Debug, Clone, Serialize)]
pub struct DetectedImage {
    /// Filename (not full path).
    pub filename: String,
    /// File extension (lowercase, without dot).
    pub extension: String,
    /// Inferred classification from filename patterns.
    pub classification: Option<String>,
    /// File size in bytes.
    pub size_bytes: u64,
}

/// A detected non-image file.
#[derive(Debug, Clone, Serialize)]
pub struct DetectedFile {
    /// Filename (not full path).
    pub filename: String,
    /// File size in bytes.
    pub size_bytes: u64,
}

/// Supported image file extensions.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "tiff"];

/// Scan a root directory for avatar folders.
///
/// Each subdirectory of `root` is treated as a avatar folder. Files within
/// each folder are classified as images, metadata, or other files.
pub async fn scan_avatar_folders(
    root: &Path,
) -> Result<Vec<ScannedAvatarFolder>, std::io::Error> {
    let mut results = Vec::new();
    let mut entries = tokio::fs::read_dir(root).await?;

    while let Some(entry) = entries.next_entry().await? {
        let file_type = entry.file_type().await?;
        if !file_type.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();
        let parsed_name = name_parser::parse_avatar_name(&folder_name);

        let mut images = Vec::new();
        let mut metadata_file = None;
        let mut tov_file = None;
        let mut bio_file = None;
        let mut other_files = Vec::new();
        let mut issues = Vec::new();

        match scan_folder_contents(&entry.path(), &mut images, &mut other_files).await {
            Ok((meta, tov, bio)) => {
                metadata_file = meta;
                tov_file = tov;
                bio_file = bio;
            }
            Err(e) => {
                issues.push(format!("Error scanning folder contents: {e}"));
            }
        }

        if images.is_empty() {
            issues.push("No image files found in folder".to_string());
        }

        results.push(ScannedAvatarFolder {
            folder_name,
            parsed_name,
            images,
            metadata_file,
            tov_file,
            bio_file,
            other_files,
            issues,
        });
    }

    results.sort_by(|a, b| a.folder_name.cmp(&b.folder_name));
    Ok(results)
}

/// Scan the contents of a single avatar folder.
///
/// Returns (metadata_file, tov_file, bio_file) as a tuple, and populates
/// `images` and `other_files` vectors.
async fn scan_folder_contents(
    folder: &Path,
    images: &mut Vec<DetectedImage>,
    other_files: &mut Vec<DetectedFile>,
) -> Result<
    (
        Option<DetectedFile>,
        Option<DetectedFile>,
        Option<DetectedFile>,
    ),
    std::io::Error,
> {
    let mut metadata_file = None;
    let mut tov_file = None;
    let mut bio_file = None;

    let mut entries = tokio::fs::read_dir(folder).await?;

    while let Some(entry) = entries.next_entry().await? {
        let file_type = entry.file_type().await?;
        if !file_type.is_file() {
            continue;
        }

        let filename = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().await?;
        let size_bytes = metadata.len();

        let extension = filename.rsplit('.').next().unwrap_or("").to_lowercase();

        // Check if it is an image.
        if IMAGE_EXTENSIONS.contains(&extension.as_str()) {
            let classification = classify_image(&filename);
            images.push(DetectedImage {
                filename,
                extension,
                classification,
                size_bytes,
            });
            continue;
        }

        // Check for known metadata files.
        let lower = filename.to_lowercase();
        if lower == "metadata.json" {
            metadata_file = Some(DetectedFile {
                filename,
                size_bytes,
            });
        } else if lower.starts_with("tov") && (lower.ends_with(".json") || lower.ends_with(".txt"))
        {
            tov_file = Some(DetectedFile {
                filename,
                size_bytes,
            });
        } else if lower.starts_with("bio") && (lower.ends_with(".json") || lower.ends_with(".txt"))
        {
            bio_file = Some(DetectedFile {
                filename,
                size_bytes,
            });
        } else {
            other_files.push(DetectedFile {
                filename,
                size_bytes,
            });
        }
    }

    // Sort images by filename for deterministic output.
    images.sort_by(|a, b| a.filename.cmp(&b.filename));

    Ok((metadata_file, tov_file, bio_file))
}

/// Classify an image by its filename patterns.
///
/// Returns a human-readable classification string based on common naming
/// conventions (e.g. "hero", "profile", "reference").
pub fn classify_image(filename: &str) -> Option<String> {
    let lower = filename.to_lowercase();

    if lower.contains("hero") {
        Some("hero".to_string())
    } else if lower.contains("profile") || lower.contains("headshot") {
        Some("profile".to_string())
    } else if lower.contains("full") || lower.contains("body") {
        Some("full_body".to_string())
    } else if lower.contains("ref") {
        Some("reference".to_string())
    } else if lower.contains("thumb") || lower.contains("thumbnail") {
        Some("thumbnail".to_string())
    } else if lower.contains("close") || lower.contains("closeup") {
        Some("closeup".to_string())
    } else {
        None
    }
}
