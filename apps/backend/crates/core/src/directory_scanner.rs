//! Unified file classifier for server-side directory scanning.
//!
//! Scans a directory and classifies every file by type (image, metadata,
//! speech, video clip, etc.) with resolved context (avatar slug, variant
//! type, labels, etc.). This is a pure filesystem classifier — it does NOT
//! access the database. Conflict detection happens in the API handler layer.
//!
//! Supports two directory structures:
//! 1. **Flat avatar folders**: `avatar-slug/image.png`, `avatar-slug/bio.json`
//! 2. **Underscore-delimited clip convention**: parsed via [`clip_filename_parser`]

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::clip_filename_parser;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Category of a scanned file, determined by extension and content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileCategory {
    /// Image file (jpg, jpeg, png, webp, gif).
    Image,
    /// Metadata JSON (bio.json, tov.json, metadata.json).
    Metadata,
    /// Speech data in JSON format.
    SpeechJson,
    /// Speech data in CSV format.
    SpeechCsv,
    /// Voice mapping CSV (has voice_id column).
    VoiceCsv,
    /// Video clip (mp4, webm, mov).
    VideoClip,
    /// Unrecognized file type.
    Unknown,
}

/// Conflict status for a scanned file (set by the handler, not the scanner).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStatus {
    /// No existing asset matches.
    New,
    /// An asset of the same type already exists.
    Exists,
    /// Duplicate content detected.
    Duplicate,
}

/// Resolved context extracted from directory structure and naming conventions.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResolvedContext {
    /// Avatar slug derived from parent folder name.
    pub avatar_slug: Option<String>,
    /// Image variant type (lowercase filename stem, e.g. "seed", "closeup").
    pub variant_type: Option<String>,
    /// Scene type slug (from clip naming convention).
    pub scene_type_slug: Option<String>,
    /// Track slug (from clip naming convention).
    pub track_slug: Option<String>,
    /// Version number (from clip naming convention).
    pub version: Option<i32>,
    /// Clip index (from clip naming convention).
    pub clip_index: Option<i32>,
    /// Labels extracted from bracket notation.
    pub labels: Vec<String>,
    /// Metadata key (e.g. "_source_bio", "_source_tov").
    pub metadata_key: Option<String>,
}

/// A single scanned file with its classification and resolved context.
#[derive(Debug, Clone, Serialize)]
pub struct ScannedFile {
    /// Absolute path to the file.
    pub path: String,
    /// Filename only (no directory).
    pub filename: String,
    /// File size in bytes.
    pub size_bytes: u64,
    /// Classified category.
    pub category: FileCategory,
    /// Context resolved from directory structure and naming.
    pub resolved: ResolvedContext,
}

/// A group of scanned files belonging to the same avatar.
#[derive(Debug, Clone, Serialize)]
pub struct AvatarScanGroup {
    /// Avatar slug (derived from folder name).
    pub avatar_slug: String,
    /// All files found for this avatar.
    pub files: Vec<ScannedFile>,
}

/// Summary counts by file category.
#[derive(Debug, Clone, Serialize)]
pub struct ScanSummary {
    pub total_files: usize,
    pub images: usize,
    pub metadata: usize,
    pub speech_json: usize,
    pub speech_csv: usize,
    pub voice_csv: usize,
    pub video_clips: usize,
    pub unknown: usize,
}

/// Result of scanning a directory.
#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    /// Files grouped by avatar slug.
    pub avatars: Vec<AvatarScanGroup>,
    /// Files at root level with no avatar context.
    pub unresolved: Vec<ScannedFile>,
    /// Per-category counts.
    pub summary: ScanSummary,
}

/// Errors that can occur during directory scanning.
#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("Directory not found: {0}")]
    NotFound(String),

    #[error("Path is not a directory: {0}")]
    NotADirectory(String),

    #[error("I/O error scanning directory: {0}")]
    Io(#[from] std::io::Error),
}

// ---------------------------------------------------------------------------
// Image extensions
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif"];

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov"];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Scan a directory and classify all files.
///
/// Entries at the root level:
/// - Subdirectories whose name matches the clip naming convention are treated
///   as clip folders; video files inside are classified as `VideoClip`.
/// - Other subdirectories are treated as avatar folders (folder name = avatar
///   slug); all files inside are classified by extension.
/// - Root-level files are classified and placed in `unresolved`.
pub fn scan_directory(path: &str) -> Result<ScanResult, ScanError> {
    let dir = Path::new(path);
    if !dir.exists() {
        return Err(ScanError::NotFound(path.to_string()));
    }
    if !dir.is_dir() {
        return Err(ScanError::NotADirectory(path.to_string()));
    }

    let mut avatar_groups: Vec<AvatarScanGroup> = Vec::new();
    let mut unresolved: Vec<ScannedFile> = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();

        if entry_path.is_dir() {
            // Try clip naming convention first.
            if let Ok(parsed) = clip_filename_parser::parse_clip_path(&entry_name) {
                let clip_files = scan_clip_folder(&entry_path, &parsed)?;
                let slug = parsed.avatar_slug.clone();
                push_to_avatar_group(&mut avatar_groups, &slug, clip_files);
            } else {
                // Treat as avatar folder.
                let avatar_slug = entry_name;
                let files = scan_avatar_folder(&entry_path, &avatar_slug)?;
                if !files.is_empty() {
                    push_to_avatar_group(&mut avatar_groups, &avatar_slug, files);
                }
            }
        } else if entry_path.is_file() {
            // Root-level file — no avatar context.
            if let Some(file) = classify_file(&entry_path, &ResolvedContext::default())? {
                unresolved.push(file);
            }
        }
    }

    let summary = compute_summary(&avatar_groups, &unresolved);

    Ok(ScanResult {
        avatars: avatar_groups,
        unresolved,
        summary,
    })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Scan a clip-convention folder for video files.
fn scan_clip_folder(
    folder: &Path,
    parsed: &clip_filename_parser::ParsedClipFilename,
) -> Result<Vec<ScannedFile>, ScanError> {
    let mut files = Vec::new();

    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Try parsing the individual clip file name for clip_index.
        let clip_index = clip_filename_parser::parse_clip_path(&filename)
            .ok()
            .and_then(|p| p.clip_index)
            .or(parsed.clip_index);

        let meta = path.metadata()?;

        files.push(ScannedFile {
            path: path.to_string_lossy().to_string(),
            filename,
            size_bytes: meta.len(),
            category: FileCategory::VideoClip,
            resolved: ResolvedContext {
                avatar_slug: Some(parsed.avatar_slug.clone()),
                scene_type_slug: Some(parsed.scene_type_slug.clone()),
                track_slug: Some(parsed.track_slug.clone()),
                version: Some(parsed.version),
                clip_index,
                labels: parsed.labels.clone(),
                ..Default::default()
            },
        });
    }

    Ok(files)
}

/// Scan an avatar folder (flat structure) for all supported file types.
fn scan_avatar_folder(folder: &Path, avatar_slug: &str) -> Result<Vec<ScannedFile>, ScanError> {
    let mut files = Vec::new();

    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let base_ctx = ResolvedContext {
            avatar_slug: Some(avatar_slug.to_string()),
            ..Default::default()
        };

        if let Some(file) = classify_file(&path, &base_ctx)? {
            files.push(file);
        }
    }

    Ok(files)
}

/// Classify a single file by extension and content.
///
/// Returns `None` for entries that cannot be read (broken symlinks, etc.).
fn classify_file(
    path: &Path,
    base_ctx: &ResolvedContext,
) -> Result<Option<ScannedFile>, ScanError> {
    let meta = match path.metadata() {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };

    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (category, mut ctx) = classify_by_extension(&ext, &stem, &filename, path, base_ctx);

    // Inherit avatar_slug from parent context if not already set.
    if ctx.avatar_slug.is_none() {
        ctx.avatar_slug.clone_from(&base_ctx.avatar_slug);
    }

    Ok(Some(ScannedFile {
        path: path.to_string_lossy().to_string(),
        filename,
        size_bytes: meta.len(),
        category,
        resolved: ctx,
    }))
}

/// Classify a file by its extension and filename.
fn classify_by_extension(
    ext: &str,
    stem: &str,
    _filename: &str,
    path: &Path,
    base_ctx: &ResolvedContext,
) -> (FileCategory, ResolvedContext) {
    let mut ctx = base_ctx.clone();

    // Images
    if IMAGE_EXTENSIONS.contains(&ext) {
        ctx.variant_type = Some(stem.to_string());
        return (FileCategory::Image, ctx);
    }

    // Video clips
    if VIDEO_EXTENSIONS.contains(&ext) {
        return (FileCategory::VideoClip, ctx);
    }

    // JSON files
    if ext == "json" {
        return classify_json(stem, ctx);
    }

    // CSV files
    if ext == "csv" {
        let category = classify_csv(path);
        return (category, ctx);
    }

    (FileCategory::Unknown, ctx)
}

/// Classify a JSON file as metadata or speech.
fn classify_json(stem: &str, mut ctx: ResolvedContext) -> (FileCategory, ResolvedContext) {
    match stem {
        "bio" => {
            ctx.metadata_key = Some("_source_bio".to_string());
            (FileCategory::Metadata, ctx)
        }
        "tov" => {
            ctx.metadata_key = Some("_source_tov".to_string());
            (FileCategory::Metadata, ctx)
        }
        "metadata" => (FileCategory::Metadata, ctx),
        _ => (FileCategory::SpeechJson, ctx),
    }
}

/// Classify a CSV file as voice or speech by reading the header row.
fn classify_csv(path: &Path) -> FileCategory {
    let Ok(file) = fs::File::open(path) else {
        return FileCategory::Unknown;
    };

    let reader = BufReader::new(file);
    let Some(Ok(header)) = reader.lines().next() else {
        return FileCategory::Unknown;
    };

    let header_lower = header.to_lowercase();
    if header_lower.contains("voice_id") || header_lower.contains("voiceid") {
        FileCategory::VoiceCsv
    } else {
        FileCategory::SpeechCsv
    }
}

/// Add files to an existing avatar group or create a new one.
fn push_to_avatar_group(
    groups: &mut Vec<AvatarScanGroup>,
    avatar_slug: &str,
    mut files: Vec<ScannedFile>,
) {
    if let Some(group) = groups.iter_mut().find(|g| g.avatar_slug == avatar_slug) {
        group.files.append(&mut files);
    } else {
        groups.push(AvatarScanGroup {
            avatar_slug: avatar_slug.to_string(),
            files,
        });
    }
}

/// Compute summary counts from all avatar groups and unresolved files.
fn compute_summary(groups: &[AvatarScanGroup], unresolved: &[ScannedFile]) -> ScanSummary {
    let all_files = groups
        .iter()
        .flat_map(|g| g.files.iter())
        .chain(unresolved.iter());

    let mut summary = ScanSummary {
        total_files: 0,
        images: 0,
        metadata: 0,
        speech_json: 0,
        speech_csv: 0,
        voice_csv: 0,
        video_clips: 0,
        unknown: 0,
    };

    for f in all_files {
        summary.total_files += 1;
        match f.category {
            FileCategory::Image => summary.images += 1,
            FileCategory::Metadata => summary.metadata += 1,
            FileCategory::SpeechJson => summary.speech_json += 1,
            FileCategory::SpeechCsv => summary.speech_csv += 1,
            FileCategory::VoiceCsv => summary.voice_csv += 1,
            FileCategory::VideoClip => summary.video_clips += 1,
            FileCategory::Unknown => summary.unknown += 1,
        }
    }

    summary
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: create a file with optional content.
    fn create_file(dir: &Path, name: &str, content: &[u8]) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn flat_avatar_folder_with_mixed_files() {
        let tmp = TempDir::new().unwrap();
        let avatar_dir = tmp.path().join("allie-nicole");
        fs::create_dir_all(&avatar_dir).unwrap();

        create_file(&avatar_dir, "seed.png", b"png data");
        create_file(&avatar_dir, "closeup.jpg", b"jpg data");
        create_file(&avatar_dir, "bio.json", b"{}");
        create_file(&avatar_dir, "unknown.txt", b"text");

        let result = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        assert_eq!(result.avatars.len(), 1);
        assert_eq!(result.avatars[0].avatar_slug, "allie-nicole");
        assert_eq!(result.avatars[0].files.len(), 4);

        let categories: Vec<&FileCategory> = result.avatars[0]
            .files
            .iter()
            .map(|f| &f.category)
            .collect();
        assert!(categories.contains(&&FileCategory::Image));
        assert!(categories.contains(&&FileCategory::Metadata));
        assert!(categories.contains(&&FileCategory::Unknown));

        assert_eq!(result.summary.images, 2);
        assert_eq!(result.summary.metadata, 1);
        assert_eq!(result.summary.unknown, 1);
        assert_eq!(result.summary.total_files, 4);
        assert!(result.unresolved.is_empty());
    }

    #[test]
    fn clip_naming_convention_folder() {
        let tmp = TempDir::new().unwrap();
        let clip_dir = tmp
            .path()
            .join("sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]");
        fs::create_dir_all(&clip_dir).unwrap();

        create_file(
            &clip_dir,
            "sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0001.mp4",
            b"video data",
        );
        create_file(
            &clip_dir,
            "sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0002.mp4",
            b"video data 2",
        );
        // Non-video files in clip folders should be skipped.
        create_file(&clip_dir, "readme.txt", b"ignore me");

        let result = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        assert_eq!(result.avatars.len(), 1);
        assert_eq!(result.avatars[0].avatar_slug, "allie-nicole");
        assert_eq!(result.avatars[0].files.len(), 2);

        for f in &result.avatars[0].files {
            assert_eq!(f.category, FileCategory::VideoClip);
            assert_eq!(f.resolved.scene_type_slug.as_deref(), Some("idle"));
            assert_eq!(f.resolved.track_slug.as_deref(), Some("topless"));
            assert_eq!(f.resolved.version, Some(1));
            assert!(f.resolved.clip_index.is_some());
        }

        assert_eq!(result.summary.video_clips, 2);
        assert_eq!(result.summary.total_files, 2);
    }

    #[test]
    fn csv_speech_vs_voice_detection() {
        let tmp = TempDir::new().unwrap();
        let avatar_dir = tmp.path().join("test-avatar");
        fs::create_dir_all(&avatar_dir).unwrap();

        create_file(
            &avatar_dir,
            "speeches.csv",
            b"text,emotion,duration\nhello,happy,2.5",
        );
        create_file(
            &avatar_dir,
            "voices.csv",
            b"name,voice_id,language\ntest,voice_123,en",
        );

        let result = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        assert_eq!(result.avatars.len(), 1);
        let files = &result.avatars[0].files;
        assert_eq!(files.len(), 2);

        let speech = files.iter().find(|f| f.filename == "speeches.csv").unwrap();
        assert_eq!(speech.category, FileCategory::SpeechCsv);

        let voice = files.iter().find(|f| f.filename == "voices.csv").unwrap();
        assert_eq!(voice.category, FileCategory::VoiceCsv);
    }

    #[test]
    fn json_metadata_vs_speech_detection() {
        let tmp = TempDir::new().unwrap();
        let avatar_dir = tmp.path().join("test-avatar");
        fs::create_dir_all(&avatar_dir).unwrap();

        create_file(&avatar_dir, "bio.json", b"{}");
        create_file(&avatar_dir, "tov.json", b"{}");
        create_file(&avatar_dir, "metadata.json", b"{}");
        create_file(&avatar_dir, "greetings.json", b"[]");

        let result = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        let files = &result.avatars[0].files;
        assert_eq!(files.len(), 4);

        let bio = files.iter().find(|f| f.filename == "bio.json").unwrap();
        assert_eq!(bio.category, FileCategory::Metadata);
        assert_eq!(bio.resolved.metadata_key.as_deref(), Some("_source_bio"));

        let tov = files.iter().find(|f| f.filename == "tov.json").unwrap();
        assert_eq!(tov.category, FileCategory::Metadata);
        assert_eq!(tov.resolved.metadata_key.as_deref(), Some("_source_tov"));

        let meta = files
            .iter()
            .find(|f| f.filename == "metadata.json")
            .unwrap();
        assert_eq!(meta.category, FileCategory::Metadata);
        assert!(meta.resolved.metadata_key.is_none());

        let speech = files
            .iter()
            .find(|f| f.filename == "greetings.json")
            .unwrap();
        assert_eq!(speech.category, FileCategory::SpeechJson);
    }

    #[test]
    fn root_level_files_go_to_unresolved() {
        let tmp = TempDir::new().unwrap();

        create_file(tmp.path(), "stray_image.png", b"data");
        create_file(tmp.path(), "random.csv", b"col_a,col_b\n1,2");

        let result = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        assert!(result.avatars.is_empty());
        assert_eq!(result.unresolved.len(), 2);

        let img = result
            .unresolved
            .iter()
            .find(|f| f.filename == "stray_image.png")
            .unwrap();
        assert_eq!(img.category, FileCategory::Image);
        assert!(img.resolved.avatar_slug.is_none());
    }

    #[test]
    fn error_on_nonexistent_directory() {
        let result = scan_directory("/nonexistent/path/that/does/not/exist");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ScanError::NotFound(_)));
    }

    #[test]
    fn error_on_file_instead_of_directory() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("not_a_dir.txt");
        fs::write(&file_path, b"hello").unwrap();

        let result = scan_directory(file_path.to_str().unwrap());
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ScanError::NotADirectory(_)));
    }

    #[test]
    fn image_variant_type_is_lowercase_stem() {
        let tmp = TempDir::new().unwrap();
        let avatar_dir = tmp.path().join("test-avatar");
        fs::create_dir_all(&avatar_dir).unwrap();

        create_file(&avatar_dir, "Seed.PNG", b"data");
        create_file(&avatar_dir, "CloseUp.JPEG", b"data");

        let result = scan_directory(tmp.path().to_str().unwrap()).unwrap();
        let files = &result.avatars[0].files;

        for f in files {
            assert_eq!(f.category, FileCategory::Image);
            // variant_type should be lowercase stem
            let vt = f.resolved.variant_type.as_ref().unwrap();
            assert_eq!(vt, &vt.to_lowercase());
        }
    }
}
