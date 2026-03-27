//! Export archive generation background task (PRD-151).
//!
//! Builds ZIP archives from selected scene video versions or media variants,
//! splitting into multiple parts when the accumulated size exceeds the
//! configured threshold. Includes a CSV manifest in the first part.
//!
//! Files inside the ZIP are named to match the delivery convention:
//! `{project}_{avatar}_{scene_type}_{track}_{version}[_{labels}].ext`

use std::io::Write;
use std::path::PathBuf;

use x121_core::naming_engine::slugify;
use x121_core::types::DbId;
use x121_db::repositories::ExportJobRepo;

use crate::state::AppState;

/// File entry resolved for inclusion in the export archive.
struct ExportFileEntry {
    /// Absolute path to the source file on disk.
    abs_path: PathBuf,
    /// Relative path inside the ZIP archive (e.g. "avatar_name/scene_type/file.mp4").
    archive_path: String,
    /// File size in bytes (for split planning).
    size_bytes: u64,
    /// CSV row fields for the manifest.
    manifest_row: Vec<String>,
}

/// Run the export job: resolve files, plan splits, build ZIPs, update DB.
///
/// All errors are caught and stored as `status = 'failed'` on the job row.
pub async fn run_export_job(state: AppState, job_id: DbId) {
    if let Err(e) = run_export_job_inner(&state, job_id).await {
        tracing::error!(job_id, error = %e, "Export job failed");
        let _ =
            ExportJobRepo::update_status(&state.pool, job_id, "failed", None, Some(&e.to_string()))
                .await;
    }
}

/// Inner implementation that returns errors for the outer wrapper to handle.
async fn run_export_job_inner(
    state: &AppState,
    job_id: DbId,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. Set status to processing.
    ExportJobRepo::update_status(&state.pool, job_id, "processing", None, None).await?;

    // 2. Load the job to get filter_snapshot.
    let job = ExportJobRepo::find_by_id(&state.pool, job_id)
        .await?
        .ok_or("Export job not found")?;

    let filter = job.filter_snapshot.unwrap_or_default();
    let ids: Vec<DbId> = filter
        .get("ids")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // 3. Resolve file entries based on entity type.
    let entries = match job.entity_type.as_str() {
        "scene_video_version" => resolve_scene_video_versions(state, &ids).await?,
        "media_variant" => resolve_media_variants(state, &ids).await?,
        other => return Err(format!("Unsupported entity_type: {other}").into()),
    };

    if entries.is_empty() {
        return Err("No files found for export".into());
    }

    // 4. Plan splits by accumulated size.
    let split_bytes = (job.split_size_mb as u64) * 1024 * 1024;
    let parts = plan_splits(&entries, split_bytes);

    // 5. Build manifest CSV.
    let manifest_csv = build_manifest_csv(&job.entity_type, &entries);

    // 6. Create export directory.
    let export_dir = state.resolve_to_path(&format!("exports/{job_id}")).await?;
    tokio::fs::create_dir_all(&export_dir).await?;

    // 7. Write ZIP archives one part at a time, updating DB after each part
    //    so the frontend can start downloading immediately.
    let mut part_infos = Vec::new();
    let total_parts = parts.len();
    for (part_idx, file_indices) in parts.iter().enumerate() {
        let part_num = part_idx + 1;
        let zip_path = export_dir.join(format!("part{part_num}.zip"));

        let entries_ref: Vec<&ExportFileEntry> =
            file_indices.iter().map(|&i| &entries[i]).collect();
        let include_manifest = part_idx == 0;
        let manifest_ref = if include_manifest {
            Some(manifest_csv.as_str())
        } else {
            None
        };

        tracing::info!(
            job_id,
            part = part_num,
            total_parts,
            file_count = file_indices.len(),
            "Building export ZIP part"
        );

        let zip_size = write_zip_archive(&zip_path, &entries_ref, manifest_ref).await?;

        part_infos.push(serde_json::json!({
            "part": part_num,
            "file": format!("part{part_num}.zip"),
            "size_bytes": zip_size,
            "file_count": file_indices.len(),
        }));

        // Update DB after each part so frontend can start downloading immediately.
        // Status stays "processing" until the final part.
        let parts_json = serde_json::Value::Array(part_infos.clone());
        if part_num < total_parts {
            ExportJobRepo::update_status(
                &state.pool,
                job_id,
                "processing",
                Some(&parts_json),
                None,
            )
            .await?;
        } else {
            ExportJobRepo::update_status(&state.pool, job_id, "completed", Some(&parts_json), None)
                .await?;
        }
    }

    tracing::info!(
        job_id,
        part_count = total_parts,
        "Export job completed successfully"
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Label lookup
// ---------------------------------------------------------------------------

/// Fetch tag names for a list of entity IDs, returned as a map of id -> comma-joined labels.
async fn fetch_labels_for_entities(
    pool: &sqlx::PgPool,
    entity_type: &str,
    ids: &[DbId],
) -> Result<std::collections::HashMap<DbId, String>, Box<dyn std::error::Error + Send + Sync>> {
    if ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    #[derive(sqlx::FromRow)]
    struct TagRow {
        entity_id: DbId,
        name: String,
    }

    let rows = sqlx::query_as::<_, TagRow>(
        "SELECT et.entity_id, t.name \
         FROM entity_tags et \
         JOIN tags t ON t.id = et.tag_id \
         WHERE et.entity_type = $1 AND et.entity_id = ANY($2) \
         ORDER BY et.entity_id, t.name COLLATE \"C\"",
    )
    .bind(entity_type)
    .bind(ids)
    .fetch_all(pool)
    .await?;

    let mut map: std::collections::HashMap<DbId, Vec<String>> = std::collections::HashMap::new();
    for row in rows {
        map.entry(row.entity_id).or_default().push(row.name);
    }

    Ok(map
        .into_iter()
        .map(|(id, names)| (id, names.join(",")))
        .collect())
}

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

/// Row returned from the scene_video_version query for export.
#[derive(sqlx::FromRow)]
struct SvvExportRow {
    id: DbId,
    file_path: String,
    file_size_bytes: Option<i64>,
    avatar_name: Option<String>,
    scene_type_name: Option<String>,
    track_name: Option<String>,
    project_name: Option<String>,
    version_number: i32,
    qa_status: Option<String>,
}

async fn resolve_scene_video_versions(
    state: &AppState,
    ids: &[DbId],
) -> Result<Vec<ExportFileEntry>, Box<dyn std::error::Error + Send + Sync>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as::<_, SvvExportRow>(
        "SELECT svv.id, svv.file_path, svv.file_size_bytes, \
                a.name AS avatar_name, st.name AS scene_type_name, \
                tr.name AS track_name, p.name AS project_name, \
                svv.version_number, svv.qa_status \
         FROM scene_video_versions svv \
         JOIN scenes s ON s.id = svv.scene_id \
         JOIN avatars a ON a.id = s.avatar_id \
         JOIN scene_types st ON st.id = s.scene_type_id \
         LEFT JOIN tracks tr ON tr.id = s.track_id \
         LEFT JOIN projects p ON p.id = a.project_id \
         WHERE svv.id = ANY($1)",
    )
    .bind(ids)
    .fetch_all(&state.pool)
    .await?;

    // Fetch labels for all IDs.
    let labels = fetch_labels_for_entities(&state.pool, "scene_video_version", ids).await?;

    let mut entries = Vec::with_capacity(rows.len());
    for row in &rows {
        let abs_path = state.resolve_to_path_with_fallback(&row.file_path).await?;
        if !abs_path.exists() {
            tracing::warn!(
                svv_id = row.id,
                path = %abs_path.display(),
                "Skipping missing file in export"
            );
            continue;
        }

        let avatar = row.avatar_name.as_deref().unwrap_or("unknown");
        let scene_type = row.scene_type_name.as_deref().unwrap_or("unknown");
        let track = row.track_name.as_deref().unwrap_or("default");
        let project = row.project_name.as_deref().unwrap_or("project");
        let ext = abs_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");

        // Build filename: {project}_{avatar}_{scene_type}_{track}_v{version}[_{labels}].ext
        let label_suffix = labels
            .get(&row.id)
            .map(|l| format!("_[{}]", l))
            .unwrap_or_default();
        let filename = format!(
            "{}_{}_{}_{}_v{}{}.{ext}",
            slugify(project),
            slugify(avatar),
            slugify(scene_type),
            slugify(track),
            row.version_number,
            label_suffix,
        );
        let qa = row.qa_status.as_deref().unwrap_or("pending");
        let label_display = labels.get(&row.id).cloned().unwrap_or_default();

        let archive_path = filename.clone();
        let size_bytes = row.file_size_bytes.unwrap_or(0) as u64;

        entries.push(ExportFileEntry {
            abs_path,
            archive_path,
            size_bytes,
            manifest_row: vec![
                row.id.to_string(),
                project.to_string(),
                avatar.to_string(),
                scene_type.to_string(),
                track.to_string(),
                format!("v{}", row.version_number),
                qa.to_string(),
                label_display,
                filename.clone(),
                row.file_path.clone(),
            ],
        });
    }

    Ok(entries)
}

/// Row returned from the media_variant query for export.
#[derive(sqlx::FromRow)]
struct MvExportRow {
    id: DbId,
    file_path: String,
    file_size_bytes: Option<i64>,
    avatar_name: Option<String>,
    variant_type: Option<String>,
    variant_label: String,
    project_name: Option<String>,
    status_id: i32,
}

async fn resolve_media_variants(
    state: &AppState,
    ids: &[DbId],
) -> Result<Vec<ExportFileEntry>, Box<dyn std::error::Error + Send + Sync>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as::<_, MvExportRow>(
        "SELECT mv.id, mv.file_path, mv.file_size_bytes, \
                a.name AS avatar_name, mv.variant_type, mv.variant_label, \
                p.name AS project_name, mv.status_id \
         FROM media_variants mv \
         JOIN avatars a ON a.id = mv.avatar_id \
         LEFT JOIN projects p ON p.id = a.project_id \
         WHERE mv.id = ANY($1) AND mv.deleted_at IS NULL",
    )
    .bind(ids)
    .fetch_all(&state.pool)
    .await?;

    // Fetch labels for all IDs.
    let labels = fetch_labels_for_entities(&state.pool, "media_variant", ids).await?;

    let mut entries = Vec::with_capacity(rows.len());
    for row in &rows {
        let abs_path = state.resolve_to_path_with_fallback(&row.file_path).await?;
        if !abs_path.exists() {
            tracing::warn!(
                mv_id = row.id,
                path = %abs_path.display(),
                "Skipping missing file in export"
            );
            continue;
        }

        let avatar = row.avatar_name.as_deref().unwrap_or("unknown");
        let vtype = row.variant_type.as_deref().unwrap_or("other");
        let project = row.project_name.as_deref().unwrap_or("project");
        let ext = abs_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");

        // Build filename: {project}_{avatar}_{variant_type}_{variant_label}[_{labels}].ext
        let label_suffix = labels
            .get(&row.id)
            .map(|l| format!("_[{}]", l))
            .unwrap_or_default();
        let filename = format!(
            "{}_{}_{}_{}{}.{ext}",
            slugify(project),
            slugify(avatar),
            slugify(vtype),
            slugify(&row.variant_label),
            label_suffix,
        );
        let status = match row.status_id {
            2 => "approved",
            3 => "rejected",
            _ => "pending",
        };
        let label_display = labels.get(&row.id).cloned().unwrap_or_default();

        let archive_path = filename.clone();
        let size_bytes = row.file_size_bytes.unwrap_or(0) as u64;

        entries.push(ExportFileEntry {
            abs_path,
            archive_path,
            size_bytes,
            manifest_row: vec![
                row.id.to_string(),
                project.to_string(),
                avatar.to_string(),
                vtype.to_string(),
                row.variant_label.clone(),
                status.to_string(),
                label_display,
                filename.clone(),
                row.file_path.clone(),
            ],
        });
    }

    Ok(entries)
}

// ---------------------------------------------------------------------------
// Split planning
// ---------------------------------------------------------------------------

/// Assign file indices to parts based on accumulated size.
///
/// Returns a `Vec<Vec<usize>>` where each inner Vec contains indices into
/// the `entries` slice for that part.
fn plan_splits(entries: &[ExportFileEntry], split_bytes: u64) -> Vec<Vec<usize>> {
    let mut parts: Vec<Vec<usize>> = vec![Vec::new()];
    let mut current_size: u64 = 0;

    for (i, entry) in entries.iter().enumerate() {
        // Start a new part if adding this file would exceed the limit,
        // unless the current part is empty (single file exceeds limit).
        if current_size > 0 && current_size + entry.size_bytes > split_bytes {
            parts.push(Vec::new());
            current_size = 0;
        }
        parts.last_mut().expect("at least one part").push(i);
        current_size += entry.size_bytes;
    }

    parts
}

// ---------------------------------------------------------------------------
// Manifest CSV
// ---------------------------------------------------------------------------

/// Build a CSV manifest string from the export entries.
fn build_manifest_csv(entity_type: &str, entries: &[ExportFileEntry]) -> String {
    let header = match entity_type {
        "scene_video_version" => {
            "id,project,avatar,scene_type,track,version,qa_status,labels,filename,original_path\n"
        }
        "media_variant" => {
            "id,project,avatar,variant_type,variant_label,status,labels,filename,original_path\n"
        }
        _ => "id,fields...\n",
    };
    let mut csv = String::from(header);
    for entry in entries {
        let escaped: Vec<String> = entry
            .manifest_row
            .iter()
            .map(|f| csv_escape_field(f))
            .collect();
        csv.push_str(&escaped.join(","));
        csv.push('\n');
    }
    csv
}

/// Escape a CSV field value, quoting if it contains commas, quotes, or newlines.
fn csv_escape_field(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

// ---------------------------------------------------------------------------
// ZIP archive writing
// ---------------------------------------------------------------------------

/// Write a ZIP archive containing the given file entries.
///
/// Streams one file at a time from disk into the ZIP — never holds more than
/// one source file in memory. If `manifest_csv` is `Some`, the manifest is
/// included as `manifest.csv`. Returns the total size of the written ZIP file.
async fn write_zip_archive(
    zip_path: &std::path::Path,
    entries: &[&ExportFileEntry],
    manifest_csv: Option<&str>,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    let zip_path_owned = zip_path.to_path_buf();
    let manifest_owned = manifest_csv.map(|s| s.to_string());

    // Collect (archive_name, abs_path) pairs — no file data yet.
    let file_list: Vec<(String, PathBuf)> = entries
        .iter()
        .map(|e| (e.archive_path.clone(), e.abs_path.clone()))
        .collect();

    // Build the ZIP in a blocking task, reading one file at a time.
    let zip_size = tokio::task::spawn_blocking(
        move || -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
            let file = std::fs::File::create(&zip_path_owned)?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);

            // Write manifest first if present.
            if let Some(ref csv) = manifest_owned {
                zip.start_file("manifest.csv", options)?;
                zip.write_all(csv.as_bytes())?;
            }

            // Stream each file: read from disk, write to ZIP, then drop the buffer.
            for (name, path) in &file_list {
                let data = std::fs::read(path)?;
                zip.start_file(name, options)?;
                zip.write_all(&data)?;
                // `data` is dropped here — only one file in memory at a time.
            }

            zip.finish()?;

            let metadata = std::fs::metadata(&zip_path_owned)?;
            Ok(metadata.len())
        },
    )
    .await??;

    Ok(zip_size)
}
