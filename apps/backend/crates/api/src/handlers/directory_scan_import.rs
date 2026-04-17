//! Server-side multi-type import engine for directory scan results (PRD-165).
//!
//! The `/directory-scan/import-assets` endpoint accepts the confirmed
//! import payload from `ImportConfirmModal` and streams progress events
//! back to the client over Server-Sent Events while it runs all five
//! import phases in order:
//!
//! 1. create any new avatar groups the payloads reference
//! 2. bulk-create the new avatars
//! 3. resolve IDs for existing avatars
//! 4. import images (media variants)
//! 5. import metadata (bio/tov/metadata JSON)
//! 6. import videos (scenes + scene_video_versions, with parent linking)
//!
//! File bytes are read from either the local filesystem or S3 via
//! [`x121_core::source_reader::read_source_file`]. All writes go through
//! the active [`StorageProvider`] so the import works identically
//! against local, S3, or any future backend.

use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::Json;
use futures::stream::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use x121_core::hashing::sha256_hex;
use x121_core::images;
use x121_core::source_reader::read_source_file;
use x121_core::storage::{pipeline_scoped_key, StorageProvider};
use x121_core::types::DbId;
use x121_db::models::audit::CreateAuditLog;
use x121_db::models::avatar::UpdateAvatar;
use x121_db::models::avatar_group::CreateAvatarGroup;
use x121_db::models::media::CreateMediaVariant;
use x121_db::models::scene::CreateScene;
use x121_db::models::scene_video_version::CreateSceneVideoVersion;
use x121_db::models::status::MediaVariantStatus;
use x121_db::repositories::{
    AuditLogRepo, AvatarGroupRepo, AvatarRepo, MediaVariantRepo, PipelineRepo, SceneRepo,
    SceneTypeRepo, SceneVideoVersionRepo, StorageBackendRepo, TagRepo,
};

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

// Shared constants with directory_scan.rs.
use super::directory_scan::{PROVENANCE_DIRECTORY_SCAN, VARIANT_KEY_PREFIX};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRESS_CHANNEL_CAPACITY: usize = 64;
const SUPPORTED_VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov"];
const CLIP_SOURCE_IMPORTED: &str = "imported";

const PHASE_GROUPS: &str = "creating-groups";
const PHASE_AVATARS: &str = "creating";
const PHASE_IMAGES: &str = "uploading-images";
const PHASE_METADATA: &str = "uploading-metadata";
const PHASE_VIDEOS: &str = "importing-videos";
const PHASE_DONE: &str = "done";

const METADATA_KEY_SOURCE_BIO: &str = "_source_bio";
const METADATA_KEY_SOURCE_TOV: &str = "_source_tov";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ImportAssetsInput {
    pub pipeline_id: DbId,
    pub project_id: DbId,
    #[serde(default)]
    pub new_payloads: Vec<ServerAvatarPayload>,
    #[serde(default)]
    pub existing_payloads: Vec<ServerAvatarPayload>,
    #[serde(default)]
    pub group_id: Option<DbId>,
    #[serde(default)]
    pub overwrite: bool,
    #[serde(default)]
    pub skip_existing: bool,
    #[serde(default)]
    pub apply_filename_tags: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerAvatarPayload {
    pub raw_name: String,
    #[serde(default)]
    pub group_name: Option<String>,
    #[serde(default)]
    pub avatar_id: Option<DbId>,
    #[serde(default)]
    pub assets: Vec<ServerAsset>,
    #[serde(default)]
    pub bio_json_path: Option<String>,
    #[serde(default)]
    pub tov_json_path: Option<String>,
    #[serde(default)]
    pub metadata_json_path: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerAsset {
    pub server_path: String,
    pub category: String,
    pub kind: String, // "image" | "video"
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub clip_meta: Option<ServerClipMeta>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerClipMeta {
    pub scene_type_slug: String,
    pub track_slug: String,
    #[serde(default = "default_version")]
    pub version: i32,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub clip_index: Option<i32>,
}

fn default_version() -> i32 {
    1
}

// ---------------------------------------------------------------------------
// SSE event payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
pub struct ImportProgressEvent {
    pub phase: String,
    pub current: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ImportDoneEvent {
    pub imported: usize,
    pub skipped: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub avatars_created: usize,
    pub groups_created: usize,
}

/// Internal message shape sent over the mpsc channel to the SSE emitter.
#[derive(Debug, Clone)]
enum SseMessage {
    Progress(ImportProgressEvent),
    Error(String),
    Done(ImportDoneEvent),
}

// ---------------------------------------------------------------------------
// Public handler — POST /api/v1/directory-scan/import-assets
// ---------------------------------------------------------------------------

/// Stream a directory-scan import over SSE.
///
/// Returns immediately with an `text/event-stream` response; the actual
/// import runs in a background task that publishes progress events on
/// an `mpsc` channel.
pub async fn import_assets(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<ImportAssetsInput>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::channel::<SseMessage>(PROGRESS_CHANNEL_CAPACITY);
    let cancel = CancellationToken::new();
    let cancel_for_task = cancel.clone();

    // Kick off the import in the background so the stream can start immediately.
    tokio::spawn(async move {
        run_import(state, auth, input, tx, cancel_for_task).await;
    });

    // Wrap mpsc -> futures Stream -> SSE Event. `cancel_guard` is moved into
    // the mapping closure and travels with the stream; when the client
    // disconnects the stream is dropped, which drops the guard, which
    // cancels the token. The background task detects cancellation and
    // additionally sees `tx.send` fail once the receiver goes away.
    let cancel_guard = Arc::new(CancelGuard(cancel));
    let stream = ReceiverStream::new(rx).map(move |msg| {
        // Keep the guard alive for the lifetime of the stream.
        let _guard = Arc::clone(&cancel_guard);
        let (event_name, data) = match msg {
            SseMessage::Progress(p) => (
                "progress",
                serde_json::to_string(&p).unwrap_or_else(|_| "{}".into()),
            ),
            SseMessage::Error(e) => (
                "error",
                serde_json::to_string(&serde_json::json!({ "message": e }))
                    .unwrap_or_else(|_| "{}".into()),
            ),
            SseMessage::Done(d) => (
                "done",
                serde_json::to_string(&d).unwrap_or_else(|_| "{}".into()),
            ),
        };
        Ok::<Event, Infallible>(Event::default().event(event_name).data(data))
    });

    Sse::new(stream.boxed()).keep_alive(KeepAlive::default())
}

/// RAII helper: cancels the paired `CancellationToken` when dropped.
struct CancelGuard(CancellationToken);
impl Drop for CancelGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async fn run_import(
    state: AppState,
    auth: AuthUser,
    input: ImportAssetsInput,
    tx: tokio::sync::mpsc::Sender<SseMessage>,
    cancel: CancellationToken,
) {
    let mut summary = ImportDoneEvent::default();

    // Resolve pipeline code once for storage keys.
    let pipeline_code = match PipelineRepo::find_by_id(&state.pool, input.pipeline_id).await {
        Ok(Some(p)) => p.code,
        Ok(None) => {
            let _ = tx
                .send(SseMessage::Error(format!(
                    "Pipeline {} not found",
                    input.pipeline_id
                )))
                .await;
            let _ = tx.send(SseMessage::Done(summary)).await;
            return;
        }
        Err(e) => {
            let _ = tx
                .send(SseMessage::Error(format!("Pipeline lookup failed: {e}")))
                .await;
            let _ = tx.send(SseMessage::Done(summary)).await;
            return;
        }
    };

    // Resolve an S3 provider once if any asset uses s3:// paths. All S3 URIs
    // in a single batch come from the same scan so one provider suffices.
    let s3_provider = resolve_s3_provider_if_needed(&state, &input).await;

    // ---- Phase 0: groups -------------------------------------------------
    if send_progress(&tx, PHASE_GROUPS, 0, 0).await.is_err() {
        tracing::debug!("SSE channel closed before phase 0");
        return;
    }

    let (group_map, groups_created) =
        match ensure_groups(&state, input.project_id, &input).await {
            Ok(v) => v,
            Err(e) => {
                summary.errors.push(format!("Group creation: {e}"));
                summary.failed += 1;
                let _ = tx.send(SseMessage::Done(summary)).await;
                return;
            }
        };
    summary.groups_created = groups_created;

    if cancel.is_cancelled() {
        let _ = tx.send(SseMessage::Done(summary)).await;
        return;
    }

    // ---- Phase 1: create new avatars ------------------------------------
    let total_new = input.new_payloads.len();
    if send_progress(&tx, PHASE_AVATARS, 0, total_new).await.is_err() {
        tracing::debug!("SSE channel closed in phase 1");
        return;
    }

    let mut new_avatar_ids: std::collections::HashMap<String, DbId> =
        std::collections::HashMap::new();
    match create_new_avatars(
        &state,
        input.project_id,
        input.group_id,
        &input.new_payloads,
        &group_map,
    )
    .await
    {
        Ok(map) => {
            summary.avatars_created = map.len();
            new_avatar_ids = map;
        }
        Err(e) => {
            summary.errors.push(format!("Avatar creation: {e}"));
            summary.failed += 1;
        }
    }
    let _ = send_progress(&tx, PHASE_AVATARS, total_new, total_new).await;

    if cancel.is_cancelled() {
        let _ = tx.send(SseMessage::Done(summary)).await;
        return;
    }

    // Build a single (payload, resolved_avatar_id) list for the subsequent
    // phases so new+existing share exactly the same code paths.
    let mut work: Vec<(&ServerAvatarPayload, DbId)> = Vec::new();
    for p in &input.new_payloads {
        if let Some(aid) = new_avatar_ids.get(&p.raw_name.to_lowercase()).copied() {
            work.push((p, aid));
        }
    }
    for p in &input.existing_payloads {
        let aid = if let Some(id) = p.avatar_id {
            Some(id)
        } else {
            resolve_existing_avatar(&state, input.project_id, &p.raw_name).await
        };
        if let Some(aid) = aid {
            work.push((p, aid));
        } else {
            summary
                .errors
                .push(format!("Could not resolve existing avatar: {}", p.raw_name));
            summary.failed += 1;
        }
    }

    // Tally totals for progress reporting.
    let total_images: usize = work
        .iter()
        .map(|(p, _)| p.assets.iter().filter(|a| a.kind == "image").count())
        .sum();
    let total_videos: usize = work
        .iter()
        .map(|(p, _)| p.assets.iter().filter(|a| a.kind == "video").count())
        .sum();
    let total_metadata_avatars: usize = work
        .iter()
        .filter(|(p, _)| {
            p.bio_json_path.is_some() || p.tov_json_path.is_some() || p.metadata_json_path.is_some()
        })
        .count();

    // ---- Phase 3: images -------------------------------------------------
    let mut images_done = 0usize;
    let _ = send_progress(&tx, PHASE_IMAGES, 0, total_images).await;
    for (payload, avatar_id) in &work {
        if cancel.is_cancelled() {
            break;
        }
        for asset in payload.assets.iter().filter(|a| a.kind == "image") {
            match import_image_from_source(
                &state,
                asset,
                *avatar_id,
                &pipeline_code,
                input.overwrite,
                input.skip_existing,
                s3_provider.as_deref(),
            )
            .await
            {
                Ok(ImportOutcome::Imported) => summary.imported += 1,
                Ok(ImportOutcome::Skipped) => summary.skipped += 1,
                Err(e) => {
                    summary.failed += 1;
                    summary
                        .errors
                        .push(format!("Image {}: {e}", asset.server_path));
                }
            }
            images_done += 1;
            let _ = send_progress(&tx, PHASE_IMAGES, images_done, total_images).await;
        }
    }

    // ---- Phase 3.5: metadata ---------------------------------------------
    let mut meta_done = 0usize;
    let _ = send_progress(&tx, PHASE_METADATA, 0, total_metadata_avatars).await;
    for (payload, avatar_id) in &work {
        if cancel.is_cancelled() {
            break;
        }
        if payload.bio_json_path.is_none()
            && payload.tov_json_path.is_none()
            && payload.metadata_json_path.is_none()
        {
            continue;
        }
        match import_metadata_from_source(
            &state,
            payload,
            *avatar_id,
            input.skip_existing,
            s3_provider.as_deref(),
        )
        .await
        {
            Ok(ImportOutcome::Imported) => summary.imported += 1,
            Ok(ImportOutcome::Skipped) => summary.skipped += 1,
            Err(e) => {
                summary.failed += 1;
                summary
                    .errors
                    .push(format!("Metadata for {}: {e}", payload.raw_name));
            }
        }
        meta_done += 1;
        let _ = send_progress(&tx, PHASE_METADATA, meta_done, total_metadata_avatars).await;
    }

    // ---- Phase 4: videos -------------------------------------------------
    let mut videos_done = 0usize;
    let _ = send_progress(&tx, PHASE_VIDEOS, 0, total_videos).await;
    for (payload, avatar_id) in &work {
        if cancel.is_cancelled() {
            break;
        }
        for asset in payload.assets.iter().filter(|a| a.kind == "video") {
            match import_video_from_source(
                &state,
                asset,
                *avatar_id,
                input.pipeline_id,
                auth.user_id,
                input.apply_filename_tags,
                input.skip_existing,
                s3_provider.as_deref(),
            )
            .await
            {
                Ok(ImportOutcome::Imported) => summary.imported += 1,
                Ok(ImportOutcome::Skipped) => summary.skipped += 1,
                Err(e) => {
                    summary.failed += 1;
                    summary
                        .errors
                        .push(format!("Video {}: {e}", asset.server_path));
                }
            }
            videos_done += 1;
            let _ = send_progress(&tx, PHASE_VIDEOS, videos_done, total_videos).await;
        }
    }

    // ---- Audit log -------------------------------------------------------
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(auth.user_id),
            session_id: None,
            action_type: "directory_scan.import_assets".to_string(),
            entity_type: Some("directory_scan".to_string()),
            entity_id: None,
            details_json: Some(serde_json::json!({
                "pipeline_id": input.pipeline_id,
                "project_id": input.project_id,
                "imported": summary.imported,
                "skipped": summary.skipped,
                "failed": summary.failed,
                "avatars_created": summary.avatars_created,
                "groups_created": summary.groups_created,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    // ---- Done ------------------------------------------------------------
    let _ = send_progress(&tx, PHASE_DONE, 1, 1).await;
    let _ = tx.send(SseMessage::Done(summary)).await;
}

// ---------------------------------------------------------------------------
// Phase helpers
// ---------------------------------------------------------------------------

/// Ensure all `group_name` values referenced by `new_payloads` exist.
///
/// Returns a case-insensitive `group_name -> group_id` map plus the number
/// of new groups that were created.
async fn ensure_groups(
    state: &AppState,
    project_id: DbId,
    input: &ImportAssetsInput,
) -> Result<(std::collections::HashMap<String, DbId>, usize), String> {
    // Always ensure a default "Intake" group exists so new avatars have a home.
    let created_default = AvatarGroupRepo::ensure_default(&state.pool, project_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut created = if created_default.is_some() { 1 } else { 0 };

    // Build a lowercase lookup over existing groups.
    let existing = AvatarGroupRepo::list_by_project(&state.pool, project_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut map: std::collections::HashMap<String, DbId> = existing
        .into_iter()
        .map(|g| (g.name.to_lowercase(), g.id))
        .collect();

    // Create any payload-referenced groups that don't yet exist.
    let unique_names: std::collections::BTreeSet<String> = input
        .new_payloads
        .iter()
        .chain(input.existing_payloads.iter())
        .filter_map(|p| p.group_name.clone())
        .filter(|n| !n.trim().is_empty())
        .collect();

    for name in unique_names {
        if map.contains_key(&name.to_lowercase()) {
            continue;
        }
        let group = AvatarGroupRepo::create(
            &state.pool,
            &CreateAvatarGroup {
                project_id,
                name: name.clone(),
                sort_order: Some(0),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
        map.insert(name.to_lowercase(), group.id);
        created += 1;
    }

    Ok((map, created))
}

/// Bulk-create new avatars and return a `lowercased_raw_name -> avatar_id` map.
async fn create_new_avatars(
    state: &AppState,
    project_id: DbId,
    fallback_group_id: Option<DbId>,
    payloads: &[ServerAvatarPayload],
    group_map: &std::collections::HashMap<String, DbId>,
) -> Result<std::collections::HashMap<String, DbId>, String> {
    let mut by_group: std::collections::HashMap<Option<DbId>, Vec<String>> =
        std::collections::HashMap::new();

    for p in payloads {
        let gid = p
            .group_name
            .as_deref()
            .and_then(|n| group_map.get(&n.to_lowercase()).copied())
            .or(fallback_group_id);
        by_group.entry(gid).or_default().push(p.raw_name.clone());
    }

    let mut out = std::collections::HashMap::new();
    for (group_id, names) in by_group {
        let created = AvatarRepo::create_many(&state.pool, project_id, &names, group_id)
            .await
            .map_err(|e| e.to_string())?;
        for avatar in created {
            out.insert(avatar.name.to_lowercase(), avatar.id);
        }
    }
    Ok(out)
}

/// Look up an existing avatar by exact case-insensitive name within the project.
async fn resolve_existing_avatar(
    state: &AppState,
    project_id: DbId,
    raw_name: &str,
) -> Option<DbId> {
    sqlx::query_scalar::<_, DbId>(
        "SELECT id FROM avatars \
         WHERE project_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(project_id)
    .bind(raw_name)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
}

/// Build an S3 provider from a configured backend if any asset path begins
/// with `s3://`. Returns `None` when all sources are local.
async fn resolve_s3_provider_if_needed(
    state: &AppState,
    input: &ImportAssetsInput,
) -> Option<Arc<dyn StorageProvider>> {
    let has_s3 = input
        .new_payloads
        .iter()
        .chain(input.existing_payloads.iter())
        .any(|p| {
            p.assets.iter().any(|a| a.server_path.starts_with("s3://"))
                || p.bio_json_path.as_deref().is_some_and(|s| s.starts_with("s3://"))
                || p.tov_json_path.as_deref().is_some_and(|s| s.starts_with("s3://"))
                || p.metadata_json_path
                    .as_deref()
                    .is_some_and(|s| s.starts_with("s3://"))
        });
    if !has_s3 {
        return None;
    }

    // Find the first s3:// path to extract a bucket name.
    let bucket = input
        .new_payloads
        .iter()
        .chain(input.existing_payloads.iter())
        .flat_map(|p| {
            p.assets
                .iter()
                .map(|a| a.server_path.as_str())
                .chain(p.bio_json_path.as_deref())
                .chain(p.tov_json_path.as_deref())
                .chain(p.metadata_json_path.as_deref())
        })
        .filter_map(|s| s.strip_prefix("s3://"))
        .filter_map(|rest| rest.split_once('/').map(|(b, _)| b.to_string()))
        .next()?;

    // Pick matching backend (same logic as the scanner).
    let backends = StorageBackendRepo::list(&state.pool).await.ok()?;
    let backend = backends
        .iter()
        .find(|b| {
            b.backend_type_id == 2
                && b.config
                    .get("bucket")
                    .and_then(|v| v.as_str())
                    .map(|v| v.eq_ignore_ascii_case(&bucket))
                    .unwrap_or(false)
        })
        .cloned()
        .or_else(|| {
            backends
                .into_iter()
                .find(|b| b.backend_type_id == 2 && b.is_default)
        })?;

    let mut config: x121_cloud::storage_provider::S3Config =
        serde_json::from_value(backend.config.clone()).ok()?;
    config.bucket = bucket;
    config.path_prefix = None;
    let provider = x121_cloud::storage_provider::S3StorageProvider::new(config)
        .await
        .ok()?;
    Some(Arc::new(provider))
}

/// Send a progress event. Returns `Err(())` when the receiver dropped (client
/// disconnected), signalling the caller to stop.
async fn send_progress(
    tx: &tokio::sync::mpsc::Sender<SseMessage>,
    phase: &str,
    current: usize,
    total: usize,
) -> Result<(), ()> {
    tx.send(SseMessage::Progress(ImportProgressEvent {
        phase: phase.to_string(),
        current,
        total,
    }))
    .await
    .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Per-asset helpers
// ---------------------------------------------------------------------------

enum ImportOutcome {
    Imported,
    Skipped,
}

/// Import a single image asset: read bytes, upload, create MediaVariant row.
async fn import_image_from_source(
    state: &AppState,
    asset: &ServerAsset,
    avatar_id: DbId,
    pipeline_code: &str,
    overwrite: bool,
    skip_existing: bool,
    s3_provider: Option<&dyn StorageProvider>,
) -> Result<ImportOutcome, AppError> {
    let ext = ext_from_filename(&asset.server_path);
    if !images::is_valid_image_format(&ext) {
        return Err(AppError::BadRequest(format!(
            "Unsupported image format '.{ext}'"
        )));
    }

    let data = read_source_file(&asset.server_path, s3_provider)
        .await
        .map_err(|e| AppError::InternalError(format!("Read source: {e}")))?;
    if data.is_empty() {
        return Err(AppError::BadRequest(
            "Image source file is empty".to_string(),
        ));
    }

    let content_hash = asset
        .content_hash
        .clone()
        .unwrap_or_else(|| sha256_hex(&data));

    let variant_type = asset.category.clone();

    // Deduplicate by content hash when requested.
    if skip_existing {
        let exists: Option<DbId> = sqlx::query_scalar(
            "SELECT id FROM media_variants \
             WHERE content_hash = $1 AND deleted_at IS NULL LIMIT 1",
        )
        .bind(&content_hash)
        .fetch_optional(&state.pool)
        .await?;
        if exists.is_some() {
            return Ok(ImportOutcome::Skipped);
        }
    }

    // Overwrite: soft-delete existing variants of the same type for this avatar.
    if overwrite {
        let existing =
            MediaVariantRepo::list_by_avatar_and_type(&state.pool, avatar_id, &variant_type)
                .await?;
        for v in &existing {
            let _ = MediaVariantRepo::soft_delete(&state.pool, v.id).await;
        }
    }

    // Upload through the active storage provider (PRD-122 / PRD-165).
    let prefix = pipeline_scoped_key(pipeline_code, VARIANT_KEY_PREFIX);
    let stored_filename = format!(
        "variant_{avatar_id}_{variant_type}_{}.{ext}",
        chrono::Utc::now().timestamp_millis()
    );
    let storage_key = format!("{prefix}/{stored_filename}");
    let provider = state.storage_provider().await;
    provider
        .upload(&storage_key, &data)
        .await
        .map_err(|e| AppError::InternalError(format!("Storage upload failed: {e}")))?;

    let (width, height) = images::image_dimensions(&data)
        .map(|(w, h)| (Some(w as i32), Some(h as i32)))
        .unwrap_or((None, None));

    let existing_hero = MediaVariantRepo::find_hero(&state.pool, avatar_id, &variant_type).await?;
    let should_be_hero = existing_hero.is_none();

    MediaVariantRepo::create(
        &state.pool,
        &CreateMediaVariant {
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
        },
    )
    .await?;

    Ok(ImportOutcome::Imported)
}

/// Import a single video asset: create/find a scene, upload, create version.
#[allow(clippy::too_many_arguments)]
async fn import_video_from_source(
    state: &AppState,
    asset: &ServerAsset,
    avatar_id: DbId,
    pipeline_id: DbId,
    user_id: DbId,
    apply_tags: bool,
    skip_existing: bool,
    s3_provider: Option<&dyn StorageProvider>,
) -> Result<ImportOutcome, AppError> {
    let ext = ext_from_filename(&asset.server_path);
    if !SUPPORTED_VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported video format '.{ext}'"
        )));
    }

    let clip = asset.clip_meta.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "Video asset is missing clip_meta (scene_type_slug, track_slug required)".to_string(),
        )
    })?;

    // Resolve scene_type and track.
    let scene_type = SceneTypeRepo::find_by_slug(&state.pool, &clip.scene_type_slug, Some(pipeline_id))
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "Scene type '{}' not found in pipeline",
                clip.scene_type_slug
            ))
        })?;

    let track_id: DbId = sqlx::query_scalar(
        "SELECT id FROM tracks \
         WHERE slug = $1 AND ($2::bigint IS NULL OR pipeline_id = $2) \
         LIMIT 1",
    )
    .bind(&clip.track_slug)
    .bind(Some(pipeline_id))
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::BadRequest(format!("Track '{}' not found", clip.track_slug)))?;

    // Find or create the scene for this (avatar, scene_type, track) triple.
    let scene_id: DbId = match sqlx::query_scalar(
        "SELECT id FROM scenes \
         WHERE avatar_id = $1 AND scene_type_id = $2 AND track_id = $3 \
           AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(avatar_id)
    .bind(scene_type.id)
    .bind(track_id)
    .fetch_optional(&state.pool)
    .await?
    {
        Some(id) => id,
        None => {
            let scene = SceneRepo::create(
                &state.pool,
                &CreateScene {
                    avatar_id,
                    scene_type_id: scene_type.id,
                    media_variant_id: None,
                    track_id: Some(track_id),
                    status_id: None,
                    transition_mode: None,
                    total_segments_estimated: None,
                    total_segments_completed: None,
                    actual_duration_secs: None,
                    transition_segment_index: None,
                    generation_started_at: None,
                    generation_completed_at: None,
                },
            )
            .await?;
            scene.id
        }
    };

    // Read bytes from source.
    let data = read_source_file(&asset.server_path, s3_provider)
        .await
        .map_err(|e| AppError::InternalError(format!("Read source: {e}")))?;
    if data.is_empty() {
        return Err(AppError::BadRequest(
            "Video source file is empty".to_string(),
        ));
    }

    let content_hash = asset
        .content_hash
        .clone()
        .unwrap_or_else(|| sha256_hex(&data));

    // Deduplicate by content hash when requested.
    if skip_existing {
        let exists: Option<DbId> = sqlx::query_scalar(
            "SELECT id FROM scene_video_versions WHERE content_hash = $1 LIMIT 1",
        )
        .bind(&content_hash)
        .fetch_optional(&state.pool)
        .await?;
        if exists.is_some() {
            return Ok(ImportOutcome::Skipped);
        }
    }

    // Resolve parent version (for derived clips) — latest version with matching number.
    let parent_version_id: Option<DbId> = sqlx::query_scalar(
        "SELECT id FROM scene_video_versions \
         WHERE scene_id = $1 AND version_number = $2 AND parent_version_id IS NULL \
           AND deleted_at IS NULL \
         ORDER BY id DESC LIMIT 1",
    )
    .bind(scene_id)
    .bind(clip.version)
    .fetch_optional(&state.pool)
    .await?;

    // Upload to managed storage (original bytes — leave transcoding to the
    // existing background machinery so we don't block the import stream).
    let storage_key = format!(
        "imports/scene_{scene_id}_{}.{ext}",
        chrono::Utc::now().timestamp_millis()
    );
    let provider = state.storage_provider().await;
    provider
        .upload(&storage_key, &data)
        .await
        .map_err(|e| AppError::InternalError(format!("Storage upload failed: {e}")))?;

    let file_size = data.len() as i64;

    // Derived clips (with a parent) are never auto-final; originals become
    // final when no approved final already exists.
    let (is_final, _has_approved_final) = if parent_version_id.is_some() {
        (false, false)
    } else {
        let existing_final =
            SceneVideoVersionRepo::find_final_for_scene(&state.pool, scene_id).await?;
        let has_approved = existing_final
            .as_ref()
            .is_some_and(|v| v.qa_status == "approved");
        (!has_approved, has_approved)
    };

    let create_input = CreateSceneVideoVersion {
        scene_id,
        source: CLIP_SOURCE_IMPORTED.to_string(),
        file_path: storage_key,
        file_size_bytes: Some(file_size),
        duration_secs: None,
        is_final: Some(is_final),
        notes: None,
        generation_snapshot: None,
        content_hash: Some(content_hash),
        parent_version_id,
        clip_index: clip.clip_index,
    };

    let version = if is_final {
        SceneVideoVersionRepo::create_as_final(&state.pool, &create_input).await?
    } else {
        SceneVideoVersionRepo::create(&state.pool, &create_input).await?
    };

    // Apply filename labels as tags when requested.
    if apply_tags {
        for label in &clip.labels {
            if let Ok(tag) = TagRepo::create_or_get(
                &state.pool,
                label,
                None,
                Some(user_id),
                Some(pipeline_id),
            )
            .await
            {
                let _ =
                    TagRepo::apply(&state.pool, "scene_video_version", version.id, tag.id, Some(user_id))
                        .await;
            }
        }
    }

    Ok(ImportOutcome::Imported)
}

/// Import bio.json / tov.json / metadata.json into an avatar's `metadata` column.
async fn import_metadata_from_source(
    state: &AppState,
    payload: &ServerAvatarPayload,
    avatar_id: DbId,
    skip_existing: bool,
    s3_provider: Option<&dyn StorageProvider>,
) -> Result<ImportOutcome, AppError> {
    let avatar = AvatarRepo::find_by_id(&state.pool, avatar_id)
        .await?
        .ok_or_else(|| AppError::BadRequest(format!("Avatar {avatar_id} not found")))?;

    let mut metadata = avatar
        .metadata
        .clone()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    if skip_existing && !metadata.is_empty() {
        return Ok(ImportOutcome::Skipped);
    }

    let mut any_merged = false;

    if let Some(path) = payload.bio_json_path.as_deref() {
        match read_json_source(path, s3_provider).await {
            Ok(val) => {
                metadata.insert(METADATA_KEY_SOURCE_BIO.to_string(), val);
                any_merged = true;
            }
            Err(e) => tracing::warn!("bio.json read failed for {path}: {e}"),
        }
    }
    if let Some(path) = payload.tov_json_path.as_deref() {
        match read_json_source(path, s3_provider).await {
            Ok(val) => {
                metadata.insert(METADATA_KEY_SOURCE_TOV.to_string(), val);
                any_merged = true;
            }
            Err(e) => tracing::warn!("tov.json read failed for {path}: {e}"),
        }
    }
    if let Some(path) = payload.metadata_json_path.as_deref() {
        match read_json_source(path, s3_provider).await {
            Ok(val) => {
                if let Some(obj) = val.as_object() {
                    for (k, v) in obj {
                        metadata.insert(k.clone(), v.clone());
                    }
                    any_merged = true;
                } else {
                    tracing::warn!("metadata.json {path} is not an object");
                }
            }
            Err(e) => tracing::warn!("metadata.json read failed for {path}: {e}"),
        }
    }

    if !any_merged {
        return Ok(ImportOutcome::Skipped);
    }

    let update = UpdateAvatar {
        name: None,
        status_id: None,
        group_id: None,
        metadata: Some(serde_json::Value::Object(metadata)),
        settings: None,
        blocking_deliverables: None,
    };
    AvatarRepo::update(&state.pool, avatar_id, &update).await?;

    Ok(ImportOutcome::Imported)
}

/// Read and JSON-parse a source file.
async fn read_json_source(
    path: &str,
    s3_provider: Option<&dyn StorageProvider>,
) -> Result<serde_json::Value, String> {
    let bytes = read_source_file(path, s3_provider)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|e| format!("invalid JSON: {e}"))
}

/// Extract the lowercase extension from a path or filename.
fn ext_from_filename(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit('.')
        .next()
        .filter(|_| name.contains('.'))
        .unwrap_or("")
        .to_lowercase()
}
