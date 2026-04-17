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

/// A pre-enumerated file entry from any source (local filesystem or S3).
///
/// Produced by the scanner entrypoints (local walk, S3 list) and consumed
/// by [`classify_entries`]. This abstraction lets the classifier operate
/// identically over local paths and S3 keys (PRD-165).
#[derive(Debug, Clone)]
pub struct ScannedEntry {
    /// Full path or URI (e.g. `/mnt/data/alice/seed.png` or `s3://bucket/prefix/alice/seed.png`).
    pub path: String,
    /// Filename component only.
    pub filename: String,
    /// File size in bytes.
    pub size_bytes: u64,
    /// Path segments relative to the scan root — used for structure detection.
    /// For `scan_root/alice/seed.png` this is `["alice", "seed.png"]`.
    /// For a top-level clip folder `scan_root/sdg_alice_idle_v1/clip0001.mp4`
    /// this is `["sdg_alice_idle_v1", "clip0001.mp4"]`.
    pub segments: Vec<String>,
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

/// Scan a local directory and classify all files.
///
/// Thin wrapper that walks the local filesystem, builds a list of
/// [`ScannedEntry`] values, and delegates to [`classify_entries`]. All
/// classification logic lives in `classify_entries` so the same code path
/// is used for local and S3 sources (PRD-165).
///
/// Local scans additionally sniff CSV headers so voice-mapping CSVs are
/// distinguished from speech CSVs (not possible for S3 without a fetch).
pub fn scan_directory(path: &str) -> Result<ScanResult, ScanError> {
    let dir = Path::new(path);
    if !dir.exists() {
        return Err(ScanError::NotFound(path.to_string()));
    }
    if !dir.is_dir() {
        return Err(ScanError::NotADirectory(path.to_string()));
    }

    let (entries, csv_overrides) = collect_local_entries(dir)?;
    classify_entries_with_overrides(entries, &csv_overrides)
}

/// Classify a pre-enumerated list of file entries into avatar groups.
///
/// Each entry's `segments` field drives the grouping:
/// - `segments.len() == 1` → root-level file, goes into `unresolved`
/// - `segments.len() >= 2` → first segment is treated as either a clip folder
///   (if it parses as the clip naming convention and the file is a video) or
///   as an avatar slug (flat-folder layout).
///
/// CSV files cannot be sniffed here because we don't have a reader — all CSVs
/// default to [`FileCategory::SpeechCsv`]. Callers that can distinguish voice
/// vs speech (e.g. local filesystem scans) should use
/// [`classify_entries_with_overrides`] instead.
pub fn classify_entries(entries: Vec<ScannedEntry>) -> Result<ScanResult, ScanError> {
    classify_entries_with_overrides(entries, &std::collections::HashMap::new())
}

/// Like [`classify_entries`] but consults a per-path override map for CSV files.
///
/// The override map lets local scanners record the result of CSV header
/// sniffing (voice vs speech) without moving filesystem I/O into the
/// classifier.
pub fn classify_entries_with_overrides(
    entries: Vec<ScannedEntry>,
    csv_overrides: &std::collections::HashMap<String, FileCategory>,
) -> Result<ScanResult, ScanError> {
    let mut avatar_groups: Vec<AvatarScanGroup> = Vec::new();
    let mut unresolved: Vec<ScannedFile> = Vec::new();

    // Group entries by their first path segment so we can detect clip folders
    // (multiple files all claim the same top-level clip-named folder).
    let mut by_first_segment: std::collections::BTreeMap<String, Vec<ScannedEntry>> =
        std::collections::BTreeMap::new();
    let mut root_entries: Vec<ScannedEntry> = Vec::new();

    for entry in entries {
        match entry.segments.len() {
            0 | 1 => root_entries.push(entry),
            _ => {
                let first = entry.segments.first().cloned().unwrap_or_default();
                by_first_segment.entry(first).or_default().push(entry);
            }
        }
    }

    // Root-level files -> unresolved.
    for entry in root_entries {
        let csv_override = csv_overrides.get(&entry.path).cloned();
        unresolved.push(scanned_file_from_entry(&entry, csv_override));
    }

    for (first_segment, entries) in by_first_segment {
        // Try clip naming convention on the folder name first.
        if let Ok(parsed) = clip_filename_parser::parse_clip_path(&first_segment) {
            let mut clip_files: Vec<ScannedFile> = Vec::new();
            for entry in &entries {
                let ext = ext_from_filename(&entry.filename);
                if !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
                    continue; // non-video files in clip folders are ignored
                }
                let clip_index = clip_filename_parser::parse_clip_path(&entry.filename)
                    .ok()
                    .and_then(|p| p.clip_index)
                    .or(parsed.clip_index);

                clip_files.push(ScannedFile {
                    path: entry.path.clone(),
                    filename: entry.filename.clone(),
                    size_bytes: entry.size_bytes,
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
            if !clip_files.is_empty() {
                push_to_avatar_group(&mut avatar_groups, &parsed.avatar_slug, clip_files);
            }
            continue;
        }

        // Otherwise treat as an avatar folder.
        let avatar_slug = first_segment;
        let base_ctx = ResolvedContext {
            avatar_slug: Some(avatar_slug.clone()),
            ..Default::default()
        };
        let mut avatar_files: Vec<ScannedFile> = Vec::new();
        for entry in &entries {
            let csv_override = csv_overrides.get(&entry.path).cloned();
            avatar_files.push(classify_entry_by_extension(entry, &base_ctx, csv_override));
        }
        if !avatar_files.is_empty() {
            push_to_avatar_group(&mut avatar_groups, &avatar_slug, avatar_files);
        }
    }

    let summary = compute_summary(&avatar_groups, &unresolved);

    Ok(ScanResult {
        avatars: avatar_groups,
        unresolved,
        summary,
    })
}

/// Build a [`ScannedFile`] from a [`ScannedEntry`] by classifying its extension.
///
/// `base_ctx.avatar_slug` is inherited when the classifier doesn't set one.
/// `csv_override` lets local callers pass the result of header sniffing.
fn classify_entry_by_extension(
    entry: &ScannedEntry,
    base_ctx: &ResolvedContext,
    csv_override: Option<FileCategory>,
) -> ScannedFile {
    let ext = ext_from_filename(&entry.filename);
    let stem = stem_from_filename(&entry.filename).to_lowercase();

    let (mut category, mut ctx) = classify_by_extension_no_io(&ext, &stem, base_ctx);

    // Upgrade SpeechCsv → VoiceCsv when the local sniffer identified a voice CSV.
    if matches!(category, FileCategory::SpeechCsv) {
        if let Some(cat) = csv_override {
            category = cat;
        }
    }

    if ctx.avatar_slug.is_none() {
        ctx.avatar_slug.clone_from(&base_ctx.avatar_slug);
    }

    ScannedFile {
        path: entry.path.clone(),
        filename: entry.filename.clone(),
        size_bytes: entry.size_bytes,
        category,
        resolved: ctx,
    }
}

/// Build a minimal [`ScannedFile`] for entries without a folder context.
fn scanned_file_from_entry(
    entry: &ScannedEntry,
    csv_override: Option<FileCategory>,
) -> ScannedFile {
    let ext = ext_from_filename(&entry.filename);
    let stem = stem_from_filename(&entry.filename).to_lowercase();

    let (mut category, ctx) =
        classify_by_extension_no_io(&ext, &stem, &ResolvedContext::default());
    if matches!(category, FileCategory::SpeechCsv) {
        if let Some(cat) = csv_override {
            category = cat;
        }
    }

    ScannedFile {
        path: entry.path.clone(),
        filename: entry.filename.clone(),
        size_bytes: entry.size_bytes,
        category,
        resolved: ctx,
    }
}

/// Walk a local directory tree and build [`ScannedEntry`] records along with
/// a per-path CSV classification map (for voice-vs-speech sniffing).
///
/// Layout expectations:
/// - Files directly under `dir` are placed at `segments.len() == 1` (unresolved).
/// - Files under a single level of subfolder have `segments = [folder, filename]`.
/// - Deeper nesting is flattened to the top-level folder (current behaviour —
///   the legacy scanner did not recurse either).
fn collect_local_entries(
    dir: &Path,
) -> Result<(Vec<ScannedEntry>, std::collections::HashMap<String, FileCategory>), ScanError> {
    let mut out: Vec<ScannedEntry> = Vec::new();
    let mut csv_overrides: std::collections::HashMap<String, FileCategory> =
        std::collections::HashMap::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();

        if entry_path.is_file() {
            let meta = entry_path.metadata()?;
            let path_str = entry_path.to_string_lossy().to_string();
            if ext_from_filename(&entry_name) == "csv" {
                csv_overrides.insert(path_str.clone(), classify_csv(&entry_path));
            }
            out.push(ScannedEntry {
                path: path_str,
                filename: entry_name.clone(),
                size_bytes: meta.len(),
                segments: vec![entry_name],
            });
        } else if entry_path.is_dir() {
            for child in fs::read_dir(&entry_path)? {
                let child = child?;
                let child_path = child.path();
                if !child_path.is_file() {
                    continue;
                }
                let meta = match child_path.metadata() {
                    Ok(m) => m,
                    Err(_) => continue, // broken symlink etc.
                };
                let child_name = child.file_name().to_string_lossy().to_string();
                let path_str = child_path.to_string_lossy().to_string();
                if ext_from_filename(&child_name) == "csv" {
                    csv_overrides.insert(path_str.clone(), classify_csv(&child_path));
                }
                out.push(ScannedEntry {
                    path: path_str,
                    filename: child_name.clone(),
                    size_bytes: meta.len(),
                    segments: vec![entry_name.clone(), child_name],
                });
            }
        }
    }
    Ok((out, csv_overrides))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Classify a file by its extension and filename, without any filesystem I/O.
///
/// This is the shared core used by both local and pre-enumerated (S3) scans.
/// CSV files default to [`FileCategory::SpeechCsv`]; callers who can inspect
/// the file should upgrade the category via `csv_override` at the call site.
fn classify_by_extension_no_io(
    ext: &str,
    stem: &str,
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

    // CSV files — caller may override to VoiceCsv.
    if ext == "csv" {
        return (FileCategory::SpeechCsv, ctx);
    }

    (FileCategory::Unknown, ctx)
}

/// Extract the lowercase extension from a filename (without the leading dot).
fn ext_from_filename(filename: &str) -> String {
    Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Extract the file stem (filename without extension) from a filename.
fn stem_from_filename(filename: &str) -> String {
    Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
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
    fn classify_entries_handles_s3_style_paths() {
        // Simulate `s3://bucket/scans/alice/seed.png` and a clip folder.
        let entries = vec![
            ScannedEntry {
                path: "s3://bucket/scans/alice/seed.png".to_string(),
                filename: "seed.png".to_string(),
                size_bytes: 1024,
                segments: vec!["alice".to_string(), "seed.png".to_string()],
            },
            ScannedEntry {
                path: "s3://bucket/scans/alice/bio.json".to_string(),
                filename: "bio.json".to_string(),
                size_bytes: 42,
                segments: vec!["alice".to_string(), "bio.json".to_string()],
            },
            ScannedEntry {
                path: "s3://bucket/scans/sdg_allie-nicole_idle_topless_v1/clip0001.mp4"
                    .to_string(),
                filename: "clip0001.mp4".to_string(),
                size_bytes: 2048,
                segments: vec![
                    "sdg_allie-nicole_idle_topless_v1".to_string(),
                    "clip0001.mp4".to_string(),
                ],
            },
            ScannedEntry {
                path: "s3://bucket/scans/stray.png".to_string(),
                filename: "stray.png".to_string(),
                size_bytes: 99,
                segments: vec!["stray.png".to_string()],
            },
        ];

        let result = classify_entries(entries).unwrap();

        // Expect two avatar groups: "alice" and "allie-nicole".
        assert_eq!(result.avatars.len(), 2);

        let alice = result
            .avatars
            .iter()
            .find(|g| g.avatar_slug == "alice")
            .expect("alice group");
        assert_eq!(alice.files.len(), 2);
        assert!(alice
            .files
            .iter()
            .any(|f| f.category == FileCategory::Image && f.filename == "seed.png"));
        assert!(alice
            .files
            .iter()
            .any(|f| f.category == FileCategory::Metadata && f.filename == "bio.json"));

        let clips = result
            .avatars
            .iter()
            .find(|g| g.avatar_slug == "allie-nicole")
            .expect("clip-folder derived avatar");
        assert_eq!(clips.files.len(), 1);
        assert_eq!(clips.files[0].category, FileCategory::VideoClip);
        assert_eq!(clips.files[0].resolved.scene_type_slug.as_deref(), Some("idle"));
        assert_eq!(clips.files[0].resolved.track_slug.as_deref(), Some("topless"));
        assert_eq!(clips.files[0].resolved.version, Some(1));

        // Root-level file -> unresolved.
        assert_eq!(result.unresolved.len(), 1);
        assert_eq!(result.unresolved[0].filename, "stray.png");
        assert_eq!(result.unresolved[0].category, FileCategory::Image);
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
