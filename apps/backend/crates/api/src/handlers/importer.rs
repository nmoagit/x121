//! Handlers for the folder-to-entity bulk importer (PRD-016).
//!
//! Provides endpoints for folder upload (multipart), import preview,
//! import commit, import cancellation, and session retrieval.

use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use trulience_core::error::CoreError;
use trulience_core::importer::{
    detect_uniqueness_conflicts, default_mapping_rules, map_files_to_entities,
    is_hidden_or_system, ParsedFile,
    SESSION_STATUS_CANCELLED, SESSION_STATUS_COMMITTED, SESSION_STATUS_PARSING,
    SESSION_STATUS_PREVIEW, STAGING_DIR_PREFIX, MAX_FOLDER_DEPTH,
};
use trulience_core::types::DbId;
use trulience_db::models::importer::{
    CreateImportMappingEntry, CreateImportSession, FolderImportPreview, ImportCommitResult,
};
use trulience_db::repositories::{ImportMappingEntryRepo, ImportSessionRepo};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Typed response for the folder upload endpoint (DRY-176).
#[derive(Debug, Serialize)]
pub struct UploadResult {
    session_id: DbId,
    staging_path: String,
    files_received: u32,
}

// ── Upload Folder ────────────────────────────────────────────────────

/// Query parameters for the folder upload endpoint.
#[derive(Debug, Deserialize)]
pub struct UploadParams {
    pub project_id: DbId,
    pub source_name: Option<String>,
}

/// POST /api/v1/import/folder
///
/// Accept a multipart upload of files, preserve their relative paths in a
/// staging directory, and create an import session.
pub async fn upload_folder(
    State(state): State<AppState>,
    Query(params): Query<UploadParams>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<DataResponse<UploadResult>>)> {
    // Create a unique staging directory.
    let session_stamp = chrono::Utc::now().timestamp_millis();
    let staging_dir = std::path::PathBuf::from(format!(
        "{STAGING_DIR_PREFIX}/{session_stamp}"
    ));
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to create staging dir: {e}")))?;

    let mut file_count: u32 = 0;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let filename = field
            .file_name()
            .unwrap_or("unknown")
            .to_string();

        // Skip hidden/system files.
        let basename = filename.rsplit('/').next().unwrap_or(&filename);
        if is_hidden_or_system(basename) {
            continue;
        }

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        // Preserve relative path structure in staging.
        let dest = staging_dir.join(&filename);
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::InternalError(e.to_string()))?;
        }
        tokio::fs::write(&dest, &data)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

        file_count += 1;
    }

    if file_count == 0 {
        return Err(AppError::BadRequest(
            "No files received in multipart upload".to_string(),
        ));
    }

    let source_name = params
        .source_name
        .unwrap_or_else(|| "folder-upload".to_string());

    let session = ImportSessionRepo::create(
        &state.pool,
        &CreateImportSession {
            project_id: params.project_id,
            staging_path: staging_dir.to_string_lossy().to_string(),
            source_name,
            created_by: None,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: UploadResult {
                session_id: session.id,
                staging_path: session.staging_path,
                files_received: file_count,
            },
        }),
    ))
}

// ── Preview ──────────────────────────────────────────────────────────

/// GET /api/v1/import/{id}/preview
///
/// Parse the staged folder, map files to entities, detect conflicts,
/// store mapping entries, and return a preview for the user.
pub async fn get_preview(
    State(state): State<AppState>,
    Path(session_id): Path<DbId>,
) -> AppResult<Json<DataResponse<FolderImportPreview>>> {
    let session = ImportSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportSession",
            id: session_id,
        }))?;

    // Transition to parsing.
    ImportSessionRepo::update_status(&state.pool, session_id, SESSION_STATUS_PARSING).await?;

    // Parse folder tree.
    let staging_path = std::path::Path::new(&session.staging_path);
    let files = parse_folder_tree(staging_path, MAX_FOLDER_DEPTH).await?;

    // Map to entities.
    let rules = default_mapping_rules();
    let mapped = map_files_to_entities(&files, &rules);

    // Detect uniqueness conflicts.
    let conflicts = detect_uniqueness_conflicts(&mapped);

    // Build mapping entries for DB.
    let create_entries: Vec<CreateImportMappingEntry> = mapped
        .iter()
        .map(|m| {
            let has_conflict = conflicts.iter().any(|c| c.entity_name == m.entity_name);
            CreateImportMappingEntry {
                session_id,
                source_path: m.source_path.clone(),
                file_name: m.file_name.clone(),
                file_size_bytes: m.file_size_bytes as i64,
                file_extension: m.file_extension.clone(),
                derived_entity_type: m.entity_type.clone(),
                derived_entity_name: m.entity_name.clone(),
                derived_category: m.category.clone(),
                target_entity_id: None,
                action: if has_conflict {
                    "conflict".to_string()
                } else {
                    "create".to_string()
                },
                conflict_details: if has_conflict {
                    Some(serde_json::json!({ "reason": "duplicate_entity_name" }))
                } else {
                    None
                },
                validation_errors: serde_json::json!([]),
                validation_warnings: serde_json::json!([]),
            }
        })
        .collect();

    let entries = ImportMappingEntryRepo::batch_insert(&state.pool, &create_entries).await?;

    // Update session counts.
    let total_size: u64 = files.iter().map(|f| f.file_size_bytes).sum();
    ImportSessionRepo::update_counts(
        &state.pool,
        session_id,
        files.len() as i32,
        total_size as i64,
        mapped.len() as i32,
    )
    .await?;

    // Transition to preview.
    ImportSessionRepo::update_status(&state.pool, session_id, SESSION_STATUS_PREVIEW).await?;

    let entities_to_create = entries.iter().filter(|e| e.action == "create").count();
    let entities_to_update = entries.iter().filter(|e| e.action == "update").count();

    Ok(Json(DataResponse {
        data: FolderImportPreview {
            session_id,
            total_files: files.len(),
            total_size_bytes: total_size,
            entities_to_create,
            entities_to_update,
            uniqueness_conflicts: conflicts,
            entries,
        },
    }))
}

// ── Commit ───────────────────────────────────────────────────────────

/// Request body for import commit.
#[derive(Debug, Deserialize)]
pub struct CommitRequest {
    /// Optional entry IDs to deselect before committing.
    #[serde(default)]
    pub deselected_entry_ids: Vec<DbId>,
}

/// POST /api/v1/import/{id}/commit
///
/// Commit the import: process selected entries.
pub async fn commit_import(
    State(state): State<AppState>,
    Path(session_id): Path<DbId>,
    Json(body): Json<CommitRequest>,
) -> AppResult<Json<DataResponse<ImportCommitResult>>> {
    let session = ImportSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportSession",
            id: session_id,
        }))?;

    // Verify session is in preview status.
    let statuses = ImportSessionRepo::list_statuses(&state.pool).await?;
    let preview_status = statuses.iter().find(|s| s.name == SESSION_STATUS_PREVIEW);
    if let Some(ps) = preview_status {
        if session.status_id != ps.id {
            return Err(AppError::Core(CoreError::Conflict(
                "Import session must be in 'preview' status to commit".to_string(),
            )));
        }
    }

    // Deselect entries if requested.
    if !body.deselected_entry_ids.is_empty() {
        ImportMappingEntryRepo::update_selection(
            &state.pool,
            &body.deselected_entry_ids,
            false,
        )
        .await?;
    }

    // Load selected entries.
    let entries = ImportMappingEntryRepo::list_selected(&state.pool, session_id).await?;

    let mut result = ImportCommitResult::default();

    for entry in &entries {
        match entry.action.as_str() {
            "create" => result.created += 1,
            "update" => result.updated += 1,
            "skip" | "conflict" => result.skipped += 1,
            _ => result.skipped += 1,
        }
    }

    // NOTE: Actual entity creation and file ingestion would happen here
    // in a production implementation. For MVP, we count the entries and
    // transition the session status.

    ImportSessionRepo::update_status(&state.pool, session_id, SESSION_STATUS_COMMITTED).await?;

    Ok(Json(DataResponse { data: result }))
}

// ── Cancel ───────────────────────────────────────────────────────────

/// POST /api/v1/import/{id}/cancel
///
/// Cancel an import session and clean up its staging directory.
pub async fn cancel_import(
    State(state): State<AppState>,
    Path(session_id): Path<DbId>,
) -> AppResult<StatusCode> {
    let session = ImportSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportSession",
            id: session_id,
        }))?;

    ImportSessionRepo::update_status(&state.pool, session_id, SESSION_STATUS_CANCELLED).await?;

    // Best-effort staging cleanup.
    let staging = std::path::Path::new(&session.staging_path);
    if staging.exists() {
        let _ = tokio::fs::remove_dir_all(staging).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Get Session ──────────────────────────────────────────────────────

/// GET /api/v1/import/{id}
///
/// Retrieve an import session by ID.
pub async fn get_import_session(
    State(state): State<AppState>,
    Path(session_id): Path<DbId>,
) -> AppResult<Json<DataResponse<trulience_db::models::importer::ImportSession>>> {
    let session = ImportSessionRepo::find_by_id(&state.pool, session_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImportSession",
            id: session_id,
        }))?;

    Ok(Json(DataResponse { data: session }))
}

// ── Private helpers ──────────────────────────────────────────────────

/// Recursively parse a folder tree into a flat list of [`ParsedFile`] entries.
///
/// Skips hidden files, system files, and files beyond `max_depth`.
async fn parse_folder_tree(
    root: &std::path::Path,
    max_depth: usize,
) -> Result<Vec<ParsedFile>, AppError> {
    let mut files = Vec::new();
    parse_recursive(root, root, &mut files, 0, max_depth).await?;
    Ok(files)
}

async fn parse_recursive(
    root: &std::path::Path,
    current: &std::path::Path,
    files: &mut Vec<ParsedFile>,
    depth: usize,
    max_depth: usize,
) -> Result<(), AppError> {
    if depth > max_depth {
        return Ok(());
    }

    let mut entries = tokio::fs::read_dir(current)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read directory: {e}")))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read entry: {e}")))?
    {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden and system files.
        if is_hidden_or_system(&name) {
            continue;
        }

        if path.is_dir() {
            Box::pin(parse_recursive(root, &path, files, depth + 1, max_depth)).await?;
        } else {
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path);
            let parent_folders: Vec<String> = relative
                .parent()
                .map(|p| {
                    p.components()
                        .map(|c| c.as_os_str().to_string_lossy().to_string())
                        .collect()
                })
                .unwrap_or_default();

            let ext = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();

            let metadata = entry
                .metadata()
                .await
                .map_err(|e| AppError::InternalError(format!("Failed to read metadata: {e}")))?;

            files.push(ParsedFile {
                relative_path: relative.to_string_lossy().to_string(),
                file_name: name,
                file_extension: ext,
                file_size_bytes: metadata.len(),
                depth,
                parent_folders,
            });
        }
    }

    Ok(())
}
