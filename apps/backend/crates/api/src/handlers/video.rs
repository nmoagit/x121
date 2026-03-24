//! Handlers for the `/videos` resource.
//!
//! Provides video streaming with HTTP range request support, metadata
//! extraction via ffprobe, and thumbnail management.
//!
//! Videos are identified by `source_type` (segment | version) and `source_id`.

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::header::{self, HeaderMap, HeaderValue};
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::response::DataResponse;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use x121_core::error::CoreError;
use x121_core::ffmpeg;
use x121_core::types::DbId;
use x121_core::video_sources;
use x121_db::models::video::{CreateVideoThumbnail, VideoMetadata};
use x121_db::repositories::{SceneVideoVersionRepo, SegmentRepo, VideoThumbnailRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::scene_video_version::{
    extract_and_set_video_metadata, generate_preview_for_version, generate_web_playback_for_version,
};
use crate::state::AppState;

/// Default thumbnail dimensions.
const THUMB_WIDTH: i32 = 320;
const THUMB_HEIGHT: i32 = 180;

/// Default thumbnail extraction interval in seconds.
const DEFAULT_INTERVAL_SECS: f32 = 1.0;

/// Maximum read chunk size for streaming (1 MiB).
const MAX_CHUNK_SIZE: u64 = 1024 * 1024;

// ---------------------------------------------------------------------------
// Query / path types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct StreamParams {
    pub quality: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GenerateThumbnailsParams {
    pub interval_seconds: Option<f32>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Resolve the filesystem path for a video given its source type and ID.
async fn resolve_video_path(
    pool: &sqlx::PgPool,
    source_type: &str,
    source_id: DbId,
) -> AppResult<String> {
    match source_type {
        video_sources::VIDEO_SOURCE_SEGMENT => {
            let segment = SegmentRepo::find_by_id(pool, source_id)
                .await?
                .ok_or(AppError::Core(CoreError::NotFound {
                    entity: "Segment",
                    id: source_id,
                }))?;
            segment
                .output_video_path
                .ok_or_else(|| AppError::BadRequest("Segment has no video file".into()))
        }
        video_sources::VIDEO_SOURCE_VERSION => {
            let version = SceneVideoVersionRepo::find_by_id(pool, source_id)
                .await?
                .ok_or(AppError::Core(CoreError::NotFound {
                    entity: "SceneVideoVersion",
                    id: source_id,
                }))?;
            if version.file_purged {
                return Err(AppError::Gone(
                    "Video file has been purged from disk".to_string(),
                ));
            }
            Ok(version.file_path)
        }
        _ => Err(AppError::BadRequest(format!(
            "Invalid source_type '{source_type}'. Expected one of: {:?}",
            video_sources::VALID_SOURCE_TYPES,
        ))),
    }
}

/// Guess a Content-Type from a file extension.
fn content_type_for_extension(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

/// Storage key prefix for video thumbnails.
const THUMBNAIL_KEY_PREFIX: &str = "thumbnails";

/// Build the storage key for a thumbnail directory.
fn thumbnail_key(source_type: &str, source_id: DbId) -> String {
    format!("{THUMBNAIL_KEY_PREFIX}/{source_type}/{source_id}")
}

/// Resolve thumbnail directory to an absolute path via the storage provider.
async fn resolve_thumbnail_dir(
    state: &AppState,
    source_type: &str,
    source_id: DbId,
) -> Result<std::path::PathBuf, crate::error::AppError> {
    let key = thumbnail_key(source_type, source_id);
    state.resolve_to_path(&key).await
}

/// Parse a `Range: bytes=START-END` header value.
/// Returns `(start, optional_end)`.
fn parse_range_header(range: &str) -> Option<(u64, Option<u64>)> {
    let range = range.strip_prefix("bytes=")?;
    let parts: Vec<&str> = range.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }
    let start = parts[0].parse::<u64>().ok()?;
    let end = if parts[1].is_empty() {
        None
    } else {
        Some(parts[1].parse::<u64>().ok()?)
    };
    Some((start, end))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/videos/{source_type}/{source_id}/stream
///
/// Streams a video file with HTTP range request support.
/// Supports `?quality=proxy|full`:
/// - `proxy`: serves the low-res preview (640x360 H.264 baseline)
/// - `full`: serves the full-res browser-compatible transcode (H.264 main)
pub async fn stream_video(
    State(state): State<AppState>,
    Path((source_type, source_id)): Path<(String, DbId)>,
    Query(params): Query<StreamParams>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let file_path = if source_type == video_sources::VIDEO_SOURCE_VERSION {
        let version = SceneVideoVersionRepo::find_by_id(&state.pool, source_id)
            .await?
            .ok_or(AppError::Core(CoreError::NotFound {
                entity: "SceneVideoVersion",
                id: source_id,
            }))?;
        if version.file_purged {
            return Err(AppError::Gone(
                "Video file has been purged from disk".to_string(),
            ));
        }
        if params.quality.as_deref() == Some("proxy") {
            // SD: serve low-res preview, fall back to web playback, then original.
            version
                .preview_path
                .or(version.web_playback_path)
                .unwrap_or(version.file_path)
        } else {
            // HD: serve full-res browser-compatible transcode, fall back to original.
            version.web_playback_path.unwrap_or(version.file_path)
        }
    } else {
        resolve_video_path(&state.pool, &source_type, source_id).await?
    };

    let path = state.resolve_to_path(&file_path).await?;

    if !path.exists() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "VideoFile",
            id: source_id,
        }));
    }

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    let file_size = metadata.len();
    let content_type = content_type_for_extension(&file_path);

    // Check for Range header.
    if let Some(range_value) = headers.get(header::RANGE) {
        let range_str = range_value
            .to_str()
            .map_err(|_| AppError::BadRequest("Invalid Range header".into()))?;

        if let Some((start, end)) = parse_range_header(range_str) {
            let end = end
                .map(|e| e.min(file_size - 1))
                .unwrap_or_else(|| (start + MAX_CHUNK_SIZE - 1).min(file_size - 1));

            if start >= file_size || start > end {
                return Ok(Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{file_size}"))
                    .body(Body::empty())
                    .unwrap());
            }

            let length = end - start + 1;

            let mut file = tokio::fs::File::open(&path)
                .await
                .map_err(|e| AppError::InternalError(e.to_string()))?;
            file.seek(std::io::SeekFrom::Start(start))
                .await
                .map_err(|e| AppError::InternalError(e.to_string()))?;

            let limited = file.take(length);
            let stream = ReaderStream::new(limited);

            return Ok(Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, content_type)
                .header(header::CONTENT_LENGTH, length.to_string())
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{file_size}"),
                )
                .header(header::ACCEPT_RANGES, "bytes")
                .body(Body::from_stream(stream))
                .unwrap());
        }
    }

    // No Range header — serve the full file.
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    let stream = ReaderStream::new(file);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from_stream(stream))
        .unwrap())
}

/// GET /api/v1/videos/{source_type}/{source_id}/metadata
///
/// Returns video metadata (duration, codec, resolution, framerate, audio tracks)
/// extracted via ffprobe.
pub async fn get_metadata(
    State(state): State<AppState>,
    Path((source_type, source_id)): Path<(String, DbId)>,
) -> AppResult<Json<DataResponse<VideoMetadata>>> {
    let file_path = resolve_video_path(&state.pool, &source_type, source_id).await?;
    let path = state.resolve_to_path(&file_path).await?;

    let probe = ffmpeg::probe_video(&path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let (width, height) = ffmpeg::parse_resolution(&probe);
    let audio_tracks = ffmpeg::parse_audio_tracks(&probe);

    let file_size = tokio::fs::metadata(&path)
        .await
        .ok()
        .map(|m| m.len() as i64);

    let metadata = VideoMetadata {
        duration_seconds: ffmpeg::parse_duration(&probe),
        codec: ffmpeg::parse_video_codec(&probe),
        width,
        height,
        framerate: ffmpeg::parse_framerate(&probe),
        total_frames: ffmpeg::parse_total_frames(&probe),
        file_size_bytes: file_size,
        audio_tracks,
    };

    Ok(Json(DataResponse { data: metadata }))
}

/// GET /api/v1/videos/{source_type}/{source_id}/thumbnails/{frame}
///
/// Returns the thumbnail image for a specific frame. If the thumbnail does not
/// exist in the database, it is extracted on-the-fly via ffmpeg and cached.
pub async fn get_thumbnail(
    State(state): State<AppState>,
    Path((source_type, source_id, frame)): Path<(String, DbId, i32)>,
) -> AppResult<Response> {
    // Check cache first.
    if let Some(thumb) =
        VideoThumbnailRepo::find_by_source_and_frame(&state.pool, &source_type, source_id, frame)
            .await?
    {
        return serve_image_file(&thumb.thumbnail_path).await;
    }

    // Not cached — extract on-the-fly.
    let file_path = resolve_video_path(&state.pool, &source_type, source_id).await?;
    let video_path = state.resolve_to_path(&file_path).await?;

    // Determine the timestamp from the frame number by probing framerate.
    let probe = ffmpeg::probe_video(&video_path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    let fps = ffmpeg::parse_framerate(&probe);
    let timestamp = if fps > 0.0 {
        frame as f64 / fps
    } else {
        frame as f64
    };

    let thumb_dir = resolve_thumbnail_dir(&state, &source_type, source_id).await?;
    tokio::fs::create_dir_all(&thumb_dir)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let thumb_filename = format!("frame_{frame:06}.jpg");
    let thumb_abs_path = thumb_dir.join(&thumb_filename);

    ffmpeg::extract_frame_thumbnail(
        &video_path,
        &thumb_abs_path,
        timestamp,
        THUMB_WIDTH,
        THUMB_HEIGHT,
    )
    .await
    .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Store storage key (not absolute path) in database.
    let thumb_storage_key = format!(
        "{}/{thumb_filename}",
        thumbnail_key(&source_type, source_id)
    );
    let input = CreateVideoThumbnail {
        source_type: source_type.clone(),
        source_id,
        frame_number: frame,
        thumbnail_path: thumb_storage_key,
        interval_seconds: None,
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
    };
    let _ = VideoThumbnailRepo::create(&state.pool, &input).await;

    serve_image_file(&thumb_abs_path.to_string_lossy()).await
}

/// POST /api/v1/videos/{source_type}/{source_id}/thumbnails
///
/// Triggers bulk thumbnail extraction at regular intervals. Returns the
/// list of created thumbnail records.
pub async fn generate_thumbnails(
    State(state): State<AppState>,
    Path((source_type, source_id)): Path<(String, DbId)>,
    Query(params): Query<GenerateThumbnailsParams>,
) -> AppResult<(
    StatusCode,
    Json<Vec<x121_db::models::video::VideoThumbnail>>,
)> {
    let file_path = resolve_video_path(&state.pool, &source_type, source_id).await?;
    let video_path = state.resolve_to_path(&file_path).await?;

    let interval = params.interval_seconds.unwrap_or(DEFAULT_INTERVAL_SECS);
    let width = params.width.unwrap_or(THUMB_WIDTH);
    let height = params.height.unwrap_or(THUMB_HEIGHT);

    let thumb_dir = resolve_thumbnail_dir(&state, &source_type, source_id).await?;

    let results =
        ffmpeg::extract_thumbnails_at_interval(&video_path, &thumb_dir, interval, width, height)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Convert to create DTOs — store storage keys, not absolute paths.
    let key_prefix = thumbnail_key(&source_type, source_id);
    let inputs: Vec<CreateVideoThumbnail> = results
        .iter()
        .map(|r| {
            // r.output_path is absolute; extract just the filename.
            let filename = std::path::Path::new(&r.output_path)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(&r.output_path);
            CreateVideoThumbnail {
                source_type: source_type.clone(),
                source_id,
                frame_number: r.frame_number,
                thumbnail_path: format!("{key_prefix}/{filename}"),
                interval_seconds: Some(interval),
                width: r.width,
                height: r.height,
            }
        })
        .collect();

    let thumbnails = VideoThumbnailRepo::create_batch(&state.pool, &inputs).await?;

    Ok((StatusCode::CREATED, Json(thumbnails)))
}

/// Response body for the backfill-previews endpoint.
#[derive(Debug, Serialize)]
pub struct BackfillPreviewsResponse {
    pub processed: usize,
    pub succeeded: usize,
    pub failed: usize,
}

/// POST /api/v1/videos/generate-previews
///
/// Backfill low-res preview files for existing scene video versions that don't
/// have one yet. Processes up to `limit` rows (default 50) per call.
pub async fn generate_previews(
    State(state): State<AppState>,
    Query(params): Query<GeneratePreviewsParams>,
) -> AppResult<Json<BackfillPreviewsResponse>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;

    let versions = SceneVideoVersionRepo::list_missing_previews(&state.pool, limit).await?;

    let total = versions.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for version in &versions {
        match generate_preview_for_version(&state, version).await {
            Some(_) => succeeded += 1,
            None => failed += 1,
        }
    }

    tracing::info!(
        total,
        succeeded,
        failed,
        "Backfill preview generation complete"
    );

    Ok(Json(BackfillPreviewsResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

#[derive(Debug, Deserialize)]
pub struct GeneratePreviewsParams {
    pub limit: Option<u32>,
}

/// POST /api/v1/videos/generate-web-playback
///
/// Backfill full-resolution browser-compatible transcodes for existing scene
/// video versions that don't have one yet. Processes up to `limit` rows
/// (default 50) per call.
pub async fn generate_web_playback(
    State(state): State<AppState>,
    Query(params): Query<GeneratePreviewsParams>,
) -> AppResult<Json<BackfillPreviewsResponse>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;

    let versions = SceneVideoVersionRepo::list_missing_web_playback(&state.pool, limit).await?;

    let total = versions.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for version in &versions {
        match generate_web_playback_for_version(&state, version).await {
            Some(_) => succeeded += 1,
            None => failed += 1,
        }
    }

    tracing::info!(
        total,
        succeeded,
        failed,
        "Backfill web playback generation complete"
    );

    Ok(Json(BackfillPreviewsResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

/// Response body for backfill-metadata endpoints.
#[derive(Debug, Serialize)]
pub struct BackfillMetadataResponse {
    pub processed: usize,
    pub succeeded: usize,
    pub failed: usize,
}

/// POST /api/v1/videos/backfill-metadata
///
/// Backfill duration_secs for existing scene video versions that don't have it
/// yet. Processes up to `limit` rows (default 50) per call.
pub async fn backfill_video_metadata(
    State(state): State<AppState>,
    Query(params): Query<GeneratePreviewsParams>,
) -> AppResult<Json<BackfillMetadataResponse>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;

    let versions = SceneVideoVersionRepo::list_missing_duration(&state.pool, limit).await?;

    let total = versions.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for version in &versions {
        if extract_and_set_video_metadata(&state, version).await {
            succeeded += 1;
        } else {
            failed += 1;
        }
    }

    tracing::info!(total, succeeded, failed, "Backfill video metadata complete");

    Ok(Json(BackfillMetadataResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

/// POST /api/v1/videos/backfill-snapshots
///
/// Backfill generation_snapshot for generated scene video versions that are
/// missing it. Rebuilds the snapshot from the scene's current workflow and
/// prompt configuration. Processes up to `limit` rows (default 50) per call.
pub async fn backfill_snapshots(
    State(state): State<AppState>,
    Query(params): Query<GeneratePreviewsParams>,
) -> AppResult<Json<BackfillMetadataResponse>> {
    use x121_db::repositories::{SceneRepo, SceneTypeRepo, SceneTypeTrackConfigRepo, WorkflowRepo};

    let limit = params.limit.unwrap_or(50).min(200) as i64;

    let versions = SceneVideoVersionRepo::list_missing_snapshots(&state.pool, limit).await?;

    let total = versions.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for version in &versions {
        // Rebuild snapshot using same logic as event_loop::build_snapshot_from_db
        let snapshot = async {
            let scene = SceneRepo::find_by_id(&state.pool, version.scene_id)
                .await
                .ok()??;
            let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene.scene_type_id)
                .await
                .ok()??;

            // Resolve workflow: track config → scene_type.workflow_id
            let resolved_workflow_id = if let Some(track_id) = scene.track_id {
                let track_config = SceneTypeTrackConfigRepo::find_by_scene_type_and_track(
                    &state.pool,
                    scene.scene_type_id,
                    track_id,
                    false,
                )
                .await
                .ok()
                .flatten();
                track_config
                    .and_then(|c| c.workflow_id)
                    .or(scene_type.workflow_id)
            } else {
                scene_type.workflow_id
            };

            let workflow_id = resolved_workflow_id?;
            let workflow = WorkflowRepo::find_by_id(&state.pool, workflow_id)
                .await
                .ok()??;

            let prompt_slots = x121_db::repositories::WorkflowPromptSlotRepo::list_by_workflow(
                &state.pool,
                workflow_id,
            )
            .await
            .unwrap_or_default();

            let mut prompts = serde_json::Map::new();
            for slot in &prompt_slots {
                let key = format!("{} [{}]", slot.slot_label, slot.node_id);
                let text = slot.default_text.clone().unwrap_or_default();
                prompts.insert(key, serde_json::Value::String(text));
            }

            let seed_image = if let Some(variant_id) = scene.media_variant_id {
                x121_db::repositories::MediaVariantRepo::find_by_id(&state.pool, variant_id)
                    .await
                    .ok()
                    .flatten()
                    .map(|v| v.file_path)
                    .unwrap_or_default()
            } else {
                String::new()
            };

            Some(serde_json::json!({
                "scene_type": scene_type.name,
                "workflow": workflow.name,
                "clip_position": "full_clip",
                "seed_image": seed_image,
                "segment_index": 0,
                "prompts": prompts,
                "generation_params": scene_type.generation_params,
                "lora_config": scene_type.lora_config,
                "generated_at": version.created_at.to_rfc3339(),
            }))
        }
        .await;

        match snapshot {
            Some(snap) => {
                match SceneVideoVersionRepo::set_generation_snapshot(&state.pool, version.id, &snap)
                    .await
                {
                    Ok(true) => succeeded += 1,
                    _ => failed += 1,
                }
            }
            None => {
                tracing::warn!(
                    version_id = version.id,
                    scene_id = version.scene_id,
                    "Could not build snapshot — missing workflow or scene data"
                );
                failed += 1;
            }
        }
    }

    tracing::info!(
        total,
        succeeded,
        failed,
        "Backfill generation snapshots complete"
    );

    Ok(Json(BackfillMetadataResponse {
        processed: total,
        succeeded,
        failed,
    }))
}

/// Serve an image file as a response.
async fn serve_image_file(path: &str) -> AppResult<Response> {
    let file_path = std::path::Path::new(path);
    if !file_path.exists() {
        return Err(AppError::InternalError(format!(
            "Thumbnail file missing: {path}"
        )));
    }

    let data = tokio::fs::read(file_path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let content_type = content_type_for_extension(path);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, data.len().to_string())
        .header(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=86400"),
        )
        .body(Body::from(data))
        .unwrap())
}
