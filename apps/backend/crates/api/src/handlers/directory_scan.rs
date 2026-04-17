//! Handlers for unified directory scanning and selective import.
//!
//! - `POST /api/v1/directory-scan`        — scan a directory, classify files, detect conflicts
//! - `POST /api/v1/directory-scan/import`  — import selected files with per-file actions

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use x121_core::directory_scanner::{
    self, ConflictStatus, FileCategory, ResolvedContext, ScanSummary, ScannedEntry,
};
use x121_core::hashing::sha256_hex;
use x121_core::images;
use x121_core::storage::{pipeline_scoped_key, StorageProvider};
use x121_core::types::DbId;
use x121_db::models::media::CreateMediaVariant;
use x121_db::models::status::MediaVariantStatus;
use x121_db::repositories::{AuditLogRepo, MediaVariantRepo, PipelineRepo, StorageBackendRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Storage key prefix for variant images.
pub(super) const VARIANT_KEY_PREFIX: &str = "variants";

/// Provenance tag for directory-scan imported images.
pub(super) const PROVENANCE_DIRECTORY_SCAN: &str = "directory_scan";

// ---------------------------------------------------------------------------
// Scan endpoint types
// ---------------------------------------------------------------------------

/// A summarised S3 scan source — just what the scan dialog's dropdown needs.
///
/// Exposes the bucket name and label of each configured S3 backend so any
/// authenticated user can pre-fill an `s3://bucket/` URI without needing
/// access to the admin-only storage credentials.
#[derive(Debug, Serialize)]
pub struct ScanSourceResponse {
    pub id: DbId,
    pub name: String,
    pub bucket: String,
}

/// GET /api/v1/directory-scan/sources
///
/// List the non-secret metadata of every active S3 storage backend so the
/// scan dialog can offer an "S3 source" dropdown without exposing the full
/// admin credentials (PRD-165).
pub async fn list_scan_sources(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<DataResponse<Vec<ScanSourceResponse>>>> {
    let backends = StorageBackendRepo::list(&state.pool).await?;
    let sources: Vec<ScanSourceResponse> = backends
        .into_iter()
        .filter(|b| b.backend_type_id == 2) // S3
        .filter_map(|b| {
            let bucket = b
                .config
                .get("bucket")
                .and_then(|v| v.as_str())
                .map(String::from)?;
            Some(ScanSourceResponse {
                id: b.id,
                name: b.name,
                bucket,
            })
        })
        .collect();
    Ok(Json(DataResponse { data: sources }))
}

/// Input for the scan endpoint.
#[derive(Debug, Deserialize)]
pub struct ScanInput {
    /// Absolute path to the directory to scan.
    pub path: String,
    /// Pipeline to scope avatar resolution to.
    pub pipeline_id: DbId,
    /// Optional project filter for avatar resolution.
    pub project_id: Option<DbId>,
}

/// Response for a single scanned file, enriched with conflict status.
#[derive(Debug, Serialize)]
pub struct ScannedFileResponse {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub category: FileCategory,
    pub resolved: ResolvedContext,
    pub conflict: ConflictStatus,
    /// Pre-computed SHA-256 (hex) for local image/video files. `None` for S3.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
}

/// An avatar group in the scan response, enriched with DB-resolved avatar info.
#[derive(Debug, Serialize)]
pub struct AvatarScanGroupResponse {
    pub avatar_slug: String,
    pub avatar_id: Option<DbId>,
    pub avatar_name: Option<String>,
    pub files: Vec<ScannedFileResponse>,
}

/// Full scan response.
#[derive(Debug, Serialize)]
pub struct ScanResponse {
    pub avatars: Vec<AvatarScanGroupResponse>,
    pub unresolved: Vec<ScannedFileResponse>,
    pub summary: ScanSummary,
}

// ---------------------------------------------------------------------------
// Import endpoint types
// ---------------------------------------------------------------------------

/// Input for the import endpoint.
#[derive(Debug, Deserialize)]
pub struct ImportInput {
    pub pipeline_id: DbId,
    pub selections: Vec<ImportSelection>,
}

/// Per-file import instruction.
#[derive(Debug, Deserialize)]
pub struct ImportSelection {
    pub file_path: String,
    pub category: FileCategory,
    /// "import", "skip", or "replace".
    pub action: String,
    pub avatar_id: Option<DbId>,
    pub resolved: ResolvedContext,
}

/// Result for a single file import.
#[derive(Debug, Serialize)]
pub struct ImportFileResult {
    pub path: String,
    /// "imported", "skipped", "replaced", or "failed".
    pub status: String,
    pub error: Option<String>,
}

/// Aggregate import result.
#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub replaced: usize,
    pub failed: usize,
    pub details: Vec<ImportFileResult>,
}

// ---------------------------------------------------------------------------
// Scan handler
// ---------------------------------------------------------------------------

/// POST /api/v1/directory-scan
///
/// Scan a directory (local filesystem or `s3://` prefix), classify files,
/// resolve avatars, and detect conflicts.
pub async fn scan(
    _auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<ScanInput>,
) -> AppResult<Json<DataResponse<ScanResponse>>> {
    // Dispatch local filesystem vs S3 source based on the path prefix.
    let is_s3 = input.path.starts_with("s3://");
    let scan_result = if is_s3 {
        s3_scan(&state, &input.path).await?
    } else {
        directory_scanner::scan_directory(&input.path).map_err(|e| match e {
            directory_scanner::ScanError::NotFound(p) => {
                AppError::BadRequest(format!("Directory not found: {p}"))
            }
            directory_scanner::ScanError::NotADirectory(p) => {
                AppError::BadRequest(format!("Path is not a directory: {p}"))
            }
            directory_scanner::ScanError::Io(e) => {
                AppError::InternalError(format!("I/O error scanning directory: {e}"))
            }
        })?
    };

    let mut avatar_groups = Vec::with_capacity(scan_result.avatars.len());

    for group in &scan_result.avatars {
        let (avatar_id, avatar_name) =
            resolve_avatar_slug(&state.pool, &group.avatar_slug, input.pipeline_id).await?;

        let mut files = Vec::with_capacity(group.files.len());
        for f in &group.files {
            let conflict = detect_conflict(&state.pool, f, avatar_id).await?;
            let content_hash = compute_scan_hash(f, is_s3).await;
            files.push(ScannedFileResponse {
                path: f.path.clone(),
                filename: f.filename.clone(),
                size_bytes: f.size_bytes,
                category: f.category.clone(),
                resolved: f.resolved.clone(),
                conflict,
                content_hash,
            });
        }

        avatar_groups.push(AvatarScanGroupResponse {
            avatar_slug: group.avatar_slug.clone(),
            avatar_id,
            avatar_name,
            files,
        });
    }

    let mut unresolved = Vec::with_capacity(scan_result.unresolved.len());
    for f in &scan_result.unresolved {
        let content_hash = compute_scan_hash(f, is_s3).await;
        unresolved.push(ScannedFileResponse {
            path: f.path.clone(),
            filename: f.filename.clone(),
            size_bytes: f.size_bytes,
            category: f.category.clone(),
            resolved: f.resolved.clone(),
            conflict: ConflictStatus::New,
            content_hash,
        });
    }

    Ok(Json(DataResponse {
        data: ScanResponse {
            avatars: avatar_groups,
            unresolved,
            summary: scan_result.summary,
        },
    }))
}

/// Compute SHA-256 for local image/video files so the frontend can dedup
/// without re-hashing in the browser. S3 hashes are deferred to import time.
async fn compute_scan_hash(
    file: &directory_scanner::ScannedFile,
    is_s3: bool,
) -> Option<String> {
    if is_s3 {
        return None;
    }
    match file.category {
        FileCategory::Image | FileCategory::VideoClip => {
            match tokio::fs::read(&file.path).await {
                Ok(data) => Some(sha256_hex(&data)),
                Err(_) => None,
            }
        }
        _ => None,
    }
}

/// Parse an `s3://bucket/prefix/...` URI into its bucket and prefix parts.
fn parse_s3_uri(uri: &str) -> Result<(String, String), AppError> {
    let without_scheme = uri
        .strip_prefix("s3://")
        .ok_or_else(|| AppError::BadRequest("S3 URI must start with s3://".to_string()))?;
    let mut parts = without_scheme.splitn(2, '/');
    let bucket = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("S3 URI missing bucket".to_string()))?
        .to_string();
    let prefix = parts.next().unwrap_or("").trim_matches('/').to_string();
    Ok((bucket, prefix))
}

/// Build an `S3StorageProvider` from the first active S3 backend whose
/// `config.bucket` matches `bucket`, or from the platform default backend
/// if no bucket-specific match is found.
async fn build_s3_provider_for_bucket(
    state: &AppState,
    bucket: &str,
) -> Result<x121_cloud::storage_provider::S3StorageProvider, AppError> {
    let backends = StorageBackendRepo::list(&state.pool).await?;
    // Prefer an active S3 backend whose config.bucket matches the URI's bucket.
    let candidate = backends
        .iter()
        .filter(|b| b.backend_type_id == 2) // s3
        .find(|b| {
            b.config
                .get("bucket")
                .and_then(|v| v.as_str())
                .map(|v| v.eq_ignore_ascii_case(bucket))
                .unwrap_or(false)
        })
        .cloned()
        .or_else(|| {
            // Fall back to the default S3 backend so admins can scan any
            // bucket the default credentials can access.
            backends
                .into_iter()
                .find(|b| b.backend_type_id == 2 && b.is_default)
        });

    let backend = candidate.ok_or_else(|| {
        AppError::BadRequest(format!(
            "No S3 storage backend configured for bucket '{bucket}'. \
             Add an S3 backend via admin settings first."
        ))
    })?;

    let mut config: x121_cloud::storage_provider::S3Config =
        serde_json::from_value(backend.config.clone()).map_err(|e| {
            AppError::InternalError(format!(
                "Stored S3 backend '{}' has invalid config: {e}",
                backend.name
            ))
        })?;
    // Always target the bucket named in the URI, in case the stored backend
    // lives at the account level with a different default bucket.
    config.bucket = bucket.to_string();
    // Scanning does not use the backend's path_prefix — the user already
    // typed the desired prefix in the URI.
    config.path_prefix = None;

    x121_cloud::storage_provider::S3StorageProvider::new(config)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to init S3 provider: {e}")))
}

/// Enumerate objects under an `s3://bucket/prefix/` URI and classify them
/// using the shared [`directory_scanner::classify_entries`] logic.
async fn s3_scan(
    state: &AppState,
    uri: &str,
) -> AppResult<directory_scanner::ScanResult> {
    let (bucket, prefix) = parse_s3_uri(uri)?;
    let provider = build_s3_provider_for_bucket(state, &bucket).await?;

    let objects = provider
        .list(&prefix)
        .await
        .map_err(|e| AppError::InternalError(format!("S3 list failed: {e}")))?;

    if objects.is_empty() {
        return Err(AppError::BadRequest(format!(
            "No objects found under s3://{bucket}/{prefix}"
        )));
    }

    let entries: Vec<ScannedEntry> = objects
        .into_iter()
        .filter(|obj| !obj.key.ends_with('/')) // skip folder markers
        .map(|obj| {
            // Filename: last path segment of the key.
            let filename = obj
                .key
                .rsplit('/')
                .next()
                .unwrap_or(&obj.key)
                .to_string();
            // Path segments: the key with the requested prefix stripped, split on '/'.
            let rel_key = obj
                .key
                .strip_prefix(&format!("{}/", prefix.trim_end_matches('/')))
                .or_else(|| obj.key.strip_prefix(&prefix))
                .unwrap_or(&obj.key)
                .trim_start_matches('/');
            let segments: Vec<String> = rel_key
                .split('/')
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect();
            ScannedEntry {
                path: format!("s3://{bucket}/{}", obj.key),
                filename,
                size_bytes: obj.size_bytes.max(0) as u64,
                segments,
            }
        })
        .collect();

    directory_scanner::classify_entries(entries).map_err(|e| match e {
        directory_scanner::ScanError::NotFound(p) => AppError::BadRequest(format!("Not found: {p}")),
        directory_scanner::ScanError::NotADirectory(p) => {
            AppError::BadRequest(format!("Not a directory: {p}"))
        }
        directory_scanner::ScanError::Io(e) => {
            AppError::InternalError(format!("I/O error: {e}"))
        }
    })
}

// ---------------------------------------------------------------------------
// Import handler
// ---------------------------------------------------------------------------

/// POST /api/v1/directory-scan/import
///
/// Import selected files based on per-file action instructions.
pub async fn import(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<ImportInput>,
) -> AppResult<(StatusCode, Json<DataResponse<ImportResult>>)> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut replaced = 0usize;
    let mut failed = 0usize;
    let mut details = Vec::with_capacity(input.selections.len());

    for sel in &input.selections {
        if sel.action == "skip" {
            skipped += 1;
            details.push(ImportFileResult {
                path: sel.file_path.clone(),
                status: "skipped".to_string(),
                error: None,
            });
            continue;
        }

        let result = match sel.category {
            FileCategory::Image => {
                import_image(&state, sel, input.pipeline_id).await
            }
            FileCategory::Metadata => {
                Ok(ImportOutcome::NotSupported(
                    "Metadata import via directory scan is not yet supported".to_string(),
                ))
            }
            FileCategory::SpeechJson | FileCategory::SpeechCsv => {
                Ok(ImportOutcome::NotSupported(
                    "Speech import via directory scan is not yet supported".to_string(),
                ))
            }
            FileCategory::VoiceCsv => {
                Ok(ImportOutcome::NotSupported(
                    "Voice CSV import via directory scan is not yet supported".to_string(),
                ))
            }
            FileCategory::VideoClip => {
                Ok(ImportOutcome::NotSupported(
                    "Video clip import via directory scan is not yet supported; use the clip import endpoint".to_string(),
                ))
            }
            FileCategory::Unknown => {
                Ok(ImportOutcome::NotSupported(
                    "Cannot import unknown file type".to_string(),
                ))
            }
        };

        match result {
            Ok(ImportOutcome::Imported) => {
                imported += 1;
                details.push(ImportFileResult {
                    path: sel.file_path.clone(),
                    status: "imported".to_string(),
                    error: None,
                });
            }
            Ok(ImportOutcome::Replaced) => {
                replaced += 1;
                details.push(ImportFileResult {
                    path: sel.file_path.clone(),
                    status: "replaced".to_string(),
                    error: None,
                });
            }
            Ok(ImportOutcome::NotSupported(msg)) => {
                failed += 1;
                details.push(ImportFileResult {
                    path: sel.file_path.clone(),
                    status: "failed".to_string(),
                    error: Some(msg),
                });
            }
            Err(e) => {
                failed += 1;
                details.push(ImportFileResult {
                    path: sel.file_path.clone(),
                    status: "failed".to_string(),
                    error: Some(e.to_string()),
                });
            }
        }
    }

    // Audit log for the import operation.
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[x121_db::models::audit::CreateAuditLog {
            user_id: Some(auth.user_id),
            session_id: None,
            action_type: "directory_scan.import".to_string(),
            entity_type: Some("directory_scan".to_string()),
            entity_id: None,
            details_json: Some(serde_json::json!({
                "pipeline_id": input.pipeline_id,
                "imported": imported,
                "skipped": skipped,
                "replaced": replaced,
                "failed": failed,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    Ok((
        StatusCode::OK,
        Json(DataResponse {
            data: ImportResult {
                imported,
                skipped,
                replaced,
                failed,
                details,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Outcome of importing a single file.
enum ImportOutcome {
    Imported,
    Replaced,
    NotSupported(String),
}

/// Resolve an avatar slug to a DB avatar id using fuzzy matching.
///
/// Converts hyphens to spaces and does case-insensitive lookup scoped to
/// avatars belonging to the given pipeline (via their project).
async fn resolve_avatar_slug(
    pool: &sqlx::PgPool,
    slug: &str,
    pipeline_id: DbId,
) -> AppResult<(Option<DbId>, Option<String>)> {
    let name_pattern = slug.replace('-', " ");

    let row = sqlx::query_as::<_, (DbId, String)>(
        "SELECT a.id, a.name FROM avatars a
         JOIN projects p ON a.project_id = p.id
         WHERE LOWER(a.name) = LOWER($1)
           AND p.pipeline_id = $2
           AND a.deleted_at IS NULL
         LIMIT 1",
    )
    .bind(&name_pattern)
    .bind(pipeline_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::InternalError(format!("Avatar lookup failed: {e}")))?;

    match row {
        Some((id, name)) => Ok((Some(id), Some(name))),
        None => Ok((None, None)),
    }
}

/// Detect conflict status for a scanned file against existing DB records.
async fn detect_conflict(
    pool: &sqlx::PgPool,
    file: &directory_scanner::ScannedFile,
    avatar_id: Option<DbId>,
) -> AppResult<ConflictStatus> {
    let Some(aid) = avatar_id else {
        return Ok(ConflictStatus::New);
    };

    match file.category {
        FileCategory::Image => {
            if let Some(vt) = &file.resolved.variant_type {
                let existing = MediaVariantRepo::list_by_avatar_and_type(pool, aid, vt).await?;
                if existing.is_empty() {
                    Ok(ConflictStatus::New)
                } else {
                    Ok(ConflictStatus::Exists)
                }
            } else {
                Ok(ConflictStatus::New)
            }
        }
        FileCategory::Metadata => {
            if let Some(key) = &file.resolved.metadata_key {
                let exists = sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS(
                        SELECT 1 FROM avatar_metadata
                        WHERE avatar_id = $1 AND key = $2
                    )",
                )
                .bind(aid)
                .bind(key)
                .fetch_one(pool)
                .await
                .unwrap_or(false);

                if exists {
                    Ok(ConflictStatus::Exists)
                } else {
                    Ok(ConflictStatus::New)
                }
            } else {
                Ok(ConflictStatus::New)
            }
        }
        _ => Ok(ConflictStatus::New),
    }
}

/// Import a single image file into managed storage and create a media_variant record.
async fn import_image(
    state: &AppState,
    sel: &ImportSelection,
    pipeline_id: DbId,
) -> Result<ImportOutcome, AppError> {
    let avatar_id = sel.avatar_id.ok_or_else(|| {
        AppError::BadRequest("avatar_id is required for image import".to_string())
    })?;

    let src_path = std::path::Path::new(&sel.file_path);
    if !src_path.is_file() {
        return Err(AppError::BadRequest(format!(
            "File not found: {}",
            sel.file_path
        )));
    }

    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !images::is_valid_image_format(&ext) {
        return Err(AppError::BadRequest(format!(
            "Unsupported image format '.{ext}'"
        )));
    }

    let variant_type = sel
        .resolved
        .variant_type
        .as_deref()
        .unwrap_or("unknown")
        .to_string();

    // If replacing, soft-delete existing variants of this type.
    let is_replace = sel.action == "replace";
    if is_replace {
        let existing =
            MediaVariantRepo::list_by_avatar_and_type(&state.pool, avatar_id, &variant_type)
                .await?;
        for v in &existing {
            let _ = MediaVariantRepo::soft_delete(&state.pool, v.id).await;
        }
    }

    // Read file data.
    let data = tokio::fs::read(src_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read image file: {e}")))?;

    if data.is_empty() {
        return Err(AppError::BadRequest("Image file is empty".to_string()));
    }

    // Compute content hash for dedup.
    let content_hash = sha256_hex(&data);

    // Determine pipeline code for storage scoping.
    let pipeline_code = PipelineRepo::find_by_id(&state.pool, pipeline_id)
        .await?
        .map(|p| p.code);

    // Build storage path.
    let prefix = match pipeline_code.as_deref() {
        Some(code) => pipeline_scoped_key(code, VARIANT_KEY_PREFIX),
        None => VARIANT_KEY_PREFIX.to_string(),
    };

    let stored_filename = format!(
        "variant_{avatar_id}_{variant_type}_{}.{ext}",
        chrono::Utc::now().timestamp_millis()
    );
    let storage_key = format!("{prefix}/{stored_filename}");

    // Upload through the active storage provider so the import works with
    // local, S3, or any future backend (PRD-122/PRD-165).
    let provider = state.storage_provider().await;
    provider
        .upload(&storage_key, &data)
        .await
        .map_err(|e| AppError::InternalError(format!("Storage upload failed: {e}")))?;

    // Image dimensions.
    let (width, height) = images::image_dimensions(&data)
        .map(|(w, h)| (Some(w as i32), Some(h as i32)))
        .unwrap_or((None, None));

    // Auto-hero if no hero exists.
    let existing_hero = MediaVariantRepo::find_hero(&state.pool, avatar_id, &variant_type).await?;
    let should_be_hero = existing_hero.is_none();

    let create_input = CreateMediaVariant {
        avatar_id,
        source_media_id: None,
        derived_media_id: None,
        variant_label: format!("Scan import ({variant_type})"),
        status_id: Some(MediaVariantStatus::Pending.id()),
        file_path: storage_key,
        variant_type: Some(variant_type),
        provenance: Some(PROVENANCE_DIRECTORY_SCAN.to_string()),
        is_hero: Some(should_be_hero),
        file_size_bytes: Some(data.len() as i64),
        width,
        height,
        format: Some(ext),
        version: Some(1),
        parent_variant_id: None,
        generation_params: None,
        content_hash: Some(content_hash),
    };

    MediaVariantRepo::create(&state.pool, &create_input).await?;

    if is_replace {
        Ok(ImportOutcome::Replaced)
    } else {
        Ok(ImportOutcome::Imported)
    }
}
