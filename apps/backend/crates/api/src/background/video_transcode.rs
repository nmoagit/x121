//! Asynchronous video transcoding pipeline (PRD-169).
//!
//! This module owns two closely-related concerns:
//!
//! 1. [`enqueue_if_needed`] — called synchronously at every video-entry
//!    point to ffprobe an uploaded file, decide whether the video is already
//!    browser-compatible, and either set `transcode_state = 'completed'` or
//!    insert a `transcode_jobs` row and set `transcode_state = 'pending'`.
//! 2. The [`run`] worker loop — polls `transcode_jobs`, claims up to N pending
//!    jobs via an atomic `UPDATE ... RETURNING`, downloads the source, runs
//!    `ffmpeg::transcode_web_playback`, uploads the result to a
//!    `<basename>-h264.mp4` key, flips `scene_video_versions.file_path` +
//!    `transcode_state` inside a single DB transaction, then (post-commit)
//!    deletes the original and publishes an activity event.
//!
//! The worker follows the `background/delivery_assembly.rs` blueprint
//! (`tokio::interval` + `CancellationToken` + `process_next`) so we have one
//! consistent worker shape in the codebase.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::ffmpeg;
use x121_core::types::DbId;
use x121_db::models::transcode_job::{
    CreateTranscodeJob, TranscodeJob, TRANSCODE_ENTITY_SCENE_VIDEO_VERSION,
};
use x121_db::repositories::{PlatformSettingRepo, SceneVideoVersionRepo, TranscodeJobRepo};

use crate::error::AppError;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/// Worker poll interval. Faster than delivery-assembly (10s) because transcodes
/// are expected to be frequent during imports.
const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// Stalled-job recovery threshold — 2x the expected transcode wall-clock budget
/// (PRD Requirement 1.4a).
const STALLED_JOB_THRESHOLD: Duration = Duration::from_secs(600);

/// Default concurrency for the worker. Admins override via the
/// `transcode.concurrency` platform setting (PRD §10 decision 5).
const DEFAULT_CONCURRENCY: u32 = 2;

/// Platform setting key for worker concurrency.
const SETTING_CONCURRENCY: &str = "transcode.concurrency";

/// Valid range for the concurrency setting.
const MIN_CONCURRENCY: u32 = 1;
const MAX_CONCURRENCY: u32 = 8;

// ---------------------------------------------------------------------------
// Public API — enqueue helper
// ---------------------------------------------------------------------------

/// Result of [`enqueue_if_needed`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnqueueOutcome {
    /// Source is already browser-compatible — marked `completed` immediately.
    Completed,
    /// Source needs transcoding — a job row was inserted (or already active).
    Pending,
}

/// Probe the uploaded video at `storage_key`; if it already uses a browser-
/// compatible codec (h264/vp9/vp8/av1), flip the SVV's `transcode_state` to
/// `'completed'` and return `Completed`. Otherwise, set `transcode_state` to
/// `'pending'` and enqueue a `transcode_jobs` row for the worker.
///
/// All four video-entry points in v1 call this after uploading their source
/// bytes (PRD Requirement 1.3). The caller is responsible for creating the
/// `scene_video_versions` row itself.
pub async fn enqueue_if_needed(
    state: &AppState,
    svv_id: DbId,
    storage_key: &str,
) -> Result<EnqueueOutcome, AppError> {
    // Defensive: if an active job already exists for this entity, don't try to
    // insert a second one — the unique partial index would reject it anyway
    // (PRD §11 edge case: "Two concurrent transcode runs for the same entity").
    if let Some(existing) =
        TranscodeJobRepo::find_active_by_entity(&state.pool, TRANSCODE_ENTITY_SCENE_VIDEO_VERSION, svv_id).await?
    {
        tracing::debug!(
            target: "transcode",
            svv_id,
            job_id = existing.id,
            status_id = existing.status_id,
            "enqueue_if_needed: active job already exists, skipping"
        );
        return Ok(EnqueueOutcome::Pending);
    }

    // Resolve the storage key to a local path. For local storage this is just
    // the absolute path; for S3 we download to a temp file first.
    let (probe_path, _tempfile_guard) = stage_for_probe(state, storage_key).await?;

    let probe = ffmpeg::probe_video(&probe_path).await.map_err(|e| {
        AppError::InternalError(format!("ffprobe failed for transcode decision: {e}"))
    })?;
    let codec = ffmpeg::parse_video_codec(&probe);

    let is_compatible = ffmpeg::is_browser_compatible(&probe_path)
        .await
        .unwrap_or(false);

    if is_compatible {
        // Happy path: mark completed in-place, no queue row needed.
        let mut tx = state.pool.begin().await.map_err(sqlx::Error::from)?;
        SceneVideoVersionRepo::set_transcode_state(&mut tx, svv_id, "completed")
            .await
            .map_err(sqlx::Error::from)?;
        tx.commit().await.map_err(sqlx::Error::from)?;

        tracing::info!(
            target: "transcode",
            svv_id,
            codec = %codec,
            "enqueue_if_needed: source is browser-compatible, state=completed"
        );
        return Ok(EnqueueOutcome::Completed);
    }

    // Transcode needed: set pending + insert job row in a single tx.
    let mut tx = state.pool.begin().await.map_err(sqlx::Error::from)?;
    SceneVideoVersionRepo::set_transcode_state(&mut tx, svv_id, "pending")
        .await
        .map_err(sqlx::Error::from)?;

    // Insert the job directly via a scoped query so it participates in tx.
    let create = CreateTranscodeJob {
        entity_type: TRANSCODE_ENTITY_SCENE_VIDEO_VERSION.to_string(),
        entity_id: svv_id,
        source_codec: Some(codec.clone()),
        source_storage_key: storage_key.to_string(),
    };
    sqlx::query(
        "INSERT INTO transcode_jobs \
            (entity_type, entity_id, status_id, source_codec, source_storage_key) \
         VALUES ($1, $2, 1, $3, $4)",
    )
    .bind(&create.entity_type)
    .bind(create.entity_id)
    .bind(&create.source_codec)
    .bind(&create.source_storage_key)
    .execute(&mut *tx)
    .await
    .map_err(sqlx::Error::from)?;

    tx.commit().await.map_err(sqlx::Error::from)?;

    tracing::info!(
        target: "transcode",
        svv_id,
        codec = %codec,
        "enqueue_if_needed: enqueued transcode job, state=pending"
    );
    Ok(EnqueueOutcome::Pending)
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

/// Run the video transcode worker until `cancel` fires.
///
/// Performs a one-time stalled-job recovery pass on startup (PRD Requirement
/// 1.4a) before entering the polling loop.
pub async fn run(state: AppState, cancel: CancellationToken) {
    tracing::info!(
        interval_secs = POLL_INTERVAL.as_secs(),
        "Video transcode worker started"
    );

    // Requirement 1.4a: one-time stalled-job recovery pass.
    match TranscodeJobRepo::recover_stalled(&state.pool, STALLED_JOB_THRESHOLD).await {
        Ok(result) => {
            if result.reset_count > 0 || result.failed_count > 0 {
                tracing::info!(
                    target: "transcode",
                    reset = result.reset_count,
                    failed = result.failed_count,
                    "Recovered stalled transcode jobs on boot"
                );
            }
        }
        Err(e) => tracing::error!(
            target: "transcode",
            error = %e,
            "Stalled-job recovery failed"
        ),
    }

    // Concurrency semaphore — size adjusted each tick from platform settings.
    let semaphore = Arc::new(Semaphore::new(DEFAULT_CONCURRENCY as usize));
    let mut interval = tokio::time::interval(POLL_INTERVAL);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Video transcode worker stopping");
                break;
            }
            _ = interval.tick() => {
                // Allow concurrency setting changes without restart.
                let target_permits = resolve_concurrency(&state).await;
                adjust_semaphore(&semaphore, target_permits);

                if let Err(e) = process_next(&state, &cancel, semaphore.clone()).await {
                    tracing::error!(
                        target: "transcode",
                        error = %e,
                        "Transcode worker tick failed"
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Worker internals
// ---------------------------------------------------------------------------

/// One tick: claim up to `available_permits` jobs and dispatch them.
async fn process_next(
    state: &AppState,
    _cancel: &CancellationToken,
    semaphore: Arc<Semaphore>,
) -> Result<(), AppError> {
    let available = semaphore.available_permits();
    if available == 0 {
        return Ok(());
    }

    let jobs = TranscodeJobRepo::claim_pending(&state.pool, available as i32)
        .await
        .map_err(|e| AppError::InternalError(format!("claim_pending failed: {e}")))?;

    for job in jobs {
        // Each job publishes its pending→in_progress transition at claim time.
        let project_id = SceneVideoVersionRepo::find_project_id(&state.pool, job.entity_id)
            .await
            .ok()
            .flatten();
        publish_transcode_event(
            state,
            &job,
            "in_progress",
            None,
            ActivityLogLevel::Info,
            project_id,
        );

        // Acquire an owned permit so the spawned task holds it for its lifetime.
        let permit = match semaphore.clone().acquire_owned().await {
            Ok(p) => p,
            Err(_) => {
                // Semaphore closed — worker is shutting down.
                break;
            }
        };
        let state_clone = state.clone();
        tokio::spawn(async move {
            let _permit = permit; // held for the job's lifetime
            run_job(&state_clone, job).await;
        });
    }
    Ok(())
}

/// End-to-end execution of a single transcode job.
async fn run_job(state: &AppState, job: TranscodeJob) {
    tracing::info!(
        target: "transcode",
        job_id = job.id,
        svv_id = job.entity_id,
        attempt = job.attempts,
        "Starting transcode"
    );

    match transcode_once(state, &job).await {
        Ok(target_key) => {
            let project_id = SceneVideoVersionRepo::find_project_id(&state.pool, job.entity_id)
                .await
                .ok()
                .flatten();

            tracing::info!(
                target: "transcode",
                job_id = job.id,
                svv_id = job.entity_id,
                target_key = %target_key,
                "Transcode completed"
            );

            // Post-commit: delete the original. Log errors but do not fail —
            // the transcode succeeded so we won't leave the user without a video
            // (PRD Requirement 1.7: avoid orphaning on DB rollback).
            let provider = state.storage_provider().await;
            if let Err(e) = provider.delete(&job.source_storage_key).await {
                tracing::warn!(
                    target: "transcode",
                    job_id = job.id,
                    key = %job.source_storage_key,
                    error = %e,
                    "Failed to delete original after successful transcode"
                );
            }

            // Reload the job to emit the final event with up-to-date fields.
            let completed_job = TranscodeJobRepo::find_by_id(&state.pool, job.id)
                .await
                .ok()
                .flatten()
                .unwrap_or(job);
            publish_transcode_event(
                state,
                &completed_job,
                "completed",
                None,
                ActivityLogLevel::Info,
                project_id,
            );
        }
        Err(e) => {
            let err_msg = e.to_string();
            tracing::error!(
                target: "transcode",
                job_id = job.id,
                svv_id = job.entity_id,
                attempt = job.attempts,
                error = %err_msg,
                "Transcode failed"
            );
            handle_failure(state, &job, &err_msg).await;
        }
    }
}

/// The happy-path transcode logic, isolated so `run_job` can focus on retry/
/// event-publish bookkeeping.
async fn transcode_once(state: &AppState, job: &TranscodeJob) -> Result<String, AppError> {
    let provider = state.storage_provider().await;

    // 1. Download source to a temp path.
    let data = provider
        .download(&job.source_storage_key)
        .await
        .map_err(|e| AppError::InternalError(format!("Download source failed: {e}")))?;

    let tmp_dir = std::env::temp_dir().join("x121_transcode");
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| AppError::InternalError(format!("Create temp dir: {e}")))?;

    let ts = chrono::Utc::now().timestamp_millis();
    let src_path = tmp_dir.join(format!("src_{}_{}.bin", job.id, ts));
    let dst_path = tmp_dir.join(format!("dst_{}_{}.mp4", job.id, ts));
    tokio::fs::write(&src_path, &data)
        .await
        .map_err(|e| AppError::InternalError(format!("Write src temp: {e}")))?;

    // 2. Run ffmpeg. Clean up temp files regardless of result.
    let transcode_result = ffmpeg::transcode_web_playback(&src_path, &dst_path).await;

    if let Err(e) = transcode_result {
        let _ = tokio::fs::remove_file(&src_path).await;
        let _ = tokio::fs::remove_file(&dst_path).await;
        return Err(AppError::InternalError(format!(
            "Transcode failed: {e}"
        )));
    }

    // 3. Upload transcoded bytes to the target key.
    let transcoded = tokio::fs::read(&dst_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Read dst temp: {e}")))?;

    let _ = tokio::fs::remove_file(&src_path).await;
    let _ = tokio::fs::remove_file(&dst_path).await;

    let target_key = target_key_for(&job.source_storage_key);
    provider
        .upload(&target_key, &transcoded)
        .await
        .map_err(|e| AppError::InternalError(format!("Upload target failed: {e}")))?;

    // 4. Commit: update SVV.file_path + transcode_state + job row, atomically.
    let mut tx = state.pool.begin().await.map_err(sqlx::Error::from)?;
    SceneVideoVersionRepo::set_transcoded(&mut tx, job.entity_id, &target_key)
        .await
        .map_err(sqlx::Error::from)?;
    TranscodeJobRepo::mark_completed(&mut tx, job.id, &target_key)
        .await
        .map_err(sqlx::Error::from)?;
    tx.commit().await.map_err(sqlx::Error::from)?;

    Ok(target_key)
}

/// On ffmpeg failure: either schedule a retry with exponential backoff, or —
/// if attempts are exhausted — mark the job (and SVV) terminally failed.
async fn handle_failure(state: &AppState, job: &TranscodeJob, err_msg: &str) {
    // `attempts` was incremented at claim time, so `job.attempts` here is the
    // number of attempts already made (1-based).
    if job.attempts < job.max_attempts {
        let backoff = x121_db::repositories::transcode_job_repo::backoff_for(job.attempts);
        if let Err(e) =
            TranscodeJobRepo::mark_failed_retry(&state.pool, job.id, err_msg, backoff).await
        {
            tracing::error!(
                target: "transcode",
                job_id = job.id,
                error = %e,
                "Failed to schedule transcode retry"
            );
        }
        // No state flip: still `pending` (retry scheduled). SVV.transcode_state
        // stays `'in_progress'` until the next claim.
        return;
    }

    // Terminal failure.
    let mut tx = match state.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(
                target: "transcode",
                job_id = job.id,
                error = %e,
                "Failed to begin terminal-failure tx"
            );
            return;
        }
    };
    if let Err(e) = TranscodeJobRepo::mark_failed_terminal(&mut tx, job.id, err_msg).await {
        tracing::error!(
            target: "transcode",
            job_id = job.id,
            error = %e,
            "mark_failed_terminal failed"
        );
        return;
    }
    if let Err(e) = SceneVideoVersionRepo::set_transcode_state(&mut tx, job.entity_id, "failed").await
    {
        tracing::error!(
            target: "transcode",
            job_id = job.id,
            error = %e,
            "set_transcode_state=failed failed"
        );
        return;
    }
    if let Err(e) = tx.commit().await {
        tracing::error!(
            target: "transcode",
            job_id = job.id,
            error = %e,
            "Commit of terminal-failure tx failed"
        );
        return;
    }

    let project_id = SceneVideoVersionRepo::find_project_id(&state.pool, job.entity_id)
        .await
        .ok()
        .flatten();
    let failed_job = TranscodeJobRepo::find_by_id(&state.pool, job.id)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| job.clone());
    publish_transcode_event(
        state,
        &failed_job,
        "failed",
        Some(err_msg),
        ActivityLogLevel::Error,
        project_id,
    );
}

// ---------------------------------------------------------------------------
// Storage-key derivation
// ---------------------------------------------------------------------------

/// Derive the target storage key for a transcoded file.
///
/// `x121/scenes/scene_42_v1_20260417.mov` →
/// `x121/scenes/scene_42_v1_20260417-h264.mp4`.
///
/// Per PRD Requirement 1.5 / §10 decision 3.
pub fn target_key_for(original: &str) -> String {
    // Strip any existing extension, append -h264.mp4.
    let (stem, _ext) = split_key(original);
    format!("{stem}-h264.mp4")
}

/// Split a storage key into `(stem, ext)` where `ext` excludes the leading dot.
/// `ext` is empty when the key has no extension after the final `/`.
fn split_key(key: &str) -> (&str, &str) {
    match key.rsplit_once('.') {
        Some((stem, ext)) => {
            // Only treat as extension if the dot came after the last `/`.
            let last_slash = key.rfind('/').unwrap_or(0);
            let dot_offset = stem.len();
            if dot_offset > last_slash {
                (stem, ext)
            } else {
                (key, "")
            }
        }
        None => (key, ""),
    }
}

// ---------------------------------------------------------------------------
// Concurrency management
// ---------------------------------------------------------------------------

/// Read the current `transcode.concurrency` setting, clamped to [1, 8].
async fn resolve_concurrency(state: &AppState) -> u32 {
    let row = match PlatformSettingRepo::find_by_key(&state.pool, SETTING_CONCURRENCY).await {
        Ok(r) => r,
        Err(e) => {
            tracing::debug!(
                target: "transcode",
                error = %e,
                "transcode.concurrency lookup failed, using default"
            );
            return DEFAULT_CONCURRENCY;
        }
    };
    let Some(setting) = row else {
        return DEFAULT_CONCURRENCY;
    };
    match setting.value.parse::<i64>() {
        Ok(v) => {
            let clamped = (v as u32).clamp(MIN_CONCURRENCY, MAX_CONCURRENCY);
            if clamped as i64 != v {
                tracing::warn!(
                    target: "transcode",
                    configured = v,
                    clamped,
                    "transcode.concurrency out of range [1, 8], clamped"
                );
            }
            clamped
        }
        Err(_) => {
            tracing::warn!(
                target: "transcode",
                raw = %setting.value,
                "transcode.concurrency not an integer, using default"
            );
            DEFAULT_CONCURRENCY
        }
    }
}

/// Expand or shrink the semaphore to match `target_permits`. Shrinking is
/// achieved by forgetting permits as they become available (no kill of in-flight
/// jobs — they continue holding their permits).
fn adjust_semaphore(semaphore: &Arc<Semaphore>, target_permits: u32) {
    let current = semaphore.available_permits();
    // Note: we can't observe the total capacity of the semaphore from the API,
    // only available_permits. So we use a best-effort add/forget:
    // - If available < target and we're expanding, add the difference.
    // - Shrinking past available is unsafe (we'd forget permits that may be
    //   held). The next tick catches up once in-flight jobs finish.
    if (current as u32) < target_permits {
        let to_add = (target_permits as usize).saturating_sub(current);
        semaphore.add_permits(to_add);
    }
}

// ---------------------------------------------------------------------------
// Probe-staging helper
// ---------------------------------------------------------------------------

/// RAII guard that removes a temp file on drop.
struct TempFileGuard(PathBuf);
impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let path = self.0.clone();
        // Fire-and-forget cleanup. Ignore errors — worst case the OS temp
        // reaper gets it.
        tokio::spawn(async move {
            let _ = tokio::fs::remove_file(path).await;
        });
    }
}

/// Stage a `storage_key` for ffprobe inspection.
///
/// For local storage, resolves the key to an absolute path. For S3-backed
/// storage, downloads the object into `$TMPDIR/x121_transcode/`. The returned
/// `Option<TempFileGuard>` is held by the caller; on drop it cleans up the
/// temp file.
async fn stage_for_probe(
    state: &AppState,
    storage_key: &str,
) -> Result<(PathBuf, Option<TempFileGuard>), AppError> {
    // Try local-path resolution first (PRD-122 Local backend returns file://).
    let provider = state.storage_provider().await;
    let url = provider
        .presigned_url(storage_key, 3600)
        .await
        .map_err(AppError::Core)?;
    if let Some(local) = url.strip_prefix("file://") {
        let path = PathBuf::from(local);
        if path.exists() {
            return Ok((path, None));
        }
    }

    // Remote (or missing locally) — download to temp.
    let data = provider
        .download(storage_key)
        .await
        .map_err(AppError::Core)?;
    let tmp_dir = std::env::temp_dir().join("x121_transcode");
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| AppError::InternalError(format!("Create temp dir: {e}")))?;
    let probe_path = tmp_dir.join(format!(
        "probe_{}.bin",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
    ));
    tokio::fs::write(&probe_path, &data)
        .await
        .map_err(|e| AppError::InternalError(format!("Write probe temp: {e}")))?;
    Ok((probe_path.clone(), Some(TempFileGuard(probe_path))))
}

// ---------------------------------------------------------------------------
// Activity broadcast
// ---------------------------------------------------------------------------

/// Publish a `transcode.updated` entry on the activity broadcaster.
///
/// Shape matches PRD Requirement 1.11 so the frontend can filter on
/// `fields.kind === "transcode.updated"`.
pub(crate) fn publish_transcode_event(
    state: &AppState,
    job: &TranscodeJob,
    state_label: &str,
    error: Option<&str>,
    level: ActivityLogLevel,
    project_id: Option<DbId>,
) {
    let fields = serde_json::json!({
        "kind": "transcode.updated",
        "state": state_label,
        "job_uuid": job.uuid.to_string(),
        "job_id": job.id,
        "progress": serde_json::Value::Null,
        "error": error,
    });
    let mut entry = ActivityLogEntry::curated(
        level,
        ActivityLogSource::Api,
        format!("Transcode {state_label}"),
    )
    .with_entity(TRANSCODE_ENTITY_SCENE_VIDEO_VERSION, job.entity_id)
    .with_fields(fields);
    if let Some(pid) = project_id {
        entry = entry.with_project(pid);
    }
    state.activity_broadcaster.publish(entry);
}
