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
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use trulience_core::error::CoreError;
use trulience_core::ffmpeg;
use trulience_core::types::DbId;
use trulience_core::video_sources;
use trulience_db::models::video::{CreateVideoThumbnail, VideoMetadata};
use trulience_db::repositories::{
    SceneVideoVersionRepo, SegmentRepo, VideoThumbnailRepo,
};

use crate::error::{AppError, AppResult};
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

/// Base directory for thumbnail storage.
const THUMBNAIL_STORAGE_DIR: &str = "storage/thumbnails";

/// Build the thumbnail storage path for a given source.
fn thumbnail_dir(source_type: &str, source_id: DbId) -> std::path::PathBuf {
    std::path::PathBuf::from(THUMBNAIL_STORAGE_DIR)
        .join(source_type)
        .join(source_id.to_string())
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
/// Supports `?quality=proxy|full` (proxy is a no-op for MVP — serves the
/// full file regardless).
pub async fn stream_video(
    State(state): State<AppState>,
    Path((source_type, source_id)): Path<(String, DbId)>,
    Query(_params): Query<StreamParams>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let file_path = resolve_video_path(&state.pool, &source_type, source_id).await?;
    let path = std::path::Path::new(&file_path);

    if !path.exists() {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "VideoFile",
            id: source_id,
        }));
    }

    let metadata = tokio::fs::metadata(path)
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

            let mut file = tokio::fs::File::open(path)
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
    let file = tokio::fs::File::open(path)
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
) -> AppResult<Json<VideoMetadata>> {
    let file_path = resolve_video_path(&state.pool, &source_type, source_id).await?;
    let path = std::path::Path::new(&file_path);

    let probe = ffmpeg::probe_video(path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let (width, height) = ffmpeg::parse_resolution(&probe);
    let audio_tracks = ffmpeg::parse_audio_tracks(&probe);

    let file_size = tokio::fs::metadata(path)
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

    Ok(Json(metadata))
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
    let video_path = std::path::Path::new(&file_path);

    // Determine the timestamp from the frame number by probing framerate.
    let probe = ffmpeg::probe_video(video_path)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    let fps = ffmpeg::parse_framerate(&probe);
    let timestamp = if fps > 0.0 {
        frame as f64 / fps
    } else {
        frame as f64
    };

    let thumb_dir = thumbnail_dir(&source_type, source_id);
    tokio::fs::create_dir_all(&thumb_dir)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let thumb_path = thumb_dir.join(format!("frame_{frame:06}.jpg"));

    ffmpeg::extract_frame_thumbnail(
        video_path,
        &thumb_path,
        timestamp,
        THUMB_WIDTH,
        THUMB_HEIGHT,
    )
    .await
    .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Store in database for future cache hits.
    let input = CreateVideoThumbnail {
        source_type: source_type.clone(),
        source_id,
        frame_number: frame,
        thumbnail_path: thumb_path.to_string_lossy().to_string(),
        interval_seconds: None,
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
    };
    let _ = VideoThumbnailRepo::create(&state.pool, &input).await;

    serve_image_file(&thumb_path.to_string_lossy()).await
}

/// POST /api/v1/videos/{source_type}/{source_id}/thumbnails
///
/// Triggers bulk thumbnail extraction at regular intervals. Returns the
/// list of created thumbnail records.
pub async fn generate_thumbnails(
    State(state): State<AppState>,
    Path((source_type, source_id)): Path<(String, DbId)>,
    Query(params): Query<GenerateThumbnailsParams>,
) -> AppResult<(StatusCode, Json<Vec<trulience_db::models::video::VideoThumbnail>>)> {
    let file_path = resolve_video_path(&state.pool, &source_type, source_id).await?;
    let video_path = std::path::Path::new(&file_path);

    let interval = params.interval_seconds.unwrap_or(DEFAULT_INTERVAL_SECS);
    let width = params.width.unwrap_or(THUMB_WIDTH);
    let height = params.height.unwrap_or(THUMB_HEIGHT);

    let thumb_dir = thumbnail_dir(&source_type, source_id);

    let results = ffmpeg::extract_thumbnails_at_interval(
        video_path,
        &thumb_dir,
        interval,
        width,
        height,
    )
    .await
    .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Convert to create DTOs.
    let inputs: Vec<CreateVideoThumbnail> = results
        .iter()
        .map(|r| CreateVideoThumbnail {
            source_type: source_type.clone(),
            source_id,
            frame_number: r.frame_number,
            thumbnail_path: r.output_path.clone(),
            interval_seconds: Some(interval),
            width: r.width,
            height: r.height,
        })
        .collect();

    let thumbnails = VideoThumbnailRepo::create_batch(&state.pool, &inputs).await?;

    Ok((StatusCode::CREATED, Json(thumbnails)))
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
